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
```

There is no build step, package manager, lockfile, or test suite. The single
`index.html` is intentional — keeps offline/PWA install simple.

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

## ⚠️ Register 68 brick hazard

**Writing `0` to Settings Reg 68 (Machine Shutdown timer) permanently bricks
devices** — confirmed in the field (issue #1). Writes of 0 to reg 68 are
blocked at the protocol layer and the "Never" option is removed from the UI.
Never relax this guard. Allowed values: 5, 10, 30, 60, 480.

## Key registers (cheat sheet)

Sourced from `PROTOCOL.md` — treat that file as authoritative.

| Reg | Name | Notes |
| --- | --- | --- |
| 8 (Status) | Error Code | **Only 78 (inverter fault) and 79 (safety lockout) are real faults.** Healthy devices report other non-zero values (e.g. 136). |
| 13 | AC Charge Rate | 1–5 → ~300 to ~1100 W on F2400 EU |
| 14 | AC Charge Max Limit (W) | 1500 (US) / 1100 (EU) |
| 20 (Status) | Total Output Power | Use this for charging detection, not Reg 39 |
| 21 (Status) | AC Input Voltage ×10 | Doubles as state code (15 = cold-temp protection) when no AC input |
| 24/25/26 | USB / DC / AC output toggles | 0/1 |
| 27 | Light Mode | 0=Off, 1=On, 2=Flash, 3=SOS |
| 42 (Status) | Protection Flags bitmask | Critical mask is `0x6000`, but only meaningful combined with Reg 8 = 79. Lower bits are normal MOSFET state. |
| 48 (Status) | System Status Flags | 0x8000=Charging, 0x4000=Standby |
| 52 (Status) | Model marker | 180=Aferiy, 0=Fossibot. **Not temperature.** |
| 56 (Status) | Main SOC | 0–1000, divide by 10 for % |
| 57 | AC Silent Charging | 0/1. **Caps charge rate ~50% so the fan stays off.** |
| 58 / 59 (Status) | Time to Full / Time to Empty | minutes |
| 64 | Power Off command | write 1 to shut down |
| 66 / 67 | Discharge / Charge limit | % × 10 |
| 68 | Machine Shutdown timer | minutes — **see brick hazard above** |
| 69 (Status) | Fan Level | 0–5 |

There is **no documented register that exposes a numeric battery temperature**
on F2400 or Aferiy as of the current PROTOCOL.md.

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
- `accumulateEnergy()` / `updateEnergyStrip()` — daily Wh in/out totals
  (localStorage `POWER-energy`) and optional tariff cost estimate.
- `checkAlerts()` — notification rules (low battery, faults, charge complete,
  AC input loss, overload).
- `rememberDevice()` / `renderKnownDevices()` / `tryAutoConnect()` — saved
  device list (`POWER-devices`) and chooser-free reconnect via
  `navigator.bluetooth.getDevices()`.

## Conventions

- **No comments unless the *why* is non-obvious.** Don't narrate what the code
  does; identifiers already do that.
- **Branches:** `claude/<short-topic>-<id>`. The user's automation creates the
  branch before the session starts; develop and push there.
- **Commits:** short imperative subject, no scope prefix. Examples from
  history: `Fix mismatched unit on dashboard remaining-time display`,
  `Treat only error codes 78/79 as device faults`.
- **Verification:** there is no automated test suite. To verify changes:
  1. `node --check` the inline JS (extract `<script>` blocks first),
  2. Load the PWA over `localhost` against a real device, or
  3. Import a saved JSON dump in the Diag tab to replay register state.
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
