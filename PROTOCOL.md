# Fossibot F2400 Bluetooth Protocol

This document details the reverse-engineered Bluetooth Low Energy (BLE) protocol for the Fossibot F2400 portable power station.

## Connection Details

*   **Service UUID:** `0000fff0-0000-1000-8000-00805f9b34fb`
*   **Write Characteristic:** `0000fff2-0000-1000-8000-00805f9b34fb` (Handle 0x24)
*   **Notify Characteristic:** `0000fff1-0000-1000-8000-00805f9b34fb` (Handle 0x21)

## Packet Structure

All data is Big-Endian. Packets generally follow this structure:

| Header | OpCode | Unknown | Unknown | Payload | Checksum |
|:-------|:-------|:--------|:--------|:--------|:---------|
| `11`   | `04`   | `00`    | `00`    | ...     | `CRC`    |

### Payload Types

The device uses different function codes (OpCodes) for different types of data:

1.  **0x1104 (STATUS):** Real-time telemetry (Voltages, Watts, Flags). Broadcast automatically or polled.
2.  **0x1103 (SETTINGS):** Device configuration (Timers, Limits, Toggles). Sent on connection or requested.

---

## 1. STATUS Registers (0x1104)
*Read-only, updates frequently (~2s interval).*

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 3   | **AC Input Watts** | Watts | Likely AC Input only. |
| 4   | **DC Input Watts** | Watts | **Solar/DC Input**. (Confirmed by user). |
| 6   | **Total Input Watts** | Watts | Sum of AC (Reg 3) + DC (Reg 4). |
| 13  | AC Charge Rate | 1-5 | Level 1 (~300W) to 5 (~1100W) |
| 16  | Frequency | Hz &times; 10 | e.g., 500 = 50.0 Hz |
| 18  | AC Out Voltage | V &times; 10 | e.g., 2300 = 230.0 V |
| 19  | AC Out Frequency | Hz &times; 10 | e.g., 500 = 50.0 Hz |
| 20  | Total Output Power | Watts | Sum of all outputs |
| 21  | **System State** | Hybrid | **Hybrid**: [AC In] = Mains Voltage (e.g. 1229 = 122.9V). [AC Out] = System Load (Scales up with usage). |
| 22  | Battery Voltage | V &times; 100 | e.g., 4900 = 49.00 V |
| 24  | USB Toggle State | 0/1 | Status of USB ports |
| 25  | DC Toggle State | 0/1 | Status of DC ports (12V/Car) |
| 26  | AC Toggle State | 0/1 | Status of Inverter |
| 27  | Light State | 0-3 | 0=Off, 1=On, 2=SOS, 3=Flash |
| 30  | USB-A Output | Watts &times; 10 | |
| 31  | USB-A Output | Watts &times; 10 | |
| 34-37| USB-C Output | Watts &times; 10 | |
| 41  | **Active Outputs** | Bitmask | **State Flags**: None=26, USB=640, DC=1152, AC=2052, Light=4224. |
| 47-49| Temp Sensors | Raw? | Unconfirmed scaling |
| 54  | **Capacity** | 0.1Ah | Battery Capacity. e.g. 374 = 37.4Ah. |
| 56  | **Main SOC** | 0.1% | State of Charge. e.g. 830 = 83.0% |
| 59-62| **Timer Counters** | ? | **Do not use for settings display**. |

---

## 2. SETTINGS Registers (0x1103)
*Read/Write. Defines device behavior.*

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 13  | Set Charge Rate | 1-5 | 1=300W, 2=500W, 3=700W, 4=900W, 5=1100W |
| 14  | AC Charge Max | Watts | Max charging power limit |
| 24  | Enable USB | 0/1 | Toggle USB power |
| 25  | Enable DC | 0/1 | Toggle 12V DC |
| 26  | Enable AC | 0/1 | Toggle Inverter |
| 27  | Light Mode | 0-3 | Set Light mode |
| 57  | Silent Charging | 0/1? | "Mute" toggle |
| 59  | **Screen Timeout** | Minutes | 0 = Never. 0x1E = 30 mins. |
| 60  | **AC Standby** | Minutes | 0 = Never. 480 = 8 hours. |
| 61  | **DC Standby** | Minutes | 0 = Never. |
| 62  | **USB Standby** | **Seconds** | **Note:** 1800 = 30 mins. 600 = 10 mins. |
| 63  | Stop Charge After | Minutes | Stop charging after X mins? |
| 66  | Discharge Limit | % &times; 10 | Lower SOC limit. |
| 67  | AC Upper Limit | % &times; 10 | Target charge % (EPS) |
| 68  | System Shutdown | Minutes | Global auto-off timer. |

---

## 3. Command Registers (Write Only)
*Control actions.*

| Reg | Name | Value | Description |
|:----|:-----|:------|:------------|
| 64  | Power Off | 1 | Shuts down the entire machine. |

## CRC Calculation
The protocol uses a custom CRC-16 checksum. See `calculateChecksum()` in `index.html` for implementation details.
