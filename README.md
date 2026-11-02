# Horizon Overlook

A lightweight AR-style web app that shows GPS locations as horizon markers over your camera feed. Built with vanilla JavaScript — no frameworks, no build step, works on iOS Safari today.

## Features

- **Camera feed** via `getUserMedia` (environment-facing)
- **Canvas overlay** with horizon line, compass ticks, and location markers
- **GPS + Compass** — bearing math projects locations to screen azimuth
- **Location management** — add/edit/delete locations (stored in localStorage)
- **Compass calibration** — align compass to a known landmark
- **PWA-ready** — installable, works offline
- **Zero build step** — ES modules, open `index.html` via HTTPS

## Quick Start

```bash
# Serve via HTTPS (required for camera/gps)
npx serve -s horizon-overlook/public/simple -l 8080 --ssl-cert cert.pem --ssl-key key.pem

# Or use any HTTPS server (ngrok, python with certs, etc.)
# Open on iPhone Safari: https://<your-ip>:8080
```

## Project Structure

```
horizon-overlook/
├── public/simple/           # ← Main app (this is what runs)
│   ├── index.html           # Single HTML entry point
│   ├── style.css            # All styling
│   └── src/
│       ├── app2.js          # Main coordinator
│       ├── geo.js           # Haversine, bearing, projection
│       ├── calibration.js   # Compass offset + localStorage
│       ├── storage.js       # Location CRUD + localStorage
│       ├── camera.js        # getUserMedia setup
│       ├── compass.js       # DeviceOrientation + iOS permission
│       ├── gps.js           # watchPosition
│       └── overlay.js       # Canvas drawing loop
├── src/core/                # Shared TypeScript core (for React Native port)
│   ├── geo.ts
│   ├── calibration.ts
│   └── storage.ts
└── horizon-overlook-native/ # (Future) Expo + React Native + ARKit
```

## How It Works

1. **GPS** gets your position (lat/lon/alt + accuracy)
2. **Compass** gets device heading (0° = North)
3. **Math** computes bearing from you → each saved location
4. **Projection** maps bearing to canvas X: `centerX + (bearing - heading) * pxPerDeg`
5. **Canvas** draws markers on horizon line at computed positions

## Screenshots

| Camera + Overlay | Location Panel | Calibration |
|------------------|----------------|-------------|
| Markers on horizon | Add/edit locations | Align to landmark |

## Requirements

- iOS 13+ Safari / Android Chrome
- HTTPS (required for camera, GPS, motion APIs)
- Camera permission
- Location permission  
- Motion permission (iOS 13+ for compass)

## Version

`v1.0.0-<git-hash>` — Check the version badge in top-right corner

## License

MIT