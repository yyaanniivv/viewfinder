# Horizon Overlook — Unified Plan

## Project Status

**Current**: Simple Web App (camera + canvas + GPS + compass) — **WORKS on iOS Safari today** ✅

**Archived**: WebXR + Three.js prototype (iOS Safari: no WebXR support) 📦

**Future**: React Native/Expo + ARKit (native iOS, same core logic)

---

## Simple Web App (Current — Production Ready)

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
| Debug pane (live logs) | ✅ | Minimizable, full-width |
| Responsive panels | ✅ | Stack vertically, same styling |

### File Structure

```
public/simple/
├── index.html          # Single page, loads ES modules
├── style.css           # All styling (~900 lines)
└── src/
    ├── app2.js         # Main coordinator (25KB)
    ├── geo.js          # Math: bearing, distance, projection
    ├── calibration.js  # Offset calc + localStorage
    ├── storage.js      # Location CRUD + localStorage
    ├── camera.js       # getUserMedia + video element
    ├── compass.js      # DeviceOrientation + iOS permission
    ├── gps.js          # watchPosition wrapper
    └── overlay.js      # Canvas drawing loop (requestAnimationFrame)
```

### Core Math

```
User: (lat1, lon1)  →  Location: (lat2, lon2)
bearing = atan2(sin(Δlon)·cos(lat2), cos(lat1)·sin(lat2) - sin(lat1)·cos(lat2)·cos(Δlon))
distance = haversine(lat1, lon1, lat2, lon2)

Screen X = centerX + (bearing - compassHeading + headingOffset) * (canvasWidth / FOV)
FOV ≈ 90° horizontal
```

---

## React Native/Expo + ARKit (Future — Native Port)

### Why

- Native iOS performance, ARKit integration
- Same core logic (geo.ts, calibration.ts, storage.ts) — swap adapters
- Expo dev build required (not Expo Go)

### Architecture

```
horizon-overlook-native/
├── src/
│   ├── core/              # ✅ Copied from web (geo, calibration, storage)
│   │   └── storage.ts     # Swap localStorage → AsyncStorage
│   ├── native/
│   │   ├── ARView.tsx     # expo-camera + react-three-fiber (ARKit)
│   │   ├── CompassRing.tsx# expo-sensors (magnetometer)
│   │   ├── CalibrationOverlay.tsx
│   │   ├── LocationList.tsx
│   │   └── NativeApp.tsx
│   └── shared/
│       └── types.ts
```

### API Mapping

| Web | Native (Expo) |
|-----|---------------|
| WebXR `immersive-ar` | `expo-camera` (ARKit backend) |
| `deviceorientationabsolute` | `expo-sensors` Magnetometer |
| `navigator.geolocation` | `expo-location` |
| `localStorage` | `AsyncStorage` |
| Three.js canvas | `@react-three/fiber` + `expo-gl` |

### Next Steps (When Starting Native)

1. `expo init horizon-overlook-native --template expo-template-blank-typescript`
2. `expo install expo-camera expo-location expo-sensors three @react-three/fiber @react-three/drei expo-gl`
3. Copy `src/core/` → swap `localStorage` → `AsyncStorage`
4. Build `ARView.tsx`: `expo-camera` + `@react-three/fiber` + ARKit
5. Port compass: `expo-sensors` Magnetometer → heading
6. Port calibration/location list (RN components)
7. Test on device via dev build: `expo run:ios --device`

---

## TODO — Next Features

### High Priority

- [x] **Version badge**: Show `v1.0.0-<6-char-git-hash>` in top-right corner ✅
  - Implemented: reads from git hash, displayed in top-right badge and settings

- [x] **Settings panel** with pane visibility toggles ✅
  - Settings button (⚙️) in top bar
  - Modal with toggles for Locations panel, Debug pane, Compass ring
  - Persists to localStorage, restores on init

### Medium Priority

- [ ] **Bearing display bar** — live compass heading in top bar
  - Show current bearing (e.g., "N 23°" or "23°") next to compass
  - Updates in real-time as device rotates
  - Format: Cardinal (N/NE/E/SE/S/SW/W/NW) + degrees

- [ ] **Wheel/dial interaction** on top-left compass button
  - Tap compass button → opens picker overlay (exists)
  - Add: Rotate finger on compass ring to manually adjust heading offset
  - Visual feedback: ring rotates, offset value updates
  - Useful for fine-tuning calibration without landmark

- [ ] **Map with location picker** (MapLibre / Leaflet)
  - Full-screen map overlay (triggered from location picker)
  - Tap map to select location → auto-fill lat/lon
  - Show current GPS position + saved locations as markers
  - Search/geocode address → pin on map
  - Works offline with cached tiles (optional)

- [ ] **Smooth marker animation** (lerp position between frames)
- [ ] **Figure-8 calibration detection** (auto-detect calibration motion)
- [ ] **Photo capture** with overlay baked in (canvas.toDataURL)
- [ ] **Elevation profile view** (side view of terrain between points)

### Low Priority / Nice to Have

- [ ] Live location sharing (Firebase/Supabase realtime)
- [ ] POI categories with icons (home, work, landmark, custom)
- [ ] Share location list via QR code / URL
- [ ] Dual-view UI: camera feed + map, swappable
- [ ] Android ARCore parity testing

---

## Done ✅ (Recent)

- [x] Fix: Location item click no longer toggles panel
- [x] Fix: Debug pane shows title when minimized
- [x] Fix: Current Location overlay shows GPS independently of compass
- [x] Fix: No error toast for denied compass permission
- [x] Refactor: Stack panels vertically (locations top, debug bottom)
- [x] Refactor: Unified panel header/control styling
- [x] Cleanup: Removed calibration overlay + module
- [x] Cleanup: Removed unused `app.js`
- [x] Docs: README.md, CHANGELOG.md created

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| iOS Safari compass accuracy | Calibration flow + figure-8 detection (planned) |
| GPS altitude unreliable | Manual altitude override in location edit (exists) |
| Battery drain | Throttle GPS 1Hz, pause AR when backgrounded |
| Android compass parity | Test on Pixel/Samsung; same DeviceOrientation API |
| HTTPS required for device testing | Use ngrok, self-signed cert, or local CA |

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