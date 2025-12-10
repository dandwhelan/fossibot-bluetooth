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

| Register | R/W | Description | Values / Notes |
| :--- | :--- | :--- | :--- |
| **1** | R/W | **Switch State** | Bitmask: USB(1), AC(2), DC(4), Light(8) |
| **3** | R | **Input Watts** | Total charging power (W) |
| **20** | R | **Total Output** | Sum of all output (W) |
| **21** | R | **System Watts** | System consumption/overhead (W) |
| **39** | R | **Output Watts** | Total load power (W) |
| **4** | R/W | **Light Mode** | 0=Off, 1=On, 2=Flash, 3=SOS |
| **27** | W | **LED Mode** | Cycle LED states (Alt control) |
| **56** | R/W? | **Main Battery / Key Sound** | **Conflict:** Reads as Battery %, Writes as Key Sound (0/1). *Use with caution.* |
| **53** | R | **Ext Battery 1** | Raw value. `(Val - 10) / 10 = %` |
| **55** | R | **Ext Battery 2** | Raw value. `(Val - 10) / 10 = %` |
| **59** | R | **Remaining Time** | Remianing runtime in minutes |
| **62** | W | **Screen Timeout** | Minutes (0=Never, 1, 5, 30, 60) |
| **68** | W | **System Auto-Off** | Minutes (0=Never, 5, 10, 30, 60, 240, 480) |

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
