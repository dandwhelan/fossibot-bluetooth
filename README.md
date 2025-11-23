# Fossibot F2400 Local Bluetooth Control

This project enables **offline, local control** of the Fossibot F2400 power station via Bluetooth, bypassing the cloud-dependent official app.

## 🎯 Features

- **Python Script**: Control your Fossibot from your PC via Bluetooth
- **Web App (PWA)**: Install on your Android phone for offline mobile control
- **No Cloud Required**: Works completely offline once set up
- **Open Protocol**: Reverse-engineered Modbus-over-BLE commands

## 🚀 Quick Start

### Option 1: Web App (Recommended for Mobile)

1. Visit: **https://dandwhelan.github.io/fossibot-bluetooth/**
2. Tap **"Install App"** or use Chrome menu → "Install app"
3. Tap **"Connect to Device"** and select your Fossibot (starts with `POWER` or MAC `DC:1E:`)
4. Control outputs (USB, AC, DC, Light) with the buttons

### Option 2: Python Script (PC)

```bash
pip install bleak
python control_fossibot.py usb_on
python control_fossibot.py ac_off
```

## 📡 Protocol Details

### Bluetooth Connection
- **Service UUID**: `0000a002-0000-1000-8000-00805f9b34fb`
- **Characteristic UUID**: `0000c304-0000-1000-8000-00805f9b34fb`
- **Protocol**: Modbus over BLE

### Command Structure

Each command is an 8-byte packet:

```
[Address] [Function] [Register Hi] [Register Lo] [Value Hi] [Value Lo] [CRC Hi] [CRC Lo]
```

**Example: Turn USB ON**
```
11 06 00 18 00 01 88 1D
```

Breaking it down:
- `11` (0x11 = 17): Modbus device address
- `06`: Modbus function code (Write Single Register)
- `00 18`: Register address (0x0018 = 24 for USB control)
- `00 01`: Value (1 = ON, 0 = OFF)
- `88 1D`: CRC-16 checksum

### Register Map

| Output | Register | ON Command | OFF Command |
|--------|----------|------------|-------------|
| USB    | 24 (0x18) | `11 06 00 18 00 01 88 1D` | `11 06 00 18 00 00 49 DD` |
| DC     | 25 (0x19) | `11 06 00 19 00 01 D9 DD` | `11 06 00 19 00 00 18 1D` |
| AC     | 26 (0x1A) | `11 06 00 1A 00 01 29 DD` | `11 06 00 1A 00 00 E8 1D` |
| Light  | 27 (0x1B) | `11 06 00 1B 00 01 78 1D` | `11 06 00 1B 00 00 B9 DD` |

### CRC-16 Checksum Algorithm

The Fossibot uses a custom CRC-16 variant:

```python
def calculate_checksum(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001  # Polynomial: 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF
```

The checksum is calculated over the first 6 bytes, then appended as **high byte first**, then low byte.

## 🔧 How It Was Reverse-Engineered

1. **Captured Bluetooth Traffic**: Used Android's HCI snoop log to record communication between the official app and the device
2. **Analyzed Packets**: Identified the Modbus protocol structure and characteristic UUIDs
3. **Discovered Checksum**: Reverse-engineered the CRC-16 algorithm by analyzing multiple command packets
4. **Tested Commands**: Verified each command by sending raw bytes and observing device behavior

## 📱 Web App Details

The PWA is built with:
- **Web Bluetooth API**: For direct BLE communication
- **Service Worker**: For offline functionality
- **TailwindCSS**: For responsive UI
- **Progressive Web App**: Installable on Android home screen

## 🛠️ Development

### Project Structure
```
fossibot_pwa/
├── index.html          # Main web app
├── manifest.json       # PWA manifest
├── service-worker.js   # Offline caching
└── icon-512.png        # App icon
```

### Local Testing
```bash
cd fossibot_pwa
python -m http.server
# Visit http://localhost:8000
```

## 📝 License

This is a reverse-engineering project for educational purposes and personal use. Use at your own risk.

## 🙏 Credits

Reverse-engineered and developed by analyzing the Fossibot/BrightEMS mobile app Bluetooth communication.

---

**Note**: Your Fossibot's Bluetooth name typically starts with `POWER` or has a MAC address beginning with `DC:1E:`.
