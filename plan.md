# Horizon Overlook — Unified Plan

## Project Status

**Current**: React Web App + Simple Web App (both work on iOS Safari) ✅

**Archived**: WebXR + Three.js prototype (iOS Safari: no WebXR support) 📦

**Future**: React Native/Expo + ARKit (native iOS, same core logic)

---

## React Web App (Production Ready)

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Camera feed (`getUserMedia`) | ✅ | Environment-facing, playsinline |
| Canvas overlay (2D drawing) | ✅ | Horizon line, compass ticks, markers |
| GPS position (`watchPosition`) | ✅ | High accuracy, altitude, accuracy |
| Compass heading (`DeviceOrientation`) | ✅ | iOS permission handled |
| Bearing math (haversine) | ✅ | Core geo.ts — pure, tested |
| Location CRUD + localStorage | ✅ | 5 Tel Aviv samples included |
| Calibration (offset) | ✅ | Tap compass → select landmark → calibrate |
| PWA (offline, installable) | ✅ | Service worker + manifest |
| Settings panel | ✅ | Pane visibility, version badge |
| Calibration result display | ✅ | Offset, user lat/lon, timestamp, landmark, true bearing |
| Interactive CompassRing | ✅ | Tap to calibrate when uncalibrated |
| Auto-minimize location panel | ✅ | Collapses on location selection |

### File Structure

```
horizon-overlook/
├── public/
│   ├── index.html
│   ├── manifest.json
│   └── sw.js (service worker)
├── src/
│   ├── core/
│   │   ├── geo.ts          # Math: bearing, distance, projection
│   │   ├── calibration.ts  # Offset calc + localStorage
│   │   └── storage.ts      # Location CRUD + localStorage
│   ├── web/
│   │   ├── App.tsx         # Main coordinator
│   │   ├── ARCanvas.tsx    # Canvas overlay rendering
│   │   ├── CompassRing.tsx # Compass with tap-to-calibrate
│   │   ├── CalibrationOverlay.tsx
│   │   └── LocationList.tsx
│   └── shared/
│       ├── types.ts
│       └── constants.ts
```

---

## Simple Web App (Production Ready)

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Camera feed (`getUserMedia`) | ✅ | Environment-facing, playsinline |
| Canvas overlay (2D drawing) | ✅ | Horizon line, compass ticks, markers |
| GPS position (`watchPosition`) | ✅ | High accuracy, altitude, accuracy |
| Compass heading (`DeviceOrientation`) | ✅ | iOS permission handled |
| Bearing math (haversine) | ✅ | Core geo.js — pure, tested |
| Location CRUD + localStorage | ✅ | 5 Tel Aviv samples included |
| Calibration (offset) | ✅ | Tap compass → select landmark → calibrate |
| PWA (offline, installable) | ✅ | Service worker + manifest |
| Settings panel | ✅ | Panel visibility, camera settings, version badge |
| Bearing display bar | ✅ | Live compass heading in top bar |
| Compass wheel/dial | ✅ | Rotate to adjust heading offset |
| Click-to-copy GPS coords | ✅ | Click GPS status to copy lat,lon,alt |

### File Structure

```
public/simple/
├── index.html          # Single page, loads ES modules
├── style.css           # All styling (~900 lines)
└── src/
    ├── app2.js         # Main coordinator
    ├── geo.js          # Math: bearing, distance, projection
    ├── calibration.js  # Offset calc + localStorage
    ├── storage.js      # Location CRUD + localStorage
    ├── camera.js       # getUserMedia + video element
    ├── compass.js      # DeviceOrientation + iOS permission
    ├── gps.js          # watchPosition wrapper
    └── overlay.js      # Canvas drawing loop (requestAnimationFrame)
```

---

## TODO — Next Features (In Priority Order)

### 1. GPS Refresh Rate Setting
- [ ] Slider/bar in settings: 200ms to 20s (default 1000ms)
- [ ] Throttles `watchPosition` updates to save battery

### 2. Copy/Paste Location Picker
- [ ] Copy location data (lat/lon/alt/name) to clipboard as text/JSON
- [ ] Paste from clipboard into location picker / add location form
- [ ] Format: "Name, Lat, Lon, Alt" or JSON for easy sharing

### 3. Phone Level Indicator
- [ ] Show pitch/roll from DeviceOrientation (beta/gamma)
- [ ] Visual: horizontal line with side dashes `|---|`
- [ ] Green when level (|pitch| < 2° and |roll| < 2°), amber when slightly off, red when crooked
- [ ] Display in top bar or overlay, updates in real-time
- [ ] Helps user hold phone level for accurate compass/bearing

### 4. Smooth Marker Animation
- [ ] Lerp position between frames for fluid marker movement

### 5. Figure-8 Calibration Detection
- [ ] Auto-detect figure-8 motion for iOS calibration

### 6. Map with Location Picker (MapLibre / Leaflet)
- [ ] Full-screen map overlay, tap to select location
- [ ] Show current GPS + saved locations as markers
- [ ] Search/geocode address

---

## Done ✅ (Recent)

- [x] Camera settings — default off + settings toggle
- [x] Compass wheel/dial interaction (rotate to adjust heading offset)
- [x] Bearing display bar — live compass heading in top bar
- [x] Click-to-copy GPS coordinates (lat,lon,alt)
- [x] Fix: Current Location overlay — removed "Waiting for compass..."
- [x] Auto-minimize location panel on selection (React)
- [x] Tel Aviv sample locations (5 locations)
- [x] Calibration result display (offset, lat/lon, timestamp, landmark, true bearing)
- [x] Interactive CompassRing — tap to calibrate when uncalibrated
- [x] Version badge in top-right corner
- [x] Settings panel with pane visibility toggles
- [x] Camera default OFF
- [x] GPS/compass independence in current location overlay
- [x] Stack panels vertically (locations top, debug bottom)
- [x] Unified panel header/control styling

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| iOS Safari compass accuracy | Calibration flow + figure-8 detection (planned) |
| GPS altitude unreliable | Manual altitude override in location edit (exists) |
| Battery drain | Throttle GPS (configurable), pause AR when backgrounded |
| Android compass parity | Test on Pixel/Samsung; same DeviceOrientation API |
| HTTPS required for device testing | Use simple-server.cjs with self-signed cert |

---

## Testing Checklist

- [ ] iPhone 13 mini (iOS 17+) — camera, GPS, compass all work
- [ ] Android Chrome — camera, GPS, compass all work
- [ ] Desktop Chrome (simulated) — GPS mock, compass mock
- [ ] Offline — app loads, markers render from localStorage
- [ ] PWA install — adds to home screen, works offline
- [ ] Calibration — tap known landmark, markers align

---

## Version

**Current**: `v1.0.0-<git-hash>` (see top-right badge)

**Release**: Tag git commit → version auto-updates