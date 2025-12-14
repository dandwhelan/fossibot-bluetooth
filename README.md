# Fossibot F2400 / F3600 Pro Control PWA

**Unlock the full potential of your Fossibot power station.**

This Progressive Web App (PWA) allows you to control and monitor your Fossibot F2400, F3600 Pro, and similar power stations directly from your browser via Bluetooth Low Energy (BLE). It bypasses the need for the official cloud-dependent app, offering a private, offline-first, and feature-rich alternative.

**🚀 [Launch Web App](https://dandwhelan.github.io/fossibot-bluetooth/)**

![App Preview](icon-512.png)

## ✨ Comprehensive Features

### ⚡ Real-Time Telemetry & Monitoring
*   **Live Power Flow:** Visualize real-time Input (Charging) and Output (Discharging) wattage with dynamic gauges.
*   **Battery Status:** Precise Battery SOC (State of Charge) percentage, estimated remaining runtime (time-to-empty) or charge time (time-to-full).
*   **System Health:** Monitor system voltage, frequency, and internal temperatures (fan levels).
*   **Battery Extensions:** Support for monitoring external battery packs (Success/Extension batteries) with individual charge levels.

### 🔋 Power Simulator
*   **Runtime Calculator:** Estimate how long your power station will run with selected appliances.
*   **Split AC/DC Lists:** Clearly organized appliance management with separate AC and DC columns.
*   **Editable Wattages:** Click any appliance wattage to customize its power draw.
*   **Efficiency Modeling:** Card-based AC (88%) and DC (96%) efficiency toggles to account for real-world conversion losses.
*   **Custom Appliances:** Add your own devices with custom names, wattages, and AC/DC type.

### 🛠️ Advanced Control Dashboard
*   **Power Toggle:** Remotely toggle AC Inverter, DC (12V) Output, and USB Ports.
*   **LED Light Control:** Switch between Light modes: **Off**, **Low**, **High**, **SOS**, and **Flash**.
*   **Silent Charging Mode:** Toggle "Silent Charging" to reduce fan noise max charging speed for overnight use.

### ⚙️ Power Management Settings
*   **Accordion Layout:** Clean collapsible sections for Quick Actions, Power Limits, Timers, and Theme selection.
*   **Charging Rate:** Adjust AC Charging power from **200W to 1100W+** (Verify supported limits for your specific model).
*   **Discharge Limit:** Set a lower limit for battery discharge (e.g., stop discharging at 10%) to preserve battery health.
*   **EPS / UPS Settings:** Configure Entry Power Supply (UPS mode) behavior and upper charge limits.
*   **Standby Timers:** detailed control over auto-shutdown timers to save power:
    *   **Screen Timeout:** 1 min, 5 min, Never.
    *   **System Standby:** Auto-shutdown after inactivity.
    *   **AC Standby:** Turn off inverter if no load detected.
    *   **DC/USB Standby:** Turn off low-voltage ports if idle.

### 🔍 Advanced Diagnostics & Reverse Engineering
*   **Change Recorder:** Capture a baseline and automatically detect register changes after performing physical actions on the device (reverse engineering helper).
*   **System Summary:** Get a plain-English status report of the device state (Region, Voltage, Flags) or a detailed comparison summary between two devices.
*   **Multi-Device Comparison:** Import JSON diagnostic files from other users to compare specifications, firmware settings, and calibration data side-by-side.
*   **Raw Register Inspector:** View the raw data stream from the BMS (Battery Management System).
*   **Input vs Holding Registers:** Clearly distinguished views for Read-Only Status registers (0x1104) vs Writable Settings registers (0x1103).
*   **Visualization:** "Flash" indicators show exactly which data points are changing in real-time.
*   **Hide Zeros:** Filter out unused registers to focus on active data.

### 🎨 Customization & Themes
Personalize your control panel with built-in themes:
*   ☢️ **Pipboy:** Fallout-inspired retro CRT green.
*   🏭 **Industrial:** Clean, high-contrast, professional amber/slate look. (Default)
*   🌃 **Cyberpunk:** Neon magenta and cyan on dark purple.
*   🌊 **Ocean:** Calming teal and deep blue tones.
*   🌅 **Sunset:** Warm gradients of violet, orange, and gold.
*   💊 **Matrix:** Classic scrolling code green-on-black aesthetic.
*   🖥️ **Terminal:** Minimalist retro command prompt style.
*   🌈 **Rainbow:** High-visibility vibrant colors.

---

## 📱 detailed Installation Guide

This app uses **Web Bluetooth API**, which means it runs entirely in your browser but can talk to hardware devices.

### Platform Support

| Platform | Browser | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Android** | Chrome / Edge | ✅ Fully Supported | Best experience. Supports PWA install. |
| **Windows / Mac / Linux** | Chrome / Edge | ✅ Fully Supported | Requires Bluetooth hardware on PC. |
| **iOS / iPadOS** | **Bluefy** Browser | ⚠️ Restricted | Safari does NOT support Web Bluetooth. You must download [Bluefy](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055) from the App Store. |

### How to Install (PWA)
For the best experience (fullscreen, offline access), install the app:

1.  **Open the App:** Navigate to [dandwhelan.github.io/fossibot-bluetooth/](https://dandwhelan.github.io/fossibot-bluetooth/)
2.  **Pair:** Click the blue **Connect** button top-right. Select your device (usually named "Fossibot..." or similar) from the list.
3.  **Install:**
    *   **Chrome (Desktop):** Click the "Install" icon in the address bar (right side).
    *   **Chrome (Android):** Tap the menu (⋮) -> "Add to Home Screen" or "Install App".
    *   **Bluefy (iOS):** Bookmark the page.

---

## 🔧 Technical Protocol Documentation

For developers interested in the underlying communications or building their own integrations (Home Assistant, ESP32, etc.).

### Bluetooth Service UUIDs
*   **Main Service:** `0000fff0-0000-1000-8000-00805f9b34fb`
*   **Write Characteristic:** `0000fff1...` (Send commands)
*   **Notify Characteristic:** `0000fff2...` (Receive data)

### Data Packets
The device uses a Modbus-like protocol over BLE.

#### 1. Status Packet (`0x1104`)
Received automatically via Notify. Contains read-only telemetry.
*   **Structure:** `[Header 2b] [Len 2b] [Data...] [CRC 2b]`
*   **Key Registers:**
    *   `Reg 20`: Total Output Watts
    *   `Reg 21`: System Idle Load (~10W units)
    *   `Reg 56`: Main Battery SOC (0-1000, scale 10)

#### 2. Settings Packet (`0x1103`)
Received upon request or when settings change. Contains read/write configuration.
*   **Key Registers:**
    *   `Reg 13`: Charge Power (1-5 level or Watts)
    *   `Reg 56`: Key Sound Toggle (1=On, 0=Off)
    *   `Reg 57`: Silent Charging (1=On, 0=Off)

### Writing Commands
Commands are sent to the Write Characteristic using a specific structure:
`[Header 0x11] [Cmd 0x??] [Reg High] [Reg Low] [Val High] [Val Low] [CRC]`

**See [PROTOCOL.md](PROTOCOL.md) for the complete reverse-engineered register map and packet structure details.**

---

## 🤝 Contributing & Development

This project is open-source and depends on community investigation to map unknown registers for different models.

1.  **Clone the Repo:** `git clone https://github.com/dandwhelan/fossibot-bluetooth.git`
2.  **Run Locally:** Use a local server (e.g. VS Code Live Server) to serve `index.html` over HTTPS (or localhost). **Note:** Web Bluetooth requires a Secure Context (HTTPS or localhost).
3.  **Investigate:** Use the built-in Diagnostics tab to find new registers.
4.  **Submit PR:** Pull Requests are welcome! I've love people to find out what all the other settings and options do.

## 📄 License

MIT License. Free for personal and commercial use.
