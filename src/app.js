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
import { loadSettings, updateSetting, getSetting } from './settings.js';
import { initSettingsUI } from './settings-ui.js';
import { initGPSUI } from './gps-ui.js';
import { initCompassUI } from './compass-ui.js';

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

let compassModule = null;
let gpsModule = null;

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

let availableZoomLevels = [...DEFAULT_ZOOM_LEVELS];
let currentZoomLevel = 1;
let pinchZoomCleanup = null;

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

  // Load compass mode setting
  const settings = loadSettings();
  compassMode = settings.compassMode || 'fixed';
  debug(`Loaded compass mode: ${compassMode}`);

  // Initialize settings UI
  const state = {
    cameraEnabled,
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
      cameraEnabled = enabled;
      if (enabled && !cameraEnabled) {
        toggleCamera();
      } else if (!enabled && cameraEnabled) {
        toggleCamera();
      }
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

  // Sync modules with state after they're initialized
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
    showError,
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
    showError,
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
    gpsStatus.handleCompassUpdate(data);
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

  cameraToggleBtn?.addEventListener('click', () => {
    toggleCamera();
    cameraEnabledCheckbox.checked = cameraEnabled;
  });

  // Pass locations to modules (they need reference for various operations)
  gpsUI.setLocations(locations);
  compassUI.setLocations(locations);

  // Store compassUI drawCompass reference for animate()
  window.compassUIDrawCompass = compassUI.drawCompass;

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

  // Draw compass using compass UI module
  if (compassCtx && window.compassUIDrawCompass) {
    window.compassUIDrawCompass(compassAlpha || 0);
  }

  requestAnimationFrame(animate);
}

let cameraStream = null;
let cameraEnabled = false;

async function toggleCamera() {
  if (!cameraEnabled) {
    try {
      debug('Starting camera...');
      cameraStream = await startCamera(video, { zoom: currentZoomLevel });
      video.style.display = 'block';
      cameraToggleBtn.querySelector('.camera-icon-off').style.display = 'none';
      cameraToggleBtn.querySelector('.camera-icon-on').style.display = 'block';
      cameraToggleBtn.classList.remove('off');
      cameraToggleBtn.title = 'Turn off camera';
      cameraToggleBtn.setAttribute('aria-pressed', 'true');
      cameraToggleBtn.setAttribute('aria-label', 'Turn off camera');
      cameraEnabled = true;
      localStorage.setItem('viewfinder:cameraEnabled', true);
      debug('Camera started');

      setupZoomControls();
      setupLensSwitch();
    } catch (err) {
      debug('Camera error: ' + err.message);
      showError(`Camera: ${err.message}`);
    }
  } else {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    video.style.display = 'none';
    cameraToggleBtn.querySelector('.camera-icon-off').style.display = 'block';
    cameraToggleBtn.querySelector('.camera-icon-on').style.display = 'none';
    cameraToggleBtn.classList.add('off');
    cameraToggleBtn.title = 'Turn on camera';
    cameraToggleBtn.setAttribute('aria-pressed', 'false');
    cameraToggleBtn.setAttribute('aria-label', 'Turn on camera');
    cameraEnabled = false;
    localStorage.setItem('viewfinder:cameraEnabled', false);
    debug('Camera stopped');

    cleanupZoomControls();
    cleanupLensSwitch();
  }
}

function setupZoomControls() {
  const defaultLevels = [1, 2, 5, 10];
  availableZoomLevels = defaultLevels;
  setAvailableZoomLevels(defaultLevels);

  currentZoomLevel = getCurrentZoom();
  updateZoomIndicator();

  const zoomButtonsEnabled = localStorage.getItem('viewfinder:zoomButtonsEnabled') !== 'false';
  if (zoomButtonsEnabled && zoomIndicator) {
    zoomIndicator.style.display = 'flex';
  }

  const zoomCycleEnabled = localStorage.getItem('viewfinder:zoomCycleEnabled') !== 'false';
  if (zoomCycleEnabled && zoomIndicator) {
    zoomIndicator.onclick = () => handleZoomCycle();
    zoomIndicator.style.cursor = 'pointer';
  } else if (zoomIndicator) {
    zoomIndicator.onclick = null;
    zoomIndicator.style.cursor = 'default';
  }

  const zoomGestureEnabled = localStorage.getItem('viewfinder:zoomGestureEnabled') !== 'false';
  if (zoomGestureEnabled && video) {
    pinchZoomCleanup = setupPinchZoom(video, (newZoom) => {
      currentZoomLevel = newZoom;
      updateZoomIndicator();
      debug(`Pinch zoom: ${newZoom}×`);
    });
  }

  setupZoomSettings();
}

/**
 * Cleanup zoom controls
 */
function cleanupZoomControls() {
  if (zoomIndicator) {
    zoomIndicator.style.display = 'none';
  }
  if (pinchZoomCleanup) {
    pinchZoomCleanup();
    pinchZoomCleanup = null;
  }
}

/**
 * Update zoom indicator display
 */
function updateZoomIndicator() {
  if (zoomIndicator) {
    zoomIndicator.textContent = `${currentZoomLevel}×`;
  }
}

/**
 * Handle zoom cycle (tap zoom indicator)
 */
function handleZoomCycle() {
  if (!cameraStream || !video) return;

  const newZoom = cycleZoomLevel();
  applyZoom(newZoom);
}

/**
 * Apply zoom level to camera
 * @param {number} zoom - Zoom level to apply
 */
async function applyZoom(zoom) {
  if (!cameraStream) return;

  const track = cameraStream.getVideoTracks()[0];
  if (!track) return;

  try {
    const success = await setZoom(track, zoom);
    if (success) {
      currentZoomLevel = zoom;
      updateZoomIndicator();
      debug(`Zoom changed to ${zoom}×`);
    } else {
      debug(`Failed to set zoom to ${zoom}×`);
    }
  } catch (err) {
    debug(`Zoom error: ${err.message}`);
  }
}

/**
 * Setup zoom settings listeners
 */
function setupZoomSettings() {
  // Pinch gesture toggle
  if (zoomGestureEnabledCheckbox) {
    const saved = localStorage.getItem('viewfinder:zoomGestureEnabled');
    zoomGestureEnabledCheckbox.checked = saved !== 'false';

    zoomGestureEnabledCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('viewfinder:zoomGestureEnabled', enabled);

      if (enabled && video && cameraEnabled) {
        pinchZoomCleanup = setupPinchZoom(video, (newZoom) => {
          currentZoomLevel = newZoom;
          updateZoomIndicator();
          debug(`Pinch zoom: ${newZoom}×`);
        });
        debug('Pinch-to-zoom enabled');
      } else if (!enabled && pinchZoomCleanup) {
        pinchZoomCleanup();
        pinchZoomCleanup = null;
        debug('Pinch-to-zoom disabled');
      }
    });
  }

  // Zoom buttons toggle
  if (zoomButtonsEnabledCheckbox) {
    const saved = localStorage.getItem('viewfinder:zoomButtonsEnabled');
    zoomButtonsEnabledCheckbox.checked = saved !== 'false';

    zoomButtonsEnabledCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('viewfinder:zoomButtonsEnabled', enabled);

      if (zoomIndicator) {
        zoomIndicator.style.display = enabled && cameraEnabled ? 'flex' : 'none';
      }
      debug(`Zoom indicator ${enabled ? 'shown' : 'hidden'}`);
    });
  }

  // Zoom cycle toggle (tap indicator to cycle)
  if (zoomCycleEnabledCheckbox) {
    const saved = localStorage.getItem('viewfinder:zoomCycleEnabled');
    zoomCycleEnabledCheckbox.checked = saved !== 'false';

    zoomCycleEnabledCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('viewfinder:zoomCycleEnabled', enabled);

      if (zoomIndicator) {
        if (enabled) {
          zoomIndicator.onclick = () => handleZoomCycle();
          zoomIndicator.style.cursor = 'pointer';
        } else {
          zoomIndicator.onclick = null;
          zoomIndicator.style.cursor = 'default';
        }
      }
      debug(`Zoom cycle ${enabled ? 'enabled' : 'disabled'}`);
    });
  }
}

/**
 * Setup lens switch button
 */
async function setupLensSwitch() {
  if (!lensSwitchBtn) return;

  // Use rearOnly=true to only show rear-facing cameras for lens switching
  const devices = await getAvailableCameras(true);
  if (devices.length <= 1) {
    // Only one camera, hide the lens switch button
    lensSwitchBtn.style.display = 'none';
    return;
  }

  // Show lens switch button when camera is on
  lensSwitchBtn.style.display = 'flex';

  // Set up click handler
  lensSwitchBtn.onclick = async () => {
    if (!cameraStream || !cameraEnabled) return;

    try {
      debug('Switching camera lens...');
      const result = await cycleCamera(video, cameraStream);
      cameraStream = result.stream;

      // Update zoom indicator after lens switch (zoom may have been clamped)
      currentZoomLevel = getCurrentZoom();
      updateZoomIndicator();

      debug(`Switched to lens: ${result.label}`);
      showError(`Lens: ${result.label}`, false); // Show lens name as toast
    } catch (err) {
      debug(`Lens switch error: ${err.message}`);
      showError(`Failed to switch lens: ${err.message}`);
    }
  };
}

/**
 * Cleanup lens switch button
 */
function cleanupLensSwitch() {
  if (lensSwitchBtn) {
    lensSwitchBtn.style.display = 'none';
    lensSwitchBtn.onclick = null;
  }
}

function showError(msg, isError = true) {
  const toast = document.createElement('div');
  toast.className = isError ? 'error-toast' : 'info-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
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

// Initialize everything when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupLocationForm();
  init();
});
