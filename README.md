# Viewfinder

A lightweight digital toposcope (orientation plaque / viewfinder) web app that shows GPS locations as horizon markers over your camera feed. Built with vanilla JavaScript — no frameworks, no build step.

## Features

- **Camera feed** via `getUserMedia` (environment-facing)
- **Canvas overlay** with horizon line, compass ticks, and location markers
- **GPS + Compass** — bearing math projects locations to screen azimuth
- **Location management** — add/edit/delete locations (stored in localStorage)
- **Compass calibration** — align compass to a known landmark
- **PWA-ready** — installable, works offline
- **Zero build step** — ES modules, open `index.html` via HTTPS

## Browser Support

| API | iOS Safari | Android Chrome | Desktop Chrome |
|-----|------------|----------------|----------------|
| getUserMedia | ✅ 11+ | ✅ 53+ | ✅ |
| DeviceOrientation | ✅ 13+ (permission) | ✅ 3+ | ❌ No native compass |
| Geolocation | ✅ 5+ | ✅ 5+ | ✅ (mock) |
| Canvas 2D | ✅ Always | ✅ Always | ✅ |
| **Full Functionality** | ❌ **No** | ✅ **Yes** | ⚠️ Partial |

**⚠️ Important:** iOS Safari does **not** provide reliable DeviceOrientation absolute heading (true north) — it only gives relative heading. This makes compass calibration unreliable on iOS. **Android Chrome is the recommended platform** for full functionality. Desktop Chrome works for UI testing but lacks real compass data.

## Quick Start

```bash
# Option 1 (recommended): Node HTTPS server with self-signed cert (LAN + mobile)
# From repo root:
node viewfinder/simple-server.cjs
# Then open https://<your-lan-ip>:5174 on your phone (accept self-signed cert)

# Option 2: Python (HTTP only — no camera/compass on mobile)
python3 -m http.server 5174 --bind 0.0.0.0 --directory viewfinder

# Option 3: npx serve (HTTP)
npx serve viewfinder -l 5174

# Option 4: ngrok for HTTPS (exposes local server to internet)
ngrok http 5174
# Use the https://xxx.ngrok.io URL on your Android phone
```

## Project Structure

```
viewfinder/
├── index.html           # Single HTML entry point
├── style.css            # All styling
└── src/
    ├── app.js           # Main coordinator
    ├── geo.js           # Haversine, bearing, projection
    ├── calibration.js   # Compass offset + localStorage
    ├── storage.js       # Location CRUD + localStorage
    ├── camera.js        # getUserMedia setup
    ├── compass.js       # DeviceOrientation + iOS permission
    ├── gps.js           # watchPosition
    └── overlay.js       # Canvas drawing loop
```

## How It Works

1. **GPS** gets your position (lat/lon/alt + accuracy)
2. **Compass** gets device heading (0° = North)
3. **Math** computes bearing from you → each saved location
4. **Projection** maps bearing to canvas X: `centerX + (bearing - heading) * pxPerDeg`
5. **Canvas** draws markers on horizon line at computed positions

## Requirements

- **Android Chrome** (recommended) — full compass + GPS + camera support
- **Desktop Chrome** — UI testing only (mock GPS, no compass)
- HTTPS required for camera/GPS/motion on mobile (use self-signed cert or ngrok)
- Camera, Location, Motion & Orientation permissions

## Version

`v1.0.0-<git-hash>` — Check the version badge in top-right corner

## License

MIT