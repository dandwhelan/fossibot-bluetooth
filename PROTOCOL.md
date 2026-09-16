# Fossibot F2400 / Aferiy Bluetooth Protocol

This document details the reverse-engineered Bluetooth Low Energy (BLE) protocol for Fossibot and Aferiy portable power stations (shared Sydpower/Tuya platform).

> **Note:** Register map correlated across 5 devices (Fossibot + Aferiy, US 120V/60Hz + EU 230V/50Hz variants) with cross-analysis assistance from Gemini Pro.

## Connection Details

* **Service UUID:** `0000fff0-0000-1000-8000-00805f9b34fb`
* **Write Characteristic:** `0000fff2-0000-1000-8000-00805f9b34fb` (Handle 0x24)
* **Notify Characteristic:** `0000fff1-0000-1000-8000-00805f9b34fb` (Handle 0x21)

## Packet Structure

All data is Big-Endian. Packets generally follow this structure:

| Header | OpCode | Unknown | Unknown | Payload | Checksum |
|:-------|:-------|:--------|:--------|:--------|:---------|
| `11`   | `04`   | `00`    | `00`    | ...     | `CRC`    |

Header byte `0x11` is the Modbus slave address (Register 17). Always `0x11` over BLE.

### Payload Types

The device uses different function codes (OpCodes) for different types of data:

1. **0x1104 (STATUS):** Real-time telemetry (Voltages, Watts, Flags). Broadcast automatically or polled.
2. **0x1103 (SETTINGS):** Device configuration (Timers, Limits, Toggles). Sent on connection or requested.

---

## 1. STATUS Registers (0x1104)

*Read-only, updates frequently (~2s interval).*

### Power & Input

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 2   | **AC Charge Speed Status** | 1-5 | Currently active charge speed profile. Usually mirrors Settings Reg 13, unless system has throttled it. |
| 3   | **AC Input Watts** | Watts | AC mains input power. |
| 4   | **DC Input Watts** | Watts | Solar/DC input power. |
| 5   | Unknown | - | Always 0 across all tested devices. |
| 6   | **Total Input Watts** | Watts | Sum of AC (Reg 3) + DC (Reg 4). |
| 7   | **AC Grid Power** | Watts | Signed 16-bit integer. Positive = importing AC grid power; negative = exporting / grid feedback (e.g. grid-tie). |
| 8   | **Error Code** | Raw | Numeric error ID corresponding to the fault bitmask in Reg 42. e.g. value `79` seen alongside Reg 42 = 0xE000. |

### Inverter Output

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 13  | AC Charge Rate | 1-5 | Level 1 (~300W) to 5 (~1100W). |
| 14  | **Max AC Input** | Watts | Max AC charge limit. 1100W (EU), 1500W (US). |
| 16  | Frequency Setting | Hz &times; 10 | e.g., 500 = 50.0 Hz, 600 = 60.0 Hz. |
| 18  | AC Out Voltage | V &times; 10 | e.g., 2306 = 230.6V (EU), 1198 = 119.8V (US). |
| 19  | AC Out Frequency | Hz &times; 10 | e.g., 500 = 50.0 Hz, 600 = 60.0 Hz. |
| 20  | **Total Output Power** | Watts | Sum of all outputs. **Use this for charging detection.** |
| 21  | **AC Input Voltage** | V &times; 10 | Measures grid voltage when AC connected. e.g. 2319 = 231.9V. **Dual-purpose:** shows small state codes (9, 15, 18, 21) when no AC input. Value 15 observed during cold temp protection (thermometer+L icon). |
| 22  | Battery Voltage | V &times; 10 | e.g., 4999 = 499.9V, 6002 = 600.2V. Only populated on some device models. |

### Output Ports

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 24  | USB Toggle State | 0/1 | Status of USB ports. |
| 25  | DC Toggle State | 0/1 | Status of DC ports (12V/Car). |
| 26  | AC Toggle State | 0/1 | Status of Inverter. |
| 27  | Light State | 0-3 | 0=Off, 1=On, 2=Flash, 3=SOS. |
| 30  | USB-A1 Output | Watts &times; 10 | First USB-A port output. |
| 31  | USB-A2 Output | Watts &times; 10 | Second USB-A port output. |
| 34  | USB-C1 Output | Watts &times; 10 | First USB-C port output. |
| 35  | USB-C2 Output | Watts &times; 10 | Second USB-C port output. |
| 36  | USB-C3 Output | Watts &times; 10 | Third USB-C port output. |
| 37  | USB-C4 Output | Watts &times; 10 | Fourth USB-C port output. |
| 39  | **Total Output Power** | Watts | Output wattage across all active ports. Primary total output power gauge used on the official vendor app dashboard. |

### System Flags & Protection

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 40  | Pack Config Voltage | V &times; 10 | Pack voltage calibration value. |
| 41  | **Port & Subsystem Active Flags** | Bitmask | Real-time port & charging state machine. Bit 2 = AC Out Active; Bit 3 = AC In Present (Grid); Bit 4 = AC In Charging Active; Bit 5 = Low PV In Present; Bit 6 = Low PV Charging Active; Bit 7 = DC Out Active; Bit 8 = Car In Present; Bit 13 = Car In Charging Active; Bit 14 = High PV In Present; Bit 15 = High PV Charging Active. Bits 2+3 simultaneous = UPS Bypass Mode. |
| 42  | **Protection Flags (Critical)** | Bitmask | **0 = OK.** Non-zero = active system fault. `0xE000` (bits 13,14,15) = Critical Hardware Failure. Correlates with Error Code in Reg 8. **Dashboard shows warning when non-zero.** |
| 47  | Hardware Constant | Flags | Always 0x3000 (12288) across all 5 tested devices. Not a sensor. |
| 48  | **System Status Flags** | Bitmask | `0x8000` = AC Charging, `0x4000` = Inverter Standby/Ready, `0x0008` = Error Pending. |
| 49  | Unknown Reg 49 | Raw | Always 0 across tested devices. |
| 50  | Unknown Reg 50 | Raw | Always 0 across tested devices. |
| 52  | Device Specific (Model?) | Raw | Value 180 on Aferiy devices, 0 on Fossibot. Not temperature. |

### Battery & SOC

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 53  | **Ext1 SOC** | Special | Extension Battery 1 SOC. 0=Missing, else (val-10)/10 = %. |
| 54  | **Battery Full Capacity** | 0.1Ah | e.g. 374 = 37.4Ah (Aferiy), 762 = 76.2Ah (Fossibot). Used to calculate SOH. |
| 55  | **Ext2 SOC** | Special | Extension Battery 2 SOC. 0=Missing, else (val-10)/10 = %. |
| 56  | **Main SOC** | 0.1% | State of Charge. e.g. 830 = 83.0%. |

### Timers & Limits

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 57  | **Booking Charge Delay** | Minutes | Countdown timer for scheduled charging (in minutes remaining). 0 when no schedule is active. |
| 58  | **Time to Full** | Minutes | Estimated charge time remaining. Indicates "Already Full" if <= 0 while SOC is 100% and AC connected without active output load. |
| 59  | **Time to Empty** | Minutes | Estimated discharge time remaining under current load. |
| 60  | AC Standby Counter | Minutes | Current AC standby countdown. |
| 61  | DC Standby Counter | Minutes | Current DC standby countdown. |
| 62  | USB Standby | Raw | Always 255 (0xFF) across all tested devices. Likely "disabled" sentinel. |
| 63  | Unused | Raw | Always 65535 (0xFFFF) across all tested devices. Padding/sentinel. |
| 66  | **Ext3 SOC** | Special | Extension Battery 3 SOC. 0=Missing, else (val-10)/10 = %. (Discharge Limit is Settings Reg 66). |
| 67  | **Ext4 SOC** | Special | Extension Battery 4 SOC. 0=Missing, else (val-10)/10 = %. (Charge Limit is Settings Reg 67). |
| 68  | Shutdown Timer | Raw | Machine shutdown countdown. |
| 69  | **Fan Level** | 0-5 | Current fan speed level. |
| 80  | CRC Checksum | Hex | Packet checksum value. |

---

## 2. SETTINGS Registers (0x1103)

*Read/Write. Defines device behavior.*

### System & Hardware

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 0   | **Factory Reset / Unbind** | 1 | Writing 1 triggers device unbind and factory defaults reset. |
| 2   | Active Charge State | 1-4 | 1=Slow, 4=Const Current. Correlates with Reg 13. |
| 3   | AC Input Watts | Watts | 0-1100. Rate at which AC is being drawn. |
| 4   | DC Input Watts | Watts | 0-500. Solar/Car Input. |
| 5   | **Master System Enable** | 0/1 | 0=Off/Fault, 1=On. **Forced to 0 during Critical Faults** (Input Reg 42). |
| 6   | Total Input Watts | Watts | 0-1600. Sum of AC + DC Input. |
| 11  | **Hardware/Model ID** | Hex | Identifies regional hardware variant. `0x0600` = US, `0x0200` = EU Type A, `0x0D00` = EU Type B. |

### Charging & Power

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 13  | **AC Charge Speed Setting** | 1-5 | User's preferred charge speed dial position. Mirrored in Input Reg 2 (unless throttled). |
| 14  | **Max Charge Wattage** | Watts | Power cap for Charge Speed "5". 1500W (US), 1100W (EU). |
| 16  | Frequency Setting | Hz &times; 10 | Output frequency (500 = 50Hz, 600 = 60Hz). |
| 17  | **Max Charge Current Limit** | Amps | Hardware capability ceiling for AC charging current (e.g. 10, 15, or 20A). Defines selectable upper bound for Reg 20. |
| 19  | **Max AC Input Current** | Deci-Amps | Hardcoded safety limit. `1600` = 16.0A (120V US), `500` = 5.0A (230V EU). |
| 20  | **Charge Current Setting** | Amps | Configurable AC charging current limit (1 to Reg 17 Amps). |

### Readings & Toggles

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 21  | AC Input Voltage | V &times; 10 | Measured AC input voltage. |
| 22  | Battery Voltage | V &times; 10 | Measured battery voltage. |
| 24  | USB Enabled | 0/1 | USB ports toggle. |
| 25  | DC Enabled | 0/1 | 12V DC toggle. |
| 26  | AC Enabled | 0/1 | Inverter toggle. |
| 27  | Light Mode | 0-3 | 0=Off, 1=On, 2=Flash, 3=SOS. |
| 32  | Firmware Version | Raw | Device firmware version identifier. |
| 40  | Pack Voltage Calib 1 | Raw | Battery pack calibration value 1. |
| 41  | Pack Voltage Calib 2 | Raw | Battery pack calibration value 2. |
| 47  | **AC Firmware Version** | High/Low Byte | Microcontroller firmware version for AC inverter module (`IntUtils.intToHighLow`). |
| 48  | **BMS Firmware Version** | High/Low Byte | Microcontroller firmware version for Battery Management System. |
| 49  | **PV Firmware Version** | High/Low Byte | Microcontroller firmware version for Solar MPPT module. |
| 50  | **DC / Panel Version** | High/Low Byte | Microcontroller firmware version for front display / DC module. |

### Timers & Limits

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 56  | Key Sound | 0/1 | Button beep toggle. |
| 57  | Silent Charging | 0/1 | Mute charging sounds / cap fan speed. |
| 59  | USB Standby Time | Seconds | Auto-off timer for USB ports. Allowed: 0, 180, 300, 600, 1800. 0 = Never. |
| 60  | AC Standby Time | Seconds | Auto-off timer for AC inverter (stored in seconds, UI shows minutes). Allowed: 0, 480, 960, 1440. 0 = Never. |
| 61  | DC Standby Time | Seconds | Auto-off timer for 12V DC (stored in seconds, UI shows minutes). Allowed: 0, 480, 960, 1440. 0 = Never. |
| 62  | Screen Timeout | Seconds | Auto-off timer for LCD display (stored in seconds: 180=3m, 300=5m, 600=10m, 1800=30m). 0 = Never. |
| 63  | Booking Charge | Minutes | Scheduled charging delay timer in minutes. |
| 64  | Power Off | 1 | Command to shutdown device. |
| 66  | **Discharge Limit** | 0.1% | Min SoC %. Stop discharging at this %. e.g. 100 = 10%. |
| 67  | **Charge Limit** | 0.1% | Max SoC %. Stop charging at this %. e.g. 1000 = 100%. |
| 68  | Machine Shutdown | Minutes | Auto-shutdown whole device if idle. **DO NOT WRITE 0** — confirmed to permanently brick devices in the field (issue #1, 2026-05-02) and per [`schauveau/sydpower-mqtt`](https://github.com/schauveau/sydpower-mqtt) `MQTT-MODBUS.md`. Allowed: 5, 10, 30, 60, 480. |
| 80  | CRC Checksum | Hex | Packet checksum. |

### Writable Register Safety Whitelist

**WARNING: Fossibot firmware does NOT validate register write values. Writing an out-of-range value can permanently brick a device.**

> **CONFIRMED BRICK — Reg 68 = 0:** Writing `0` to register 68 (Machine Shutdown / Whole Machine Unused Time) has been confirmed to permanently brick Fossibot devices in the field. A user (issue #1, 2026-05-02) lost a Fossibot F2400W this way; the unit could not be recovered with the standard DC+Light+USB factory-reset chord. The community-maintained [`schauveau/sydpower-mqtt`](https://github.com/schauveau/sydpower-mqtt) project documents the same risk. Forks must keep this register out of any user-writable code path with a value of 0.

| Register | Allowed Values |
|:---------|:---------------|
| 20 (Max Charging Current) | 1-20 (integers) |
| 24 (USB Output) | 0 or 1 |
| 25 (DC Output) | 0 or 1 |
| 26 (AC Output) | 0 or 1 |
| 27 (LED) | 0, 1, 2, 3 |
| 57 (AC Silent Charging) | 0 or 1 |
| 59 (USB Standby Time) | 0, 3, 5, 10, 30 |
| 60 (AC Standby Time) | 0, 480, 960, 1440 |
| 61 (DC Standby Time) | 0, 480, 960, 1440 |
| 62 (Screen Rest Time) | 0, 180, 300, 600, 1800 |
| 63 (Stop Charge After) | 0-1440 (minutes) |
| 66 (Discharge Limit) | 0-1000 (0.1% units) |
| 67 (Charging Limit) | 0-1000 (0.1% units) |
| 68 (Machine Shutdown) | 5, 10, 30, 60, 480 — **NEVER 0 (bricks device)** |

---

## 3. Command Registers (Write Only)

*Control actions.*

| Reg | Name | Value | Description |
|:----|:-----|:------|:------------|
| 64  | Power Off | 1 | Shuts down the entire machine. The device echoes the write back as a normal confirmation (opCode `0x06`) whether or not it actually powers off — the echo is protocol-level receipt, not proof of shutdown. Observed in the field: a unit charging from an external source (van battery) accepted and echoed the write but stayed on. Suspected firmware interlock against shutting down mid-charge, not independently confirmed — untested whether it powers off with no AC/DC input connected. |

---

## 4. Network Configuration (0x1107)

*Write/Notify. Controls WiFi connectivity.*

**OpCode:** `0x07`

### Connect to WiFi (Disable AP)

Sending valid WiFi credentials causes the device to connect to the local network and **automatically disable** its credentials-free Access Point (AP).

| Header | OpCode | SSID Len | Pass Len | SSID | Password | CRC |
|:-------|:-------|:---------|:---------|:-----|:---------|:----|
| `11`   | `07`   | `Len`    | `Len`    | String ... | String ... | `CRC` |

**Example (from logs):**

* **SSID:** "Test" (Len 4)
* **Pass:** "TEST1234" (Len 8)
* **Packet:** `11 07 04 08 54 65 73 74 54 45 53 54 31 32 33 34 76 C3`

### Notifications

The device sends status updates containing the `0x07` OpCode.

| Status Byte | Meaning |
|:------------|:--------|
| `02`        | Connecting... |
| `01`        | Connected / Success |

**Example:**

* `11 07 02 ...` -> Connecting
* `11 07 01 ...` -> Connected
* `11 07 01 ...` -> Connected

---

## 5. Protocol Discovery Findings

Recent analysis reveals the device stack is likely based on Espressif AT commands.

* **AT Command Leak:** The device occasionally leaks raw AT command strings via the Notification characteristic (0xc305).
  * Cloud API identified: `api.app.sydpower.com`
* **OpCode Scan (0x00 - 0x20):**
  * **Readable/Valid:** `0x03` (Settings), `0x04` (Status).
  * **Write-Only/Notify:** `0x07` (Network), `0x05` (Switch Control).
  * **Error (OpCode | 0x80):** `0x00-0x02`, `0x06`, `0x08-0x20`.
  * **Conclusion:** No hidden readable registers found in this range. The "Silent" behavior seen earlier was likely due to GATT congestion which is now resolved.

### OpCode Map (0x00 - 0x20)

| OpCode | Function | Type | Status |
| :--- | :--- | :--- | :--- |
| `0x00` | - | Error | Returns `0x80` |
| `0x01` | - | Error | Returns `0x81` |
| `0x02` | - | Error | Returns `0x82` |
| `0x03` | **Settings** | R/W | Returns Settings Data |
| `0x04` | **Status** | Read | Returns Status Data |
| `0x06` | Write | **Control** | Write to Registers (e.g. Turn USB On) |
| `0x07` | Write | **WiFi** | WiFi Configuration |
| `0x08`+ | - | Error | All return `0x8x` (Not Supported) |

## Packet Construction Notes

**OpCode 0x06 (Write):** used for all control actions (USB, AC, DC, Light).
Structure: `Header(11) Op(06) RegHi RegLo ValHi ValLo CRC_Hi CRC_Lo`.

**CRC Order:**
The correct CRC byte order is **Hi-Byte First** (Modbus Standard), e.g., `0xAA 0xBB`.
Legacy code/findings suggesting `Lo-Hi` were incorrect and caused packet rejection.

---

## 6. Error Code Logic (Reg 8 + Reg 42)

### Error Codes (Reg 8)

| Code | Meaning | Notes |
|:-----|:--------|:------|
| 0    | **Normal** | No error. |
| 78   | **Inverter Fault** | AC inverter offline. DC Charging via Solar still works. |
| 79   | **AC Charging Interrupted** | Safety Lockout. Triggers for BOTH critical hardware failures AND environmental protection (Cold/Hot). |
| Other | **Normal (unknown meaning)** | Some firmware reports other non-zero values during normal operation (e.g. 136 / 0x88 observed on a healthy device with Reg 42 = 0xE3D8). Do **not** treat `Reg 8 > 0` as an error — only codes 78 and 79 are confirmed faults. |

### Fault Detection (Reg 42)

Reg 42 is a **mixed-purpose bitmask** containing both status bits and fault bits. You **cannot** simply check `if (Reg42 > 0)` — the lower bits reflect normal MOSFET state.

**Bitmask Layout:**

| Bits | Mask | Meaning |
|:-----|:-----|:--------|
| Bit 15 | 0x8000 | System Warning / Non-Critical Latch (often always on) |
| Bits 13-14 | **0x6000** | **CRITICAL FAULT MASK** |
| Bits 0-12 | 0x1FFF | Output MOSFET Status (e.g., +984 when USB/DC is on) |

**Important:** Bits 13-14 can be set during normal device operation (e.g., Reg 42 = `0xE3D8` while healthy). Do **not** use `isCriticalFault` alone as an error indicator — it must be combined with Reg 8.

**Implementation:**

```javascript
const isCriticalFault = (Reg42 & 0x6000) > 0;
```

### Combined Logic (Error Classification)

When Reg 8 reports Error 79:
- **IF `(Reg42 & 0x6000) > 0`:** Hardware Failure (critical).
- **IF `(Reg42 & 0x6000) == 0`:** Environmental Protection (Cold/Hot Temperature).

If Reg 8 is anything other than 78 or 79 (Normal), do **not** show any fault — even if bits 13-14 are set in Reg 42.

### UI Display Rules

- **Status Text Priority:** Error (Reg 48 bit 3) > Charging (Reg 48 bit 15) > Standby (Reg 48 bit 14).
- If Error 79 is present with NO critical bits in Reg 42, display **"Temp/Safety Protection"** instead of "System Failure".

---

## 7. BLE Service Map (Discovered)

Based on exploration of `0xA002` and `0xA003`.

### Service `0xA002` (Main Control)

**Likely Tuya BLE Protocol (v3.x or similar)**
The presence of `Y_DHK` and `LOCAL_KEY` in `0xC301` confirms this is a **Tuya-based** device.

| UUID | Props | Description | Notes |
| :--- | :--- | :--- | :--- |
| `0xC300` | Read | ? | Static Value: `0x30` ("0") |
| `0xC301` | Read | **Tuya Config** | Contains `Y_DHK` (Device Secret) and `LE_LOCAL_KEY` (Local Key). |
| `0xC302` | Write | ? | - |
| `0xC303` | ? | ? | - |
| `0xC304` | **Write** | **Command** | Used for sending packets (0x11...) |
| `0xC305` | **Notify** | **Status** | Used for receiving packets (0x11...) |
| `0xC306` | ? | ? | - |
| `0xC307` | Read | ? | Static Value: `0x30` ("0") |

### Service `0xA003` (Auxiliary?)

| UUID | Props | Description | Notes |
| :--- | :--- | :--- | :--- |
| `0xC400` | Read | ? | Static Value: `0x30` ("0") |
| `0xC401` | Read | ? | Static Value: `0x30` ("0") |

---

## CRC Calculation

The protocol uses a custom CRC-16 checksum with polynomial 0xA001 (Modbus standard). See `calculateChecksum()` in `index.html` for implementation details.

---

## 8. SwitchBot Bot (Remote Power Button)

Used by the "SwitchBot Power Button" panel to wake a powered-off station by
having a SwitchBot Bot press the physical power button. This is the vendor's
own BLE protocol, documented at
<https://github.com/OpenWonderLabs/SwitchBotAPI-BLE> (`devicetypes/bot.md`).

| UUID | Role |
| :--- | :--- |
| `cba20d00-224d-11e6-9fb8-0002a5d5c51b` | Primary service |
| `cba20002-224d-11e6-9fb8-0002a5d5c51b` | Write (commands) |
| `cba20003-224d-11e6-9fb8-0002a5d5c51b` | Notify (responses) |

Commands (write, then wait for one notification):

| Bytes | Meaning |
| :--- | :--- |
| `57 01 00` | Press (no password set) |
| `57 11 <crc32> 00` | Press with password — `<crc32>` is the big-endian CRC32 of the password string (same scheme as pySwitchbot) |

First byte of the notification: `01` OK · `02` error · `03` busy · `06` low
battery · `07` device has a password (command was sent without one) · `09`
wrong password.

For discovery, Bots advertise service data under UUID `0xFD3D` (device type
byte `H` / `0x48`; older firmware also advertises the 128-bit service UUID).
The 2026 rechargeable USB-C Bot uses the same protocol as the original.

---

## 9. Next-Gen Platform (Protocol V1 / Balcony Solar & Unified Architecture)

For devices advertising with firmware `protocol_version >= 1` (newer power station revisions and Balcony Solar energy storage devices), the Sydpower platform maps to a modernized unified register set (`se` architecture in BrightEMS):

### Holding Registers (V1 Settings)

| Reg | Name | Description |
|:----|:-----|:------------|
| 1   | `grid_charge_power_level_set` | AC grid charge speed level profile |
| 4   | `timeZone` | Device timezone configuration |
| 5   | `DST_start_time` | Daylight Saving Time start |
| 6   | `DST_end_time` | Daylight Saving Time end |
| 21  | `DC_input_max_curr` | Max DC charging current hardware limit |
| 23  | `DC_input_max_curr_set` | Configured DC charging current |
| 24  | `Offline_AC_output_sleep_time` | AC inverter standby sleep timer (replaces V0 Reg 60) |
| 25  | `LCD_dim_time` | Screen auto-dim / timeout timer (replaces V0 Reg 62) |
| 26  | `discharge_soc_min_limit` | Minimum discharge limit (DOD %) (replaces V0 Reg 66) |
| 27  | `ups_charge_soc_max_limit` | Maximum charge limit (%) in UPS mode (replaces V0 Reg 67) |
| 28  | `shutdown_wait_time` | Whole machine auto-shutdown idle timer (replaces V0 Reg 68) |
| 29  | `USB_QC_PD_sleep_time` | USB output standby sleep timer (replaces V0 Reg 59) |
| 30  | `DC_12V_output_sleep_time` | 12V DC output standby sleep timer (replaces V0 Reg 61) |
| 31  | `ECO_SOC` | Battery SOC threshold for ECO mode |
| 32  | `dod_deep_discharge` | Deep discharge recovery enable / calibration |
| 84  | `LowBatteryNotification` | Low battery audible / push notification threshold |
| 85  | `UPS_mode_set` | UPS mode priority setting |
| 86  | `grid_tie_out_power_max_set` | Maximum grid-tie export / feedback power in Watts |
| 88  | `charge_priority` | Charging source priority (Solar vs Grid) |

### Status Registers & System Control (V1 Telemetry)

* **Input Reg 75 (`systemState`)**: Active system state and function toggle bitmask, controlled via OpCode `0x05` (`GET_BLE_INPUT_REGISTER_SET`):
  * Bit 0: `pvSelfConsumption` (Solar self-consumption mode)
  * Bit 1: `grid_function_pause` (Pause grid feed-in)
  * Bit 2: `system_idle_set` (Idle mode toggle)
  * Bit 3: `AI_energy_control` (Automated dynamic energy scheduling)
  * Bit 4: `AC_backup_output_onoff` (AC emergency backup power output)
  * Bit 5: `DC_input_type` (DC input type select)
  * Bit 6: `silent_charging_mode` (Silent charging fan cap toggle)
  * Bit 7: `Buzzer_enable` (Key beep buzzer toggle)
  * Bit 8: `Low_PV_Vol_Exist_status` (Low-voltage solar input present)
  * Bit 9: `Low_PV_charge_onoff` (Low-voltage solar charging toggle)
  * Bit 10: `Car_charge_onoff` (Car charging toggle)
  * Bit 11: `DC_usb_pd_led_wirelesscharge_Port_Out_onoff` (DC/USB/LED master toggle)
  * Bit 12: `High_PV_Vol_Exist_status` (High-voltage solar input present)
  * Bit 13: `High_PV_charge_onoff` (High-voltage solar charging toggle)
  * Bit 14: `APP_control_remote_shutoff` (Remote shutdown command)
* **Input Reg 70 (`grid_charge_appointment_time`)**: Scheduled charge countdown timer (in minutes).
* **Input Regs 59–61 (Energy Metering)**:
  * Reg 59: `PV_charge_energy_total_H` (High 16 bits of lifetime cumulative solar generation Wh)
  * Reg 60: `PV_charge_energy_total_L` (Low 16 bits of lifetime cumulative solar generation Wh)
  * Reg 61: `PV_charge_energy_today` (Today's solar generation Wh)
* **Input Reg 78 (`total_DC_discharge_power`)**: Total DC discharge power in Watts.
* **Input Regs 97–99 (Device Real-Time Clock)**:
  * Reg 97: Year (High byte) & Month (Low byte)
  * Reg 98: Day (High byte) & Hour (Low byte)
  * Reg 99: Minute (High byte) & Second (Low byte)

---

## 10. DC-DC Auxiliary Battery Charger Protocol

BrightEMS also manages vehicle auxiliary DC-DC battery chargers (`DC_DC-V1-0083` profile, `wp` register mapping):

### Telemetry (Input Registers 0x1104)

| Reg | Name | Unit | Notes |
|:----|:-----|:-----|:------|
| 0   | `inputPower` | Watts | Starter / alternator input power |
| 1   | `inputVolt` | V &times; 10 | Starter / alternator input voltage |
| 2   | `inputCurrent` | A &times; 10 | Alternator input current |
| 3   | `outputPower` | Watts | Auxiliary battery charging power |
| 4   | `outputVolt` | V &times; 10 | Auxiliary battery charge voltage |
| 5   | `outputCurrent` | A &times; 10 | Auxiliary battery charge current |
| 6   | `deviceTemper` | &deg;C | Internal heatsink / power stage temperature |
| 7   | `faultFlags` | Bitmask | Bit 3 = Undervoltage Protection, Bit 7 = Engine Flameout Protection active |

### Configuration (Holding Registers 0x1103)

| Reg | Name | Description |
|:----|:-----|:------------|
| 10  | `shutdownWaitTime` | Standby shutdown delay timer |
| 11  | `outputVoltSet` | Target auxiliary battery float/bulk voltage setting |
| 12  | `appControlShutdown` | Remote software power shutdown |
| 13  | `flameoutProtection` | Engine vibration/flameout cut-off protection toggle |
| 14  | `inputCutoffVoltSet` | Alternator cutoff voltage threshold |

---

## 11. Fault Codes, Error Classification & Safety Protections Matrix

Firmware telemetry reports safety events and hardware faults across dedicated status registers and bitmasks:

### Classic V0 Platform (F2400 / F3600 Pro / AFERIY / SYDPOWER)

#### Input Register 8 (`errorCode`)
| Value | Classification | Meaning & Hardware Behavior |
|:---:|:---|:---|
| **`0`** | **Normal** | System healthy; no active faults. |
| **`78`** | **Inverter Stage Fault** | AC output stage tripped or overloaded (short circuit, high load, or inverter bridge thermal overload). **Solar MPPT charging, DC car port, and USB outputs remain operational.** |
| **`79`** | **Safety Lockout / Protection** | Evaluated in combination with **Input Reg 42** bits 13–14: <br>• **If `(Reg 42 & 0x6000) > 0`**: **Critical Hardware Failure** (`Error 79`). Power board hardware comparator or MOSFET punch-through detected. Master System Enable (Holding Reg 5) is forced to `0`. Requires AC disconnection and full power cycle/reset.<br>• **If `(Reg 42 & 0x6000) === 0`**: **Environmental Temperature Protection**. Battery cell temperature is out of safe operating envelope (&lt;0°C cold freeze charging lockout or &gt;55°C high-temperature thermal limit). Automatically clears when cell temperatures normalize. |
| **`136`** (`0x88`) | **Normal Running Status** | Routinely broadcast by healthy F2400 and F3600 units under standard charging/discharging. **Must NEVER be interpreted as an error.** |
| *Other* | **State Indicator** | Firmware lifecycle states (e.g. `1`). Not actionable faults. |

#### Input Register 42 (`protFlags`) — Hardware Protection Bitmask
* **Bits 0–12 (`0x1FFF`)**: Active MOSFET gate drive lines (e.g., `+984` / `0x03D8` when DC/USB active, `0xE3D8` under active load). Normal operating state.
* **Bits 13–14 (`0x6000`)**: **Critical Hardware Fault Mask**. Represents internal hardware fault comparator lines.
* **Bit 15 (`0x8000`)**: Hardware warning / protection latch.

#### Input Register 48 (`statusFlags`)
* **Bit 15 (`0x8000`)**: Active Charging (AC grid or DC solar).
* **Bit 14 (`0x4000`)**: Inverter Standby.
* **Bit 3 (`0x0008`)**: Transient AC switching state during relay transition. (Filtered to avoid false alarm flashes).

#### Input Register 21 (`ac_voltage`) Multiplexed State Code
* When the station is unplugged from AC mains, Reg 21 reports multiplexed operational status:
  * Value **`15`** (`1.5V`): **Cold Temperature Freeze Protection Active** (&lt;0°C). Lithium cell charge current inhibited to prevent lithium dendrite plating.

---

### DC-DC Auxiliary Vehicle Charger (`wp` / `DC_DC-V1-0083`)

#### Input Register 7 (`faultFlags`)
| Bit | Hex Value | Name | Function |
|:---:|:---:|:---|:---|
| **Bit 3** | `0x08` | `undervoltage-protection` | **Starter Battery Undervoltage Cutoff**. Alternator/starter voltage dropped below the threshold in Holding Reg 14 (e.g. 12.0V). DC-DC charger stops drawing current to preserve engine cranking power. |
| **Bit 7** | `0x80` | `flameout-protection` | **Engine Flameout Vibration Protection Active**. Accelerometer/vibration sensor detected engine shutdown. Charger halts to prevent draining starter battery with engine off. |

---

## 12. Fan Control, Cooling Levels & Thermal Telemetry Architecture

### Fan Speed Telemetry (Input Reg 69)
* **Register**: Input Register 69 in Status Bank (`0x1104`).
* **Name**: `fan_level`
* **Values**: `0` to `5`
  * `0`: Cooling fans stopped (silent / idle).
  * `1`: Low speed (whisper cooling, typical at low charge wattages &lt;300W).
  * `2`: Medium-low cooling.
  * `3`: Medium cooling (~600W–1000W charging).
  * `4`: High-speed cooling (heavy load / rapid charging).
  * `5`: Maximum forced-air cooling (1100W+ charging or high ambient temperature).
* **Silent Charging Override**: Holding Register 57 (`ac_silent_mode`). Setting to `1` throttles maximum AC charge rate by ~50% to maintain `fan_level` at 0–1 for quiet overnight operation.

### Temperature Measurement Architecture & Common Misconceptions
* **V0 Power Stations (F2400 / F3600 Pro / AFERIY):**
  * **No Direct Numeric °C Register in Modbus Telemetry**: The BMS and AC Inverter Sub-MCUs do not broadcast raw cell temperature in degrees Celsius over the Modbus BLE connection.
  * **Reg 52 Myth**: Input Register 52 was previously theorized to be temperature in early community projects. APK reverse engineering proved it is a static **Hardware Model Constant** (`180` = AFERIY, `0` = FOSSIBOT).
  * **Thermal Envelope Enforcement**: The BMS enforces thermal safety boundaries internally and reports violations via **Reg 21 = 15** (Cold Lockout &lt;0°C) and **Reg 8 = 79** with Reg 42 mask `0x6000 === 0` (Thermal Extreme Lockout).
* **Next-Gen V1 Platform (`se`):**
  * BMS User Status registers (Regs 37–45) report **Bit 9** (`BMS_user_status_BatHeat`): Active battery self-heating pad engaged for sub-zero temperature operation.
* **DC-DC Auxiliary Vehicle Charger (`wp`):**
  * **Input Register 6 (`deviceTemper`)**: Broadcasts direct real-time internal heatsink and power MOSFET temperature in **signed °C** (`vk.myfn.IntUtils.unsignIntToSignInt_16Bit`).


