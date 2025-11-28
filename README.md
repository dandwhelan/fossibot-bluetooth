# Fossibot F2400 Control PWA

A simple, offline-capable web app to control and monitor your Fossibot F2400 power station via Bluetooth.

## Features
- **Monitor**: Real-time battery %, Watts In/Out, Remaining Time, and Energy (kWh).
- **Control**: Toggle USB, AC, DC, and Light outputs.
- **Offline**: Works without an internet connection.

## How to Use
1.  **Download**: Save the `fossibot_control.html` file to your computer or phone.
2.  **Open**: Double-click the file to open it in a web browser (Chrome, Edge, or Bluefy on iOS).
3.  **Connect**: Click the **Connect** button and select your device (named "POWER" or "Fossibot").

## Troubleshooting
- **Browser Support**: Requires a browser with Web Bluetooth support (Chrome, Edge, Opera). Firefox and Safari (macOS) are not supported. On iOS, use the "Bluefy" app.
- **Connection Issues**: If connection fails, try refreshing the page or toggling Bluetooth on/off on your device.
- **"NetworkError"**: This usually means the device is already connected to something else or needs a reset.

## Technical Info
- **Service UUID**: `0000a002-0000-1000-8000-00805f9b34fb`
- **Write Char**: `0000c304...`
- **Notify Char**: `0000c305...`
