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

Header byte `0x11` is the Modbus slave address (Register 17). Always `0x11` over BLE.

### Payload Types

The device uses different function codes (OpCodes) for different types of data:

1. **0x1104 (STATUS):** Real-time telemetry (Voltages, Watts, Flags). Broadcast automatically or polled.
2. **0x1103 (SETTINGS):** Device configuration (Timers, Limits, Toggles). Sent on connection or requested.

---

## 1. STATUS Registers (0x1104)

*Read-only, updates frequently (~2s interval).*

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 2   | **AC Charge Speed Status** | 1-5 | Current charge speed level. |
| 3   | **AC Input Watts** | Watts | AC Input power (actual). |
| 4   | **DC Input Watts** | Watts | **Solar/DC Input** power. |
| 6   | **Total Input Watts** | Watts | Sum of AC (Reg 3) + DC (Reg 4). |
| 8   | **Active Error Code** | Raw | **Safety Lockout.** 0=Normal, 78=Inverter Fault, 79=AC Charging Interrupted. See [Error Code Logic](#6-error-code-logic-reg-8--reg-42). |
| 18  | AC Out Voltage | V &times; 10 | e.g., 2300 = 230.0 V. |
| 19  | AC Out Frequency | Hz &times; 10 | e.g., 500 = 50.0 Hz. |
| 20  | **Total Output Power** | Watts | Sum of all outputs. **Use this for charging detection.** |
| 21  | **Multiplexed Voltage** | V &times; 10 | **Charging:** AC Input Voltage (e.g. 2317 = 231.7V). **Discharging:** Internal DC Bus Voltage. Context-dependent. |
| 30  | USB-A1 Output | Watts &times; 10 | First USB-A port output. |
| 31  | USB-A2 Output | Watts &times; 10 | Second USB-A port output. |
| 41  | **Active Port Flags** | Bitmask | Bit 9 (0x0200)=USB, Bit 10 (0x0400)=DC, Bit 11 (0x0800)=AC, Bit 12 (0x1000)=LED. |
| 42  | **Hardware GPIO & Fault Mask** | Bitmask | **Bit 15 (0x8000):** System Warning / Non-Critical Latch (often always on). **Bits 13-14 (0x6000):** CRITICAL FAULT MASK. **Bits 0-12:** Output MOSFET Status (e.g., +984 when USB/DC on). Check `(Reg42 & 0x6000) > 0` for faults. See [Error Code Logic](#6-error-code-logic-reg-8--reg-42). |
| 47  | Protocol Version | Constant | Always 12288 (0x3000). Not a sensor. |
| 48  | **System Status Flags** | Bitmask | **0x8000**=Charging, **0x4000**=Standby, **0x0008**=Error Pending. |
| 54  | **Battery Capacity** | 0.1Ah | Battery Full Capacity. e.g. 374 = 37.4Ah. Used to calc SOH. |
| 56  | **Main SOC** | 0.1% | State of Charge. e.g. 830 = 83.0%. |
| 58  | **Time to Full** | Minutes | Estimated minutes until battery is full (when charging). |
| 59  | **Time to Empty** | Minutes | Estimated minutes until battery is empty (when discharging). |

### Additional STATUS Registers (Informational)

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 22  | Battery Voltage | V &times; 10 | e.g., 233 = 23.3V. |
| 30  | USB-A1 Output | Watts &times; 10 | First USB-A port output. |
| 31  | USB-A2 Output | Watts &times; 10 | Second USB-A port output. |
| 34  | USB-C1 Output | Watts &times; 10 | First USB-C port output. |
| 35  | USB-C2 Output | Watts &times; 10 | Second USB-C port output. |
| 36  | USB-C3 Output | Watts &times; 10 | Third USB-C port output. |
| 37  | USB-C4 Output | Watts &times; 10 | Fourth USB-C port output. |
| 39  | Output Watts (Legacy) | Watts | **Deprecated.** Use Reg 20 instead. |
| 40  | Pack Config Voltage | V &times; 10 | Pack voltage calibration value. |
| 52  | **Model Constant** | Raw | **NOT a temperature sensor.** Fixed at 180 for Fossibot, 0 for Aferiy. Ignore for thermal monitoring. |
| 53  | **Ext1 SOC** | Special | Extension Battery 1 SOC. 0=Missing, else (val-10)/10 = %. |
| 55  | **Ext2 SOC** | Special | Extension Battery 2 SOC. 0=Missing, else (val-10)/10 = %. |
| 57  | AC Silent Mode | 0/1 | Silent charging status. |
| 60  | AC Standby Counter | Minutes | Current AC standby countdown. |
| 61  | DC Standby Counter | Minutes | Current DC standby countdown. |
| 62  | USB Standby Counter | Raw | Current USB standby countdown. |
| 66  | Discharge Limit | 0.1% | Current discharge limit setting. e.g. 100 = 10%. |
| 67  | Charge Limit | 0.1% | Current charge limit setting. e.g. 1000 = 100%. |
| 68  | Shutdown Timer | Raw | Machine shutdown countdown. |
| 69  | **Fan Level** | 0-5 | Current fan speed level. |
| 80  | CRC Checksum | Hex | Packet checksum value. |

---

## 2. SETTINGS Registers (0x1103)

*Read/Write. Defines device behavior.*

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 5   | **Master System Enable** | 0/1 | 0=Off, 1=On. Forced to 0 during Critical Faults (Reg 42 bits 13-14). |
| 11  | **Hardware ID** | Raw | 1536 (0x0600) = US Aferiy, 512 (0x0200) = EU Fossibot. |
| 13  | **AC Charge Speed Setpoint** | 1-5 | Charge level setting. |
| 14  | **Max Charge Wattage** | Watts | 1500 (US), 1100 (EU). |
| 16  | Frequency Setting | Hz &times; 10 | Output frequency (500 = 50Hz, 600 = 60Hz). |
| 19  | **Max AC Input Current** | dA | 1600 = 16.0A (120V US), 500 = 5.0A (230V EU). |
| 24  | **USB Toggle** | 0/1 | USB ports toggle. |
| 25  | **DC Toggle** | 0/1 | 12V DC toggle. |
| 26  | **AC Toggle** | 0/1 | Inverter toggle. |
| 27  | **Light Mode** | 0-3 | 0=Off, 1=On, 2=Flash, 3=SOS. |
| 32  | Firmware Version | Raw | Device firmware version identifier. |
| 56  | **Key Sound** | 0/1 | Button beep toggle. |
| 57  | Silent Charging | 0/1 | Mute charging sounds. |
| 59  | Screen Timeout | Minutes | 0 = Never. e.g. 30 = 30 mins. |
| 60  | AC Standby Time | Minutes | Auto-off timer for AC. 0 = Never. |
| 61  | DC Standby Time | Minutes | Auto-off timer for DC. 0 = Never. |
| 62  | USB Standby Time | Seconds | Auto-off timer for USB. 0 = Never. |
| 63  | Booking Charge | Minutes | Scheduled charging delay. |
| 64  | Power Off | 1 | Command to shutdown device. |
| 66  | **Discharge Limit** | 0.1% | Min SoC %. Stop discharging at this %. e.g. 100 = 10%. |
| 67  | **Charge Limit** | 0.1% | Max SoC %. Stop charging at this %. e.g. 1000 = 100%. |
| 68  | Machine Shutdown | Minutes | Auto-shutdown if idle. |
| 80  | CRC Checksum | Hex | Packet checksum. |

### Writable Register Safety Whitelist

**WARNING: Fossibot firmware does NOT validate register write values. Writing an out-of-range value can permanently brick a device.**

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
| 68 (Sleep Time) | 5, 10, 30, 480 |

---

## 3. Command Registers (Write Only)

*Control actions.*

| Reg | Name | Value | Description |
|:----|:-----|:------|:------------|
| 64  | Power Off | 1 | Shuts down the entire machine. |

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

### Fault Detection (Reg 42)

Reg 42 is a **mixed-purpose bitmask** containing both status bits and fault bits. You **cannot** simply check `if (Reg42 > 0)` — the lower bits reflect normal MOSFET state.

**Bitmask Layout:**

| Bits | Mask | Meaning |
|:-----|:-----|:--------|
| Bit 15 | 0x8000 | System Warning / Non-Critical Latch (often always on) |
| Bits 13-14 | **0x6000** | **CRITICAL FAULT MASK** |
| Bits 0-12 | 0x1FFF | Output MOSFET Status (e.g., +984 when USB/DC is on) |

**Implementation:**

```javascript
const isCriticalFault = (Reg42 & 0x6000) > 0;
```

### Combined Logic (Error Classification)

When Reg 8 reports Error 79:
- **IF `(Reg42 & 0x6000) > 0`:** Hardware Failure (critical).
- **IF `(Reg42 & 0x6000) == 0`:** Environmental Protection (Cold/Hot Temperature).

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
