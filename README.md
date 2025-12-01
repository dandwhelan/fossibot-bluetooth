# Fossibot F2400 Bluetooth Control PWA

A Progressive Web App (PWA) to monitor and control the Fossibot F2400 Portable Power Station via Bluetooth Low Energy (BLE). This project allows for local, offline control directly from your browser without requiring any cloud servers or proprietary apps.

## 🚀 Quick Start

### Online (GitHub Pages)
The easiest way to use the app is to visit the hosted version:
👉 **[Launch App](https://dandwhelan.github.io/fossibot-bluetooth/)**

### Offline Usage
1.  **Download**: Get the `index.html` file from the [latest release](../../releases).
2.  **Open**: Double-click the file to open it in a compatible web browser.
3.  **Connect**: Click **Connect** and select your device (usually named "POWER" or "Fossibot").

### Supported Browsers
- **Desktop**: Chrome, Edge, Opera (requires Web Bluetooth support).
- **Android**: Chrome.
- **iOS**: "Bluefy" Web Bluetooth Browser (Safari does not support Web Bluetooth).

---

## 🛠️ Technical Deep Dive

This section documents the reverse-engineered Bluetooth protocol for the Fossibot F2400.

### Bluetooth LE Protocol
The device uses a custom protocol over BLE. Unlike standard implementations, it splits communication across two characteristics: one for writing commands and one for receiving data.

- **Service UUID**: `0000a002-0000-1000-8000-00805f9b34fb`
- **Write Characteristic**: `0000c304-0000-1000-8000-00805f9b34fb`
    - Used for sending commands (Turn On/Off) and polling requests.
- **Notify Characteristic**: `0000c305-0000-1000-8000-00805f9b34fb`
    - Used for receiving register values and status updates.
    - **Note**: You must enable notifications on this characteristic to receive any data.

### Data Structure
Commands are sent as 8-byte packets. The last two bytes are a CRC-16 checksum.

**Packet Format:**
`[Address, Function, Reg_Hi, Reg_Lo, Val_Hi, Val_Lo, CRC_Hi, CRC_Lo]`

- **Address**: Typically `0x11` (17)
- **Function**: `0x06` for Write, `0x04` for Read
- **Register**: The target register (see map below)
- **Value**: The value to write (or 0 for read requests)

**CRC Algorithm:**
A custom CRC-16 variant is used. See the `calculateChecksum` function in the source code for the implementation.

### Register Map
Through reverse engineering, the following registers have been identified:

| Register | Description | Value / Unit | Notes |
| :--- | :--- | :--- | :--- |
| **3** | Input Power | Watts | Solar/AC Input |
| **20** | Total Output | Watts | Combined output power |
| **21** | System Power | Watts | Internal system consumption |
| **25** | Light State | 0 = Off, 1 = On | LED Light status |
| **39** | Output Power | Watts | AC/DC/USB Output |
| **41** | **Status Bitmask** | Bitmask | See Status Decoding below |
| **56** | Battery Level | 0-1000 | Divide by 10 for % (e.g., 985 = 98.5%) |
| **59** | Remaining Time | Minutes | Time to empty/full |

### Status Decoding (Register 41)
Register 41 is a bitmask that indicates the state of the various output switches.

- **Bit 9**: USB Output (0 = Off, 1 = On)
- **Bit 10**: DC Output (12V/RV) (0 = Off, 1 = On)
- **Bit 11**: AC Output (Inverter) (0 = Off, 1 = On)
- **Bit 12**: Light (0 = Off, 1 = On)

*Example*: A value of `2560` (Binary `...101000000000`) means AC (Bit 11) and USB (Bit 9) are ON.

---

## 💻 Development

The entire app is contained within a single HTML file (`index.html`) for portability. It uses:
- **Vanilla JavaScript**: No frameworks, just standard Web Bluetooth API.
- **Tailwind CSS**: Injected via CDN (or inline for offline version) for styling.
- **FontAwesome**: SVGs are inlined for offline support.

### How to Modify
1.  Open `index.html` in your favorite code editor.
2.  Make changes to the JavaScript logic or UI.
3.  Test by opening the file in Chrome.

### Key Functions
- `connect()`: Handles device discovery and characteristic setup.
- `handleNotification()`: Parses incoming byte arrays and updates the UI.
- `sendCommand()`: Constructs and sends packets to the device.
- `calculateChecksum()`: Generates the required CRC for commands.

## 🤝 Contributing
If you discover new registers or features, please open an issue or submit a pull request! This project is intended to be a community resource for Fossibot owners.

## 📄 License
MIT License - feel free to use and modify as you wish.
