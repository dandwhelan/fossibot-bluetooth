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
service-worker.js  PWA caching.
manifest.json      PWA manifest.
img/               Screenshots.
icon-512.png       PWA icon.
task.md            Scratchpad / TODO notes.
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
  `[Header 0x11] [Cmd] [RegHi] [RegLo] [ValHi] [ValLo] [CRC]`. See
  `generateCommandBytes()` at `index.html:2298`.
- Two register banks:
  - **Status `0x1104`** — read-only telemetry (power flow, SOC, flags).
  - **Settings `0x1103`** — read/write configuration.
- Writes go through a command queue (~500ms gap) to avoid GATT collisions.
  See the "Robot Restaurant" analogy at the bottom of `README.md`.

## Key registers (cheat sheet)

Sourced from `PROTOCOL.md` and the maps in `index.html` (~`3375`, `3424`).

| Reg | Name | Notes |
| --- | --- | --- |
| 13 | AC Charge Rate | 1–5 → 300/500/700/900/1100W on F2400 EU |
| 14 | AC Charge Max Limit (W) | 1500 (US) / 1100 (EU) |
| 21 | AC Input Voltage ×10 | Doubles as state code (15 = cold-temp protection) |
| 24/25/26 | USB / DC / AC output toggles | 0/1 |
| 27 | Light Mode | 0=Off, 1=On, 2=Flash, 3=SOS |
| 52 | Model marker | 180=Fossibot, 0=Aferiy. **Not temperature.** |
| 56 | Main SOC | 0–1000, divide by 10 for % |
| 57 | AC Silent Charging | 0/1. **Caps charge rate ~50% so the fan stays off.** |
| 58 | Time to Full | minutes |
| 59 | Time to Empty | minutes |
| 64 | Power Off command | write 1 to shut down |
| 67 | EPS upper limit | %×10 |
| 68 | Machine Shutdown | auto-shutdown timer in minutes |
| 69 | Fan Level | 0–N |
| 76 | Error code | 79 = environmental protection (cold/hot) |

There is **no documented register that exposes a numeric battery
temperature** on F2400 or Aferiy as of the current PROTOCOL.md.

## Where common UI handlers live (index.html)

- `toggleSetting()` — checkbox/button toggles (~line 4595).
  Handles `ac_silent`, `light_mode`, `eps_toggle`, `power_off`.
- `changeSelect()` — dropdown writes (line 4633). Map at line 4636 routes
  `screen_timeout`, `ac_standby`, `dc_standby`, `usb_standby`, `sys_standby`,
  `eps_limit`, `charge_profile` → register numbers.
- `changeInput()` — numeric input writes (~line 4666).
- `setRegister(reg, val)` — low-level write entry point.
- `renderDiagnostics()` — Diag tab renderer (line 3484).
- Format helpers — formatter switch starts ~line 3450 (`charge_level` at
  3471, `watt`, `time`, etc.).
- Model auto-detect (capacity inference) — `index.html:2329`, `4731`.

## Conventions

- **No comments unless the *why* is non-obvious.** Don't narrate what the code
  does; identifiers already do that.
- **Branches:** `claude/<short-topic>-<id>` (e.g.
  `claude/fix-power-limit-rotation-rr6Hm`). The user's automation creates the
  branch before the session starts; develop and push there.
- **Commits:** short imperative subject, no scope prefix. Examples from
  history: `Fix mismatched unit on dashboard remaining-time display`,
  `Fix false Hardware Fault banner when device is operating normally`.
- **PRs:** only when the user explicitly asks.
- **Verification:** there is no automated test suite. To verify changes:
  1. Load the PWA over `localhost` against a real device, or
  2. Import a saved JSON dump in the Diag tab to replay register state.
- **Keep `index.html` as a single file.** Don't introduce a bundler or split
  into modules without discussion.

## Recent changes worth knowing

(From `git log` on `main`.)

- `63dcc3c` — Fix mismatched unit on dashboard remaining-time display.
- `680ad79` — Fix false Hardware Fault banner when device is operating
  normally.
- `042da43` — Fix false 'Error' status on switch toggle.
- `065f48c` — Fix battery `--` display by resolving variable declaration
  order.
- `fb20321`, `ea01db6`, `e437788` — `PROTOCOL.md` updated from a 5-device
  cross-analysis (Reg 42 fault bitmask, Reg 52 model marker, Reg 8/21
  corrections).
- `923807f` — Cold-temperature warning register findings.

## When debugging user reports

The Diag tab can **Copy JSON** of the current Status (`0x1104`) and Settings
(`0x1103`) register banks. Always ask the reporter for that JSON before
guessing — it removes most ambiguity. Common gotchas:

- Apparent "halved charge rate" → check Reg 57 (Silent Charging) before
  assuming a code bug.
- Apparent "zero battery" → check decode order for Reg 56, not the device.
- Apparent fault banner with no fault → check Reg 42 bitmask handling, not
  Reg 76 alone.
