/**
 * Main app coordinator for Viewfinder
 * Wires camera, compass, GPS, overlay, calibration, and locations
 */

import { Overlay } from './overlay.js';
import {
  startCamera,
  stopCamera,
  switchCamera,
  cycleCamera,
  setZoom,
  getCurrentZoom,
  getAvailableZoomLevels,
  setAvailableZoomLevels,
  cycleZoomLevel,
  cycleZoomLevelBack,
  setupPinchZoom,
  getAvailableCameras,
  DEFAULT_ZOOM_LEVELS
} from './camera.js';
import { startCompass } from './compass.js';
import { startGPS } from './gps.js';

import { getLocations, saveLocations, SAMPLE_LOCATIONS, createLocation, generateId, getNextColor, LOCATION_COLORS, LOCATION_TYPES, getTypeEmoji } from './storage.js';
import { loadCalibration, saveCalibration, computeHeadingOffset, hasValidCalibration } from './calibration.js';
import { normalizeBearing, formatDistance, haversineDistance, bearing } from './geo.js';
import { loadSettings, updateSetting, getSetting } from './settings.js';
import { initSettingsUI } from './settings-ui.js';
import { initGPSUI } from './gps-ui.js';
import { initCompassUI } from './compass-ui.js';
import { initCameraControls } from './camera-controls.js';
import { initLocationsPanel } from './locations-panel.js';
import { initDebugPane } from './debug-pane.js';
import { initToasts } from './toasts.js';

const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const cameraViewport = document.getElementById('camera-viewport');
const compassBtn = document.getElementById('compass-btn');
const locationsPanel = document.getElementById('locations-panel');
const locationList = document.getElementById('location-list');
const locationForm = document.getElementById('location-form');
const locationFormContainer = document.getElementById('location-form-container');
const addLocationBtn = document.getElementById('add-location-btn');
const locCancelBtn = document.getElementById('loc-cancel-btn');
const locColorSwatches = document.getElementById('loc-color-swatches');
const locTypeSelect = document.getElementById('loc-type');
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

let compassModule = null;
let gpsModule = null;

let userPosition = null;
let gpsAccuracy = null;
let compassAlpha = null;
let compassAbsolute = false;
let headingOffset = 0;
let isCalibrated = false;
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

// Early debug function (before init() defines the full one)
function earlyDebug(msg) {
  console.log('[App]', msg);
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
    earlyDebug(`Panels visibility changed: ${panelsVisible}`);
  }

  // Update container data attribute for CSS border-radius styling
  const visibleCount = (locationsVisible ? 1 : 0) + (debugVisible ? 1 : 0);
  bottomPanels.dataset.visiblePanels = visibleCount;
}

async function init() {
  console.log('[App] init() started');

  // Initialize debug pane first (so debug logs work)
  const debugPaneAPI = initDebugPane({
    debugPane,
    debugContent,
    minimizeDebugBtn,
    maximizeDebugBtn,
    clearDebugBtn,
    debug: console.log,
    updateViewportForPanels,
  });

  // Initialize toasts
  const toasts = initToasts({ debug: console.log });

  // Wrap debug to also log to debug pane
  function debug(msg) {
    console.log('[App]', msg);
    debugPaneAPI.log(msg);
  }

  debug('Starting init...');

  if (settingsVersion && versionBadge) {
    const version = 'v1.0.0';
    settingsVersion.textContent = version;
    versionBadge.textContent = version;
  }

  // Initialize locations panel
  const locationsPanelAPI = initLocationsPanel({
    locationsPanel,
    locationList,
    locationForm,
    locationFormContainer,
    addLocationBtn,
    locCancelBtn,
    locColorSwatches,
    locTypeSelect,
    locationCountEl,
    minimizeLocationsBtn,
    maximizeLocationsBtn,
    debug,
    updateViewportForPanels,
    onTrackedLocationChange: (id) => {
      trackedLocationId = id;
      gpsUI.setTrackedLocationId(id);
    },
    getUserPosition: () => userPosition,
  });

  // Load locations
  try {
    const locs = getLocations();
    debug(`Loaded ${locs.length} locations from localStorage`);
    if (locs.length === 0) {
      debug('No locations, loading samples...');
      const sampleLocs = SAMPLE_LOCATIONS.map(l => ({ ...l, id: generateId() }));
      saveLocations(sampleLocs);
      debug(`Saved ${sampleLocs.length} sample locations`);
      locationsPanelAPI.addLocations(sampleLocs);
    } else {
      locationsPanelAPI.setLocations(locs);
    }
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

  // Initialize settings UI
  const state = {
    cameraEnabled: false,
    cameraDefaultOn: cameraDefaultOnCheckbox?.checked || false,
    compassDirection,
    compassRate: parseInt(compassRateSlider?.value || '100'),
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
      state.cameraEnabled = enabled;
    },
    onLevelTagChange: () => {
      gpsUI.updateStatus();
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
    showError: toasts.showError,
    state,
  });

  // Make camera controls available globally for settings callbacks
  state.onCameraToggle = (enabled) => {
    state.cameraEnabled = enabled;
    if (enabled && !state.cameraEnabled) {
      cameraControls.toggleCamera();
    } else if (!enabled && state.cameraEnabled) {
      cameraControls.toggleCamera();
    }
  };
  state.onLevelTagChange = () => {
    gpsUI.updateStatus();
  };

  // Sync modules with state after they're initialized
  Object.defineProperty(state, 'compassModule', {
    get() { return compassModule; },
    set(v) { compassModule = v; }
  });
  Object.defineProperty(state, 'gpsModule', {
    get() { return gpsModule; },
    set(v) { gpsModule = v; }
  });
  Object.defineProperty(state, 'compassMode', {
    get() { return compassMode; },
    set(v) {
      compassMode = v;
      compassUI.setCompassMode?.(v);
    }
  });

  // Initialize GPS UI module
  const gpsUI = initGPSUI({
    statusGPS,
    currentLocationOverlay,
    currentLocationCloseBtn,
    currentLocationUseGpsBtn,
    currentLocationSetManualBtn,
    manualLat,
    manualLon,
    gpsLatEl,
    gpsLonEl,
    gpsAltEl,
    gpsAccEl,
    gpsCompassEl,
    gpsBearingEl,
    debug,
    showError: toasts.showError,
    // Callbacks to update app.js state
    onUserPositionChange: (pos) => { userPosition = pos; },
    onGpsAccuracyChange: (acc) => { gpsAccuracy = acc; },
    onCompassAlphaChange: (alpha) => { compassAlpha = alpha; },
    onCompassAbsoluteChange: (abs) => { compassAbsolute = abs; },
    onHeadingOffsetChange: (offset) => { headingOffset = offset; },
    onTrackedLocationIdChange: (id) => { trackedLocationId = id; },
  });

  // Initialize Compass UI module
  const compassUI = initCompassUI({
    compassCanvas: document.getElementById('compass-canvas'),
    calibrationOverlay,
    compassBtn,
    debug,
    showError: toasts.showError,
    // Callbacks to update app.js state
    onCompassAlphaChange: (alpha) => { compassAlpha = alpha; },
    onCompassAbsoluteChange: (abs) => { compassAbsolute = abs; },
    onHeadingOffsetChange: (offset) => { headingOffset = offset; },
    onIsCalibratedChange: (val) => { isCalibrated = val; },
    onCompassDirectionChange: (dir) => { compassDirection = dir; },
    onCompassZeroOffsetChange: (offset) => { compassZeroOffset = offset; },
    onLevelPitchChange: (pitch) => { levelPitch = pitch; },
    onLevelRollChange: (roll) => { levelRoll = roll; },
    onCompassModeChange: (mode) => { compassMode = mode; },
    onUserPositionChange: (pos) => { userPosition = pos; },
  });

  // Initialize compass module
  const compassRate = parseInt(compassRateSlider?.value || '100');
  startCompass((data) => {
    // Forward to both modules
    gpsUI.handleCompassUpdate(data);
    compassUI.handleCompassUpdate(data);
  }, { updateRate: compassRate })
    .then(module => {
      compassModule = module;
      debug(`Compass module initialized (rate: ${compassRate}ms, permission on first user gesture)`);
      // Initialize compass UI with the module
      compassUI.init(module, compassMode);
    })
    .catch(err => {
      debug('Compass init failed: ' + err.message);
    });

  // Initialize GPS
  try {
    const gpsRate = parseInt(gpsRateSlider?.value || '10000');
    debug('Starting GPS...');
    gpsModule = startGPS(
      (pos) => gpsUI.handleGPSUpdate(pos),
      (err) => gpsUI.handleGPSError(err),
      { updateRateMs: gpsRate }
    );
    debug(`GPS watch started (rate: ${gpsRate / 1000}s)`);
    window.__gpsWatch = gpsModule;
  } catch (err) {
    debug('GPS error: ' + err.message);
  }

  try {
    overlay = new Overlay(canvas, {
      locations: locationsPanelAPI.getLocationsArray(),
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

  cameraToggleBtn?.addEventListener('click', () => {
    cameraControls.toggleCamera();
    cameraEnabledCheckbox.checked = state.cameraEnabled;
  });

  // Pass locations to modules (they need reference for various operations)
  gpsUI.setLocations(locationsPanelAPI.getLocationsArray());
  compassUI.setLocations(locationsPanelAPI.getLocationsArray());

  // Store compassUI drawCompass reference for animate()
  window.compassUIDrawCompass = compassUI.drawCompass;

  debug('init() complete');
}

function animate() {
  if (overlay) {
    overlay.update({
      locations: locationsPanelAPI.getLocationsArray(),
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

  // Draw compass using compass UI module
  if (compassCtx && window.compassUIDrawCompass) {
    window.compassUIDrawCompass(compassAlpha || 0);
  }

  requestAnimationFrame(animate);
}

// Initialize everything when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  init();
});