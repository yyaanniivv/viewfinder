# Viewfinder — Unified Plan

## Project Status

**Current**: Viewfinder — Simple Canvas 2D Web App (works on Android Chrome) ✅

**Archived**: React Web App + WebXR + Three.js prototype (iOS Safari: no WebXR support) 📦

**Future**: React Native/Expo + ARKit (native iOS, same core logic)

---

## Viewfinder (Production Ready)

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Camera feed (`getUserMedia`) | ✅ | Environment-facing, playsinline |
| Canvas overlay (2D drawing) | ✅ | Horizon line, compass ticks, markers |
| Horizon markers | ✅ | Triangle ticks at horizon line; name+distance boxes below, staggered rows to avoid overlap |
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
| Compass invert toggle | ✅ | In Settings: "Invert Compass Direction" |
| Compass update rate | ✅ | Configurable 50-2000ms slider |
| Compass zero offset | ✅ | 0-360° slider (180° fixes N/S) |
| Level detection | ✅ | Status bar shows Level/Tilted via beta/gamma |
| Level indicator (visual) | ✅ | Wide bubble gauge centered below horizon line; green <2°, amber <5°, red beyond; settings toggle |
| GPS refresh rate setting | ✅ | 1-20s slider (default 10s); throttles watchPosition, persisted, live-apply |
| Scrollable settings pane | ✅ | Settings panel scrolls when content exceeds 80vh |

### File Structure

```
viewfinder/
├── index.html          # Single page, loads ES modules
├── style.css           # All styling (~900 lines)
└── src/
    ├── app.js          # Main coordinator
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

### 1. Compass Improvements (IN PROGRESS — NOT DONE)
- [ ] **OrientationSensor API** — Migrate from deprecated DeviceOrientation to modern OrientationSensor API
  - ✅ Hybrid implementation added (tries OrientationSensor, falls back to DeviceOrientation)
  - ⚠️ **NEEDS TESTING**: Works on Chrome Android, falls back on iOS Safari
  - ⚠️ **TODO**: Test on Android Chrome, Pixel, Samsung to verify absolute heading + level detection
- [ ] **Device orientation matrix** — Use quaternion/rotation matrix for robust level detection
  - Current: basic pitch/roll threshold (|pitch|<5°, |roll|<5°)
  - Better: use rotation matrix for precise horizon vs level detection
- [ ] **Compass calibration UI** — Visual figure-8 guide + auto-detect
- [ ] **Auto-switch compass/level mode** — When phone points down → compass, raised → level bar

### 2. GPS Refresh Rate Setting
- [x] Slider in settings: 1s to 20s (default 10s)
- [x] Throttles `watchPosition` updates to save battery
- [x] Live-apply via setUpdateRate (restarts watch, next fix passes immediately)

### 3. Copy/Paste Location Picker
- [ ] Copy location data (lat/lon/alt/name) to clipboard as text/JSON
- [ ] Paste from clipboard into location picker / add location form
- [ ] Format: "Name, Lat, Lon, Alt" or JSON for easy sharing

### 4. Phone Level Indicator (Visual)
- [x] Show pitch/roll from DeviceOrientation (beta/gamma)
- [x] Visual: wide centered bubble gauge below horizon line `|---|`
- [x] Green when level (|pitch| < 2° and |roll| < 2°), amber when slightly off, red when crooked
- [x] Display centered on overlay, updates in real-time — helps align device while panning for POI
- [x] Pitch shifts gauge frame vertically against fixed dashed reference line
- [x] Settings toggle to show/hide (persisted)

### 5. Smooth Marker Animation
- [ ] Lerp position between frames for fluid marker movement

### 6. Map with Location Picker (MapLibre / Leaflet)
- [ ] Full-screen map overlay, tap to select location
- [ ] Show current GPS + saved locations as markers
- [ ] Search/geocode address

---

## Done ✅ (Recent)

- [x] Fix: calibration button stuck on "Calibrating..." when reopening during the 2s window (state reset on open)
- [x] Fix: calibration overlay no longer auto-opens on first load — it blocked the camera toggle and GPS pill; canvas shows "UNCALIBRATED — Tap compass" instead
- [x] Fix: POI markers redesigned — triangle tick at horizon + name•distance boxes below with width-aware stagger (no more overlap with level gauge or each other)
- [x] Fix: compact GPS pill (±20m; coords in tooltip/copy) — camera button no longer pushed off-screen on mobile
- [x] Removed redundant 🧭 Relative/Absolute pill from top bar (info lives in calibration + current-location overlays)
- [x] GPS refresh rate setting (1-20s, default 10s) — throttle + live-apply
- [x] Level indicator moved to wide centered gauge on overlay (below horizon)
- [x] Overlay canvas always visible (level gauge works without camera)
- [x] Port app2 features into viewfinder (single app: settings, camera toggle, dial, debug pane, current-location overlay, hybrid compass)
- [x] Scrollable settings pane (max-height 80vh + overflow-y)
- [x] Visual level indicator (bubble gauge) with settings toggle
- [x] Remove stale app copies (horizon-overlook/public/simple + public/src) — gitignored, files kept on disk
- [x] simple-server.cjs defaults to serving viewfinder/
- [x] Compass invert toggle & configurable update rate in Settings
- [x] Compass zero offset (0-360°) — 180° fixes N/S upside down
- [x] Level detection via beta/gamma → status bar shows Level/Tilted
- [x] Hybrid OrientationSensor API (works on Chrome Android, falls back on iOS)
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
| DeviceOrientation API deprecated | Hybrid OrientationSensor API implemented |

---

## Testing Checklist

- [ ] iPhone 13 mini (iOS 17+) — camera, GPS, compass all work
- [ ] **Android Chrome — camera, GPS, compass all work (OrientationSensor → absolute heading)**
- [ ] **Pixel/Samsung — verify absolute heading + level detection works**
- [ ] Desktop Chrome (simulated) — GPS mock, compass mock
- [ ] Offline — app loads, markers render from localStorage
- [ ] PWA install — adds to home screen, works offline
- [ ] Calibration — tap known landmark, markers align

---

## Version

**Current**: `v1.0.0-<git-hash>` (see top-right badge)

**Release**: Tag git commit → version auto-updates