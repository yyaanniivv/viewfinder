/**
 * Main app coordinator for Viewfinder
 * Wires camera, compass, GPS, overlay, calibration, and locations
 */

import { Overlay } from './overlay.js';
import { startCompass } from './compass.js';
import { startGPS } from './gps.js';

import { getLocations, saveLocations, SAMPLE_LOCATIONS, createLocation, generateId, getNextColor, LOCATION_COLORS, LOCATION_TYPES, getTypeEmoji } from './storage.js';
import { loadCalibration, saveCalibration, computeHeadingOffset, hasValidCalibration } from './calibration.js';
import { normalizeBearing, formatDistance, haversineDistance, bearing } from './geo.js';
import { loadSettings, updateSetting, getSetting } from './settings.js';
import { initSettingsUI } from './settings-ui.js';
import { initCameraControls } from './camera-controls.js';

const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const cameraViewport = document.getElementById('camera-viewport');
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

const bottomPanels = document.getElementById('bottom-panels');

const currentLocationOverlay = document.getElementById('current-location-overlay');
const currentLocationCloseBtn = document.getElementById('current-location-close-btn');
const currentLocationUseGpsBtn = document.getElementById('current-location-use-gps-btn');
const currentLocationSetManualBtn = document.getElementById('current-location-set-manual-btn');
const manualLat = document.getElementById('manual-lat');
const manualLon = document.getElementById('manual-lon');
const gpsLatEl = document.getElementById('gps-lat');
const gpsLonEl = document.getElementById('gps-lon');
const gpsAltEl = document.getElementById('gps-alt');
const gpsAccEl = document.getElementById('gps-acc');
const gpsCompassEl = document.getElementById('gps-compass');
const gpsBearingEl = document.getElementById('gps-bearing');

const cameraToggleBtn = document.getElementById('camera-toggle-btn');

const settingsBtn = document.getElementById('version-badge');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const toggleLocationsPanel = document.getElementById('toggle-locations-panel');
const toggleDebugPane = document.getElementById('toggle-debug-pane');
const toggleCompass = document.getElementById('toggle-compass');
const settingsVersion = document.getElementById('settings-version');
const versionBadge = document.getElementById('version-badge');

const cameraEnabledCheckbox = document.getElementById('camera-enabled');
const cameraDefaultOnCheckbox = document.getElementById('camera-default-on');

const compassInvertCheckbox = document.getElementById('compass-invert');
const compassRateSlider = document.getElementById('compass-rate');
const compassRateValue = document.getElementById('compass-rate-value');
const compassZeroOffsetInput = document.getElementById('compass-zero-offset-input');
const compassAutoCalibrateCheckbox = document.getElementById('compass-auto-calibrate');

const levelIndicatorToggle = document.getElementById('toggle-level-indicator');
const levelIndicatorCanvas = document.getElementById('level-indicator');

const levelTagToggle = document.getElementById('toggle-level-tag');

const laneModeToggle = document.getElementById('toggle-lane-mode');

const cleanWheelToggle = document.getElementById('toggle-clean-wheel');

const gpsRateSlider = document.getElementById('gps-rate');
const gpsRateValue = document.getElementById('gps-rate-value');

const calibrationOverlay = document.getElementById('calibration-overlay');

const zoomIndicator = document.getElementById('zoom-indicator');
const lensSwitchBtn = document.getElementById('lens-switch-btn');

const zoomGestureEnabledCheckbox = document.getElementById('zoom-gesture-enabled');
const zoomButtonsEnabledCheckbox = document.getElementById('zoom-buttons-enabled');
const zoomCycleEnabledCheckbox = document.getElementById('zoom-cycle-enabled');

let compassDialActive = false;
let compassDialStartAngle = 0;
let compassDialStartOffset = 0;
let compassPermissionRequested = false;
let compassModule = null;
let gpsModule = null;
let compassDialAbortController = null;

let userPosition = null;
let gpsAccuracy = null;
let compassAlpha = null;
let compassAbsolute = false;
let headingOffset = 0;
let isCalibrated = false;
let locations = [];
let trackedLocationId = null;
let selectedCalibrationLocation = null;
let overlay = null;
let compassCanvas = null;
let compassCtx = null;

// Compass orientation fix: some browsers report alpha inverted or offset
// 1 = normal, -1 = inverted (flip direction)
let compassDirection = 1;
// Compass zero offset: adjust if North isn't at 0°
let compassZeroOffset = 0;
let levelPitch = null;
let levelRoll = null;
let levelIndicatorEnabled = false;
let levelTagEnabled = false;
let laneModeEnabled = false;
let cleanWheelEnabled = true;

let panelsVisible = false;
let compassMode = 'fixed'; // 'fixed' = N/E/S/W fixed, pointer rotates | 'dynamic' = wheel spins, pointer fixed at top

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

/**
 * Update camera viewport for bottom panels
 * With flex layout, panels are in normal flow below viewport
 * Viewport automatically takes remaining space
 */
function updateViewportForPanels() {
  const locationsVisible = locationsPanel.style.display !== 'none';
  const debugVisible = debugPane.style.display !== 'none';
  const panelsVisibleNow = locationsVisible || debugVisible;

  if (panelsVisibleNow !== panelsVisible) {
    panelsVisible = panelsVisibleNow;
    debug(`Panels visibility changed: ${panelsVisible}`);
  }

  // Update container data attribute for CSS border-radius styling
  const visibleCount = (locationsVisible ? 1 : 0) + (debugVisible ? 1 : 0);
  bottomPanels.dataset.visiblePanels = visibleCount;
}

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
  headingOffset = ((headingOffset % 360) + 360) % 360;

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

async function init() {
  console.log('[App] init() started');

  clearDebugBtn?.addEventListener('click', () => {
    if (debugContent) debugContent.innerHTML = '';
  });

  debug('Starting init...');

  if (settingsVersion && versionBadge) {
    const version = 'v1.0.0';
    settingsVersion.textContent = version;
    versionBadge.textContent = version;
  }

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

  const cal = loadCalibration();
  if (cal && hasValidCalibration()) {
    headingOffset = cal.headingOffset;
    isCalibrated = true;
    debug(`Loaded calibration: offset=${headingOffset.toFixed(1)}° from ${cal.landmarkName}`);
  } else {
    debug('No valid calibration - showing calibration on first use');
  }

  // Load compass mode setting
  const settings = loadSettings();
  compassMode = settings.compassMode || 'fixed';
  debug(`Loaded compass mode: ${compassMode}`);

  const compassRate = parseInt(compassRateSlider?.value || '100');
  startCompass(handleCompassUpdate, { updateRate: compassRate })
    .then(module => {
      compassModule = module;
      debug(`Compass module initialized (rate: ${compassRate}ms, permission on first user gesture)`);
    })
    .catch(err => {
      debug('Compass init failed: ' + err.message);
    });

  // Initialize settings UI
  const state = {
    cameraEnabled,
    cameraDefaultOn: cameraDefaultOnCheckbox?.checked || false,
    compassDirection,
    compassRate,
    compassZeroOffset,
    compassAutoCalibrate: compassAutoCalibrateCheckbox?.checked || false,
    levelIndicatorEnabled,
    levelTagEnabled,
    laneModeEnabled,
    cleanWheelEnabled,
    compassMode,
    compassModule: null,
    gpsModule: null,
    onCameraToggle: (enabled) => {
      cameraEnabled = enabled;
      if (enabled && !cameraEnabled) {
        toggleCamera();
      } else if (!enabled && cameraEnabled) {
        toggleCamera();
      }
    },
    onLevelTagChange: () => {
      updateStatus();
    },
  };

  const settingsUI = initSettingsUI({
    settingsBtn,
    settingsOverlay,
    settingsCloseBtn,
    settingsVersion,
    versionBadge,
    debug,
    updateViewportForPanels,
    state,
  });

  // Initialize camera controls
  const cameraControls = initCameraControls({
    video,
    cameraToggleBtn,
    zoomIndicator,
    lensSwitchBtn,
    debug,
    showError,
    state,
  });

  // Make camera controls available globally for settings callbacks
  state.onCameraToggle = (enabled) => {
    cameraEnabled = enabled;
    if (enabled && !state.cameraEnabled) {
      cameraControls.toggleCamera();
    } else if (!enabled && state.cameraEnabled) {
      cameraControls.toggleCamera();
    }
  };
  state.onLevelTagChange = () => {
    updateStatus();
  };

  // Sync modules with state after they're initialized
  const originalCompassModule = compassModule;
  const originalGpsModule = gpsModule;
  Object.defineProperty(state, 'compassModule', {
    get() { return compassModule; },
    set(v) { compassModule = v; }
  });
  Object.defineProperty(state, 'gpsModule', {
    get() { return gpsModule; },
    set(v) { gpsModule = v; }
  });
  Object.defineProperty(state, 'cameraEnabled', {
    get() { return cameraEnabled; },
    set(v) { cameraEnabled = v; }
  });

  try {
    const gpsRate = parseInt(gpsRateSlider?.value || '10000');
    debug('Starting GPS...');
    gpsModule = startGPS(handleGPSUpdate, handleGPSError, { updateRateMs: gpsRate });
    debug(`GPS watch started (rate: ${gpsRate / 1000}s)`);
    window.__gpsWatch = gpsModule;
  } catch (err) {
    debug('GPS error: ' + err.message);
  }

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

  compassCanvas = document.getElementById('compass-canvas');
  if (compassCanvas) {
    compassCtx = compassCanvas.getContext('2d');
    debug('Compass canvas initialized');
  }

  animate();
  debug('Animation loop started');

  if (compassBtn) {
    compassBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      debug('Compass button clicked');
      try {
        await requestCompassPermission();
      } catch (err) {
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

  cameraToggleBtn?.addEventListener('click', () => {
    toggleCamera();
    cameraEnabledCheckbox.checked = cameraEnabled;
  });

  if (compassCanvas) {
    compassDialAbortController = new AbortController();
    const { signal } = compassDialAbortController;

    compassCanvas.addEventListener('mousedown', handleCompassDialStart, { signal });
    window.addEventListener('mousemove', handleCompassDialMove, { signal });
    window.addEventListener('mouseup', handleCompassDialEnd, { signal });

    compassCanvas.addEventListener('touchstart', handleCompassDialStart, { signal, passive: false });
    window.addEventListener('touchmove', handleCompassDialMove, { signal, passive: false });
    window.addEventListener('touchend', handleCompassDialEnd, { signal });
  }

  minimizeLocationsBtn?.addEventListener('click', () => {
    locationsPanel.dataset.state = 'minimized';
    minimizeLocationsBtn.style.display = 'none';
    maximizeLocationsBtn.style.display = 'flex';
    debugPane.classList.add('above-panel');
    toggleLocationsPanel.checked = false;
    localStorage.setItem('viewfinder:showLocations', false);
    updateViewportForPanels();
  });
  maximizeLocationsBtn?.addEventListener('click', () => {
    locationsPanel.dataset.state = 'maximized';
    maximizeLocationsBtn.style.display = 'none';
    minimizeLocationsBtn.style.display = 'flex';
    debugPane.classList.remove('above-panel');
    toggleLocationsPanel.checked = true;
    localStorage.setItem('viewfinder:showLocations', true);
    updateViewportForPanels();
  });

  const locationsTitle = locationsPanel?.querySelector('h3');
  locationsTitle?.addEventListener('click', () => {
    if (locationsPanel.dataset.state === 'minimized') {
      locationsPanel.dataset.state = 'maximized';
      maximizeLocationsBtn.style.display = 'none';
      minimizeLocationsBtn.style.display = 'flex';
      debugPane.classList.remove('above-panel');
      toggleLocationsPanel.checked = true;
    } else {
      locationsPanel.dataset.state = 'minimized';
      minimizeLocationsBtn.style.display = 'none';
      maximizeLocationsBtn.style.display = 'flex';
      debugPane.classList.add('above-panel');
      toggleLocationsPanel.checked = false;
    }
    localStorage.setItem('viewfinder:showLocations', locationsPanel.dataset.state === 'maximized');
    updateViewportForPanels();
  });

  minimizeDebugBtn?.addEventListener('click', () => {
    debugPane.dataset.state = 'minimized';
    minimizeDebugBtn.style.display = 'none';
    maximizeDebugBtn.style.display = 'flex';
    if (locationsPanel.dataset.state === 'minimized') {
      debugPane.classList.add('above-panel');
    }
    toggleDebugPane.checked = false;
    localStorage.setItem('viewfinder:showDebug', false);
    updateViewportForPanels();
  });
  maximizeDebugBtn?.addEventListener('click', () => {
    debugPane.dataset.state = 'maximized';
    maximizeDebugBtn.style.display = 'none';
    minimizeDebugBtn.style.display = 'flex';
    debugPane.classList.remove('above-panel');
    toggleDebugPane.checked = true;
    localStorage.setItem('viewfinder:showDebug', true);
    updateViewportForPanels();
  });

  const debugTitle = debugPane?.querySelector('h3');
  debugTitle?.addEventListener('click', () => {
    if (debugPane.dataset.state === 'minimized') {
      debugPane.dataset.state = 'maximized';
      maximizeDebugBtn.style.display = 'none';
      minimizeDebugBtn.style.display = 'flex';
      debugPane.classList.remove('above-panel');
      toggleDebugPane.checked = true;
    } else {
      debugPane.dataset.state = 'minimized';
      minimizeDebugBtn.style.display = 'none';
      maximizeDebugBtn.style.display = 'flex';
      if (locationsPanel.dataset.state === 'minimized') {
        debugPane.classList.add('above-panel');
      }
      toggleDebugPane.checked = false;
    }
    localStorage.setItem('viewfinder:showDebug', debugPane.dataset.state === 'maximized');
    updateViewportForPanels();
  });

  // Settings UI is now handled by settings-ui.js module
  // settingsUI.init() was called earlier in init()

  if (statusGPS) {
    statusGPS.style.cursor = 'pointer';
    statusGPS.title = 'Click to copy coordinates';
    statusGPS.addEventListener('click', () => {
      if (userPosition) {
        const lat = userPosition.lat.toFixed(6);
        const lon = userPosition.lon.toFixed(6);
        const coords = `${lat},${lon}`;
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

  // Update level indicator (text status) — shown only when the tag setting
  // is on, and hidden when the overlay gauge is active
  const statusLevel = document.getElementById('status-level');
  if (statusLevel) {
    const isLevel = window.compassIsLevel;
    const gaugeActive = levelIndicatorEnabled && levelPitch !== null;
    if (levelTagEnabled && isLevel !== undefined && !gaugeActive) {
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

function showError(msg, isError = true) {
  const toast = document.createElement('div');
  toast.className = isError ? 'error-toast' : 'info-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
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

  if (isNaN(lat) || isNaN(lon)) {
    alert('Please enter valid coordinates');
    return;
  }

  // Override user position with manual entry
  userPosition = { lat, lon };
  gpsAccuracy = 0; // Manual has no accuracy
  debug(`Manual location set: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  updateStatus();
  updateCurrentLocationDisplay();
  hideCurrentLocationOverlay();
}

// Location List UI
function updateLocationCount() {
  if (locationCountEl) {
    const visible = locations.filter(l => !l.hidden).length;
    const total = locations.length;
    locationCountEl.textContent = `${visible}/${total}`;
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

// Compass drawing function
function drawCompass(heading) {
  if (!compassCtx || !compassCanvas) return;

  const { width, height } = compassCanvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 4;

  compassCtx.clearRect(0, 0, width, height);

  if (compassMode === 'fixed') {
    // FIXED MODE: Wheel stays fixed (N at top), pointer rotates to show heading
    drawFixedWheel(centerX, centerY, radius, heading);
  } else {
    // DYNAMIC MODE: Wheel rotates with heading, pointer fixed at top (original behavior)
    drawDynamicWheel(centerX, centerY, radius, heading);
  }

  // Center dot (always same)
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

function drawFixedWheel(centerX, centerY, radius, heading) {
  // Outer ring (fixed)
  compassCtx.beginPath();
  compassCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  compassCtx.strokeStyle = isCalibrated ? '#FFFFFF' : '#FFBE0B';
  compassCtx.lineWidth = 3;
  compassCtx.stroke();

  // Cardinal directions (fixed - N always at top)
  const cardinals = ['N', 'E', 'S', 'W'];
  compassCtx.font = 'bold 14px system-ui, sans-serif';
  compassCtx.fillStyle = '#FFFFFF';
  compassCtx.textAlign = 'center';
  compassCtx.textBaseline = 'middle';

  cardinals.forEach((dir, i) => {
    const angle = (i * Math.PI / 2) - Math.PI / 2; // 0° = North (up)
    const x = centerX + Math.cos(angle) * (radius - 15);
    const y = centerY + Math.sin(angle) * (radius - 15);
    compassCtx.fillText(dir, x, y);
  });

  // Degree marks every 30° (fixed)
  compassCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  compassCtx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI / 6) - Math.PI / 2; // 0° = North (up)
    const inner = radius - 8;
    const outer = radius;
    compassCtx.beginPath();
    compassCtx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
    compassCtx.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
    compassCtx.stroke();
  }

  // Heading pointer (rotates to show current heading)
  // No fixed red triangle at N - the pointer IS the indicator
  compassCtx.save();
  compassCtx.translate(centerX, centerY);
  // Rotate to heading: 0° = North (up), so we rotate by heading degrees clockwise
  compassCtx.rotate(heading * Math.PI / 180);

  // Draw the heading pointer (triangle pointing up = North)
  compassCtx.fillStyle = isCalibrated ? '#4ECDC4' : '#FFBE0B';
  compassCtx.beginPath();
  compassCtx.moveTo(0, -radius + 8); // Tip of pointer at top
  compassCtx.lineTo(-8, -radius + 22); // Left base
  compassCtx.lineTo(8, -radius + 22);  // Right base
  compassCtx.closePath();
  compassCtx.fill();

  // Add a small line extending from center to pointer base for clarity
  compassCtx.strokeStyle = isCalibrated ? '#4ECDC4' : '#FFBE0B';
  compassCtx.lineWidth = 2;
  compassCtx.lineCap = 'round';
  compassCtx.beginPath();
  compassCtx.moveTo(0, 0);
  compassCtx.lineTo(0, -radius + 12);
  compassCtx.stroke();

  compassCtx.restore();
}

function drawDynamicWheel(centerX, centerY, radius, heading) {
  // In dynamic mode, rotate the entire wheel so that the current heading points UP
  // This is the original behavior: wheel spins, N moves to show where North is relative to you
  compassCtx.save();
  compassCtx.translate(centerX, centerY);

  // FIRST: Draw the fixed pointer at top of screen (12 o'clock) BEFORE rotating
  // This shows "you are here" - the device orientation relative to the spinning wheel
  compassCtx.fillStyle = '#FF6B6B';
  compassCtx.beginPath();
  compassCtx.moveTo(0, -radius + 5);
  compassCtx.lineTo(-6, -radius + 16);
  compassCtx.lineTo(6, -radius + 16);
  compassCtx.closePath();
  compassCtx.fill();

  // THEN: Rotate the wheel so that heading points UP (North at top of screen)
  // Canvas 0° = East, we want heading = North (up), so rotate by -(90° + heading)
  compassCtx.rotate(-Math.PI / 2 - heading * Math.PI / 180);

  // Outer ring
  compassCtx.beginPath();
  compassCtx.arc(0, 0, radius, 0, Math.PI * 2);
  compassCtx.strokeStyle = isCalibrated ? '#FFFFFF' : '#FFBE0B';
  compassCtx.lineWidth = 3;
  compassCtx.stroke();

  // Cardinal directions (rotate with wheel)
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

  compassCtx.restore();
}

// Module initialization
document.addEventListener('DOMContentLoaded', () => {
  setupLocationForm();
  init();
});
