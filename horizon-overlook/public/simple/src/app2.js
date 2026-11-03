/**
 * Main app coordinator for Horizon Overlook Simple v2
 * Wires camera, compass, GPS, overlay, calibration, and locations
 */

import { Overlay } from './overlay.js';
import { startCamera } from './camera.js';
import { startCompass } from './compass.js';
import { startGPS } from './gps.js';
import { getLocations, saveLocations, SAMPLE_LOCATIONS, createLocation, generateId, getNextColor, LOCATION_COLORS, LOCATION_TYPES, getTypeEmoji } from './storage.js';
import { normalizeBearing, formatDistance, deg2rad, rad2deg, EARTH_RADIUS_M } from './geo.js';

// DOM Elements
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const currentLocationBtn = document.getElementById('current-location-btn');
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
// Generic Location Picker (reused for add location, track location)
const locationPickerOverlay = document.getElementById('location-picker-overlay');
const locationPickerCloseBtn = document.getElementById('location-picker-close-btn');
const locationPickerSelectBtn = document.getElementById('location-picker-select-btn');
const locationPickerCancelBtn = document.getElementById('location-picker-cancel-btn');
const locationPickerSelect = document.getElementById('location-picker-select');
const locationPickerTitle = document.getElementById('location-picker-title');
const locationPickerInstruction = document.getElementById('location-picker-instruction');
const locationPickerSelectedInfo = document.getElementById('location-picker-selected-info');
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
const compassAutoCalibrateCheckbox = document.getElementById('compass-auto-calibrate');

// Compass dial interaction state
let compassDialActive = false;
let compassDialStartAngle = 0;
let compassDialStartOffset = 0;
let compassPermissionRequested = false;
let compassModule = null;

// State
let userPosition = null;
let gpsAccuracy = null;
let compassAlpha = null;
let compassAbsolute = false;
let headingOffset = 0;
let locations = [];
let trackedLocationId = null; // Currently tracked location
let overlay = null;
let compassCanvas = null;
let compassCtx = null;

// Compass orientation fix: some browsers report alpha inverted or offset
// 1 = normal, -1 = inverted (flip direction)
let compassDirection = 1; // Set to -1 if compass reads backwards
// Compass zero offset: adjust if North isn't at 0°
let compassZeroOffset = 0;

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

  debug(`Compass dial: offset=${headingOffset.toFixed(1)}°`);
}

function handleCompassDialEnd(e) {
  if (!compassDialActive) return;
  compassDialActive = false;
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

  // Start camera (default off - user toggles)
  // Camera will be started when user clicks camera toggle button

  // Start compass (module only, permission requested on user gesture)
  compassModule = startCompass(handleCompassUpdate);
  debug('Compass module initialized (permission on first user gesture)');

  // Start GPS
  try {
    debug('Starting GPS...');
    const gps = startGPS(handleGPSUpdate, handleGPSError);
    debug('GPS watch started, watchId returned');
    window.__gpsWatch = gps;
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

  // Event listeners - Current Location button
  if (currentLocationBtn) {
    // Support both click and touch for iOS Safari compatibility
    currentLocationBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      debug('Current location button clicked');
      // Request compass permission on first user gesture (iOS requirement)
      try {
        await requestCompassPermission();
      } catch (err) {
        // Permission denied, continue without compass
        debug('Compass permission failed, continuing without compass');
      }
      showCurrentLocationOverlay();
    });
    currentLocationBtn.addEventListener('touchend', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      debug('Current location button touched');
      // Request compass permission on first user gesture (iOS requirement)
      try {
        await requestCompassPermission();
      } catch (err) {
        debug('Compass permission failed, continuing without compass');
      }
      showCurrentLocationOverlay();
    }, { passive: false });
    debug('Current location button event listeners attached');
  } else {
    debug('ERROR: current-location-btn not found!');
  }
  setupLocationPickerEvents();
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
    toggleCompass.checked = currentLocationBtn.style.display !== 'none';
  });
  settingsCloseBtn?.addEventListener('click', () => {
    settingsOverlay.style.display = 'none';
  });

  // Settings checkboxes
  toggleLocationsPanel?.addEventListener('change', (e) => {
    locationsPanel.style.display = e.target.checked ? 'flex' : 'none';
    localStorage.setItem('horizon:showLocations', e.target.checked);
  });
  toggleDebugPane?.addEventListener('change', (e) => {
    debugPane.style.display = e.target.checked ? 'flex' : 'none';
    localStorage.setItem('horizon:showDebug', e.target.checked);
  });
  toggleCompass?.addEventListener('change', (e) => {
    currentLocationBtn.style.display = e.target.checked ? 'flex' : 'none';
    localStorage.setItem('horizon:showCompass', e.target.checked);
  });

  // Camera settings checkboxes
  cameraEnabledCheckbox?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    localStorage.setItem('horizon:cameraEnabled', enabled);
    if (!enabled && cameraEnabled) {
      toggleCamera();
    }
  });
  cameraDefaultOnCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('horizon:cameraDefaultOn', e.target.checked);
  });

  // Load saved visibility preferences
  const showLocations = localStorage.getItem('horizon:showLocations');
  if (showLocations !== null) {
    const show = showLocations === 'true';
    locationsPanel.style.display = show ? 'flex' : 'none';
    toggleLocationsPanel.checked = show;
  }
  const showDebug = localStorage.getItem('horizon:showDebug');
  if (showDebug !== null) {
    const show = showDebug === 'true';
    debugPane.style.display = show ? 'flex' : 'none';
    toggleDebugPane.checked = show;
  }
  const showCompass = localStorage.getItem('horizon:showCompass');
  if (showCompass !== null) {
    const show = showCompass === 'true';
    currentLocationBtn.style.display = show ? 'flex' : 'none';
    toggleCompass.checked = show;
  }

  // Load saved camera preferences
  const cameraEnabledPref = localStorage.getItem('horizon:cameraEnabled');
  if (cameraEnabledPref !== null) {
    const enabled = cameraEnabledPref === 'true';
    cameraEnabledCheckbox.checked = enabled;
    if (!enabled && cameraEnabled) {
      // Camera was enabled but user disabled it in settings
      // toggleCamera will be called when they click the button
    }
  }
  const cameraDefaultOnPref = localStorage.getItem('horizon:cameraDefaultOn');
  if (cameraDefaultOnPref !== null) {
    const defaultOn = cameraDefaultOnPref === 'true';
    cameraDefaultOnCheckbox.checked = defaultOn;
    if (defaultOn && !cameraEnabled) {
      // Auto-start camera if default is on
      toggleCamera();
    }
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

  debug('init() complete');
}

function animate() {
  if (overlay) {
    overlay.update({
      locations,
      userPosition,
      compassHeading: compassAlpha || 0,
      headingOffset,
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
  debug(`handleCompassUpdate called: alpha=${data.alpha}, absolute=${data.absolute}, beta=${data.beta}, gamma=${data.gamma}`);

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
  debug(`Compass: raw=${data.alpha.toFixed(1)}°, fixed=${alpha.toFixed(1)}°, absolute=${data.absolute}, dir=${compassDirection}, offset=${compassZeroOffset}`);
  updateStatus();
  updateBearingDisplay();
  // Update current location overlay if open
  if (currentLocationOverlay.style.display === 'flex') {
    updateCurrentLocationDisplay();
  }
}

function handleGPSUpdate(pos) {
  userPosition = { lat: pos.lat, lon: pos.lon, alt: pos.alt };
  gpsAccuracy = pos.accuracy;
  debug(`GPS: lat=${pos.lat.toFixed(6)}, lon=${pos.lon.toFixed(6)}, alt=${pos.alt}, accuracy=${pos.accuracy}m, timestamp=${new Date(pos.timestamp).toISOString()}`);
  updateStatus();
  // Update current location overlay if open (distance changes)
  if (currentLocationOverlay.style.display === 'flex') {
    updateCurrentLocationDisplay();
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
      canvas.style.display = 'block';
      cameraToggleBtn.textContent = '📷';
      cameraToggleBtn.classList.remove('off');
      cameraToggleBtn.title = 'Turn off camera';
      cameraEnabled = true;
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
    canvas.style.display = 'none';
    cameraToggleBtn.textContent = '📷';
    cameraToggleBtn.classList.add('off');
    cameraToggleBtn.title = 'Turn on camera';
    cameraEnabled = false;
    debug('Camera stopped');
  }
}

function updateStatus() {
  if (statusGPS) {
    if (userPosition && gpsAccuracy !== null) {
      statusGPS.textContent = `📍 ${userPosition.lat.toFixed(6)}, ${userPosition.lon.toFixed(6)} ±${Math.round(gpsAccuracy)}m`;
    } else {
      statusGPS.textContent = `📍 GPS: —`;
    }
    statusGPS.className = gpsAccuracy && gpsAccuracy < 50 ? 'good' : 'warn';
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
    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const cardIndex = Math.round(calibratedHeading / 22.5) % 16;
    const cardinal = cardinals[cardIndex < 0 ? cardIndex + 16 : cardIndex];
    gpsBearingEl.textContent = `${cardinal} ${Math.round(calibratedHeading)}°`;
    debug(`Bearing set: ${cardinal} ${Math.round(calibratedHeading)}° (compassAlpha=${compassAlpha}, offset=${headingOffset})`);
  } else {
    gpsBearingEl.textContent = '—';
    debug('No compassAlpha, bearing set to —');
  }

  // Bearing to tracked location (relative bearing)
  if (trackedLocationId && compassAlpha !== null) {
    const targetLoc = locations.find(l => l.id === trackedLocationId);
    if (targetLoc) {
      const { bearing: trueBearing, distance } = calcBearingDistance(userPosition, targetLoc);
      const calibratedBearing = normalizeBearing(trueBearing - headingOffset);
      const relBearing = normalizeBearing(calibratedBearing - compassAlpha);
      const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const cardIndex = Math.round(relBearing / 22.5) % 16;
      const cardinal = cardinals[cardIndex < 0 ? cardIndex + 16 : cardIndex];
      gpsBearingEl.textContent = `${cardinal} ${Math.round(relBearing)}° → ${targetLoc.name} (${formatDistance(distance)})`;
    }
  }
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

// Generic Location Picker (reusable for track location, add location)
let locationPickerCallback = null;

function showLocationPicker(mode, callback) {
  locationPickerCallback = callback;
  locationPickerOverlay.style.display = 'flex';

  if (mode === 'track') {
    locationPickerTitle.textContent = 'Select Location to Track';
    locationPickerInstruction.textContent = 'Select a location to center the AR view on it';
    locationPickerSelectBtn.textContent = 'Track This Location';
  } else if (mode === 'add') {
    locationPickerTitle.textContent = 'Select Location Reference';
    locationPickerInstruction.textContent = 'Pick a nearby location as reference for new location';
    locationPickerSelectBtn.textContent = 'Use This Location';
  }

  renderLocationPickerSelect();
}

function hideLocationPicker() {
  locationPickerOverlay.style.display = 'none';
  locationPickerCallback = null;
}

function renderLocationPickerSelect() {
  const select = locationPickerSelect;
  const infoDiv = locationPickerSelectedInfo;
  if (!select) return;

  if (locations.length === 0) {
    select.innerHTML = '<option value="">No locations. Tap "Manage Locations" to add some.</option>';
    if (infoDiv) infoDiv.style.display = 'none';
    return;
  }

  select.innerHTML = locations.map(loc => {
    let bearingStr = '—';
    let distanceStr = '—';
    if (userPosition && compassAlpha !== null) {
      const { bearing: trueBearing, distance } = calcBearingDistance(userPosition, loc);
      const calibratedBearing = normalizeBearing(trueBearing - headingOffset);
      const relBearing = normalizeBearing(calibratedBearing - compassAlpha);
      bearingStr = `${Math.round(relBearing)}°`;
      distanceStr = formatDistance(distance);
    }
    return `<option value="${loc.id}" data-bearing="${bearingStr}" data-distance="${distanceStr}" style="color: ${loc.color}">${loc.name} ${loc.type ? `(${loc.type})` : ''}</option>`;
  }).join('');

  select.onchange = (e) => {
    const option = e.target.selectedOptions[0];
    if (option && option.value && infoDiv) {
      const loc = locations.find(l => l.id === option.value);
      if (loc) {
        infoDiv.innerHTML = `
          <strong>${loc.name}</strong>${loc.type ? ` <span style="font-size:11px;color:var(--accent);">(${loc.type})</span>` : ''}<br>
          <span style="font-family:monospace;">${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}${loc.alt !== undefined ? ` • ${loc.alt}m` : ''}</span><br>
          <span style="color:var(--accent);">Bearing: ${option.dataset.bearing}</span> | <span style="color:var(--text-muted);">Distance: ${option.dataset.distance}</span>
        `;
        infoDiv.style.display = 'block';
      }
    } else if (infoDiv) {
      infoDiv.style.display = 'none';
    }
  };

  if (select.value) {
    select.onchange({ target: select });
  }
}

function selectLocationForTracking(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc) return;

  trackedLocationId = loc.id;

  // Show toast
  showLocationToast(loc);

  // Close picker
  hideLocationPicker();

  // Update current location overlay if open
  if (currentLocationOverlay.style.display === 'flex') {
    updateCurrentLocationDisplay();
  }
}

function setupLocationPickerEvents() {
  locationPickerCloseBtn?.addEventListener('click', hideLocationPicker);
  locationPickerCancelBtn?.addEventListener('click', hideLocationPicker);
  locationPickerSelectBtn?.addEventListener('click', () => {
    if (locationPickerSelect && locationPickerSelect.value && locationPickerCallback) {
      locationPickerCallback(locationPickerSelect.value);
      hideLocationPicker();
    }
  });
}

// Helper: calculate bearing and distance
function calcBearingDistance(from, to) {
  const lat1 = deg2rad(from.lat);
  const lat2 = deg2rad(to.lat);
  const dLon = deg2rad(to.lon - from.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = normalizeBearing(rad2deg(Math.atan2(y, x)));

  const dLat = deg2rad(to.lat - from.lat);
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  const distance = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return { bearing, distance };
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

  list.innerHTML = locations.map(loc => `
    <div class="location-item" data-id="${loc.id}">
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
        <button class="icon-btn edit-btn" data-id="${loc.id}">✏️</button>
        <button class="icon-btn delete-btn" data-id="${loc.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  // Event delegation
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

function editLocation(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc) return;

  const form = document.getElementById('location-form');
  form.dataset.editId = id;
  document.getElementById('loc-name').value = loc.name;
  document.getElementById('loc-lat').value = loc.lat;
  document.getElementById('loc-lon').value = loc.lon;
  document.getElementById('loc-alt').value = loc.alt || '';
  document.getElementById('loc-color').value = loc.color;
  document.getElementById('loc-type').value = loc.type || 'custom';

  showLocationForm();
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

function haversineDistance(from, to) {
  return calcBearingDistance(from, to).distance;
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

    const locData = {
      name: document.getElementById('loc-name').value.trim(),
      lat,
      lon,
      alt,
      color: document.getElementById('loc-color').value,
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
    document.getElementById('loc-color').value = getNextColor(locations);
    showLocationForm();
  });

  // Add "Pick from Map" button functionality - opens location picker in 'add' mode
  // This is called from the location form when user wants to use existing location as reference
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
  compassCtx.strokeStyle = '#FFFFFF';
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