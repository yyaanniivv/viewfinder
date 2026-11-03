/**
 * Main app coordinator for Viewfinder
 * Wires camera, compass, GPS, overlay, calibration, and locations
 */

import { Overlay } from './overlay.js';
import { startCamera } from './camera.js';
import { startCompass } from './compass.js';
import { startGPS } from './gps.js';
import { getLocations, saveLocations, SAMPLE_LOCATIONS, createLocation, generateId, getNextColor, LOCATION_COLORS } from './storage.js';
import { loadCalibration, saveCalibration, computeHeadingOffset, hasValidCalibration } from './calibration.js';
import { normalizeBearing, formatDistance, haversineDistance } from './geo.js';

// DOM Elements
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const compassBtn = document.getElementById('compass-btn');
const locationsPanel = document.getElementById('locations-panel');
const calibrationOverlay = document.getElementById('calibration-overlay');
const statusGPS = document.getElementById('status-gps');
const statusCompass = document.getElementById('status-compass');

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

// Initialize
async function init() {
  // Load locations
  locations = getLocations();
  if (locations.length === 0) {
    locations = SAMPLE_LOCATIONS.map(l => ({ ...l, id: generateId() }));
    saveLocations(locations);
  }
  renderLocationList();

  // Load calibration
  const cal = loadCalibration();
  if (cal && hasValidCalibration()) {
    headingOffset = cal.headingOffset;
    isCalibrated = true;
  } else {
    showCalibration();
  }

  // Start camera
  try {
    await startCamera(video);
    console.log('Camera started');
  } catch (err) {
    showError(err.message);
  }

  // Start compass
  const compass = startCompass(handleCompassUpdate);
  try {
    await compass.requestPermission();
    console.log('Compass permission granted');
  } catch (err) {
    showError(`Compass permission: ${err.message}`);
  }

  // Start GPS
  startGPS(handleGPSUpdate, handleGPSError);

  // Initialize overlay
  overlay = new Overlay(canvas, {
    locations,
    userPosition: null,
    compassHeading: 0,
    headingOffset: 0,
    isCalibrated: false,
  });

  // Start render loop
  animate();

  // Event listeners
  compassBtn.addEventListener('click', () => showCalibration());
  setupCalibrationEvents();
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
  requestAnimationFrame(animate);
}

function handleCompassUpdate(data) {
  compassAlpha = data.alpha;
  compassAbsolute = data.absolute;
  updateStatus();
}

function handleGPSUpdate(pos) {
  userPosition = { lat: pos.lat, lon: pos.lon, alt: pos.alt };
  gpsAccuracy = pos.accuracy;
  updateStatus();
}

function handleGPSError(err) {
  showError(err);
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

// Location List UI
function renderLocationList() {
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