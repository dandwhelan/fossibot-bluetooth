# Fossibot F2400 / F3600 Pro Control PWA

Bypass the official cloud-dependent app and control your Fossibot power station directly via Bluetooth. Private, offline-first, and feature-rich.

**🚀 [Launch Web App](https://dandwhelan.github.io/fossibot-bluetooth/)**

![App Preview](icon-512.png)

## ✨ key Features

*   **🔒 Privacy First:** No cloud servers, no account required. Direct Bluetooth LE connection.
*   **⚡ Real-time Telemetry:** Monitor Input/Output wattage, battery voltage, temperature, and frequency.
*   **🛠️ Advanced Control:**
    *   Toggle AC, DC, USB, and LED Light (SOS/Flash modes).
    *   **Silent Charging:** Enable quiet mode for night charging.
    *   **Standby Timers:** Precise control over AC, DC, Screen, and System timeouts.
    *   **Battery Protection:** Set Discharge Limits and AC Charging Upper Limits (EPS).
*   **🎨 Multiple Themes:**
    *   ☢️ **Pipboy:** Fallout-inspired CRT aesthetic.
    *   🖥️ **Terminal:** Retro command-line interface.
    *   🌈 **Rainbow:** High-contrast, vibrant visualization.
    *   🏭 **Industrial:** Clean, modern dashboard.

## 📱 Installation

This is a **Progressive Web App (PWA)**. It works in Chrome (Android/Desktop), Edge, and Bluefy (iOS).

### Android / Desktop (Chrome)
1.  Visit the [App URL](https://dandwhelan.github.io/fossibot-bluetooth/).
2.  Click **Connect** to pair your device.
3.  **Install:** Click "Install App" in the address bar or menu to add it to your home screen.

### iOS (iPhone/iPad)
Apple unfortunately restricts Web Bluetooth. You must use a specialized browser:
1.  Download **Bluefy** from the App Store.
2.  Open the App URL in Bluefy.

## 🔧 Technical Details & Protocol

This project is the result of reverse-engineering the Fossibot BLE protocol.

**See [PROTOCOL.md](PROTOCOL.md) for full technical documentation, register maps, and packet structures.**

### Quick Protocol Overview
*   **Service:** `0000fff0-0000-1000-8000-00805f9b34fb`
*   **Data Types:**
    *   `0x1104` (Status): Live telemetry (volts, watts).
    *   `0x1103` (Settings): Saved configuration (timers, limits).

### Known Registers
*   **Reg 21:** System Voltage (~0.7V).
*   **Reg 62:** USB Standby Timer (in Seconds).
*   **Reg 66:** Discharge Limit (%).
*   **Reg 68:** System Shutdown Timer (Minutes).

## 🤝 Contributing

Found a new register or have a different model (F3600, F2400 Pro)?
1.  Open **Diagnostics Mode** (Pulse icon).
2.  Watch the raw register feed.
3.  Toggle settings on your device and look for changes!
4.  Submit a PR or Issue with your findings.

## 📄 License
MIT License. Open source and free to use.
