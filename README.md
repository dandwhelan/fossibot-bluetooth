# Fossibot F2400 Control PWA

**🚀 Live App: [https://dandwhelan.github.io/fossibot-bluetooth/](https://dandwhelan.github.io/fossibot-bluetooth/)**

A robust Progressive Web App (PWA) for monitoring and controlling Fossibot Portable Power Stations (F2400, F3600 Pro) via Bluetooth. Designed for privacy and offline capability, it runs entirely client-side using the Web Bluetooth API.

![App Icon](icon-512.png)

## ✨ Features

-   **Live Telemetry:** Real-time monitoring of Input/Output wattage, battery SOC, remaining runtime, and temperatures.
-   **Wireless Control:** Toggle AC, DC, USB, and LED Light outputs remotely.
-   **Appliance Runtime Calculator:** Simulate various loads (TV, Fridge, Induction Hob) to estimate battery duration.
-   **Labs (Experimental):** Advanced controls for:
    -   **Key Sound** (Toggle beep feedback) *[Verification Needed]*
    -   **Screen Timeout** (Set auto-dim timer)
    -   **System Auto-Off** (Set standby timer)
    -   **LED Modes** (Cycle Light/Flash/SOS)
-   **Multiple Themes:**
    -   🖥️ **Terminal:** Retro CLI with typing effects.
    -   ☢️ **Pipboy:** Fallout-inspired green monochrome (Default).
    -   👁️ **Psychedelic:** Trippy visuals with interactive backgrounds.
    -   🏭 **Industrial:** Clean, high-contrast dashboard.
-   **PWA Ready:** Installable on Android, IOS, Windows, and macOS. Works 100% offline.

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

**Checksum Algorithm (JavaScript):**
```javascript
function calculateChecksum(arr) {
    let t = 0xffff; // Initial value
    for (let byte of arr) {
        t ^= byte;
        for (let i = 0; i < 8; i++) t = (t & 1) ? ((t >> 1) ^ 40961) : (t >> 1);
    }
    return t & 0xffff;
}
```

### Register Map

> **Note:** Data sourced from community findings and [schauveau/sydpower-mqtt](https://github.com/schauveau/sydpower-mqtt/blob/main/MQTT-MODBUS.md). Values generally need specific scaling (e.g., usually 1/10 or 1/100).

#### Monitoring Registers (Read)
| Register | Description | Notes |
| :--- | :--- | :--- |
| **2, 3, 6**| **Input Watts** | Reg 6 appears to be Total (AC+DC). Reg 30/31 are USB idle? |
| **18** | **AC Out Volt** | `Val / 10 = V` |
| **19** | **AC Out Freq** | `Val / 10 = Hz` |
| **20** | **Total Output**| Sum of all outputs (W) |
| **22** | **AC In Freq** | `Val / 100 = Hz` (e.g., 4988 = 49.88Hz) |
| **30-31**| **USB A Power** | `Val / 10 = W`. Reg 30/31 linked? |
| **34** | **USB C1 Power**| 100W Port. `Val / 10 = W` |
| **35-37**| **USB C Power** | 20W Ports. `Val / 10 = W` |
| **39** | **Total Output**| `Val = W` (AC+DC+USB) |
| **42** | **Mask 1** | USB Active (0x03d8) / DC Active (0xe000) |
| **48** | **Mask 2** | AC Charging (0x8000) / Idle? (0x4000) |
| **56** | **Main SOC** | `Val / 10 = %` (0-1000 range) |
| **58** | **Time to Full**| Minutes (0 if discharging) |
| **59** | **Time to Empty**| Minutes |

#### Control Registers (Write)
| Register | Description | Values / Notes |
| :--- | :--- | :--- |
| **13** | **AC Charge Rate**| Read Only? 1-5 (300W-1100W) |
| **24** | **USB Only** | 0=Off, 1=On |
| **25** | **DC Only** | 0=Off, 1=On |
| **26** | **AC Only** | 0=Off, 1=On |
| **27** | **LED Light** | 0=Off, 1=On, 2=Flash, 3=SOS |
| **57** | **AC Booking** | Mins to disable AC charging (Timer) |
| **60** | **Screen Timeout**| Minutes (1, 3, 5, 10, 30) |
| **61** | **AC Standby** | Minutes |
| **62** | **DC Standby** | Minutes |
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
1.  Open the **Scanner Tool** (Microscope 🔬 icon).
2.  Scan a range of registers while toggling features on your device.
3.  Open an issue or PR with your findings!

## License
MIT License. Created by [Dan Whelan](https://github.com/dandwhelan).
