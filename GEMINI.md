# GEMINI.md

Guidance for future Google Gemini, Antigravity, and Gemini CLI sessions working on this codebase.

---

## 📖 Project Overview

This repository houses a high-performance, single-file Progressive Web App (PWA) that connects directly to **Fossibot, AFERIY, SYDPOWER, and ABOK** portable power stations via the browser's **Web Bluetooth API (BLE)**. It completely bypasses the manufacturer's cloud-dependent mobile apps (BrightEMS), providing local, privacy-first, low-latency control and monitoring.

- **Production URL:** <https://dandwhelan.github.io/fossibot-bluetooth/> (GitHub Pages)
- **Primary Target Hardware:** Fossibot F2400, F3600 Pro, AFERIY P210 / P310, SYDPOWER N052 / N066.
- **Operating Model:** 100% client-side, zero build step, fully offline-capable PWA.

---

## 📂 Repository Architecture & Layout

```text
├── index.html         # Monolithic web application (~5.3k lines): HTML, CSS, and vanilla JS
├── PROTOCOL.md        # Definitive reverse-engineered Modbus BLE register map & protocol spec
├── README.md          # End-user documentation, feature breakdowns, and platform guides
├── CLAUDE.md          # Guidance file for Anthropic Claude Code sessions
├── GEMINI.md          # Guidance file for Google Gemini & Antigravity sessions (this file)
├── service-worker.js  # PWA offline cache engine (network-first app shell, cache-first assets)
├── manifest.json      # PWA web app manifest
├── img/               # UI screenshots and visual assets
├── test/              # Stock Node.js test-runner suite (zero dependencies)
│   ├── extract.mjs    # Harvests top-level JS functions from index.html for headless testing
│   ├── harness.mjs    # Lightweight DOM and BLE packet mock harness
│   ├── alerts.test.mjs
│   ├── connect.test.mjs
│   ├── history.test.mjs
│   ├── import.test.mjs
│   ├── notification.test.mjs
│   ├── protocol.test.mjs
│   ├── registers.test.mjs
│   └── syntax.test.mjs
```

### ⚡ Architectural Non-Negotiables
1. **Single-File Architecture:** Keep `index.html` as a standalone file. Do **not** introduce a bundler (Vite, Webpack), package manager (`npm install`), or transpile step unless explicitly commanded by the user.
2. **Zero Runtime Dependencies:** The web application and test suite execute purely on native web and Node.js built-ins.
3. **Automated Verification:** All tests are run with `node --test "test/*.test.mjs"`. Every test must pass at all times.

---

## 📡 Bluetooth Low Energy (BLE) & Protocol Mechanics

### BLE GATT Service & Characteristic Map
* **Main Service:** `0000a002-0000-1000-8000-00805f9b34fb` (`0xA002`)
* **Write Characteristic:** `0000c304-0000-1000-8000-00805f9b34fb` (`0xC304` — write commands without response / with response)
* **Notify Characteristic:** `0000c305-0000-1000-8000-00805f9b34fb` (`0xC305` — incoming telemetry stream)

### Packet Framing (Modbus-RTU over BLE)
Commands use big-endian 8-byte framing with Modbus-16 CRC:
`[Header 0x11] [OpCode] [Reg High] [Reg Low] [Val High] [Val Low] [CRC High] [CRC Low]`
- **CRC-16 Polynomial:** `0xA001`, initial seed `0xFFFF`, appended high-byte first.
- **Write Command Queue:** All outgoing packets must route through `addToQueue()` / `processQueue()`. A mandatory 200 ms spacing prevents Android/Windows "GATT operation already in progress" errors.

### Modbus Banks
1. **Status Bank (`0x1104`):** Telemetry pushed automatically via `0xC305` notifications (~every 1–2 seconds while connected).
2. **Settings Bank (`0x1103`):** Configuration registers sent upon request or on change confirmation.
3. **Wi-Fi OpCode (`0x07`):** SSID and password provisioning (`11 07 01` connected / `11 07 02` connecting).

---

## 🏗️ Platform Matrix: V0 vs V1 vs DC-DC

APK reverse engineering revealed three distinct hardware families in the manufacturer ecosystem:

### 1. Classic V0 Platform (The Web App's Primary Focus)
- **Supported Models:** F2400, F3600 Pro, Aferiy P210/P310, Sydpower N052/N066.
- **Protocol:** Split banks (Settings `0x1103` vs Status `0x1104`). Individual holding registers for standby timers (59, 60, 61, 62, 68), limits (66, 67), and features.
- The web app Settings view is explicitly demarcated for this platform.

### 2. Next-Gen V1 Platform (`portable-power-station-v1`, `balcony-pv`, `switch-box`)
- **Firmware Marker:** Advertises with `protocol_version >= 1`.
- **Unified Register Layout (`se`):** Standby sleep timers are consolidated in lower contiguous registers:
  - `Reg 24`: AC Sleep, `Reg 25`: Screen Dim, `Reg 26`: Min Discharge Limit, `Reg 27`: UPS Max Charge, `Reg 28`: Whole Machine Shutdown, `Reg 29`: USB Sleep, `Reg 30`: 12V DC Sleep.
- **OpCode `0x05` Bitmask (`systemState` Reg 75):** Single-packet 15-bit toggle bitmask for Solar self-consumption, Grid feedback pause, AI energy, Buzzer, PV charging toggles, and remote shutdown.
- **Solar Generation Counters:** 32-bit cumulative Wh (Regs 59–60) and RTC synchronization (Regs 97–99). Fully documented in `PROTOCOL.md` §9.

### 3. DC-DC Auxiliary Vehicle Charger (`wp` / `DC_DC-V1-0083`)
- Dual-battery camper/vehicle charger. OpCodes `0x21` / `0x22`. Alternator input metrics (Regs 0–2), auxiliary battery charge metrics (Regs 3–5), engine flameout vibration protection (Reg 7 Bit 7 / Reg 13), and undervoltage protection (Reg 7 Bit 3). Fully documented in `PROTOCOL.md` §10.

### 4. Smart Transfer Switch Box (`switch-box` / ATS)
- Home backup and emergency automatic transfer switch accessory.
- Status Bank (`0x1104`): Input Reg 4 = Mode (1=Mains, 2=Smart), Input Reg 12 = Grid State (1=ON GRID, 2=OFF GRID, 3=FAULT), Input Reg 11 = Forced off-grid status.
- Settings Bank (`0x1103`): Holding Reg 12 = Force off-grid toggle (1 = isolate from grid and run loads on power station; 0 = restore mains bypass). Documented in `PROTOCOL.md` §13.

### 5. Multi-MCU Distributed Firmware Architecture (Classic V0)
- Distributed sub-MCUs reporting independent firmware in holding registers:
  - Reg 47: AC Inverter Sub-MCU
  - Reg 48: BMS Battery Sub-MCU
  - Reg 49: Solar MPPT Sub-MCU
  - Reg 50: DC Front Display Panel MCU
  - Decoding formula: `v((val & 0xff) / 10).toFixed(1)`. Documented in `PROTOCOL.md` §14.

---

## 🚨 Critical Safety Rules & Protocol Invariants

### 1. ⚠️ Register 68 BRICK HAZARD
> [!CAUTION]
> **Writing `0` to Settings Register 68 (Whole Machine Shutdown Timer) permanently bricks the power station.**
> This is a verified hardware MCU firmware bug (GitHub Issue #1).
> - Writes of `0` to Reg 68 are strictly blocked at the protocol layer in `setRegister()`.
> - The "Never" option is permanently removed from the UI.
> - Allowed values: `5, 10, 30, 60, 480` minutes.
> - **NEVER remove, relax, or bypass this guard.**

### 2. ⏱️ Register 59 vs 62 Unit Swap
* **Holding Reg 59 = USB Standby Timer** in **minutes** (`5, 10, 30, 60, 120, 480, 600, 0=Never`).
* **Holding Reg 62 = Screen Timeout Timer** in **seconds** (`60, 180, 300, 600, 1800, 3600, 7200, 14400, 0=Never`).
*(Previous community code inverted these two; writing seconds to Reg 59 caused USB ports to shut off unexpectedly).*

### 3. ⚠️ Fault Code Classification & Flashing Alerts (Reg 8 & Reg 42)
* **Reg 8 (`errorCode`):** Only codes **`78`** (Inverter Fault) and **`79`** (Safety Lockout / Temp Protection) represent true faults. Healthy devices routinely report **`136`** (`0x88`) or other non-zero numbers. **Never treat `Reg 8 > 0` as a fault.**
* **Reg 42 (`protFlags`):** Lower bits (0–12) reflect normal output MOSFET drive states (e.g. `+984` when DC/USB is active). Bits 13–14 (`0x6000`) represent the **Critical Hardware Fault Mask**.
* **Combined Rule:**
  - If `Reg 8 === 79 && (Reg 42 & 0x6000) > 0` &rarr; Critical Hardware Failure (`Error 79`). Forces Master System Enable Reg 5 to 0.
  - If `Reg 8 === 79 && (Reg 42 & 0x6000) === 0` &rarr; `Temp Protection` (ambient thermal limit: &lt;0°C cold charge lockout or &gt;55°C heat cutoff).
  - If `Reg 8 === 78` &rarr; `Inverter Fault` (AC inverter overload / trip; DC and solar MPPT continue working).
  - All other Reg 8 values &rarr; Normal operation (no fault banner).
* **Flashing Visual Alerting:** When an active fault is detected, `#protectionWarning` applies `.fault-active-flash` to pulsate with a high-visibility luminous red/amber glow.
* **DC-DC Fault Flags (Input Reg 7):** Bit 3 (`0x08`) = Undervoltage cutoff; Bit 7 (`0x80`) = Engine flameout vibration sensor tripped.

### 4. 🌀 Fan Speed Telemetry & Thermal Architecture
* **Input Reg 69 (`fan_level`):** Reports active cooling fan stage (`0`–`5`). App shows spinning fan icon `🌀` when `fan_level > 0`.
* **Holding Reg 57 (`ac_silent_mode`):** Caps AC charge wattage (~50%) to silence fans.
* **Temperature Architecture (Classic V0):**
  - **No Direct Numeric °C Register:** BMS sub-MCUs do not stream raw degrees Celsius over Modbus BLE.
  - **Reg 52 is NOT temperature:** Fixed hardware model constant (`180` = AFERIY, `0` = FOSSIBOT).
  - **Cold Freeze Protection (Reg 21):** When unplugged from mains, value **`15`** indicates Cold Temperature Protection active (&lt;0°C).
  - **Thermal Lockout (Reg 8 = 79):** Indicates environmental thermal extreme (&gt;55°C or &lt;0°C).
* **Temperature Architecture (DC-DC):**
  - **Input Reg 6 (`deviceTemper`):** Signed 16-bit integer directly reporting heatsink/MOSFET temperature in **°C**.

### 4. 📱 Android Web Bluetooth Discovery Invariants (PR #32)
* **Pass `auto` per call:** `connect({ auto: true })` from auto-connect, plain `connect()` from manual user taps. Never use global shared state.
* **No `await` before `requestDevice()` on manual paths:** Android Chrome consumes transient user gestures; any `await` before `requestDevice()` causes a fatal `SecurityError`.
* **Never leave dead devices latched:** `device` must be unlatched after repeated connection failures (`MAX_SILENT_RETRIES`) so the user can re-open the chooser.
* **Taps cancel background loops:** Calling `cancelAutoConnect()` prevents adapter lock collisions.

---

## 📋 Comprehensive Register Cheat Sheet (Classic V0)

### Settings Bank (`0x1103`) — Holding Registers
| Reg | Name | Format / Values | Description |
|:---:|:-----|:----------------|:------------|
| **0** | `factory_reset` | `1` | Restore factory defaults & unbind station |
| **11** | `hardware_model` | Raw integer | Regional hardware model ID |
| **13** | `charge_rate_level`| `1` to `5` | AC charging rate (~300W to ~1100W+ on EU) |
| **14** | `ac_max_power` | Watts | Max AC charging ceiling (1100W EU / 1500W US) |
| **16** | `ac_frequency` | `500` / `600` | AC inverter output frequency (50.0 Hz / 60.0 Hz) |
| **17** | `max_charge_current`| Amps | Hardware maximum charging current ceiling (e.g. 20A) |
| **20** | `charge_current` | `3` to Reg 17 | Configured charging current ceiling in Amps |
| **24** | `usb_output_state` | `0` / `1` | USB output port master switch |
| **25** | `dc_output_state` | `0` / `1` | 12V DC / Car port master switch |
| **26** | `ac_output_state` | `0` / `1` | AC inverter master switch |
| **27** | `light_mode` | `0`–`4` | 0=Off, 1=Low, 2=High, 3=SOS, 4=Flash |
| **47** | `mcu_version_ac` | Raw integer | AC Inverter Sub-MCU firmware version |
| **48** | `mcu_version_bms`| Raw integer | BMS Battery Sub-MCU firmware version |
| **49** | `mcu_version_pv` | Raw integer | Solar MPPT Sub-MCU firmware version |
| **50** | `mcu_version_dc` | Raw integer | DC Front Display Panel MCU firmware version |
| **56** | `key_sound` | `0` / `1` | Key sound / buzzer button confirmation beep |
| **57** | `ac_silent_mode` | `0` / `1` | Silent charging mode (caps charging speed to silence fans) |
| **59** | `usb_standby_time`| Minutes | USB auto-off: 5, 10, 30, 60, 120, 480, 600, 0=Never |
| **60** | `ac_standby_time` | Minutes | AC inverter auto-off: 60, 480, 960, 1440, 0=Never |
| **61** | `dc_standby_time` | Minutes | 12V DC port auto-off: 60, 480, 960, 1440, 0=Never |
| **62** | `screen_timeout` | **Seconds** | Screen auto-dim: 60, 180, 300, 600, 1800, 3600, 7200, 14400, 0=Never |
| **63** | `booking_charge_set`| Minutes | Delay from now until charging begins. Write `0` to cancel |
| **64** | `power_off` | `1` | Remote software power shutdown |
| **66** | `discharge_limit` | % &times; 10 | Minimum battery DOD discharge threshold (e.g. 100 = 10%) |
| **67** | `ups_charge_limit` | % &times; 10 | UPS mode maximum charge limit (e.g. 800 = 80%) |
| **68** | `shutdown_wait_time`| Minutes | Whole machine auto-off: 5, 10, 30, 60, 480. **NEVER 0** |

### Status Bank (`0x1104`) — Input Registers
| Reg | Name | Format / Units | Description |
|:---:|:-----|:---------------|:------------|
| **3** | `ac_input_power` | Watts | Ratified AC input power |
| **4** | `dc_input_power` | Watts | DC / Solar PV input power |
| **6** | `total_input_power`| Watts | Total input power |
| **7** | `grid_power` | Signed Watts | Grid feed power |
| **8** | `error_code` | Code | Error code: 78=Inverter, 79=Lockout/Temp, 136=Normal |
| **20** | `total_output_power`| Watts | Authoritative total load output (Reg 39 is duplicate) |
| **21** | `ac_voltage` | V &times; 10 | Mains AC voltage (15 = cold temp protection when offline) |
| **41** | `port_state_bitmask`| Bitmask | Bit 2=AC Out, 3=AC In, 4=AC Chg, 5=Low-PV In, 6=Low-PV Chg, 7=DC Out, 8=Car In, 9=USB Out, 10=LED Out, 13=Car Chg, 14=High-PV In, 15=High-PV Charge |
| **42** | `protection_bitmask`| Bitmask | Bits 0–12=MOSFETs (`+984` active), 13–14=`0x6000` Critical HW Fault, 15=`0x8000` Warning |
| **48** | `system_status` | Bitmask | Bit 15=`0x8000` Charging, Bit 14=`0x4000` Standby |
| **52** | `model_type` | Marker | 180=AFERIY, 0=Fossibot (Not temperature) |
| **53 / 55** | `ext_battery_1_2` | % &times; 10 | `0` = absent, otherwise `(val - 10) / 10 = %` |
| **54** | `battery_capacity`| 0.1 Ah | Full battery pack capacity (e.g. 400 = 40.0 Ah) |
| **56** | `main_battery_soc` | 0–1000 | Main battery SOC (`val / 10 = %`) |
| **57** | `booking_charge_rem`| Minutes | Live remaining countdown until scheduled charge starts |
| **58** | `time_to_full` | Minutes | Time remaining to complete charge |
| **59** | `time_to_empty` | Minutes | Time remaining at current discharge rate |
| **66 / 67** | `ext_battery_3_4` | % &times; 10 | `0` = absent, otherwise `(val - 10) / 10 = %` |
| **69** | `fan_level` | `0`–`5` | Active cooling fan speed stage |

---

## 🧪 Testing & Verification Workflow

The test suite runs with Node's native test runner without third-party frameworks:

```powershell
node --test "test/*.test.mjs"
```

### How Tests Work
- **`test/extract.mjs`:** Reads `index.html`, parses named function declarations (`handleNotification`, `setRegister`, `checkAlerts`, `generateCommandBytes`, `changeSelect`, `syncSettingsUI`), and evaluates them in a sandboxed module with mocks.
- **`test/harness.mjs`:** Supplies a lightweight DOM stub and packet builders (`statusPacket()`, `settingsPacket()`).
- **`node --check` syntax validation:** `test/syntax.test.mjs` extracts every `<script>` block in `index.html` and checks it with the V8 compiler.

### Verification Checklist After Changes
1. [ ] Run `node --test "test/*.test.mjs"` &rarr; **106/106 tests must pass**.
2. [ ] Verify that `index.html` remains 100% valid HTML/CSS/JS with no missing closing tags.
3. [ ] Verify that the Reg 68 shutdown timer guard (`val === 0`) cannot be reached under any circumstances.
4. [ ] Ensure both `CLAUDE.md` and `GEMINI.md` are kept synchronized when new registers or features are added.
