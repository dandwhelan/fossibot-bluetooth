# CLAUDE.md

Guidance for future Claude Code sessions working on this repo.

## Project overview

A single-page Progressive Web App that controls Fossibot / AFERIY / SYDPOWER /
ABOK portable power stations over Web Bluetooth (BLE), bypassing the
cloud-dependent vendor app.

- Hosted at <https://dandwhelan.github.io/fossibot-bluetooth/> via GitHub Pages.
- Tested on Fossibot F2400, F3600 Pro and AFERIY P210/P310.
- Offline-first; installable as a PWA.

## Repo layout

```
index.html         All HTML, CSS, and JS inline (~5k lines). The whole app.
PROTOCOL.md        Reverse-engineered Modbus register map and packet structure.
README.md          User-facing docs and feature list.
service-worker.js  PWA caching (network-first app shell, cache-first assets).
manifest.json      PWA manifest.
img/               Screenshots.
icon-512.png       PWA icon.
task.md            Scratchpad / TODO notes (all items completed).
test/              Node test-runner suite; harvests functions out of index.html.
```

There is no build step, package manager, or lockfile. The single `index.html`
is intentional — keeps offline/PWA install simple. The tests sit beside it and
run on stock Node with no dependencies, so nothing enters the deployed app.

## Run locally

Web Bluetooth needs a secure context. Serve over `localhost` or HTTPS:

```
python3 -m http.server 8000        # then open http://localhost:8000
# or VS Code Live Server, or any static server
```

Open in Chrome / Edge on Android, desktop, or Bluefy on iOS.

## Architecture notes

- BLE service `0xA002`; write characteristic `0xC304`; notify characteristic
  `0xC305`.
- Framing is Modbus-RTU-like:
  `[Header 0x11] [Cmd] [RegHi] [RegLo] [ValHi] [ValLo] [CRC hi] [CRC lo]`.
  See `generateCommandBytes()`. CRC is hi-byte first.
- Two register banks:
  - **Status `0x1104`** — read-only telemetry (power flow, SOC, flags).
  - **Settings `0x1103`** — read/write configuration.
- **OpCode `0x07`** — WiFi configuration (SSID/password packet; the device
  replies `11 07 02` connecting / `11 07 01` connected). The settings panel
  also has a "Disable WiFi Access Point" button that sends bogus credentials
  to kill the device's open `ESP_xxxxxx` hotspot.
- All writes go through a command queue (`processQueue()`, ~200 ms gap
  between commands) to avoid "GATT operation already in progress".
  See the "Robot Restaurant" analogy at the bottom of `README.md`.

### Platform Distinctions

1. **Classic V0 Platform (Current Web App Primary Target):**
   - Hardware: Fossibot F2400, F3600 Pro, Aferiy P210/P310, Sydpower N052/N066.
   - Distinct Modbus register banks: Settings `0x1103` vs Status `0x1104`.
   - Dedicated registers for timers, limits, and controls.
2. **Next-Gen V1 Platform (`portable-power-station-v1`, `balcony-pv`, `switch-box`):**
   - Advertises with `protocol_version >= 1`.
   - Unified `se` register layout (Regs 24–30 for standby timers; Reg 86 for grid export).
   - OpCode `0x05` (Reg 75) 15-bit bitmask (`systemState`) for rapid multi-state toggling (Solar self-consumption, grid feed-in pause, buzzer, AI energy, remote shutdown).
   - 32-bit solar cumulative Wh meters (Regs 59–60) and RTC synchronization (Regs 97–99).
   - Documented in `PROTOCOL.md` §9 for future V1 driver development.
3. **DC-DC Auxiliary Battery Charger (`wp`):**
   - Vehicle/camper dual-battery DC-DC charger (`DC_DC-V1-0083`).
   - OpCodes `0x21` / `0x22`. Alternator telemetry, flameout/undervoltage protection. Documented in `PROTOCOL.md` §10.
4. **Smart Transfer Switch Box (`switch-box` / ATS):**
   - Home emergency backup and automatic transfer switch accessory.
   - Input Reg 4 (1=Mains, 2=Smart), Input Reg 12 (1=ON GRID, 2=OFF GRID, 3=FAULT), Holding Reg 12 (Forced Off-Grid toggle). Documented in `PROTOCOL.md` §13.
5. **Multi-MCU Distributed Architecture (Classic V0):**
   - Distributed Sub-MCUs in holding registers: AC Inverter (47), BMS Battery (48), Solar MPPT (49), DC Front Panel (50). Decoded via `v((val & 0xff) / 10).toFixed(1)`. Documented in `PROTOCOL.md` §14.

### Error Messages & Fault Detection Architecture

### 3. ⚠️ Fault Code Classification & Flashing Alerts (Reg 8 & Reg 42)

- **Vendor App Implementation:** The official app does not hardcode error strings. It queries `uniCloud` (`client/device/faultCode.getList`) for product-specific bitmasks (`byte_list` and `bit_list`). When any bit is active, it shows `device.tip-2` ("There is a device failure, click to view details") and navigates to `/pages/device/log` to display the timestamped messages.
- **Hardware Register Mapping (Classic V0):**
  - **Input Reg 8 (`errorCode`):** Only `78` (Inverter Fault) and `79` (Safety Lockout / Temp Protection) are real errors. Normal operating devices routinely broadcast `136` or other non-zero codes — **never treat `Reg 8 > 0` as a fault**.
  - **Input Reg 42 (`protFlags`):** Lower bits (0–12) reflect normal output MOSFET state (`+984` when USB/DC active). Bits 13–14 (`0x6000`) are the **Critical Hardware Fault Mask**. Bit 15 (`0x8000`) is a non-critical warning latch.
  - **Combined Classification:**
    - If `Reg 8 == 79` and `(Reg 42 & 0x6000) > 0` → Hardware Fault (`Error 79` / Critical Hardware Failure). Forces Master Enable Reg 5 to 0.
    - If `Reg 8 == 79` and `(Reg 42 & 0x6000) == 0` → `Temp Protection` (ambient thermal limit: &lt;0°C cold charge lockout or &gt;55°C high-heat pause).
    - If `Reg 8 == 78` → `Inverter Fault` (AC inverter overload / trip; DC and solar MPPT remain operational).
    - Otherwise → Normal operation (`#protectionWarning` hidden).
  - **Flashing Visual Alerting:** When any real fault is detected, the UI `#protectionWarning` banner activates with a pulsing CSS keyframe animation (`fault-active-flash`), glowing continuously with a luminous red/amber pulse.
- **DC-DC Fault Flags (Input Reg 7):**
  - `Bit 3 (0x08)`: Starter battery undervoltage protection active (&lt; cutoff in Reg 14).
  - `Bit 7 (0x80)`: Engine flameout vibration protection active (vehicle engine off).

### 4. 🌀 Fan Speed Telemetry & Thermal Architecture
- **Input Reg 69 (`fan_level`):** Reports active cooling fan speed stage from `0` to `5` (0 = off, 1 = low, 5 = max cooling). When `fan_level > 0`, the web app activates an animated spinning fan icon (`🌀.spinning`).
- **Holding Reg 57 (`ac_silent_mode`):** Caps AC charging wattage (~50%) to silence fans.
- **Temperature Architecture (Classic V0):**
  - There is **no direct raw °C temperature register** in the Modbus BLE stream for V0 power stations.
  - **Input Reg 52 is NOT temperature:** It is a hardware model ID (`180` = Aferiy, `0` = Fossibot).
  - **Thermal State Code (Input Reg 21):** When disconnected from AC grid, value **`15`** indicates **Cold Temperature Protection** (&lt;0°C cell charging freeze lockout).
  - **Thermal Lockout Code (Input Reg 8 = 79):** Indicates environmental thermal extreme (&gt;55°C or &lt;0°C).
- **Temperature Architecture (DC-DC):**
  - **Input Reg 6 (`deviceTemper`):** Signed 16-bit integer directly reporting heatsink/MOSFET temperature in **°C**.

### ⏱️ Register 59 vs 62 Swap Warning

- **Holding Reg 59 = USB Standby Timer** in **minutes** (5m, 10m, 30m, 1h, 2h, 8h, 10h, Never/0).
- **Holding Reg 62 = Screen Timeout Timer** in **seconds** (60s, 180s, 300s, 600s, 1800s, 3600s, 7200s, 14400s, Never/0).
*(Older community versions inverted these two, causing 10-minute screen timeouts [600s] to be misread as USB standby).*

`connect(options)` serves both a user tap and the background auto-connect
loop, and the two must not be confused. Four invariants, each of which has
already broken Android discovery once — see PR #32:

1. **Pass `auto` per call — never via shared state.** `connect({ auto: true })`
   from `tryAutoConnect()`, plain `connect()` from a tap. A global flag set
   around the loop's `await` makes any tap landing in that window look like a
   background retry, and the device chooser is silently skipped. `connect` is
   also wired directly as a click listener, so `options` may be an `Event` —
   hence the strict `options.auto === true` check.
2. **Never leave a dead `device` latched.** `device` is truthy → `connect()`
   skips `requestDevice()` entirely. A saved device restored from
   `getDevices()` that will not connect must be released, or the chooser
   becomes unreachable until a page reload. `failedConnects` counts failures
   per device id; a manual tap drops the device after `MAX_SILENT_RETRIES`.
   Background retries keep theirs, so out-of-range reconnect still works.
3. **Nothing may `await` before `requestDevice()` on the manual path.** Chrome
   on Android requires transient user activation and rejects with
   `SecurityError` if the tap's activation was consumed. This is why
   `getDevices()` is cached into `grantedDevices` at startup by
   `refreshGrantedDevices()` instead of being awaited inside the tap.
4. **A tap cancels the auto-connect loop** (`cancelAutoConnect()`) so the two
   do not race for the same adapter.

Invariant 3 applies to every connect entry point, not just the original
button: `#conn-bar`, `#connect-help-cta` and the "connect a different power
station" link all reach `requestDevice()` with no `await` in between.
`test/connect.test.mjs` cannot see that — only the Playwright check described
under Verification can.

`watchAdvertisements()` is used only on the auto path — Chrome on Android
often cannot connect to a `getDevices()`-restored device before it has seen
an advertisement. It needs an experimental flag on some builds, so its
failure is caught and treated as "try connecting directly".

### What the user is told

Every statement about the connection goes through `setConnState(state,
overrides)` — `idle`, `scanning`, `connected` or `error` — which drives both
the status bar above the dashboard and the card that stands in for it while
disconnected. Two things to preserve:

- **Never report a connection problem only via `log()`.** The Activity Log
  lives inside the Diagnostics tab, two taps away, so anything reported only
  there is reported nowhere. Pair every `log()` on a failure path with a
  `setConnState('error', friendlyConnectError(e))`.
- **Only a tap may show an error.** A background retry sets `scanning` with a
  "reconnecting" detail — it will try again by itself, so a red failure is
  both wrong and alarming.

`friendlyConnectError()` maps exceptions to a plain-English cause plus a next
step; it must never surface a `DOMException` name. The card hides the
dashboard (`#dash-main.needs-connect`) rather than covering it, so whatever
hides the card has to restore the dashboard in the same breath —
`dismissConnectHelp()` re-renders through `setConnState` for that reason.

Chooser-free reconnect via `getDevices()` also needs
`chrome://flags/#enable-web-bluetooth-new-permissions-backend` on some Chrome
builds; without it the browser forgets the grant on every launch.

## ⚠️ Register 68 brick hazard

**Writing `0` to Settings Reg 68 (Machine Shutdown timer) permanently bricks
devices** — confirmed in the field (issue #1). Writes of 0 to reg 68 are
blocked at the protocol layer and the "Never" option is removed from the UI.
Never relax this guard. Allowed values: 5, 10, 30, 60, 480.

## Key registers (cheat sheet)

Sourced from `PROTOCOL.md` — treat that file as authoritative.

### Settings Bank (`0x1103`) — Read/Write Configuration
| Reg | Name | Description |
| --- | --- | --- |
| 0 | Factory Reset / Unbind | Write `1` to unbind and restore factory defaults |
| 11 | Hardware Model ID | Regional hardware model identification |
| 13 | AC Charge Rate Level | 1–5 → ~300W to ~1100W+ on F2400 EU |
| 14 | AC Max Power Limit | 1500W (US) / 1100W (EU) |
| 16 | AC Output Frequency | 500 = 50.0 Hz, 600 = 60.0 Hz |
| 17 | Max Hardware Charge Current | Hardware ceiling in Amps (e.g. 20A) |
| 20 | Configured Charge Current | User setting (3A to Reg 17 A) |
| 24/25/26 | USB / DC / AC Output Toggles | 0/1 write |
| 27 | LED Light Mode | 0=Off, 1=Low, 2=High, 3=SOS, 4=Flash |
| 47–50 | Sub-MCU Firmware Versions | AC MCU (47), BMS MCU (48), PV MCU (49), DC/Panel MCU (50) |
| 56 | Key Sound / Buzzer Tone | 1 = enabled, 0 = muted |
| 57 | Silent Charging Toggle | 1 = silent mode (caps charge rate ~50% to silence fans) |
| 59 | USB Standby Timer | Minutes: 5, 10, 30, 60, 120, 480, 600, 0=Never |
| 60 | AC Standby Timer | Minutes: 60, 480, 960, 1440, 0=Never |
| 61 | DC Standby Timer | Minutes: 60, 480, 960, 1440, 0=Never |
| 62 | Screen Timeout Timer | **Seconds**: 60, 180, 300, 600, 1800, 3600, 7200, 14400, 0=Never |
| 63 | Schedule Charge Delay | Minutes from now until charging starts. Write `0` to cancel |
| 64 | Power Off Command | Write `1` to initiate device power shutdown |
| 66 | Minimum Discharge Limit | DOD cutoff threshold (% × 10, e.g. 100 = 10%) |
| 67 | UPS Charge Limit | Max charge ceiling (% × 10, e.g. 800 = 80%) |
| 68 | Machine Shutdown Timer | Whole device idle auto-off. Minutes: 5, 10, 30, 60, 480. **NEVER WRITE 0 (BRICK HAZARD)** |

### Status Bank (`0x1104`) — Read-Only Telemetry
| Reg | Name | Description |
| --- | --- | --- |
| 3 | AC Input Power (Ratified) | Watts |
| 4 | DC / Solar Input Power | Watts |
| 6 | Total Input Power | Watts |
| 7 | AC Grid Power | Signed 16-bit watts |
| 8 | Error Code | **Only 78 (inverter fault) and 79 (safety lockout) are real faults.** Healthy devices report 136 or other non-zero codes |
| 20 | Total Output Power | Watts (Authoritative for load/charging detection; Reg 39 is duplicate/uncalibrated) |
| 21 | AC Input Voltage ×10 | Volts (also doubles as state code when unplugged: 15 = cold temp protection) |
| 41 | Power Output & State Bitmask | Bit 2=AC Out, Bit 3=AC In, Bit 4=AC Charge, Bit 5=Low-PV In, Bit 6=Low-PV Charge, Bit 7=DC Out, Bit 8=Car In, Bit 9=USB Out, Bit 10=LED Out, Bit 13=Car Charge, Bit 14=High-PV In, Bit 15=High-PV Charge |
| 42 | Protection & MOSFET Bitmask | Bits 0–12 = MOSFET drive status (`+984` normal when USB/DC active). Bits 13–14 (`0x6000`) = Critical HW Fault. Bit 15 (`0x8000`) = System Warning latch |
| 48 | System Status Flags | Bit 15 (`0x8000`) = Charging, Bit 14 (`0x4000`) = Standby. Bit 3 (`0x0008`) is transient inverter switching |
| 52 | Model Identifier | 180 = Aferiy, 0 = Fossibot. **Not battery temperature** |
| 53 / 55 | Extension Battery 1 / 2 SOC | 0 = absent, otherwise `(raw - 10) / 10 = %` |
| 54 | Battery Capacity | 0.1 Ah units (e.g. 400 = 40.0 Ah) |
| 56 | Main Battery SOC | 0–1000, divide by 10 for % |
| 57 | Schedule Charge Countdown | Remaining minutes until scheduled charge begins |
| 58 | Time to Full | Minutes remaining until 100% |
| 59 | Time to Empty | Minutes remaining at current load |
| 66 / 67 | Extension Battery 3 / 4 SOC | 0 = absent, otherwise `(raw - 10) / 10 = %` |
| 69 | Fan Speed Level | 0–5 |

There is **no documented register that exposes numeric battery temperature** on F2400 or Aferiy as of current reverse engineering.

## Where common code lives (index.html)

Line numbers drift with every change — search for the function name instead.

- `generateCommandBytes()` — builds write packets.
- `processQueue()` / `addToQueue()` — BLE command queue (returns a promise).
- `handleNotification()` — parses all incoming packets (0x1103/0x1104/0x07,
  AT-command leaks, write confirmations).
- `toggleSetting()` — checkbox/button toggles (`ac_silent`, `light_mode`, …).
- `changeSelect()` — dropdown writes; its map routes setting names → registers.
- `changeInput()` — numeric input writes.
- `setRegister(reg, val)` — low-level write entry point (contains the reg 68
  guard).
- `renderDiagnostics()` — Diag tab renderer.
- `sendWifiCredentials()` / `disableWifiAP()` / `updateWifiStatusUI()` — WiFi
  config over OpCode 0x07.
- `recordHistory()` / `flushHistory()` / `loadHistoryFromDB()` — chart samples,
  persisted to IndexedDB (`POWER-history` DB, 24 h retention).
- `toggleHistoryCollapsed()` / `applyHistoryCollapsed()` — collapses the Power
  History card to its header (`#history-panel.collapsed`), persisted in
  `localStorage['POWER-hist-collapsed']`. Safe to collapse for free:
  `drawHistoryChart()` already no-ops when `canvas.offsetParent === null`, so
  `applyHistoryCollapsed()` only needs to force one redraw on the way back in.
- `accumulateEnergy()` / `updateEnergyStrip()` — daily Wh in/out totals
  (localStorage `POWER-energy`) and optional tariff cost estimate.
- `checkAlerts()` — notification rules (low battery, faults, charge complete,
  AC input loss, overload).
- `rememberDevice()` / `renderKnownDevices()` / `tryAutoConnect()` — saved
  device list (`POWER-devices`) and chooser-free reconnect via
  `navigator.bluetooth.getDevices()`.
- `connect(options)` — the single connect path for taps and auto-connect
  alike; see "Connecting and device discovery" above before touching it.
- `setConnState()` / `connStateCopy()` / `friendlyConnectError()` /
  `renderConnectHelp()` — the connection status bar and the guided card that
  replaces the dashboard while disconnected.
- `refreshGrantedDevices()` / `cancelAutoConnect()` — `grantedDevices` cache
  and the loop's cancellation flag.
- `connectToKnown(id)` / `connectNewDevice(showAll)` — Settings › Devices
  entry points. `connectNewDevice(true)` pairs with `acceptAllDevices`, for
  units advertising outside the `POWER` / `AFERIY` / `FOSSIBOT` prefixes.
- `switchbotPress()` / `renderSwitchbotPanel()` — the "SwitchBot Power
  Button" panel at the bottom of the Control view: its Press button pairs a
  SwitchBot Bot (button pusher) and makes it press the station's physical
  power button, the only way to wake a unit whose BLE is off; 5 s after a
  successful press it kicks off `tryAutoConnect()`. Separate GATT connection
  and `SWITCHBOT_*` constants; does not touch the power-station connect path
  or its command queue. Bot password = CRC32 only, stored as
  `POWER-switchbot-key`; paired Bot stored as `POWER-switchbot`. Protocol
  details in `PROTOCOL.md` §8. Also the onclick for `.btn-switchbot-corner`,
  the bottom-left dashboard corner icon shown while disconnected — same
  function, no separate wiring.
- `.btn-switchbot-corner` / `.btn-poweroff-corner` — the bottom-left corner
  icon is the physical power button by proxy, toggled by `updateStatus()`
  exactly like `.btn-connect`/`.btn-disconnect`: `switchbotPress()` while
  disconnected (nothing else can reach a station with its BLE off), reused
  `toggleSetting('power_off')` (Reg 64, with its existing `confirm()`) while
  connected. Never let the connected state fall through to a SwitchBot press
  — a paired Bot pressing an already-on station's power button would turn it
  *off*.

## Conventions

- **No comments unless the *why* is non-obvious.** Don't narrate what the code
  does; identifiers already do that.
- **Branches:** `claude/<short-topic>-<id>`. The user's automation creates the
  branch before the session starts; develop and push there.
- **Commits:** short imperative subject, no scope prefix. Examples from
  history: `Fix mismatched unit on dashboard remaining-time display`,
  `Treat only error codes 78/79 as device faults`.
- **Verification:** run `node --test "test/*.test.mjs"` (no dependencies, no
  install step; CI runs the same command). It covers the protocol packet
  builder, the Reg 68 brick guard, `handleNotification()` packet decoding,
  `checkAlerts()` notification rules, the four `connect()` invariants, the
  connection status copy and its card/dashboard swap, the Diag tab's register
  formatting and JSON round trip, daily energy accounting, and `node --check`
  over every inline `<script>` block. Still unverified: the history chart, the
  appliance simulator, and the SwitchBot panel. To verify
  anything else:
  1. Add a test — `test/extract.mjs` harvests any top-level function out of
     `index.html` and evaluates it with stubs for its free variables, so pure
     logic (parsers, formatters, register maps) is testable without a browser.
     Load a function together with everything it calls, or you get a
     `ReferenceError` for the missing stub. It handles `function` declarations
     and block-bodied arrow consts; `loadLiteral()` pulls out a top-level table
     such as `KNOWN_REGS` so tests assert against the real map rather than a
     copy. `test/harness.mjs` supplies a fake `document` and builders for
     synthetic BLE packets.

     `handleNotification()` swallows exceptions into `console.error`, so assert
     that nothing was caught — otherwise a missing stub reads as a pass.
     `loadFunctions(...).readVar(name)` reads back module state the code
     assigns rather than returns, such as `device` on the connect path.

     `connect()` takes `navigator` as a free variable, so `test/connect.test.mjs`
     drives the whole path against a stub with no browser. What that cannot see
     is the DOM wiring — that `connect` is registered as a click listener at
     all — so a change to how it is bound still needs the Playwright check
     below.
  2. Load the PWA over `localhost` against a real device, or
  3. Import a saved JSON dump in the Diag tab to replay register state.

  Real hardware is usually not available to a Claude Code session, and the
  live site is the only place the maintainer can test. For connection or BLE
  logic, drive the real `index.html` in headless Chromium (Playwright is
  preinstalled) over `python3 -m http.server`, with `navigator.bluetooth`
  replaced via `addInitScript` by a stub exposing `getDevices()`,
  `requestDevice()` and a fake `device.gatt`. Assert on *which* API calls
  happen — e.g. "tapping Connect reaches `requestDevice`" — and run the same
  script against `git show origin/main:index.html` to prove the bug existed
  before the fix. Note `.btn-connect` matches three elements, only one of
  which is visible. This catches regressions that `node --check` cannot, but
  it does not replace a confirmation run against a real power station.
- **Keep `index.html` as a single file.** Don't introduce a bundler or split
  into modules without discussion.
- **Service worker:** bump `CACHE_NAME` in `service-worker.js` only when
  static assets change; the app shell is network-first so code deploys go
  live without a version bump.

## When debugging user reports

The Diag tab can **Copy JSON** of the current Status (`0x1104`) and Settings
(`0x1103`) register banks. Always ask the reporter for that JSON before
guessing — it removes most ambiguity. Common gotchas:

- Apparent "halved charge rate" → check Reg 57 (Silent Charging) before
  assuming a code bug.
- Apparent "zero battery" → check decode order for Reg 56, not the device.
- Apparent fault banner with no fault → Reg 8 must be 78/79 before showing a
  fault; Reg 42 bits 13–14 alone are not an error.
- Device unresponsive after settings change → ask exactly which registers
  were written (see the reg 68 brick hazard).
- "Power Off did nothing" → check Reg 3/4 (AC/DC input watts) for active
  charging first. Reg 64 = 1 gets echoed back by the device as a normal write
  confirmation (`handleNotification()`'s opCode `0x06` branch) even when the
  unit does not actually shut down — the echo only proves the command was
  received, not that the physical power-off happened. Confirmed in the field:
  a unit charging from a van battery took the write, echoed it, and stayed
  on. Ask the reporter to retry with no AC/DC input connected before treating
  it as a code bug.
- "Connect does nothing" / no device chooser on Android → ask what the status
  bar above the dashboard says first; it names the failure and the next step
  without opening Diagnostics. Then check the terminal
  log. `Reconnecting to saved device:` followed by repeated
  `Connection failed:` means a stale saved device is being retried, not that
  discovery is broken; the chooser opens after `MAX_SILENT_RETRIES`. An
  *empty* chooser is a browser permission problem (Nearby devices /
  Location), not a code bug — have the reporter try "Pair Any Device" in
  Settings › Devices to rule out the name filter. See "Connecting and device
  discovery" above.
- Reports that arrive right after a deploy → the app shell is network-first,
  but an installed PWA may still be running a cached build. Ask the reporter
  to fully close and reopen it before assuming the newest commit is what they
  are running.
