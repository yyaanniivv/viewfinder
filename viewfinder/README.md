# Viewfinder — Digital Toposcope / Orientation Plaque

> A web-based **digital toposcope** (orientation plaque / viewfinder) that shows points of interest on the horizon through your phone's camera.

## What is a Toposcope?

A **toposcope** (also called an **orientation plaque**, **orientation table**, or **viewfinder**) is a physical plaque found at viewpoints showing the direction and distance to visible landmarks. Think of the bronze plaques on mountain summits or observation decks that say "Mount X — 23 km →".

**Viewfinder digitizes this:** instead of a fixed metal plaque, you get a live camera view with dynamic markers that move as you pan your phone — showing exactly where each landmark is on the horizon, with real-time distance and bearing.

## Features

- 📷 **Camera feed** — Live rear camera view (`getUserMedia`)
- 🧭 **Compass heading** — DeviceOrientation API (with iOS permission handling)
- 📍 **GPS position** — High-accuracy `watchPosition`
- 🎯 **Horizon markers** — Canvas overlay drawing markers at correct azimuth
- 📍 **Location management** — Add/edit/delete points of interest (localStorage)
- ⚙️ **Calibration** — Tap compass → point at known landmark → auto-calibrate
- 📱 **PWA-ready** — Install to home screen, works offline
- 🌐 **Web-based** — No app store, runs in Chrome (desktop & Android)

## Browser Support

| API | iOS Safari | Android Chrome | Desktop Chrome |
|-----|------------|----------------|----------------|
| getUserMedia | ✅ 11+ | ✅ 53+ | ✅ |
| OrientationSensor / compass | ✅ via `webkitCompassHeading` | ✅ AbsoluteOrientationSensor | ❌ No native compass |
| Geolocation | ✅ 5+ | ✅ 5+ | ✅ (mock) |
| Canvas 2D | ✅ Always | ✅ Always | ✅ |
| **Full Functionality** | ⚠️ Absolute via webkitCompassHeading | ✅ **Yes** | ⚠️ Partial |

**Note on absolute heading (true north):** Android Chrome provides it via the `AbsoluteOrientationSensor` API (preferred path). iOS Safari doesn't support that API, but its `deviceorientation` events carry `webkitCompassHeading` — the magnetometer's true-north heading — which the app uses as the absolute bearing on iOS. Devices with neither (older browsers, desktop) fall back to relative `alpha` heading, where the landmark calibration flow compensates.

## Use Cases

- **Hiking viewpoints** — Identify peaks, valleys, towns
- **Urban rooftops** — Label buildings, landmarks, neighborhoods
- **Observation decks** — Digital orientation plaque for visitors
- **Property surveys** — Mark boundaries, corners, features
- **Photography** — Know exactly where landmarks will appear

## Quick Start

```bash
# Option 1 (recommended): bundled HTTPS server with self-signed cert (LAN + mobile)
# One-time: generate the cert in horizon-overlook/ (already done if key.pem/cert.pem exist):
openssl req -x509 -newkey rsa:2048 -keyout horizon-overlook/key.pem -out horizon-overlook/cert.pem -days 365 -nodes -subj "/CN=localhost"

# Start the server (serves viewfinder/ on https://0.0.0.0:5174):
cd /path/to/repo && VIEWFINDER_DIR=$PWD/viewfinder node horizon-overlook/simple-server.cjs
# On your phone: https://<your-mac-ip>:5174 (accept the self-signed cert warning)

# Option 2: Python (HTTP only — no camera/compass on mobile)
python3 -m http.server 5174 --bind 0.0.0.0 --directory viewfinder

# Option 3: npx serve (HTTP)
npx serve viewfinder -l 5174

# Option 4: ngrok for HTTPS (exposes local server to internet)
ngrok http 5174
# Use the https://xxx.ngrok.io URL on your Android phone
```

## On Mobile (Android Chrome Only — iOS Not Supported)

1. Open the HTTPS URL (ngrok) on **Android Chrome**
2. Allow permissions: **Camera**, **Location**, **Motion & Orientation**
3. Tap the **compass button** (top-left) to calibrate
4. Select a visible landmark, point phone at it, tap **Calibrate**
5. Pan phone 360° — markers move on the horizon line

## Locations (Pre-loaded Tel Aviv Area)

| Location | Type | Coordinates |
|----------|------|-------------|
| TelAviv ToHa2 | Building | 32.068444, 34.784437 |
| KFS Water Tower | Landmark | 32.184258, 34.9103777 |
| Sharonim Mall | Building | 32.13226, 34.9052418 |
| Antipatris Fort | Landmark | 32.105094, 34.9304287 |
| Menivim Tower | Building | 32.1735835, 34.8914394 |

Add your own via the **Locations panel** (bottom drawer).

## Architecture

```
index.html          # Camera <video> + Canvas <canvas> + UI panels
style.css           # All styling (dark theme, mobile-first)
src/
├── app.js          # Main coordinator (settings, camera toggle, dial, debug pane)
├── geo.js          # Haversine distance, bearing math
├── calibration.js  # Compass offset computation + localStorage
├── storage.js      # Location CRUD (localStorage) + colors + type emojis
├── camera.js       # getUserMedia setup
├── compass.js      # Hybrid: OrientationSensor API → DeviceOrientation fallback
├── gps.js          # navigator.geolocation.watchPosition
└── overlay.js      # Canvas 2D drawing (horizon, ticks, markers)
```

## Math

```
bearing = atan2(sin(Δlon)·cos(lat₂), cos(lat₁)·sin(lat₂) - sin(lat₁)·cos(lat₂)·cos(Δlon))
distance = haversine(lat₁, lon₁, lat₂, lon₂)

screenX = centerX + (bearing - compassHeading) × (canvasWidth / FOV)
```

FOV assumed ~90° horizontal. Markers wrap at ±180°.

## Calibration

```
trueBearing = bearing(userGPS, landmarkGPS)
compassAlpha = deviceOrientation.alpha (0° = North)
offset = normalize(compassAlpha - trueBearing)
calibratedHeading = normalize(compassAlpha - offset)
```

Persisted to `localStorage` (survives reload).

## Requirements

- **Android Chrome** (recommended) — full compass + GPS + camera support
- **Desktop Chrome** — UI testing only (mock GPS, no compass)
- HTTPS required for camera/GPS/motion on mobile (use self-signed cert or ngrok)
- Camera, Location, Motion & Orientation permissions

## Future Ideas

- MapLibre map panel for location picking
- Photo capture with markers baked in
- Smooth marker animation (lerp)
- Figure-8 calibration detection
- Elevation profile view
- Share location list via QR/URL
- React Native port (native ARKit/ARCore)

## License

MIT — Build your own digital toposcope.