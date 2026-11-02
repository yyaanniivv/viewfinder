# Horizon Overlook — Digital Toposcope / Orientation Plaque

> A web-based **digital toposcope** (orientation plaque / viewfinder) that shows points of interest on the horizon through your phone's camera.

## What is a Toposcope?

A **toposcope** (also called an **orientation plaque**, **orientation table**, or **viewfinder**) is a physical plaque found at viewpoints showing the direction and distance to visible landmarks. Think of the bronze plaques on mountain summits or observation decks that say "Mount X — 23 km →".

**Horizon Overlook digitizes this:** instead of a fixed metal plaque, you get a live camera view with dynamic markers that move as you pan your phone — showing exactly where each landmark is on the horizon, with real-time distance and bearing.

## Features

- 📷 **Camera feed** — Live rear camera view (`getUserMedia`)
- 🧭 **Compass heading** — DeviceOrientation API (with iOS permission handling)
- 📍 **GPS position** — High-accuracy `watchPosition`
- 🎯 **Horizon markers** — Canvas overlay drawing markers at correct azimuth
- 📍 **Location management** — Add/edit/delete points of interest (localStorage)
- ⚙️ **Calibration** — Tap compass → point at known landmark → auto-calibrate
- 📱 **PWA-ready** — Install to home screen, works offline
- 🌐 **Web-based** — No app store, runs in Safari/Chrome

## Use Cases

- **Hiking viewpoints** — Identify peaks, valleys, towns
- **Urban rooftops** — Label buildings, landmarks, neighborhoods
- **Observation decks** — Digital orientation plaque for visitors
- **Property surveys** — Mark boundaries, corners, features
- **Photography** — Know exactly where landmarks will appear

## Quick Start

```bash
# Serve locally (HTTPS required for camera on mobile)
cd horizon-overlook-simple

# Option 1: Python
python3 -m http.server 5174

# Option 2: npx serve
npx serve -l 5174

# Option 3: ngrok for HTTPS (required on mobile Safari)
ngrok http 5174
# Use the https://xxx.ngrok.io URL on your phone
```

## On Mobile (iOS Safari / Android Chrome)

1. Open the HTTPS URL
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
index.html          # Camera <video> + Canvas <canvas> + UI
style.css           # All styling (dark theme, mobile-first)
src/
├── geo.js          # Haversine distance, bearing math
├── calibration.js  # Compass offset computation + localStorage
├── storage.js      # Location CRUD (localStorage)
├── camera.js       # getUserMedia setup
├── compass.js      # DeviceOrientation + iOS permission
├── gps.js          # navigator.geolocation.watchPosition
├── overlay.js      # Canvas 2D drawing (horizon, ticks, markers)
└── app.js          # Main coordinator
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

## Browser Support

| API | iOS Safari | Android Chrome |
|-----|------------|----------------|
| getUserMedia | ✅ 11+ | ✅ 53+ |
| DeviceOrientation | ✅ 13+ (permission) | ✅ 3+ |
| Geolocation | ✅ 5+ | ✅ 5+ |
| Canvas 2D | ✅ Always | ✅ Always |

**HTTPS required** for camera on mobile. Use ngrok or mkcert for local testing.

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