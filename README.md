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
| Compass (absolute heading) | ✅ via `webkitCompassHeading` | ✅ AbsoluteOrientationSensor | ❌ No native compass |
| Geolocation | ✅ 5+ | ✅ 5+ | ✅ (mock) |
| Canvas 2D | ✅ Always | ✅ Always | ✅ |
| **Full Functionality** | ✅ **Yes** (with calibration) | ✅ **Yes** | ⚠️ Partial |

**Note on absolute heading (true north):** Android Chrome provides it via the `AbsoluteOrientationSensor` API (preferred path). iOS Safari doesn't support that API, but its `deviceorientation` events carry `webkitCompassHeading` — the magnetometer's true-north heading — which the app uses as the absolute bearing on iOS. Devices with neither (older browsers, desktop) fall back to relative `alpha` heading, where the landmark calibration flow compensates.

## Use Cases

- **Hiking viewpoints** — Identify peaks, valleys, towns
- **Urban rooftops** — Label buildings, landmarks, neighborhoods
- **Observation decks** — Digital orientation plaque for visitors
- **Property surveys** — Mark boundaries, corners, features
- **Photography** — Know exactly where landmarks will appear

## Quick Start

```bash
# Option 1 (recommended): Node HTTPS server with self-signed cert (LAN + mobile)
# From repo root:
node simple-server.cjs
# On your phone: https://<your-mac-ip>:5174 (accept the self-signed cert warning)

# Option 2: Python (HTTP only — no camera/compass on mobile)
python3 -m http.server 5174 --bind 0.0.0.0 --directory viewfinder

# Option 3: npx serve (HTTP)
npx serve viewfinder -l 5174

# Option 4: ngrok for HTTPS (exposes local server to internet)
ngrok http 5174
# Use the https://xxx.ngrok.io URL on your Android phone
```

## Required Mobile Permissions

| Permission | iOS (Safari) | Android (Chrome) | Purpose |
|------------|--------------|------------------|---------|
| **Camera** | ✅ Required | ✅ Required | Rear camera feed for AR overlay |
| **Location (GPS)** | ✅ Required | ✅ Required | Your position for bearing calculations |
| **Motion & Orientation** | ✅ Required | ✅ Required | Compass heading (deviceorientation) |
| **Orientation Sensor** | ❌ N/A | ✅ Optional | AbsoluteOrientationSensor (true north) |

**iOS note:** iOS Safari uses `webkitCompassHeading` from `deviceorientation` events for absolute heading — no separate sensor permission needed beyond Motion & Orientation.

---

## On Mobile (Android Chrome & iOS Safari)

### Android Chrome (full support)
1. Open the HTTPS URL on **Android Chrome**
2. Allow permissions: **Camera**, **Location**, **Motion & Orientation**
3. Tap the **compass button** (top-left) to calibrate
4. Select a visible landmark, point phone at it, tap **Calibrate**
5. Pan phone 360° — markers move on the horizon line

### iOS Safari (works with limitations)
1. Open the HTTPS URL on **iOS Safari** (Chrome on iOS uses WebKit, same behavior)
2. Allow permissions: **Camera**, **Location**, **Motion & Orientation** (Settings → Safari → Motion & Orientation Access)
3. Tap the **compass button** (top-left) to calibrate
4. Select a visible landmark, point phone at it, tap **Calibrate**
5. Pan phone 360° — markers move on the horizon line

**iOS limitations:**
- No `AbsoluteOrientationSensor` API — relies on `webkitCompassHeading` (magnetometer-based)
- Compass may drift more than Android; recalibrate as needed
- Requires HTTPS (self-signed cert works after accepting warning)
- Must enable "Motion & Orientation Access" in Safari settings

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

## Settings Reference

All settings live in the gear panel (tap the version badge). Defaults in
parentheses; every value persists to `localStorage`.

**Panel Visibility**
| Setting | Default | Effect |
|---|---|---|
| Locations Panel | off | Bottom drawer with the location list |
| Debug Pane | off | Log pane for events/errors |
| Compass Ring | on | The dial button (tap to calibrate) |

**Camera**
| Setting | Default | Effect |
|---|---|---|
| Camera Enabled | off | Camera feed on/off (toggle also in the toolbar) |
| Start Camera Automatically | off | Start the feed on page load |

**GPS**
| Setting | Default | Effect |
|---|---|---|
| Update Rate | 10s | `watchPosition` refresh interval |

**Compass**
| Setting | Default | Effect |
|---|---|---|
| Invert Compass Direction | off | Flip alpha if the compass reads backwards |
| Update Rate (ms) | 100 | Heading event throttle |
| Zero Offset (°) | 0 | Static correction if North reads off |
| Auto-calibrate on Figure-8 | off | Reserved for figure-8 detection (not yet implemented) |
| Level Indicator | off | On-canvas spirit-level gauge while panning |
| Show Level/Tilted Tag | off | ⚖️ Level/Tilted pill in the status bar |
| Lane Markers | off | Lane-mode overlay (see Overlay Marker Modes) |
| Clean Center Wheel | on | Lane mode: wheel keeps only N/E/S/W, labels self-contained in 2+2 lanes |

**Data** — "Clear All Storage (Reset)" wipes locations, settings, and
calibration.

## Overlay Marker Modes

The canvas overlay (`src/overlay.js`) draws locations in one of two modes,
selected by settings (see Settings → Compass section):

### Classic mode (Lane Markers off)

All markers sit on the horizon line: colored pointer triangles with label
boxes stacked below (rows stagger downward when boxes would overlap).
Off-screen locations render as edge arrows with mini labels.

### Lane mode (Lane Markers on)

The horizon becomes a clean "wheel" and location data fans out vertically
into **lanes**. Two sub-modes, toggled by "Clean Center Wheel":

- **Fixed 5-lane layout (Clean Center Wheel on, default)** — the horizon
  carries only N/E/S/W letters and ticks. Every location renders as a
  self-contained label box — `Name • distance` plus a pointer chevron on
  the side of its true azimuth — in one of 4 label lanes: L1 42px above,
  L1 42px below, L2 86px above, L2 86px below (see `drawFixedLanes`).

  Placement rules:
  1. A box prefers the side its chevron points toward (label drifts in
     the direction you should look).
  2. Inner lanes (L1) fill first; a second box joins a lane only when it
     does not horizontally overlap the box already in it (≥12px gap).
  3. If all 4 lanes are blocked at that x, the box spills to a 3rd row on
     its chevron side with a dimmed plumb line. Beyond ~5 visible
     locations the layout degrades by design — hide some locations via
     the panel instead.

  Each box also draws a **dashed plumb line** at its location's true
  azimuth, from the wheel to the lane. The line anchors at `screenX` (the
  exact azimuth position), never at the label box — so a short name and a
  long name keep their anchor at the same spot even when their boxes clamp
  at a screen edge. In clean-wheel mode a small colored dot marks the
  azimuth on the wheel itself.

- **Adaptive layout (Clean Center Wheel off)** — pointer triangles return
  to the horizon, and lane positions squeeze adaptively: gap between rows
  compresses from 38px to 27px as row count grows, boxes reuse rows when
  horizontally separated, and everything clamps into safe areas (below
  the tick labels, above the bottom panels).

### Edge locations (off-screen)

A location more than ±45° off the heading is off-screen. It renders as a
chevron at the screen edge pointing toward the marker's real direction
(marker off-screen left → chevron points left; panning that way brings it
in), with its label box participating in the lane layout like every other
location. Note the behind test uses the *signed* relative bearing
(`relBearing > 180 → relBearing - 360`); testing the unsigned value
misclassifies locations just past north.

### Visibility

Locations carry a persisted `hidden` flag (eye toggle in the Locations
panel). Hidden locations stay in the list but are excluded from the
overlay in both marker modes.

## Calibration

```
trueBearing = bearing(userGPS, landmarkGPS)
compassAlpha = deviceOrientation.alpha (0° = North)
offset = normalize(compassAlpha - trueBearing)
calibratedHeading = normalize(compassAlpha - offset)
```

Persisted to `localStorage` (survives reload).

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