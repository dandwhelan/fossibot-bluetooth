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
| 7   | Error/Warning Code? | Flags | Observed as 0 across all tested states. Needs more data. |
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
| 39  | Output Watts (Legacy) | Watts | **Deprecated.** Use Reg 20 instead. |

### System Flags & Protection

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 40  | Pack Config Voltage | V &times; 10 | Pack voltage calibration value. |
| 41  | **Capability Flags** | Bitmask | Active output/capability flags. Bit 9=USB, Bit 10=DC, Bit 11=AC. Varies significantly by device state. |
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
| 57  | AC Silent Mode | 0/1 | Silent charging status. |
| 60  | AC Standby Counter | Minutes | Current AC standby countdown. |
| 61  | DC Standby Counter | Minutes | Current DC standby countdown. |
| 62  | USB Standby | Raw | Always 255 (0xFF) across all tested devices. Likely "disabled" sentinel. |
| 63  | Unused | Raw | Always 65535 (0xFFFF) across all tested devices. Padding/sentinel. |
| 66  | Discharge Limit | 0.1% | Current discharge limit setting. e.g. 100 = 10%. |
| 67  | Charge Limit | 0.1% | Current charge limit setting. e.g. 1000 = 100%. |
| 68  | Shutdown Timer | Raw | Machine shutdown countdown. |
| 69  | **Fan Level** | 0-5 | Current fan speed level. |
| 80  | CRC Checksum | Hex | Packet checksum value. |

---

## 2. SETTINGS Registers (0x1103)

*Read/Write. Defines device behavior.*

### System & Hardware

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
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
| 19  | **Max AC Input Current** | Deci-Amps | Hardcoded safety limit. `1600` = 16.0A (120V US), `500` = 5.0A (230V EU). |

### Readings & Toggles

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 20  | Total Output / DC Max | Amps | DC output max current setting. |
| 21  | AC Input Voltage | V &times; 10 | Measured AC input voltage. |
| 22  | Battery Voltage | V &times; 10 | Measured battery voltage. |
| 24  | USB Enabled | 0/1 | USB ports toggle. |
| 25  | DC Enabled | 0/1 | 12V DC toggle. |
| 26  | AC Enabled | 0/1 | Inverter toggle. |
| 27  | Light Mode | 0-3 | 0=Off, 1=On, 2=Flash, 3=SOS. |
| 32  | Firmware Version | Raw | Device firmware version identifier. |
| 40  | Pack Voltage Calib 1 | Raw | Battery pack calibration value 1. |
| 41  | Pack Voltage Calib 2 | Raw | Battery pack calibration value 2. |

### Timers & Limits

| Reg | Name | Format | Notes |
|:----|:-----|:-------|:------|
| 56  | Key Sound | 0/1 | Button beep toggle. |
| 57  | Silent Charging | 0/1 | Mute charging sounds. |
| 59  | Screen Timeout | Minutes | 0 = Never. e.g. 30 = 30 mins. |
| 60  | AC Standby Time | Minutes | Auto-off timer for AC. 0 = Never. |
| 61  | DC Standby Time | Minutes | Auto-off timer for DC. 0 = Never. |
| 62  | USB Standby Time | Seconds | Auto-off timer for USB. 0 = Never. |
| 63  | Booking Charge | Minutes | Scheduled charging delay. |
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

## 9. Tuya BLE Switch Robot (Fingerbot)

Used by the "Switch Robot" panel next to the SwitchBot one, for a button the
station cannot reach itself — the wall switch feeding its charger, say. Model
`ADSBB201`, Tuya category `szjqr`, sold as Adaprox / MOES Fingerbot and many
rebadges.

Unlike the SwitchBot Bot, this protocol is encrypted and needs per-device
credentials. They exist only in Tuya's cloud once the Smart Life app has paired
the device, so they are pasted into the app once (`tinytuya wizard`, or
`redphx/tuya-local-key-extractor`) and kept in `localStorage`. Everything after
that is local; the app never makes a cloud call.

Cross-checked against `PlusPlus-ua/ha_tuya_ble` (MIT), which is the de-facto
reference implementation.

### Credentials

| Key | Shape | Role |
| :--- | :--- | :--- |
| `device_id` | 20 chars | sent in the pairing frame |
| `uuid` | 16 hex chars | sent in the pairing frame |
| `local_key` | 16 chars | **only the first 6 are key material** |
| `product_id` | 8 chars | selects the datapoint map |

### GATT

| UUID | Role |
| :--- | :--- |
| `0000a201-0000-1000-8000-00805f9b34fb` | Service (also the advertised UUID) |
| `00002b10-0000-1000-8000-00805f9b34fb` | Notify |
| `00002b11-0000-1000-8000-00805f9b34fb` | Write |

Fixed 20-byte GATT MTU; do not negotiate larger.

### Keys

```
local_key_6 = local_key[:6]                 ASCII, first 6 chars only
login_key   = MD5(local_key_6)
session_key = MD5(local_key_6 || srand)     srand = device_info_reply[6:12]
auth_key    = device_info_reply[14:46]
```

MD5 is not there for security — it is what the device expects. WebCrypto has no
MD5, so `md5()` in `index.html` implements it.

### Frame

```
plain = seq(u32) response_to(u32) code(u16) len(u16) || data || CRC16(u16)
plain += 0x00 × (16 - len(plain) % 16)      ZERO padding, never PKCS#7
wire   = flag || iv(16) || AES-128-CBC(plain, key, iv)
flag   = 0x04 for DEVICE_INFO (login_key), else 0x05 (session_key)
```

CRC-16 is Modbus (init `0xFFFF`, poly `0xA001`, reflected) — the same algorithm
as the power station's, but stored little-end-first here rather than hi-first.

`crypto.subtle` only does PKCS#7, which the device rejects. Both directions work
around it without shipping a JS AES: on encrypt the input is already a multiple
of 16, so subtle appends exactly one padding block and its ciphertext is
dropped; on decrypt a block that decrypts to a full pad (`0x10` ×16) is appended
so subtle accepts the zero-padded frame. See `tuyaAesEncrypt` /
`tuyaAesDecrypt`, pinned against Node's own AES in `test/tuya.test.mjs`.

### Fragmentation

```
packet 0 = varint(0) || varint(total_len) || (protocol_version << 4) || payload
packet N = varint(N) || payload
```

Each packet is at most 20 bytes **including** its header, so the length varint
growing to two bytes shifts the version byte along — nothing may assume a fixed
offset. Protocol v3 sends `0x30`.

On receive, a fragment out of sequence discards the buffer. Fragment 0 always
starts a new frame, which is a deliberate departure from the reference: it
treats a restart as out-of-order and so loses the whole of a retransmission.

### Handshake

```
1. connect, subscribe 2b10
2. TX FUN_SENDER_DEVICE_INFO (0x0000), no data
3. RX 46+ bytes: [2] protocol version (must be 3) · [6:12] srand · [14:46] auth_key
4. TX FUN_SENDER_PAIR (0x0001), 44 bytes: uuid || local_key_6 || device_id, zero-padded
5. RX 1 byte: 0 = paired · 2 = already paired · anything else = refused
6. TX FUN_SENDER_DEVICE_STATUS (0x0003) to make the device report every datapoint
```

`seq` starts at 1 and **resets on every reconnect**. Protocol v4 frames
(`0x0027`, `0x8006`, `0x8007`) are not implemented; the app fails loudly.

### Reports and acks

Skipping an ack makes the device retry and then drop the link.

| Code | Payload | Ack |
| :--- | :--- | :--- |
| `0x8001` RECEIVE_DP | records from 0 | empty data |
| `0x8004` RECEIVE_SIGN_DP | dp_seq(u16), flags, records | `dp_seq, flags, 0` |
| `0x8003` RECEIVE_TIME_DP | timestamp from 0, then records | empty data |
| `0x8005` RECEIVE_SIGN_TIME_DP | dp_seq(u16), flags, timestamp from 3, records | `dp_seq, flags, 0` |
| `0x8011` / `0x8012` TIME REQ | — | ms timestamp as ASCII, or Y/M/D/h/m/s/weekday; both + UTC offset in hundredths of an hour |

A timestamp is a format byte then either 13 ASCII digits (`0`) or 4 bytes big
endian (`1`).

**The signed-report offset is ambiguous.** The reference reads `flags` at offset
2 and then parses records from offset 2 as well, while its timestamped variant
parses from 3 — the two cannot both be right. `tuyaReadDpReport()` therefore
tries each and keeps whichever consumes the payload exactly.

### Datapoints

TLV records: `dp_id, dp_type, length, value` (big endian). Types: `0` RAW,
`1` BOOL, `2` VALUE, `3` STRING, `4` ENUM, `5` BITMAP. `DT_VALUE` is always sent
as 4 signed bytes; on receive it may arrive narrower and is sign-extended from
its declared width.

Fingerbot / Fingerbot Plus (`szjqr`):

| Function | DP | Type | Range |
| :--- | :--- | :--- | :--- |
| `switch` | 2 | BOOL | actuate |
| `mode` | 8 | ENUM | 0 push · 1 switch · 2 program |
| `down_position` | 9 | VALUE | 51–100 % |
| `hold_time` | 10 | VALUE | 0–10 s, push mode only |
| `reverse_positions` | 11 | BOOL | |
| `battery` | 12 | VALUE | 0–100 %, read-only |
| `up_position` | 15 | VALUE | 0–50 % |
| `manual_control` | 17 | BOOL | Plus only |
| `program` | 121 | RAW | Plus only |

CubeTouch 1s / II is a different layout (`switch` 1, `mode` 2, `hold_time` 3,
`reverse` 4, `up` 5, `down` 6, `battery_charging` 7, `battery` 8, both positions
0–100), which is why position limits are read from the resolved map rather than
from constants.

Product ids are mapped in `TUYA_PRODUCT_TABLES`. **`ADSBB201`'s own product id
is unconfirmed** — it is USB-C rechargeable, which points at the `y6kttvd6`
family. An unrecognised id falls back to the plain Fingerbot map and the panel
says so rather than refusing to run. To confirm one: Tuya IoT console → Cloud →
Devices → *Change Control Instruction Mode* → **DP Instruction**, then API
Explorer → *Get Device Specification Attribute*.

### Battery

The device is sleepy: it advertises, accepts a connection, acts, then drops.
The app connects on demand and disconnects immediately, with no reconnect loop
— a held-open link is what flattened the battery in the original Home Assistant
integration. Expect 1–3 s per action.
