# Horizon Overlook — Implementation Plan

## Context
Build a cross-platform AR app that shows friends' locations as horizon markers over the live camera feed. User stands on a high floor (50th), adds 5-10 static GPS points, then pans phone 360° to see labeled markers on the horizon indicating each friend's direction. Far-distance (7-15km) handled via fixed-distance horizon projection with azimuth from GPS bearing. Local-first, no backend initially. Start with WebXR (React + Three.js), fallback to React Native/Expo if browser limitations block AR camera access or sensor fusion.

## Approach

### Phase 1: Core WebXR Prototype (Week 1-2)
**Goal**: Prove GPS→AR transform works in mobile browser with camera + compass.

#### Task 1.1: Project Scaffold + Dev Server
- `npm create vite@latest horizon-overlook -- --template react-ts`
- Install: `three`, `@types/three`, `maplibre-gl`, `vite-plugin-pwa`
- Run `npm run dev` → open on phone via LAN IP (`--host`)
- **Verify**: Vite React app loads on mobile browser, hot reload works

#### Task 1.2: WebXR Camera Feed
- Request `immersive-ar` session with `camera-access`
- Render camera texture to full-screen quad (Three.js)
- Handle session start/end, visibility change
- **Verify**: Phone camera feed fills screen in AR session (Android Chrome / iOS WebXR Viewer)

#### Task 1.3: Compass Heading (DeviceOrientation)
- Listen to `deviceorientationabsolute` event
- Extract `alpha` (compass heading, 0° = North)
- Render simple compass ring at top of screen (N/E/S/W labels)
- **Verify**: Rotate phone 360° → compass ring rotates smoothly, N points north

#### Task 1.4: GPS Location + Bearing Math (geo.ts)
- Get user position via `navigator.geolocation.watchPosition({enableHighAccuracy: true})`
- Implement `geo.ts`: Haversine distance, bearing(lat1,lon1→lat2,lon2), horizon projection
- Add 2-3 hardcoded friend positions (nearby + 10km away)
- **Verify**: Console logs show correct bearing/distance to known landmarks

#### Task 1.5: Heading Calibration
- Calibration screen: "Point at known landmark, tap to calibrate"
- Compute `heading_offset = compass_alpha - gps_bearing_to_landmark`
- Apply offset to all bearings
- Persist offset in localStorage
- **Verify**: After calibration, compass ring matches real-world landmarks ±5°

#### Task 1.6: Horizon Markers in AR
- For each friend: compute bearing → place Three.js sprite at `HORIZON_DIST = 100m` on that bearing
- Sprite: colored pin + name label (billboard, always faces camera)
- Distance badge (e.g., "12.3 km")
- Markers behind camera → clamp to screen edge with arrow indicator
- **Verify**: Pan phone 360° → markers appear at correct azimuth, labels readable

#### Task 1.7: Friend Management + Map Panel
- LocalStorage CRUD: add/edit/delete friends (name, lat, lon, alt, color)
- Bottom panel: MapLibre map centered on user, pins for each friend
- Tap pin → highlight in AR view (or auto-center AR bearing)
- **Verify**: Add friend via UI → appears on map + in AR immediately, persists reload

#### Task 1.8: PWA + Offline
- Configure `vite-plugin-pwa` (manifest, service worker)
- Cache all assets, works offline after first load
- **Verify**: Install to home screen, disable network → app loads, AR works

### Phase 2: Polish & Reliability (Week 2-3)
1. **Compass Calibration Flow**
   - Detect uncalibrated compass (iOS needs figure-8 motion)
   - Visual indicator: "Move phone in figure-8"
   - Lock heading after calibration

2. **GPS Accuracy Handling**
   - Show accuracy radius on markers
   - Filter: only show friends with `distance > 100m` (horizon mode) or `distance < 50m` (ground mode)
   - Smooth marker positions (lerp over 200ms) to reduce jitter

3. **Offline/PWA**
   - Service worker caches all assets
   - Works offline after first load
   - localStorage persists friend list

4. **Testing on Device**
   - Test on iOS Safari (WebXR via WebXR Viewer or iOS 18+ native)
   - Test on Android Chrome (native WebXR)
   - Verify: 50th floor → 10km marker azimuth within ±5°

### Phase 3: React Native/Expo Fallback (If Needed)
**Trigger**: WebXR fails on target devices (no camera access, poor compass, no WebXR support)

1. **Expo Setup**
   - `expo init` + `expo-camera` + `expo-location` + `expo-sensors`
   - `three` + `expo-three` or `react-native-three` for 3D overlay
   - Or: `react-native-vision-camera` + custom AR view (more control)

2. **Native AR Alternatives**
   - **Option A**: `react-native-arkit` / `react-native-arcore` — true AR anchors, but platform-specific
   - **Option B**: Custom OpenGL/Metal view — full control, heavy lift
   - **Option C**: MapLibre/Mapbox GL with camera overlay — 2D map + camera, not true AR

3. **Shared Logic**
   - Extract GPS→bearing/distance/horizon math to pure TS module (`src/core/geo.ts`)
   - Share friend list schema & localStorage/AsyncStorage adapter
   - Same calibration logic

## Critical Files to Create

```
/src
  /core
    geo.ts           # Haversine, bearing, GPS→AR horizon projection (pure math, testable)
    calibration.ts   # Heading offset calibration logic
    storage.ts       # Friend/POI CRUD + localStorage/AsyncStorage adapter
  /web
    ARCanvas.tsx     # Three.js + WebXR scene, camera feed, marker rendering
    CompassRing.tsx  # Top compass UI
    CalibrationOverlay.tsx
    FriendList.tsx   # Add/edit/delete friends
    App.tsx          # Main web entry
  /native (if needed)
    ARView.tsx       # Expo Three / VisionCamera AR view
    NativeModules... # Platform-specific compass/GPS if needed
  /shared
    types.ts         # Friend, POI, GeoPoint types
    constants.ts     # HORIZON_DIST, colors, config
```

## Verification Checklist

| Test | Pass Criteria |
|------|---------------|
| WebXR session starts on mobile Chrome/Safari | Camera feed visible, no permission errors |
| Compass heading updates smoothly | Rotate phone 360° → compass ring rotates 360° |
| GPS bearing matches real world | Point at known landmark (sun, building) → bearing within 10° |
| Friend at 10km appears on horizon | Marker azimuth matches map bearing ±5° |
| Marker label readable at all distances | Text scales, doesn't clip, faces camera |
| Add friend → appears in AR immediately | No reload needed, localStorage persists |
| Works offline after first load | Disable network → app loads, AR works |
| PWA installable | "Add to Home Screen" works on iOS/Android |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| WebXR not supported on iOS Safari (pre-iOS 18) | Use WebXR Viewer app, or skip to React Native |
| Compass inaccurate indoors/near steel | Calibration flow + visual confidence indicator |
| GPS altitude unreliable (50th floor) | Allow manual altitude override in friend edit |
| Battery drain (GPS + camera + sensors) | Throttle GPS to 1Hz, pause AR when backgrounded |
| Far markers jitter | Smoothing + fixed horizon distance |

## Future Enhancements (Post-MVP)
- Live location sharing (Firebase/Supabase realtime)
- POI categories (home, work, favorite cafe)
- Photo capture with markers baked in
- Share friend list via QR/URL
- Elevation profile view (side view of terrain)
- **Dual-view UI**: Split screen with camera feed (large) + map (small), swappable tap-to-swap. Camera preview can be circular. Map shows friend pins, tap pin → centers AR view on that bearing.

## Next Steps
1. Initialize Vite + React + TS + Three.js project
2. Implement `geo.ts` with unit tests (Jest)
3. Build minimal WebXR camera + compass demo
4. Add horizon marker rendering
5. Add friend management UI
6. Test on physical device (critical — simulator lacks sensors)