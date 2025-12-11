# Fossibot F2400 Control PWA

**🚀 Live App: [https://dandwhelan.github.io/fossibot-bluetooth/](https://dandwhelan.github.io/fossibot-bluetooth/)**

A robust Progressive Web App (PWA) for monitoring and controlling Fossibot Portable Power Stations (F2400, F3600 Pro) via Bluetooth. Designed for privacy and offline capability, it runs entirely client-side using the Web Bluetooth API.

![App Icon](icon-512.png)

## ✨ Features

-   **Live Telemetry:** Real-time monitoring of Input/Output wattage, battery SOC, remaining runtime, voltage, and frequency.
-   **Wireless Control:** Toggle AC, DC, USB, and LED Light outputs remotely.
-   **Diagnostics Mode:** 
    -   **"Stock Ticker" Feed:** Watch registers update in real-time with visual flash indicators (Green = Up, Yellow = Down).
    -   **Full Register Access:** View raw data for registers 0-90.
    -   **Auto-Refresh:** Continuous data stream for debugging.
-   **Advanced Settings:**
    -   **AC Charging Enable:** Toggle AC charging on/off (Verified).
    -   **Silent Charging:** Enable quiet mode (Reg 57).
    -   **Standby Timers:** Set separate timeout values for System, AC, DC, and Screen.
    -   **Battery Protection:** Set Discharge Limits (Reg 66).
    -   **Booking Charge:** Schedule charging start/stop times.
-   **Appliance Runtime Calculator:** Simulate various loads (TV, Fridge, Induction Hob) to estimate battery duration.
-   **Multiple Themes:**
    -   🖥️ **Terminal:** Retro CLI with typing effects.
    -   ☢️ **Pipboy:** Fallout-inspired green monochrome (Default).
    -   🌈 **Rainbow:** High-contrast, colorful styling.
    -   � **Acid Mode:** Psychedelic visual effects.
    -   🏭 **Industrial:** Clean, high-contrast dashboard.

---

## 🛠️ Developer Guide

This section details the reverse-engineered Bluetooth protocol for Fossibot devices.

### Bluetooth Service & Characteristics

| Service / Char | UUID | Description |
| :--- | :--- | :--- |
| **Service** | `0000a002-0000-1000-8000-00805f9b34fb` | Main Control Service |
| **Write Char** | `0000c304-0000-1000-8000-00805f9b34fb` | Send commands (Toggle switches, settings) |
| **Notify Char** | `0000c305-0000-1000-8000-00805f9b34fb` | Receive status updates (Telemetry) |

### Protocol Structure

Communication uses a custom 16-bit register-based protocol. Packets are typically 6-8 bytes.

**Packet Format (Hex):**
`11 04 AA BB CC DD EE FF`
- `11 04`: Header / Preamble
- `AA BB`: Register Address (High/Low Byte)
- `CC DD`: Value / Payload
- `EE FF`: **CRC Checksum** (Custom implementation)

### Register Map (Analysis 0-90)

> **Note:** Data sourced from community findings and live analysis. Values generally need specific scaling (e.g., usually 1/10 or 1/100).

#### Monitoring Registers (Read)
| Register | Description | Notes |
| :--- | :--- | :--- |
| **2** | **Input Watts (Type A?)** | Unknown source |
| **3** | **Input Watts (AC?)** | Often matches Reg 6 |
| **6** | **Total Input Watts** | AC + DC Input |
| **18** | **AC Out Volt** | `Val / 10 = V` |
| **19** | **AC Out Freq** | `Val / 10 = Hz` |
| **20** | **Total Output**| Sum of all outputs (W) |
| **22** | **AC In Freq** | `Val / 100 = Hz` |
| **30-31**| **USB A Power** | `Val / 10 = W` |
| **34** | **USB C1 Power**| 100W Port. `Val / 10 = W` |
| **35-37**| **USB C Power** | 20W Ports. `Val / 10 = W` |
| **39** | **Total Output (All)**| `Val = W` |
| **42** | **State Flags (USB/DC)**| Status bits |
| **48** | **Charge Flags** | Status bits |
| **53/55** | **Ext Battery SOC** | External Battery Status |
| **56** | **Main SOC** | `Val / 10 = %` (0-1000 range) |
| **58** | **Time to Full**| Minutes |
| **59** | **Time to Empty**| Minutes |

#### Control Registers (Write)
| Register | Description | Values / Notes |
| :--- | :--- | :--- |
| **13** | **AC Charge Power**| 1-5 (Levels: 300W-1100W) |
| **24** | **USB Toggle** | 0=Off, 1=On |
| **25** | **DC Toggle** | 0=Off, 1=On |
| **26** | **AC Toggle** | 0=Off, 1=On |
| **27** | **LED Light** | 0=Off, 1=On, 2=Flash, 3=SOS |
| **57** | **Silent Charging**| 1=On, 0=Off (Reg 57 might also be booking?) |
| **60** | **Screen Timeout**| Minutes (1, 3, 5, 10, 30, 0=Never) |
| **61** | **AC Standby** | Minutes |
| **62** | **DC Standby** | Minutes |
| **63** | **Booking Charge** | Start/End time logic |
| **64** | **System Power Off**| 1=Off |
| **66** | **Discharge Limit**| % Limit (High/Low bytes?) |
| **67** | **AC Charge Enable**| 1100=On, 10=Off |

---

## 📦 Installation

### Web / Desktop
1.  Visit the [Live App](https://dandwhelan.github.io/fossibot-bluetooth/).
2.  Click **Connect** and pair your device.
3.  (Optional) Click the install icon in your address bar to install as a desktop app.

### Android
1.  Open the site in Chrome.
2.  Wait for the **"Install Application"** prompt, or select **Install app** from the Chrome menu.
3.  Ensure "Bluetooth Scanning" and "Location" permissions are granted to Chrome.

---

## 🤝 Contributing

Have a different model? Found a new register?
1.  Open the **Diagnostics Mode** (Microscope/Pulse icon).
2.  Watch the register feed while toggling buttons on your device.
3.  Look for the **Green Flash** to identify the register that changed!
4.  Open an issue or PR with your findings!

## License
MIT License. Created by [Dan Whelan](https://github.com/dandwhelan).
