# Changelog

All notable changes to Horizon Overlook Simple.

## [v1.0.0] - 2026-11-03

### Added
- Initial simple web app (camera + canvas + GPS + compass)
- Location management (add/edit/delete, localStorage)
- Compass calibration overlay
- Debug pane with live logs
- Responsive UI with minimizable panels

### Changed
- **Refactor**: Merged `app.js` → `app2.js` as single entry point
- **Layout**: Debug pane now stacks below locations panel (full width)
- **UI**: Both panels share same header/control styling
- **Debug pane**: Title remains visible when minimized

### Fixed
- **Bug**: Clicking location item no longer toggles panel minimize
  - Added `e.stopPropagation()` to location-info click handler
- **Bug**: Current Location overlay shows GPS data independently of compass
  - GPS lat/lon/alt/accuracy display as soon as GPS fix available
  - Compass shows "Waiting for compass..." separately
- **UX**: Removed error toast for denied compass permission
  - Compass is optional; GPS works without it
  - Only logs to debug console

### Removed
- Compass calibration overlay/screen (no longer needed)
- `calibration.js` module
- Calibration-related CSS styles
- `isCalibrated` state throughout app
- Old `app.js` (unused, kept only `app2.js`)

## [v0.x] - 2026-11-02

### Added
- WebXR prototype (Phase 1) — Three.js + WebXR + React + Vite
- Core math library: geo.ts (haversine, bearing, projection)
- Calibration logic (heading offset)
- Storage abstraction (localStorage adapter)
- Location CRUD UI
- PWA support (service worker, manifest)
- 5 Tel Aviv sample locations

### Note
WebXR prototype archived — iOS Safari doesn't support WebXR. Simple web app is now the primary implementation.

---

## Version Format

`v<major>.<minor>.<patch>-<git-short-hash>`

Example: `v1.0.0-a1b2c3d`