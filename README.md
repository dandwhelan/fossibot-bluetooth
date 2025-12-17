# Fossibot BLE PWA

**Control your Fossibot power station directly from your browser.**

This Progressive Web App (PWA) lets you control and monitor your Fossibot F2400, F3600 Pro, and similar power stations via Bluetooth Low Energy (BLE). No cloud, no official app required — private, offline-first control.

**🚀 [Launch Web App](https://dandwhelan.github.io/fossibot-bluetooth/)**

![App Preview](icon-512.png)

---
<img width="570" height="496" alt="image" src="https://github.com/user-attachments/assets/77779422-5d75-4a2e-ac61-8acc07f66069" />

## ✨ Features

### ⚡ Real-Time Dashboard
- **Live Power Flow:** Input/Output wattage with dynamic display
- **Battery Status:** SOC percentage, estimated runtime, charge time
- **System Health:** Voltage, frequency monitoring
- **Battery Extensions:** Support for external battery pack levels
- **Settings Access:** Cog icon in dashboard for quick configuration

### 🛠️ Control Panel
- **Power Toggle:** AC Inverter, DC (12V), and USB Ports
- **LED Light Control:** Off, Low, High, SOS, Flash
- **Silent Charging Mode:** Reduce fan noise for overnight use

### ⚙️ Settings

#### Power Limits
| Setting | Options |
| :--- | :--- |
| **AC Charging Upper Limit (EPS)** | 60%, 70%, 80%, 90%, 100% |
| **Discharge Limit** | 0-100% (slider) |

#### Timers
| Setting | Options |
| :--- | :--- |
| **Screen Timeout** | 1 min, 3 min, 5 min, 10 min, 30 min, 60 min, 2 hr, 4 hr, Never |
| **System Idle Shutdown** | 5 min, 10 min, 30 min, 1 hr, 8 hr, 24 hr, Never |
| **AC Standby** | 1 hr, 8 hr, 16 hr, 24 hr, Never |
| **DC Standby** | 1 hr, 8 hr, 16 hr, 24 hr, Never |
| **USB Standby** | 5 min, 10 min, 30 min, 1 hr, 2 hr, 8 hr, 10 hr, Never |
| **Schedule Charge** | Time picker or minutes delay |

#### Network
- **WiFi Configuration:** Connect device to your home network (SSID + Password)

### 🎨 Themes
| Theme | Description |
| :--- | :--- |
| 🌊 **Ocean** | Calming teal and blue (Default) |
| 🖥️ **Terminal** | Minimalist command prompt style |
| 🌃 **Cyberpunk** | Neon magenta and cyan |
|  **Sunset** | Warm violet/orange gradients |
| 🌈 **Rainbow** | High-visibility vibrant colors |

---

## 📱 Installation

### Platform Support

| Platform | Browser | Status |
| :--- | :--- | :--- |
| **Android** | Chrome / Edge | ✅ Fully Supported |
| **Windows / Mac / Linux** | Chrome / Edge | ✅ Fully Supported |
| **iOS / iPadOS** | [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055) | ⚠️ Safari doesn't support Web Bluetooth |

### Install as PWA
1. Open [dandwhelan.github.io/fossibot-bluetooth/](https://dandwhelan.github.io/fossibot-bluetooth/)
2. Click **Connect** and pair with your device
3. Install:
   - **Chrome Desktop:** Click install icon in address bar
   - **Android:** Menu (⋮) → "Add to Home Screen"
   - **iOS:** Bookmark in Bluefy

---

## 🔧 Protocol Documentation

This device uses a **Tuya BLE Protocol** with Modbus-like commands.

### Key Commands
| OpCode | Function | Description |
| :--- | :--- | :--- |
| `0x1103` | Settings | Read/Write configuration |
| `0x1104` | Status | Read-only telemetry |
| `0x06` | Control | Write to registers (USB, AC, DC) |

### Packet Structure
```
[Header 0x11] [OpCode] [Reg_Hi] [Reg_Lo] [Val_Hi] [Val_Lo] [CRC_Hi] [CRC_Lo]
```

**See [PROTOCOL.md](PROTOCOL.md) for complete register map and protocol details.**

---

## 🤝 Contributing

1. **Clone:** `git clone https://github.com/dandwhelan/fossibot-bluetooth.git`
2. **Dev branch:** Use `git checkout dev` for full diagnostic tools
3. **Run locally:** Serve over HTTPS (Web Bluetooth requires secure context)
4. **Submit PR:** Help map unknown registers for different models!

## 📄 License

MIT License — Free for personal and commercial use.

