# Fossibot F2400 Control PWA

A Progressive Web App (PWA) for controlling and monitoring the Fossibot F2400 Portable Power Station via Bluetooth. This application runs entirely in the browser (Chrome/Edge/Android) using the Web Bluetooth API, allowing for offline control without the need for official cloud-based apps.

## Features

-   **Real-time Monitoring:** View Input/Output wattage, battery percentage, remaining time, and energy stats.
-   **Remote Control:** Toggle USB, AC, DC, and Light outputs wirelessly.
-   **PWA Support:** Installable on Android, Windows, and macOS for an app-like experience. Works offline.
-   **Multiple Themes:**
    -   **Cyberpunk (Default):** Dark mode with neon accents.
    -   **Terminal:** Retro command-line interface with typing support.
    -   **Psychedelic:** Trippy visuals with melting effects and watching eyes.
    -   **Pipboy:** Fallout-inspired green monochrome.
    -   **Minimal/Industrial:** Clean and functional designs.
-   **Register Scanner:** Built-in tool to scan and reverse-engineer Bluetooth registers.

## Installation & Usage

### Web (Chrome/Edge)
1.  Navigate to the hosted URL (e.g., GitHub Pages).
2.  Click the **Connect** button.
3.  Select your Fossibot device from the Bluetooth pairing list.
4.  Once connected, the dashboard will update with live data.

### Android (PWA)
1.  Open the site in Chrome for Android.
2.  Tap the "Install App" prompt at the bottom or go to Chrome Menu -> "Install app".
3.  Launch the app from your home screen.
4.  Note: Ensure Bluetooth and Location services are enabled for Web Bluetooth to work.

## Technical Details

-   **Stack:** HTML5, Vanilla CSS, Vanilla JavaScript. No frameworks or build steps required.
-   **Bluetooth:** Uses the Web Bluetooth API (`navigator.bluetooth`) to communicate with the Fossibot's GATT server.
-   **Service Worker:** Caches all assets for offline functionality (`service-worker.js`).
-   **Manifest:** Compliant `manifest.json` for PWA installation.

## Project Structure

-   `index.html`: Main application logic and UI.
-   `service-worker.js`: Handles offline caching and updates.
-   `manifest.json`: App metadata for PWA installation.
-   `img/`: Contains assets for the Psychedelic theme.
-   `README.md`: Project documentation.

## Recent Updates

-   **v23:** UI Refinements (Removed title, resized icons).
-   **v22:** Added "Screen Melt" chaos effect to Psychedelic theme.
-   **v21:** Implemented "Watching Eyes" interactive background.
-   **v20:** Organized image assets into `img/` directory.

## License

MIT License. Feel free to fork and modify for your own power stations!
