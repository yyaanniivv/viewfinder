/**
 * Main app coordinator for Viewfinder
 * Wires camera, compass, GPS, overlay, calibration, and locations
 */

import { Overlay } from './overlay.js';
import { startCamera } from './camera.js';
import { startCompass } from './compass.js';
import { startGPS } from './gps.js';

import { getLocations, saveLocations, SAMPLE_LOCATIONS, createLocation, generateId, getNextColor, LOCATION_COLORS, LOCATION_TYPES, getTypeEmoji } from './storage.js';
import { loadCalibration, saveCalibration, computeHeadingOffset, hasValidCalibration } from './calibration.js';
import { normalizeBearing, formatDistance, haversineDistance, bearing } from './geo.js';

// DOM Elements
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const compassBtn = document.getElementById('compass-btn');
const locationsPanel = document.getElementById('locations-panel');
const statusGPS = document.getElementById('status-gps');
const locationCountEl = document.getElementById('location-count');
const debugPane = document.getElementById('debug-pane');
const debugContent = document.getElementById('debug-content');
const minimizeLocationsBtn = document.getElementById('minimize-locations-btn');
const maximizeLocationsBtn = document.getElementById('maximize-locations-btn');
const minimizeDebugBtn = document.getElementById('minimize-debug-btn');
const maximizeDebugBtn = document.getElementById('maximize-debug-btn');
const clearDebugBtn = document.getElementById('clear-debug-btn');
// Current Location Overlay
const currentLocationOverlay = document.getElementById('current-location-overlay');
const currentLocationCloseBtn = document.getElementById('current-location-close-btn');
const currentLocationUseGpsBtn = document.getElementById('current-location-use-gps-btn');
const currentLocationSetManualBtn = document.getElementById('current-location-set-manual-btn');
const manualLat = document.getElementById('manual-lat');
const manualLon = document.getElementById('manual-lon');
const manualAlt = document.getElementById('manual-alt');
const gpsLatEl = document.getElementById('gps-lat');
const gpsLonEl = document.getElementById('gps-lon');
const gpsAltEl = document.getElementById('gps-alt');
const gpsAccEl = document.getElementById('gps-acc');
const gpsCompassEl = document.getElementById('gps-compass');
const gpsBearingEl = document.getElementById('gps-bearing');
// Camera toggle
const cameraToggleBtn = document.getElementById('camera-toggle-btn');
// Settings (triggered by version badge)
const settingsBtn = document.getElementById('version-badge');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const toggleLocationsPanel = document.getElementById('toggle-locations-panel');
const toggleDebugPane = document.getElementById('toggle-debug-pane');
const toggleCompass = document.getElementById('toggle-compass');
const settingsVersion = document.getElementById('settings-version');
const versionBadge = document.getElementById('version-badge');
// Camera settings
const cameraEnabledCheckbox = document.getElementById('camera-enabled');
const cameraDefaultOnCheckbox = document.getElementById('camera-default-on');
// Compass settings
const compassInvertCheckbox = document.getElementById('compass-invert');
const compassRateSlider = document.getElementById('compass-rate');
const compassRateValue = document.getElementById('compass-rate-value');
const compassZeroOffsetSlider = document.getElementById('compass-zero-offset');
const compassZeroOffsetValue = document.getElementById('compass-zero-offset-value');
const compassAutoCalibrateCheckbox = document.getElementById('compass-auto-calibrate');
// Level indicator
const levelIndicatorToggle = document.getElementById('toggle-level-indicator');
const levelIndicatorCanvas = document.getElementById('level-indicator');
// Lane markers experiment (labels fan out above/below horizon)
const laneModeToggle = document.getElementById('toggle-lane-mode');
// Clean center wheel (no location triangles on the horizon in lane mode)
const cleanWheelToggle = document.getElementById('toggle-clean-wheel');
// GPS settings
const gpsRateSlider = document.getElementById('gps-rate');
const gpsRateValue = document.getElementById('gps-rate-value');
// Calibration overlay
const calibrationOverlay = document.getElementById('calibration-overlay');

// Compass dial interaction state
let compassDialActive = false;
let compassDialStartAngle = 0;
let compassDialStartOffset = 0;
let compassPermissionRequested = false;
let compassModule = null;
let gpsModule = null;

// State
let userPosition = null;
let gpsAccuracy = null;
let compassAlpha = null;
let compassAbsolute = false;
let headingOffset = 0;
let isCalibrated = false;
let locations = [];
let trackedLocationId = null; // Currently tracked location
let selectedCalibrationLocation = null;
let overlay = null;
let compassCanvas = null;
let compassCtx = null;

// Compass orientation fix: some browsers report alpha inverted or offset
// 1 = normal, -1 = inverted (flip direction)
let compassDirection = 1; // Set to -1 if compass reads backwards
// Compass zero offset: adjust if North isn't at 0°
let compassZeroOffset = 0;
// Level indicator state
let levelPitch = null;    // front-to-back tilt (beta)
let levelRoll = null;     // left-to-right tilt (gamma)
let levelIndicatorEnabled = false; // Default OFF
// Lane markers experiment
let laneModeEnabled = false; // Default OFF
// Clean center wheel (only affects lane mode)
let cleanWheelEnabled = true; // Default ON

// Debug function (module scope so callbacks can use it)
function debug(msg) {
  console.log('[App]', msg);
  if (debugContent) {
    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.textContent = `[${timestamp}] ${msg}`;
    debugContent.appendChild(line);
    debugContent.scrollTop = debugContent.scrollHeight;
  }
}

// Compass dial interaction handlers
function handleCompassDialStart(e) {
  if (!compassCanvas || !compassCtx) return;
  // Only allow dial adjustment when calibrated
  if (headingOffset === 0 && compassAlpha === null) return;

  e.preventDefault();
  const rect = compassCanvas.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  compassDialStartAngle = Math.atan2(clientY - centerY, clientX - centerX);
  compassDialStartOffset = headingOffset;
  compassDialActive = true;

  // Visual feedback
  compassCanvas.style.cursor = 'grabbing';
}

function handleCompassDialMove(e) {
  if (!compassDialActive || !compassCanvas) return;
  e.preventDefault();

  const rect = compassCanvas.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const currentAngle = Math.atan2(clientY - centerY, clientX - centerX);
  const angleDiff = currentAngle - compassDialStartAngle;
  const degreesDiff = angleDiff * 180 / Math.PI;

  headingOffset = compassDialStartOffset + degreesDiff;
  // Normalize to 0-360
  headingOffset = ((headingOffset % 360) + 360) % 360;

  // Keep persisted calibration in sync with dial adjustments
  saveCalibration({
    headingOffset,
    calibratedAt: Date.now(),
    landmarkName: 'manual dial',
    landmarkPosition: null,
  });

  debug(`Compass dial: offset=${headingOffset.toFixed(1)}°`);
}

function handleCompassDialEnd(e) {
  if (!compassDialActive) return;
  compassDialActive = false;
  isCalibrated = true;
  if (compassCanvas) {
    compassCanvas.style.cursor = 'grab';
  }
  debug(`Compass dial ended: offset=${headingOffset.toFixed(1)}°`);
}

// Request compass permission on user gesture (iOS requirement)
function requestCompassPermission() {
  if (compassPermissionRequested) {
    debug('Compass permission already requested');
    return Promise.resolve(true);
  }
  compassPermissionRequested = true;
  debug('Requesting compass permission on user gesture...');
  return compassModule.requestPermission()
    .then(() => {
      debug('Compass permission granted');
      return true;
    })
    .catch(err => {
      debug('Compass permission error: ' + err.message);
      showError(`Compass permission denied. Enable in Settings > Safari > Motion & Orientation Access.`);
      throw err;
    });
}

// Initialize
async function init() {
  console.log('[App] init() started');

  // Clear debug
  clearDebugBtn?.addEventListener('click', () => {
    if (debugContent) debugContent.innerHTML = '';
  });

  debug('Starting init...');

  // Version badge
  if (settingsVersion && versionBadge) {
    const version = 'v1.0.0';
    settingsVersion.textContent = version;
    versionBadge.textContent = version;
  }

  // Populate color swatches and type select in the location form
  const colorSwatches = document.getElementById('loc-color-swatches');
  if (colorSwatches) {
    colorSwatches.innerHTML = LOCATION_COLORS.map(c =>
      `<button type="button" class="color-swatch" data-color="${c}" style="background: ${c}" aria-label="Color ${c}"></button>`
    ).join('');
  }
  const typeSelect = document.getElementById('loc-type');
  if (typeSelect) {
    typeSelect.innerHTML = LOCATION_TYPES.map(t =>
      `<option value="${t.value}">${t.emoji} ${t.label}</option>`
    ).join('');
  }

  // Load locations
  try {
    locations = getLocations();
    debug(`Loaded ${locations.length} locations from localStorage`);
    if (locations.length === 0) {
      debug('No locations, loading samples...');
      locations = SAMPLE_LOCATIONS.map(l => ({ ...l, id: generateId() }));
      saveLocations(locations);
      debug(`Saved ${locations.length} sample locations`);
    }
    renderLocationList();
    debug('Location list rendered');
  } catch (e) {
    debug('Location error: ' + e.message);
  }

  // Load saved calibration (landmark-based)
  const cal = loadCalibration();
  if (cal && hasValidCalibration()) {
    headingOffset = cal.headingOffset;
    isCalibrated = true;
    debug(`Loaded calibration: offset=${headingOffset.toFixed(1)}° from ${cal.landmarkName}`);
  } else {
    debug('No valid calibration - showing calibration on first use');
  }

  // Start camera (default off - user toggles)
  // Camera will be started when user clicks camera toggle button
  // Auto-start if cameraDefaultOn preference is set (applied below after prefs load)

  // Start compass (module only, permission requested on user gesture)
  const compassRate = parseInt(compassRateSlider?.value || '100');
  startCompass(handleCompassUpdate, { updateRate: compassRate })
    .then(module => {
      compassModule = module;
      debug(`Compass module initialized (rate: ${compassRate}ms, permission on first user gesture)`);
    })
    .catch(err => {
      debug('Compass init failed: ' + err.message);
    });

  // Start GPS (throttled; rate configurable in settings, default 10s)
  try {
    const gpsRate = parseInt(gpsRateSlider?.value || '10000');
    debug('Starting GPS...');
    gpsModule = startGPS(handleGPSUpdate, handleGPSError, { updateRateMs: gpsRate });
    debug(`GPS watch started (rate: ${gpsRate / 1000}s)`);
    window.__gpsWatch = gpsModule;
  } catch (err) {
    debug('GPS error: ' + err.message);
  }

  // Initialize overlay
  try {
    overlay = new Overlay(canvas, {
      locations,
      userPosition: null,
      compassHeading: 0,
      headingOffset: 0,
      isCalibrated,
    });
    debug('Overlay initialized');
  } catch (e) {
    debug('Overlay error: ' + e.message);
  }

  // Initialize compass canvas
  compassCanvas = document.getElementById('compass-canvas');
  if (compassCanvas) {
    compassCtx = compassCanvas.getContext('2d');
    debug('Compass canvas initialized');
  }

  // Start render loop
  animate();
  debug('Animation loop started');

  // Event listeners - Compass button (opens calibration)
  if (compassBtn) {
    // Support both click and touch for iOS Safari compatibility
    compassBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      debug('Compass button clicked');
      // Request compass permission on first user gesture (iOS requirement)
      try {
        await requestCompassPermission();
      } catch (err) {
        // Permission denied, continue without compass
        debug('Compass permission failed, continuing without compass');
      }
      showCalibration();
    });
    compassBtn.addEventListener('touchend', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      debug('Compass button touched');
      try {
        await requestCompassPermission();
      } catch (err) {
        debug('Compass permission failed, continuing without compass');
      }
      showCalibration();
    }, { passive: false });
    debug('Compass button event listeners attached');
  } else {
    debug('ERROR: compass-btn not found!');
  }
  setupCalibrationEvents();
  setupCurrentLocationEvents();

  // Camera toggle
  cameraToggleBtn?.addEventListener('click', toggleCamera);

  // Compass dial interaction (rotate to adjust heading offset)
  if (compassCanvas) {
    // Mouse events
    compassCanvas.addEventListener('mousedown', handleCompassDialStart);
    window.addEventListener('mousemove', handleCompassDialMove);
    window.addEventListener('mouseup', handleCompassDialEnd);

    // Touch events for mobile
    compassCanvas.addEventListener('touchstart', handleCompassDialStart, { passive: false });
    window.addEventListener('touchmove', handleCompassDialMove, { passive: false });
    window.addEventListener('touchend', handleCompassDialEnd);
  }

  // Panel minimize/maximize
  minimizeLocationsBtn?.addEventListener('click', () => {
    locationsPanel.dataset.state = 'minimized';
    minimizeLocationsBtn.style.display = 'none';
    maximizeLocationsBtn.style.display = 'flex';
    debugPane.classList.add('above-panel');
  });
  maximizeLocationsBtn?.addEventListener('click', () => {
    locationsPanel.dataset.state = 'maximized';
    maximizeLocationsBtn.style.display = 'none';
    minimizeLocationsBtn.style.display = 'flex';
    debugPane.classList.remove('above-panel');
  });

  // Click on Locations title to toggle
  const locationsTitle = locationsPanel?.querySelector('h3');
  locationsTitle?.addEventListener('click', () => {
    if (locationsPanel.dataset.state === 'minimized') {
      locationsPanel.dataset.state = 'maximized';
      maximizeLocationsBtn.style.display = 'none';
      minimizeLocationsBtn.style.display = 'flex';
      debugPane.classList.remove('above-panel');
    } else {
      locationsPanel.dataset.state = 'minimized';
      minimizeLocationsBtn.style.display = 'none';
      maximizeLocationsBtn.style.display = 'flex';
      debugPane.classList.add('above-panel');
    }
  });

  // Debug pane minimize/maximize
  minimizeDebugBtn?.addEventListener('click', () => {
    debugPane.dataset.state = 'minimized';
    minimizeDebugBtn.style.display = 'none';
    maximizeDebugBtn.style.display = 'flex';
    if (locationsPanel.dataset.state === 'minimized') {
      debugPane.classList.add('above-panel');
    }
  });
  maximizeDebugBtn?.addEventListener('click', () => {
    debugPane.dataset.state = 'maximized';
    maximizeDebugBtn.style.display = 'none';
    minimizeDebugBtn.style.display = 'flex';
    debugPane.classList.remove('above-panel');
  });

  // Click on Debug title to toggle
  const debugTitle = debugPane?.querySelector('h3');
  debugTitle?.addEventListener('click', () => {
    if (debugPane.dataset.state === 'minimized') {
      debugPane.dataset.state = 'maximized';
      maximizeDebugBtn.style.display = 'none';
      minimizeDebugBtn.style.display = 'flex';
      debugPane.classList.remove('above-panel');
    } else {
      debugPane.dataset.state = 'minimized';
      minimizeDebugBtn.style.display = 'none';
      maximizeDebugBtn.style.display = 'flex';
      if (locationsPanel.dataset.state === 'minimized') {
        debugPane.classList.add('above-panel');
      }
    }
  });

  // Settings
  settingsBtn?.addEventListener('click', () => {
    settingsOverlay.style.display = 'flex';
    // Sync checkboxes with current state
    toggleLocationsPanel.checked = locationsPanel.style.display !== 'none';
    toggleDebugPane.checked = debugPane.style.display !== 'none';
    toggleCompass.checked = compassBtn.style.display !== 'none';
  });
  settingsCloseBtn?.addEventListener('click', () => {
    settingsOverlay.style.display = 'none';
  });

  // Close settings when clicking outside the panel
  settingsOverlay?.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
      settingsOverlay.style.display = 'none';
    }
  });

  // Settings checkboxes
  toggleLocationsPanel?.addEventListener('change', (e) => {
    locationsPanel.style.display = e.target.checked ? 'flex' : 'none';
    locationsPanel.dataset.state = e.target.checked ? 'maximized' : 'minimized';
    localStorage.setItem('viewfinder:showLocations', e.target.checked);
  });
  toggleDebugPane?.addEventListener('change', (e) => {
    debugPane.style.display = e.target.checked ? 'flex' : 'none';
    debugPane.dataset.state = e.target.checked ? 'maximized' : 'minimized';
    localStorage.setItem('viewfinder:showDebug', e.target.checked);
  });
  toggleCompass?.addEventListener('change', (e) => {
    compassBtn.style.display = e.target.checked ? 'flex' : 'none';
    localStorage.setItem('viewfinder:showCompass', e.target.checked);
  });

  // Camera settings checkboxes
  cameraEnabledCheckbox?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    localStorage.setItem('viewfinder:cameraEnabled', enabled);
    if (!enabled && cameraEnabled) {
      toggleCamera();
    }
  });
  cameraDefaultOnCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('viewfinder:cameraDefaultOn', e.target.checked);
  });

  // Compass settings
  compassInvertCheckbox?.addEventListener('change', (e) => {
    compassDirection = e.target.checked ? -1 : 1;
    localStorage.setItem('viewfinder:compassInvert', e.target.checked);
    debug(`Compass direction: ${compassDirection === -1 ? 'inverted' : 'normal'}`);
  });
  compassRateSlider?.addEventListener('input', (e) => {
    const rate = parseInt(e.target.value);
    compassRateValue.textContent = `${rate}ms`;
    localStorage.setItem('viewfinder:compassRate', rate);
    if (compassModule && compassModule.setUpdateRate) {
      compassModule.setUpdateRate(rate);
    }
    debug(`Compass update rate: ${rate}ms`);
  });
  compassZeroOffsetSlider?.addEventListener('input', (e) => {
    const offset = parseInt(e.target.value);
    compassZeroOffset = offset;
    compassZeroOffsetValue.textContent = `${offset}°`;
    localStorage.setItem('viewfinder:compassZeroOffset', offset);
    debug(`Compass zero offset: ${offset}°`);
  });
  compassAutoCalibrateCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('viewfinder:compassAutoCalibrate', e.target.checked);
    debug(`Compass auto-calibrate: ${e.target.checked ? 'on' : 'off'}`);
  });

  // Level indicator toggle
  levelIndicatorToggle?.addEventListener('change', (e) => {
    levelIndicatorEnabled = e.target.checked;
    localStorage.setItem('viewfinder:levelIndicator', levelIndicatorEnabled);
    debug(`Level indicator: ${levelIndicatorEnabled ? 'on' : 'off'}`);
  });

  // Lane markers experiment toggle
  laneModeToggle?.addEventListener('change', (e) => {
    laneModeEnabled = e.target.checked;
    localStorage.setItem('viewfinder:laneMode', laneModeEnabled);
    debug(`Lane markers: ${laneModeEnabled ? 'on' : 'off'}`);
  });

  // Clean center wheel toggle (lane mode only)
  cleanWheelToggle?.addEventListener('change', (e) => {
    cleanWheelEnabled = e.target.checked;
    localStorage.setItem('viewfinder:cleanWheel', cleanWheelEnabled);
    debug(`Clean wheel: ${cleanWheelEnabled ? 'on' : 'off'}`);
  });

  // GPS rate slider
  gpsRateSlider?.addEventListener('input', (e) => {
    const rateMs = parseInt(e.target.value);
    gpsRateValue.textContent = `${rateMs / 1000}s`;
    localStorage.setItem('viewfinder:gpsRate', rateMs);
    if (gpsModule && gpsModule.setUpdateRate) {
      gpsModule.setUpdateRate(rateMs);
    }
    debug(`GPS update rate: ${rateMs / 1000}s`);
  });

  // Clear storage button
  const clearStorageBtn = document.getElementById('clear-storage-btn');
  clearStorageBtn?.addEventListener('click', () => {
    if (confirm('Clear all stored data? This will reset locations, settings, and calibration.')) {
      localStorage.clear();
      debug('All localStorage cleared');
      // Reload page to apply defaults
      location.reload();
    }
  });

  // Load saved visibility preferences
  const showLocations = localStorage.getItem('viewfinder:showLocations');
  if (showLocations !== null) {
    const show = showLocations === 'true';
    locationsPanel.style.display = show ? 'flex' : 'none';
    locationsPanel.dataset.state = show ? 'maximized' : 'minimized';
    toggleLocationsPanel.checked = show;
  } else {
    // Default: minimized
    locationsPanel.style.display = 'flex';
    locationsPanel.dataset.state = 'minimized';
    toggleLocationsPanel.checked = false;
  }
  const showDebug = localStorage.getItem('viewfinder:showDebug');
  if (showDebug !== null) {
    const show = showDebug === 'true';
    debugPane.style.display = show ? 'flex' : 'none';
    debugPane.dataset.state = show ? 'maximized' : 'minimized';
    toggleDebugPane.checked = show;
  } else {
    // Default: OFF
    debugPane.style.display = 'none';
    debugPane.dataset.state = 'minimized';
    toggleDebugPane.checked = false;
  }
  const showCompass = localStorage.getItem('viewfinder:showCompass');
  if (showCompass !== null) {
    const show = showCompass === 'true';
    compassBtn.style.display = show ? 'flex' : 'none';
    toggleCompass.checked = show;
  } else {
    // Default: ON
    compassBtn.style.display = 'flex';
    toggleCompass.checked = true;
  }

  // Load saved camera preferences
  const cameraEnabledPref = localStorage.getItem('viewfinder:cameraEnabled');
  if (cameraEnabledPref !== null) {
    const enabled = cameraEnabledPref === 'true';
    cameraEnabledCheckbox.checked = enabled;
  }
  const cameraDefaultOnPref = localStorage.getItem('viewfinder:cameraDefaultOn');
  if (cameraDefaultOnPref !== null) {
    const defaultOn = cameraDefaultOnPref === 'true';
    cameraDefaultOnCheckbox.checked = defaultOn;
    if (defaultOn) {
      // Auto-start camera if default is on
      toggleCamera();
    }
  }

  // Load saved compass preferences
  const compassInvertPref = localStorage.getItem('viewfinder:compassInvert');
  if (compassInvertPref !== null) {
    const invert = compassInvertPref === 'true';
    compassDirection = invert ? -1 : 1;
    compassInvertCheckbox.checked = invert;
    debug(`Loaded compass invert: ${invert ? 'on' : 'off'}`);
  } else {
    // Default: OFF (normal direction)
    compassInvertCheckbox.checked = false;
    compassDirection = 1;
  }
  const compassRatePref = localStorage.getItem('viewfinder:compassRate');
  if (compassRatePref !== null) {
    const rate = parseInt(compassRatePref);
    compassRateSlider.value = rate;
    compassRateValue.textContent = `${rate}ms`;
    debug(`Loaded compass rate: ${rate}ms`);
  }
  const compassAutoCalibratePref = localStorage.getItem('viewfinder:compassAutoCalibrate');
  if (compassAutoCalibratePref !== null) {
    const autoCal = compassAutoCalibratePref === 'true';
    compassAutoCalibrateCheckbox.checked = autoCal;
    debug(`Loaded compass auto-calibrate: ${autoCal ? 'on' : 'off'}`);
  } else {
    // Default: OFF
    compassAutoCalibrateCheckbox.checked = false;
  }
  const compassZeroOffsetPref = localStorage.getItem('viewfinder:compassZeroOffset');
  if (compassZeroOffsetPref !== null) {
    const offset = parseInt(compassZeroOffsetPref);
    compassZeroOffset = offset;
    compassZeroOffsetSlider.value = offset;
    compassZeroOffsetValue.textContent = `${offset}°`;
    debug(`Loaded compass zero offset: ${offset}°`);
  }

  // Load level indicator preference (default off)
  const levelIndicatorPref = localStorage.getItem('viewfinder:levelIndicator');
  if (levelIndicatorPref !== null) {
    levelIndicatorEnabled = levelIndicatorPref === 'true';
    levelIndicatorToggle.checked = levelIndicatorEnabled;
    debug(`Loaded level indicator: ${levelIndicatorEnabled ? 'on' : 'off'}`);
  } else {
    // Default: OFF
    levelIndicatorEnabled = false;
    levelIndicatorToggle.checked = false;
  }

  // Load lane markers experiment preference (default off)
  const laneModePref = localStorage.getItem('viewfinder:laneMode');
  if (laneModePref !== null) {
    laneModeEnabled = laneModePref === 'true';
    laneModeToggle.checked = laneModeEnabled;
    debug(`Loaded lane markers: ${laneModeEnabled ? 'on' : 'off'}`);
  } else {
    laneModeEnabled = false;
    laneModeToggle.checked = false;
  }

  // Load clean wheel preference (default on)
  const cleanWheelPref = localStorage.getItem('viewfinder:cleanWheel');
  if (cleanWheelPref !== null) {
    cleanWheelEnabled = cleanWheelPref === 'true';
    cleanWheelToggle.checked = cleanWheelEnabled;
    debug(`Loaded clean wheel: ${cleanWheelEnabled ? 'on' : 'off'}`);
  } else {
    cleanWheelEnabled = true;
    cleanWheelToggle.checked = true;
  }

  // Load GPS rate preference (default 10s)
  const gpsRatePref = localStorage.getItem('viewfinder:gpsRate');
  if (gpsRatePref !== null) {
    const rateMs = parseInt(gpsRatePref);
    gpsRateSlider.value = rateMs;
    gpsRateValue.textContent = `${rateMs / 1000}s`;
    debug(`Loaded GPS rate: ${rateMs / 1000}s`);
  }

  // GPS Status click-to-copy: copies "lat,lon,alt" to clipboard
  if (statusGPS) {
    statusGPS.style.cursor = 'pointer';
    statusGPS.title = 'Click to copy coordinates';
    statusGPS.addEventListener('click', () => {
      if (userPosition) {
        const lat = userPosition.lat.toFixed(6);
        const lon = userPosition.lon.toFixed(6);
        const alt = userPosition.alt !== undefined ? userPosition.alt.toFixed(1) : '0';
        const coords = `${lat},${lon},${alt}`;
        navigator.clipboard.writeText(coords).then(() => {
          debug(`Copied to clipboard: ${coords}`);
          // Visual feedback
          const originalText = statusGPS.textContent;
          statusGPS.textContent = '📋 Copied!';
          statusGPS.style.color = '#4ECDC4';
          setTimeout(() => {
            statusGPS.textContent = originalText;
            statusGPS.style.color = '';
          }, 1500);
        }).catch(err => {
          debug('Clipboard copy failed: ' + err.message);
        });
      } else {
        debug('No GPS position to copy');
      }
    });
  }

  // Don't auto-open calibration on first use — the overlay covers the
  // whole screen and blocks the camera toggle / GPS pill. The canvas
  // shows "UNCALIBRATED — Tap compass to calibrate" instead, and the
  // user opens calibration via the compass button when ready.

  debug('init() complete');
}

function animate() {
  if (overlay) {
    overlay.update({
      locations,
      userPosition,
      compassHeading: compassAlpha || 0,
      headingOffset,
      isCalibrated,
      pitch: levelPitch,
      roll: levelRoll,
      showLevel: levelIndicatorEnabled,
      laneMode: laneModeEnabled,
      cleanWheel: cleanWheelEnabled,
    });
    overlay.draw();
  }

  // Draw compass
  if (compassCtx) {
    drawCompass(compassAlpha || 0);
  }

  requestAnimationFrame(animate);
}

function handleCompassUpdate(data) {
  debug(`handleCompassUpdate called: alpha=${data.alpha}, absolute=${data.absolute}, beta=${data.beta}, gamma=${data.gamma}, isLevel=${data.isLevel}`);

  // Apply compass direction fix: some devices report alpha inverted
  let alpha = data.alpha;
  if (compassDirection === -1) {
    // Invert direction: 0->360, 90->270, etc.
    alpha = (360 - data.alpha) % 360;
  }
  // Apply zero offset
  alpha = (alpha + compassZeroOffset) % 360;

  compassAlpha = alpha;
  compassAbsolute = data.absolute;
  // Store level state for UI
  window.compassIsLevel = data.isLevel;
  levelPitch = data.beta;
  levelRoll = data.gamma;

  updateStatus();
  updateBearingDisplay();
  // Update current location overlay if open
  if (currentLocationOverlay.style.display === 'flex') {
    updateCurrentLocationDisplay();
  }
  // Update calibration overlay if open
  if (calibrationOverlay.style.display === 'flex') {
    updateCalibrationDisplay();
  }
}

function handleGPSUpdate(pos) {
  userPosition = { lat: pos.lat, lon: pos.lon, alt: pos.alt };
  gpsAccuracy = pos.accuracy;
  debug(`GPS: lat=${pos.lat.toFixed(6)}, lon=${pos.lon.toFixed(6)}, alt=${pos.alt}, accuracy=${pos.accuracy}m`);
  updateStatus();
  // Update current location overlay if open (distance changes)
  if (currentLocationOverlay.style.display === 'flex') {
    updateCurrentLocationDisplay();
  }
  // Update calibration overlay if open
  if (calibrationOverlay.style.display === 'flex') {
    updateCalibrationDisplay();
  }
}

function handleGPSError(err) {
  debug(`GPS Error: ${err.message} (code: ${err.code})`);
  showError(`GPS Error: ${err.message}`);
}

let cameraStream = null;
let cameraEnabled = false; // Default to off

async function toggleCamera() {
  if (!cameraEnabled) {
    // Turn camera ON
    try {
      debug('Starting camera...');
      cameraStream = await startCamera(video);
      video.style.display = 'block';
      cameraToggleBtn.textContent = '📷';
      cameraToggleBtn.classList.remove('off');
      cameraToggleBtn.title = 'Turn off camera';
      cameraEnabled = true;
      localStorage.setItem('viewfinder:cameraEnabled', true);
      debug('Camera started');
    } catch (err) {
      debug('Camera error: ' + err.message);
      showError(`Camera: ${err.message}`);
    }
  } else {
    // Turn camera OFF
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    video.style.display = 'none';
    cameraToggleBtn.textContent = '📷';
    cameraToggleBtn.classList.add('off');
    cameraToggleBtn.title = 'Turn on camera';
    cameraEnabled = false;
    localStorage.setItem('viewfinder:cameraEnabled', false);
    debug('Camera stopped');
  }
}

function updateStatus() {
  if (statusGPS) {
    if (userPosition && gpsAccuracy !== null) {
      // Compact: accuracy only — full coords live in the tooltip,
      // the Current Location overlay, and click-to-copy
      statusGPS.textContent = `📍 ±${Math.round(gpsAccuracy)}m`;
      statusGPS.title = `${userPosition.lat.toFixed(6)}, ${userPosition.lon.toFixed(6)} — click to copy`;
    } else {
      statusGPS.textContent = `📍 GPS: —`;
      statusGPS.title = 'Click to copy coordinates';
    }
    statusGPS.className = gpsAccuracy && gpsAccuracy < 50 ? 'good' : 'warn';
  }

  // Update level indicator (text status) — hidden when the overlay gauge is active
  const statusLevel = document.getElementById('status-level');
  if (statusLevel) {
    const isLevel = window.compassIsLevel;
    const gaugeActive = levelIndicatorEnabled && levelPitch !== null;
    if (isLevel !== undefined && !gaugeActive) {
      statusLevel.style.display = 'inline-block';
      statusLevel.textContent = isLevel ? '⚖️ Level' : '⚖️ Tilted';
      statusLevel.className = isLevel ? 'good' : 'warn';
    } else {
      statusLevel.style.display = 'none';
    }
  }
}

function updateBearingDisplay() {
  const cardinalEl = document.getElementById('bearing-cardinal');
  const degreesEl = document.getElementById('bearing-degrees');
  if (!cardinalEl || !degreesEl) return;

  if (compassAlpha === null) {
    cardinalEl.textContent = '—';
    degreesEl.textContent = '—°';
    return;
  }

  const heading = compassAlpha;
  const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(heading / 22.5) % 16;
  const cardinal = cardinals[index];

  cardinalEl.textContent = cardinal;
  degreesEl.textContent = `${Math.round(heading)}°`;
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Calibration UI (landmark-based, from Viewfinder)
function showCalibration() {
  calibrationOverlay.style.display = 'flex';
  // Reset button/result state so a reopen during the "Calibrating..." window
  // (or after an error) never shows stale state
  const calibrateBtn = document.getElementById('cal-calibrate-btn');
  if (calibrateBtn) {
    calibrateBtn.disabled = false;
    calibrateBtn.textContent = 'Calibrate Now';
  }
  const resultDiv = document.getElementById('cal-result');
  if (resultDiv) {
    resultDiv.style.display = 'none';
    resultDiv.innerHTML = '';
  }
  renderCalibrationLocations();
  updateCalibrationDisplay();
}

function hideCalibration() {
  calibrationOverlay.style.display = 'none';
}

function renderCalibrationLocations() {
  const select = document.getElementById('cal-location-select');
  if (!select) return;

  select.innerHTML = locations.map(loc =>
    `<option value="${loc.id}" style="color: ${loc.color}">${loc.name}</option>`
  ).join('');

  if (locations.length > 0) {
    select.value = locations[0].id;
    selectedCalibrationLocation = locations[0];
  }
}

function updateCalibrationDisplay() {
  const compassEl = document.getElementById('cal-compass');
  const bearingEl = document.getElementById('cal-bearing');
  const gpsEl = document.getElementById('cal-gps');
  if (!compassEl) return;

  compassEl.textContent = compassAlpha !== null ? `${compassAlpha.toFixed(1)}°` : '—';

  if (userPosition && compassAlpha !== null && selectedCalibrationLocation) {
    const trueBearing = bearing(userPosition, selectedCalibrationLocation);
    bearingEl.textContent = `${trueBearing.toFixed(1)}°`;
  } else {
    bearingEl.textContent = '—';
  }

  if (userPosition) {
    gpsEl.textContent = `${userPosition.lat.toFixed(5)}, ${userPosition.lon.toFixed(5)}`;
    gpsEl.className = 'cal-value good';
  } else {
    gpsEl.textContent = 'Waiting...';
    gpsEl.className = 'cal-value warn';
  }
}

function setupCalibrationEvents() {
  const select = document.getElementById('cal-location-select');
  const calibrateBtn = document.getElementById('cal-calibrate-btn');
  const cancelBtn = document.getElementById('cal-cancel-btn');
  const closeBtn = document.getElementById('cal-close-btn');

  select?.addEventListener('change', (e) => {
    selectedCalibrationLocation = locations.find(l => l.id === e.target.value) || null;
    updateCalibrationDisplay();
  });

  calibrateBtn?.addEventListener('click', handleCalibrate);
  cancelBtn?.addEventListener('click', hideCalibration);
  closeBtn?.addEventListener('click', hideCalibration);
}

function handleCalibrate() {
  if (!userPosition || compassAlpha === null || !selectedCalibrationLocation) {
    alert('Need GPS, compass, and a selected location');
    return;
  }

  const calibrateBtn = document.getElementById('cal-calibrate-btn');
  calibrateBtn.disabled = true;
  calibrateBtn.textContent = 'Calibrating...';

  try {
    const offset = computeHeadingOffset(compassAlpha, userPosition, selectedCalibrationLocation);
    const now = Date.now();

    const calData = {
      headingOffset: offset,
      calibratedAt: now,
      landmarkName: selectedCalibrationLocation.name,
      landmarkPosition: selectedCalibrationLocation,
    };

    saveCalibration(calData);
    headingOffset = offset;
    isCalibrated = true;

    // Show result
    const resultDiv = document.getElementById('cal-result');
    resultDiv.innerHTML = `
      <h4>✅ Calibrated!</h4>
      <p>Offset: ${offset.toFixed(2)}°</p>
      <p>Your position: ${userPosition.lat.toFixed(6)}, ${userPosition.lon.toFixed(6)}</p>
      <p>Time: ${new Date(now).toLocaleTimeString()}</p>
      <p>Landmark: ${selectedCalibrationLocation.name}</p>
    `;
    resultDiv.style.display = 'block';

    setTimeout(() => {
      // Only auto-close if the overlay is still open on this calibration
      if (calibrationOverlay.style.display === 'flex') {
        hideCalibration();
      }
      calibrateBtn.disabled = false;
      calibrateBtn.textContent = 'Calibrate Now';
    }, 2000);
  } catch (err) {
    alert(`Calibration failed: ${err.message}`);
    calibrateBtn.disabled = false;
    calibrateBtn.textContent = 'Calibrate Now';
  }
}

// Current Location Overlay
function showCurrentLocationOverlay() {
  debug('showCurrentLocationOverlay called');
  if (currentLocationOverlay) {
    currentLocationOverlay.style.display = 'flex';
    // Force reflow to ensure display is applied
    currentLocationOverlay.offsetHeight;
    updateCurrentLocationDisplay();
    debug('Current location overlay shown');
  } else {
    debug('ERROR: currentLocationOverlay element not found!');
  }
}

function hideCurrentLocationOverlay() {
  debug('hideCurrentLocationOverlay called');
  if (currentLocationOverlay) {
    currentLocationOverlay.style.display = 'none';
    debug('Current location overlay hidden');
  }
}

function updateCurrentLocationDisplay() {
  debug(`updateCurrentLocationDisplay: userPosition=${!!userPosition}, compassAlpha=${compassAlpha}, compassAbsolute=${compassAbsolute}, headingOffset=${headingOffset}`);

  if (!userPosition) {
    gpsLatEl.textContent = 'Waiting for GPS...';
    gpsLonEl.textContent = '—';
    gpsAltEl.textContent = '—';
    gpsAccEl.textContent = '—';
    gpsCompassEl.textContent = compassAlpha !== null
      ? `${compassAlpha.toFixed(1)}° (${compassAbsolute ? 'Absolute' : 'Relative'})`
      : '—';
    gpsBearingEl.textContent = '—';
    return;
  }
  gpsLatEl.textContent = userPosition.lat.toFixed(6);
  gpsLonEl.textContent = userPosition.lon.toFixed(6);
  gpsAltEl.textContent = userPosition.alt !== undefined ? `${userPosition.alt.toFixed(1)}m` : '—';
  gpsAccEl.textContent = gpsAccuracy !== null ? `${Math.round(gpsAccuracy)}m` : '—';

  // Compass: raw compass reading
  gpsCompassEl.textContent = compassAlpha !== null
    ? `${compassAlpha.toFixed(1)}° (${compassAbsolute ? 'Absolute' : 'Relative'})`
    : '—';

  // Bearing: calibrated heading (what you're actually facing)
  if (compassAlpha !== null) {
    const calibratedHeading = normalizeBearing(compassAlpha - headingOffset);
    const cardinal = bearingToCardinal(calibratedHeading);
    gpsBearingEl.textContent = `${cardinal} ${Math.round(calibratedHeading)}°`;
  } else {
    gpsBearingEl.textContent = '—';
  }

  // Bearing to tracked location (relative bearing)
  if (trackedLocationId && compassAlpha !== null) {
    const targetLoc = locations.find(l => l.id === trackedLocationId);
    if (targetLoc) {
      const trueBearing = bearing(userPosition, targetLoc);
      const distance = haversineDistance(userPosition, targetLoc);
      const calibratedBearing = normalizeBearing(trueBearing - headingOffset);
      const relBearing = normalizeBearing(calibratedBearing - compassAlpha);
      const cardinal = bearingToCardinal(relBearing);
      gpsBearingEl.textContent = `${cardinal} ${Math.round(relBearing)}° → ${targetLoc.name} (${formatDistance(distance)})`;
    }
  }
}

function bearingToCardinal(heading) {
  const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(heading / 22.5) % 16;
  return cardinals[index < 0 ? index + 16 : index];
}

function setupCurrentLocationEvents() {
  // Close button - support both click and touch
  if (currentLocationCloseBtn) {
    currentLocationCloseBtn.addEventListener('click', hideCurrentLocationOverlay);
    currentLocationCloseBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      hideCurrentLocationOverlay();
    }, { passive: false });
  } else {
    debug('WARN: current-location-close-btn not found');
  }

  // Use GPS button - just close overlay
  if (currentLocationUseGpsBtn) {
    currentLocationUseGpsBtn.addEventListener('click', () => {
      debug('Use GPS button clicked');
      hideCurrentLocationOverlay();
    });
    currentLocationUseGpsBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      debug('Use GPS button touched');
      hideCurrentLocationOverlay();
    }, { passive: false });
  } else {
    debug('WARN: current-location-use-gps-btn not found');
  }

  // Set Manual Location button
  if (currentLocationSetManualBtn) {
    currentLocationSetManualBtn.addEventListener('click', handleSetManualLocation);
    currentLocationSetManualBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleSetManualLocation();
    }, { passive: false });
  } else {
    debug('WARN: current-location-set-manual-btn not found');
  }
}

function handleSetManualLocation() {
  const lat = parseFloat(manualLat.value);
  const lon = parseFloat(manualLon.value);
  const alt = manualAlt.value ? parseFloat(manualAlt.value) : undefined;

  if (isNaN(lat) || isNaN(lon)) {
    alert('Please enter valid coordinates');
    return;
  }

  // Override user position with manual entry
  userPosition = { lat, lon, alt };
  gpsAccuracy = 0; // Manual has no accuracy
  debug(`Manual location set: ${lat.toFixed(6)}, ${lon.toFixed(6)}${alt !== undefined ? `, ${alt}m` : ''}`);
  updateStatus();
  updateCurrentLocationDisplay();
  hideCurrentLocationOverlay();
}

// Location List UI
function updateLocationCount() {
  if (locationCountEl) {
    locationCountEl.textContent = locations.length;
  }
}

function renderLocationList() {
  updateLocationCount();

  const list = document.getElementById('location-list');
  if (!list) return;

  if (locations.length === 0) {
    list.innerHTML = '<p class="empty">No locations. Tap "Add Location" to start.</p>';
    return;
  }

  renderEyeList(list);
}

/**
 * Picker mode A: every item has an eye toggle. Hidden items render dimmed
 * in place, under a "Hidden" subheader. Simple, no reordering needed.
 */
function renderEyeList(list) {
  const shown = locations.filter(l => !l.hidden);
  const hidden = locations.filter(l => l.hidden);

  const itemHTML = (loc, isHidden) => `
    <div class="location-item ${isHidden ? 'location-hidden' : ''}" data-id="${loc.id}">
      <div class="location-info">
        <span class="location-color" style="background: ${loc.color}"></span>
        <div class="location-details">
          <span class="location-name">${loc.name}</span>
          <span class="location-meta">
            ${loc.type ? `<span class="type-emoji">${getTypeEmoji(loc.type)}</span>` : ''}
            ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}
            ${loc.alt !== undefined ? ` • ${loc.alt}m` : ''}
          </span>
        </div>
      </div>
      <div class="location-actions">
        <button class="icon-btn visibility-btn" data-id="${loc.id}" aria-label="${isHidden ? 'Show on overlay' : 'Hide from overlay'}">${isHidden ? '🚫' : '👁️'}</button>
        <button class="icon-btn edit-btn" data-id="${loc.id}">✏️</button>
        <button class="icon-btn delete-btn" data-id="${loc.id}">🗑️</button>
      </div>
    </div>
  `;

  let html = '';
  if (hidden.length > 0) {
    html += `<div class="picker-section-label">Visible (${shown.length})</div>`;
    html += shown.map(l => itemHTML(l, false)).join('');
    html += `<div class="picker-section-label">Hidden (${hidden.length})</div>`;
    html += hidden.map(l => itemHTML(l, true)).join('');
  } else {
    html += shown.map(l => itemHTML(l, false)).join('');
  }
  list.innerHTML = html;

  attachLocationListEvents(list);
}

function attachLocationListEvents(list) {
  list.querySelectorAll('.visibility-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLocationHidden(e.currentTarget.dataset.id);
    });
  });
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editLocation(e.currentTarget.dataset.id);
    });
  });
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLocation(e.currentTarget.dataset.id);
    });
  });
  list.querySelectorAll('.location-info').forEach(info => {
    info.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.currentTarget.closest('.location-item').dataset.id;
      selectLocation(id);
    });
  });
}

function toggleLocationHidden(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc) return;
  setHidden(id, !loc.hidden);
}

function setHidden(id, isHidden) {
  const loc = locations.find(l => l.id === id);
  if (!loc || loc.hidden === isHidden) return;
  loc.hidden = isHidden;
  saveLocations(locations);
  renderLocationList();
  debug(`${loc.name} ${isHidden ? 'hidden from' : 'shown on'} overlay`);
}

function editLocation(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc) return;

  const form = document.getElementById('location-form');
  form.dataset.editId = id;
  document.getElementById('loc-name').value = loc.name;
  document.getElementById('loc-lat').value = loc.lat;
  document.getElementById('loc-lon').value = loc.lon;
  document.getElementById('loc-alt').value = loc.alt || '';
  document.getElementById('loc-type').value = loc.type || 'custom';

  showLocationForm();
  markSelectedSwatch(loc.color);
}

function deleteLocation(id) {
  if (confirm('Delete this location?')) {
    locations = locations.filter(l => l.id !== id);
    saveLocations(locations);
    renderLocationList();
    updateLocationCount();
  }
}

function selectLocation(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc) return;

  // Track the selected location (bearing shown in Current Location overlay)
  trackedLocationId = loc.id;

  // Show toast
  showLocationToast(loc);
}

function showLocationToast(loc) {
  let toast = document.querySelector('.location-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'location-toast';
    document.body.appendChild(toast);
  }

  const dist = userPosition ? formatDistance(
    haversineDistance(userPosition, loc)
  ) : '—';

  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="width: 10px; height: 10px; border-radius: 50%; background: ${loc.color}"></span>
      <strong>${loc.name}</strong>
      ${loc.type ? `<span style="font-size: 12px; color: #888; text-transform: capitalize">• ${loc.type}</span>` : ''}
    </div>
    <div style="font-size: 13px; color: #BBB;">${dist} away</div>
    <button class="toast-close">×</button>
  `;

  toast.querySelector('.toast-close').onclick = () => toast.remove();
}

function showLocationForm() {
  document.getElementById('location-form-container').style.display = 'block';
}

function hideLocationForm() {
  document.getElementById('location-form-container').style.display = 'none';
  document.getElementById('location-form').reset();
  delete document.getElementById('location-form').dataset.editId;
}

function setupLocationForm() {
  const form = document.getElementById('location-form');
  const cancelBtn = document.getElementById('loc-cancel-btn');
  const addBtn = document.getElementById('add-location-btn');
  const colorSwatches = document.getElementById('loc-color-swatches');

  // Swatch picker: click sets the hidden color input and highlights the
  // selected swatch
  colorSwatches?.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-swatch');
    if (!btn) return;
    document.getElementById('loc-color').value = btn.dataset.color;
    colorSwatches.querySelectorAll('.color-swatch').forEach(b =>
      b.classList.toggle('selected', b === btn)
    );
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = form.dataset.editId;

    const lat = parseFloat(document.getElementById('loc-lat').value);
    const lon = parseFloat(document.getElementById('loc-lon').value);
    const alt = document.getElementById('loc-alt').value ? parseFloat(document.getElementById('loc-alt').value) : undefined;

    if (isNaN(lat) || isNaN(lon)) {
      alert('Invalid coordinates');
      return;
    }

    let color = document.getElementById('loc-color').value;
    if (!color) {
      // Default for a new location opened without swatch selection
      color = getNextColor(locations);
    }

    const locData = {
      name: document.getElementById('loc-name').value.trim(),
      lat,
      lon,
      alt,
      color,
      type: document.getElementById('loc-type').value,
    };

    if (editId) {
      const idx = locations.findIndex(l => l.id === editId);
      if (idx >= 0) {
        locations[idx] = { ...locations[idx], ...locData };
      }
    } else {
      locData.id = generateId();
      locations.push(locData);
    }

    saveLocations(locations);
    renderLocationList();
    updateLocationCount();
    hideLocationForm();
  });

  cancelBtn?.addEventListener('click', hideLocationForm);
  addBtn?.addEventListener('click', () => {
    form.reset();
    delete form.dataset.editId;
    showLocationForm();
    // Highlight the suggested color for the new location
    markSelectedSwatch(getNextColor(locations));
  });
}

/** Highlight the swatch matching `color` (call after the form is visible). */
function markSelectedSwatch(color) {
  document.getElementById('loc-color').value = color;
  document.querySelectorAll('#loc-color-swatches .color-swatch').forEach(b =>
    b.classList.toggle('selected', b.dataset.color === color)
  );
}

// Initialize everything when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupLocationForm();
  init();
});

// Compass drawing function
function drawCompass(heading) {
  if (!compassCtx || !compassCanvas) return;

  const { width, height } = compassCanvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 4;

  compassCtx.clearRect(0, 0, width, height);
  compassCtx.save();
  compassCtx.translate(centerX, centerY);

  // Rotate so 0° (North) points up, then apply negative heading
  // Canvas: 0° = right (East), we want 0° = up (North)
  compassCtx.rotate(-Math.PI / 2 - heading * Math.PI / 180);

  // Outer ring
  compassCtx.beginPath();
  compassCtx.arc(0, 0, radius, 0, Math.PI * 2);
  compassCtx.strokeStyle = isCalibrated ? '#FFFFFF' : '#FFBE0B';
  compassCtx.lineWidth = 3;
  compassCtx.stroke();

  // Cardinal directions
  const cardinals = ['N', 'E', 'S', 'W'];
  compassCtx.font = 'bold 14px system-ui, sans-serif';
  compassCtx.fillStyle = '#FFFFFF';
  compassCtx.textAlign = 'center';
  compassCtx.textBaseline = 'middle';

  cardinals.forEach((dir, i) => {
    const angle = (i * Math.PI / 2);
    const x = Math.cos(angle) * (radius - 15);
    const y = Math.sin(angle) * (radius - 15);
    compassCtx.fillText(dir, x, y);
  });

  // Degree marks every 30°
  compassCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  compassCtx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const inner = radius - 8;
    const outer = radius;
    compassCtx.beginPath();
    compassCtx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    compassCtx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    compassCtx.stroke();
  }

  // North indicator (red triangle at top)
  compassCtx.fillStyle = '#FF6B6B';
  compassCtx.beginPath();
  compassCtx.moveTo(0, -radius + 5);
  compassCtx.lineTo(-6, -radius + 16);
  compassCtx.lineTo(6, -radius + 16);
  compassCtx.closePath();
  compassCtx.fill();

  compassCtx.restore();

  // Center dot
  compassCtx.beginPath();
  compassCtx.arc(centerX, centerY, 3, 0, Math.PI * 2);
  compassCtx.fillStyle = '#4ECDC4';
  compassCtx.fill();

  // Heading text
  compassCtx.font = 'bold 12px system-ui, sans-serif';
  compassCtx.fillStyle = '#FFFFFF';
  compassCtx.textAlign = 'center';
  compassCtx.textBaseline = 'top';
  compassCtx.fillText(`${Math.round(heading)}°`, centerX, centerY + radius + 6);
}
