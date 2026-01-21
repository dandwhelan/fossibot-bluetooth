# Fossibot F2400 Bluetooth Protocol

This document details the reverse-engineered Bluetooth Low Energy (BLE) protocol for the Fossibot F2400 portable power station.

## Connection Details

* **Service UUID:** `0000fff0-0000-1000-8000-00805f9b34fb`
* **Write Characteristic:** `0000fff2-0000-1000-8000-00805f9b34fb` (Handle 0x24)
* **Notify Characteristic:** `0000fff1-0000-1000-8000-00805f9b34fb` (Handle 0x21)

## Packet Structure

All data is Big-Endian. Packets generally follow this structure:

| Header | OpCode | Unknown | Unknown | Payload | Checksum |
|:-------|:-------|:--------|:--------|:--------|:---------|
| `11`   | `04`   | `00`    | `00`    | ...     | `CRC`    |

### Payload Types

The device uses different function codes (OpCodes) for different types of data:

1. **0x1104 (STATUS):** Real-time telemetry (Voltages, Watts, Flags). Broadcast automatically or polled.
2. **0x1103 (SETTINGS):** Device configuration (Timers, Limits, Toggles). Sent on connection or requested.

---

## 1. STATUS Registers (0x1104)

*Read-only, updates frequently (~2s interval).*

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 3   | **AC Input Watts** | Watts | Likely AC Input only. |
| 4   | **DC Input Watts** | Watts | **Solar/DC Input**. |
| 6   | **Total Input Watts** | Watts | Sum of AC (Reg 3) + DC (Reg 4). |
| 13  | AC Charge Rate | 1-5 | Level 1 (~300W) to 5 (~1100W) |
| 16  | Frequency | Hz &times; 10 | e.g., 500 = 50.0 Hz |
| 18  | AC Out Voltage | V &times; 10 | e.g., 2300 = 230.0 V |
| 19  | AC Out Frequency | Hz &times; 10 | e.g., 500 = 50.0 Hz |
| 20  | Total Output Power | Watts | Sum of all outputs |
| 21  | **AC Input Voltage** | V &times; 10 | e.g. 2317 = 231.7V. Measures Grid Voltage. **Note:** Matches Reg 18 (AC Out) when Bypass Relays are closed during charging. |
| 22  | Battery Voltage | V &times; 100 | e.g., 4900 = 49.00 V |
| 24  | USB Toggle State | 0/1 | Status of USB ports |
| 25  | DC Toggle State | 0/1 | Status of DC ports (12V/Car) |
| 26  | AC Toggle State | 0/1 | Status of Inverter |
| 27  | Light State | 0-3 | 0=Off, 1=On, 2=SOS, 3=Flash |
| 30  | USB-A Output | Watts &times; 10 | |
| 31  | USB-A Output | Watts &times; 10 | |
| 34-37| USB-C Output | Watts &times; 10 | |
| 41  | **Active Outputs** | Bitmask | **State Flags**: None=26, USB=640, DC=1152, AC=2052, Light=4224. |
| 47-50| **Temp Sensors** | Celsius | **Unconfirmed**. Likely component temps (Inverter, Rectifier, Case). Values like 78, 73, 90 observed under load. |
| 52  | **Temp Sensor** | Celsius | **Diagnostic Flag**. "Current" unit showed 180 (18.0C). |
| 54  | **Battery Capacity** | 0.1Ah | Battery Full Capacity. e.g. 374 = 37.4Ah. Used to calc SOH. |
| 56  | **Main SOC** | 0.1% | State of Charge. e.g. 830 = 83.0% |
| 59-62| **Timer Counters** | ? | **Do not use for settings display**. |

---

## 2. SETTINGS Registers (0x1103)

*Read/Write. Defines device behavior.*

| 2 | Active Charge State | 1=Slow, 4=Const Current | 1, 4 | Correlates with Reg 13 settings |
| 3 | AC Input Watts | Watts | 0 - 1100 | Rate at which AC is being drawn |
| 4 | DC Input Watts | Watts | 0 - 500 | Solar / Car Input |
| 5 | Unknown | ? | 0 | |
| 6 | Total Input Watts | Watts | 0 - 1600 | Sum of AC + DC Input |
| 7 | Unknown | ? | 0 | |
| 25  | Enable DC | 0/1 | Toggle 12V DC |
| 26  | Enable AC | 0/1 | Toggle Inverter |
| 27  | Light Mode | 0-3 | Set Light mode |
| 57  | Silent Charging | 0/1? | "Mute" toggle |
| 59  | **Screen Timeout** | Minutes | 0 = Never. 0x1E = 30 mins. |
| 60 | AC Standby Time | Minutes | 0 (Never) | Auto-off timer for AC |
| 61 | DC Standby Time | Minutes | 0 | Auto-off timer for DC |
| 62 | USB Standby Time | Minutes | 0 | Auto-off timer for USB |
| 63 | Booking Charge | Minutes | 0 | Scheduled charging delay |
| 64 | Power Off | 1 | 1 | Command to shutdown device |
| 65 | Unknown | ? | 0 | |
| 66 | Discharge Limit | % *10 | 0 (0%) | Stop discharging at this % (Battery Preserv.) |
| 67 | Charge Limit (EPS) | %* 10 | 1000 (100%) | Stop charging at this % (Battery Preserv.) |
| 68 | System Shutdown | Minutes | 60 | Auto-shutdown if idle |

---

## 3. Command Registers (Write Only)

*Control actions.*

| Reg | Name | Value | Description |
|:----|:-----|:------|:------------|
| 64  | Power Off | 1 | Shuts down the entire machine. |

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

## 8. Candidate Registers for Investigation

Based on recent "Dump" analysis, these registers show interesting activity:

| Register | Value (Idle) | Value (Load) | Hypothesis | Test to Verify |
| :--- | :--- | :--- | :--- | :--- |
| `R18` | 33 | 115? | **Temp?** / Power? | Watch while heating up. |
| `R50` | 0 | 42 | **Inverter Temp?** | Watch during AC use. |
| `R60` | 0 | 480 | **Fan Speed?** | Watch when fan spins up. |
| `R19` | 500 | 500 | **Frequency?** | 50.0 Hz? |

### Service `0xA003` (Auxiliary?)

| UUID | Props | Description | Notes |
| :--- | :--- | :--- | :--- |
| `0xC400` | Read | ? | Static Value: `0x30` ("0") |
| `0xC401` | Read | ? | Static Value: `0x30` ("0") |

## CRC Calculation

The protocol uses a custom CRC-16 checksum. See `calculateChecksum()` in `index.html` for implementation details.
