/**
 * Main app coordinator for Horizon Overlook Simple
 * Wires camera, compass, GPS, overlay, calibration, and locations
 */

import { Overlay } from './overlay.js';
import { startCamera } from './camera.js';
import { startCompass } from './compass.js';
import { startGPS } from './gps.js';
import { getLocations, saveLocations, SAMPLE_LOCATIONS, createLocation, generateId, getNextColor, LOCATION_COLORS } from './storage.js';
import { loadCalibration, saveCalibration, computeHeadingOffset, hasValidCalibration } from './calibration.js';
import { normalizeBearing, formatDistance, deg2rad, rad2deg, EARTH_RADIUS_M } from './geo.js';

// DOM Elements
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const compassBtn = document.getElementById('compass-btn');
const locationsPanel = document.getElementById('locations-panel');
const calibrationOverlay = document.getElementById('calibration-overlay');
const statusGPS = document.getElementById('status-gps');
const statusCompass = document.getElementById('status-compass');
const locationCountEl = document.getElementById('location-count');
const debugPane = document.getElementById('debug-pane');
const debugContent = document.getElementById('debug-content');
const minimizeLocationsBtn = document.getElementById('minimize-locations-btn');
const maximizeLocationsBtn = document.getElementById('maximize-locations-btn');
const minimizeDebugBtn = document.getElementById('minimize-debug-btn');
const maximizeDebugBtn = document.getElementById('maximize-debug-btn');
const clearDebugBtn = document.getElementById('clear-debug-btn');
// Location picker
const locationPickerOverlay = document.getElementById('location-picker-overlay');
const pickerCloseBtn = document.getElementById('picker-close-btn');
const pickerSelectBtn = document.getElementById('picker-select-btn');
const pickerManageBtn = document.getElementById('picker-manage-btn');
const pickerLocationSelect = document.getElementById('picker-location-select');
// Camera toggle
const cameraToggleBtn = document.getElementById('camera-toggle-btn');

// State
let userPosition = null;
let gpsAccuracy = null;
let compassAlpha = null;
let compassAbsolute = false;
let headingOffset = 0;
let isCalibrated = false;
let locations = [];
let selectedCalibrationLocation = null;
let overlay = null;
let compassCanvas = null;
let compassCtx = null;

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

  // Load calibration
  try {
    const cal = loadCalibration();
    if (cal && hasValidCalibration()) {
      headingOffset = cal.headingOffset;
      isCalibrated = true;
      debug('Calibration loaded: offset=' + headingOffset.toFixed(2));
    } else {
      debug('No valid calibration, will show calibration overlay');
      showCalibration();
    }
  } catch (e) {
    debug('Calibration error: ' + e.message);
  }

  // Start camera
  try {
    debug('Starting camera...');
    cameraStream = await startCamera(video);
    debug('Camera started successfully');
  } catch (err) {
    debug('Camera error: ' + err.message);
    showError(err.message);
  }

  // Start compass
  try {
    debug('Requesting compass permission...');
    const compass = startCompass(handleCompassUpdate);
    await compass.requestPermission();
    debug('Compass permission granted');
  } catch (err) {
    debug('Compass error: ' + err.message);
    showError(`Compass: ${err.message}`);
  }

  // Start GPS
  try {
    debug('Starting GPS...');
    const gps = startGPS(handleGPSUpdate, handleGPSError);
    debug('GPS watch started, watchId returned');
    // Store reference so we can stop it later if needed
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
      isCalibrated: false,
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

  // Event listeners
  compassBtn.addEventListener('click', () => showLocationPicker());
  setupCalibrationEvents();
  setupLocationPickerEvents();

  // Camera toggle
  cameraToggleBtn?.addEventListener('click', toggleCamera);

  // Panel minimize/maximize
  minimizeLocationsBtn?.addEventListener('click', () => {
    locationsPanel.dataset.state = 'minimized';
    minimizeLocationsBtn.style.display = 'none';
    maximizeLocationsBtn.style.display = 'flex';
  });
  maximizeLocationsBtn?.addEventListener('click', () => {
    locationsPanel.dataset.state = 'maximized';
    maximizeLocationsBtn.style.display = 'none';
    minimizeLocationsBtn.style.display = 'flex';
  });

  // Click on Locations title to toggle
  const locationsTitle = locationsPanel?.querySelector('h3');
  locationsTitle?.addEventListener('click', () => {
    if (locationsPanel.dataset.state === 'minimized') {
      locationsPanel.dataset.state = 'maximized';
      maximizeLocationsBtn.style.display = 'none';
      minimizeLocationsBtn.style.display = 'flex';
    } else {
      locationsPanel.dataset.state = 'minimized';
      minimizeLocationsBtn.style.display = 'none';
      maximizeLocationsBtn.style.display = 'flex';
    }
  });

  // Debug pane minimize/maximize
  minimizeDebugBtn?.addEventListener('click', () => {
    debugPane.dataset.state = 'minimized';
    minimizeDebugBtn.style.display = 'none';
    maximizeDebugBtn.style.display = 'flex';
  });
  maximizeDebugBtn?.addEventListener('click', () => {
    debugPane.dataset.state = 'maximized';
    maximizeDebugBtn.style.display = 'none';
    minimizeDebugBtn.style.display = 'flex';
  });

  // Click on Debug title to toggle
  const debugTitle = debugPane?.querySelector('h3');
  debugTitle?.addEventListener('click', () => {
    if (debugPane.dataset.state === 'minimized') {
      debugPane.dataset.state = 'maximized';
      maximizeDebugBtn.style.display = 'none';
      minimizeDebugBtn.style.display = 'flex';
    } else {
      debugPane.dataset.state = 'minimized';
      minimizeDebugBtn.style.display = 'none';
      maximizeDebugBtn.style.display = 'flex';
    }
  });

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
    });
    overlay.draw();
  }

  // Draw compass
  if (compassCtx) {
    drawCompass(compassAlpha || 0, isCalibrated);
  }

  requestAnimationFrame(animate);
}

function handleCompassUpdate(data) {
  compassAlpha = data.alpha;
  compassAbsolute = data.absolute;
  debug(`Compass: alpha=${data.alpha.toFixed(1)}°, absolute=${data.absolute}`);
  updateStatus();
}

function handleGPSUpdate(pos) {
  userPosition = { lat: pos.lat, lon: pos.lon, alt: pos.alt };
  gpsAccuracy = pos.accuracy;
  debug(`GPS: lat=${pos.lat.toFixed(6)}, lon=${pos.lon.toFixed(6)}, alt=${pos.alt}, accuracy=${pos.accuracy}m, timestamp=${new Date(pos.timestamp).toISOString()}`);
  updateStatus();
}

function handleGPSError(err) {
  debug(`GPS Error: ${err.message} (code: ${err.code})`);
  showError(`GPS Error: ${err.message}`);
}

let cameraStream = null;
let cameraEnabled = true;

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
    statusGPS.textContent = `📍 GPS: ${gpsAccuracy ? `${Math.round(gpsAccuracy)}m` : '—'}`;
    statusGPS.className = gpsAccuracy && gpsAccuracy < 50 ? 'good' : 'warn';
  }
  if (statusCompass) {
    statusCompass.textContent = `🧭 ${compassAbsolute ? 'Absolute' : 'Relative'}`;
    statusCompass.className = compassAbsolute ? 'good' : 'warn';
  }
}

function showError(msg) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Calibration UI
function showCalibration() {
  calibrationOverlay.style.display = 'flex';
  renderCalibrationLocations();
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

function setupCalibrationEvents() {
  const select = document.getElementById('cal-location-select');
  const calibrateBtn = document.getElementById('cal-calibrate-btn');
  const cancelBtn = document.getElementById('cal-cancel-btn');
  const closeBtn = document.getElementById('cal-close-btn');

  select?.addEventListener('change', (e) => {
    selectedCalibrationLocation = locations.find(l => l.id === e.target.value) || null;
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
      hideCalibration();
      calibrateBtn.disabled = false;
      calibrateBtn.textContent = 'Calibrate Now';
    }, 2000);
  } catch (err) {
    alert(`Calibration failed: ${err.message}`);
    calibrateBtn.disabled = false;
    calibrateBtn.textContent = 'Calibrate Now';
  }
}

// Location Picker UI
function showLocationPicker() {
  locationPickerOverlay.style.display = 'flex';
  renderPickerLocationSelect();
}

function hideLocationPicker() {
  locationPickerOverlay.style.display = 'none';
}

function renderPickerLocationSelect() {
  const select = document.getElementById('picker-location-select');
  const infoDiv = document.getElementById('picker-selected-info');
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

  // Update selected info when selection changes
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

  // Trigger onchange for first item
  if (select.value) {
    select.onchange({ target: select });
  }
}

function selectLocationForTracking(id) {
  const loc = locations.find(l => l.id === id);
  if (!loc) return;

  // Set as selected location for tracking
  selectedCalibrationLocation = loc;

  // Show toast
  showLocationToast(loc);

  // Close picker
  hideLocationPicker();

  // Auto-open calibration if not calibrated
  if (!isCalibrated) {
    setTimeout(() => showCalibration(), 500);
  }
}

function setupLocationPickerEvents() {
  const pickerSelectBtn = document.getElementById('picker-select-btn');
  const pickerSelect = document.getElementById('picker-location-select');

  pickerCloseBtn?.addEventListener('click', hideLocationPicker);
  pickerSelectBtn?.addEventListener('click', () => {
    if (pickerSelect && pickerSelect.value) {
      selectLocationForTracking(pickerSelect.value);
    }
  });
  pickerManageBtn?.addEventListener('click', () => {
    hideLocationPicker();
    // Scroll to locations panel
    locationsPanel.dataset.state = 'maximized';
    minimizeLocationsBtn.style.display = 'flex';
    maximizeLocationsBtn.style.display = 'none';
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
            ${loc.type ? `<span class="type-badge" style="background: ${loc.color}">${loc.type}</span>` : ''}
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
}

// Initialize everything when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupLocationForm();
  init();
});

// Compass drawing function
function drawCompass(heading, isCalibrated) {
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
  compassCtx.fillStyle = isCalibrated ? '#4ECDC4' : '#FFBE0B';
  compassCtx.fill();

  // Heading text
  compassCtx.font = 'bold 12px system-ui, sans-serif';
  compassCtx.fillStyle = '#FFFFFF';
  compassCtx.textAlign = 'center';
  compassCtx.textBaseline = 'top';
  compassCtx.fillText(`${Math.round(heading)}°`, centerX, centerY + radius + 6);

  // Uncalibrated warning
  if (!isCalibrated) {
    compassCtx.font = '9px system-ui, sans-serif';
    compassCtx.fillStyle = '#FFBE0B';
    compassCtx.textAlign = 'center';
    compassCtx.textBaseline = 'bottom';
    compassCtx.fillText('UNCALIBRATED', centerX, centerY - radius - 6);
  }
}