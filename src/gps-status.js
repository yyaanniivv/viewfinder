/**
 * GPS Status Module
 * Handles GPS display, current location overlay, and manual location entry
 */

import { haversineDistance, bearing, normalizeBearing, formatDistance } from './geo.js';
import { getSetting } from './settings.js';

/**
 * Initialize GPS status module
 * @param {Object} deps - Dependencies
 * @param {HTMLElement} deps.statusGPS - GPS status pill element
 * @param {HTMLElement} deps.currentLocationOverlay - Current location overlay element
 * @param {HTMLElement} deps.currentLocationCloseBtn - Close button for overlay
 * @param {HTMLElement} deps.currentLocationUseGpsBtn - Use GPS button
 * @param {HTMLElement} deps.currentLocationSetManualBtn - Set manual location button
 * @param {HTMLElement} deps.manualLat - Manual latitude input
 * @param {HTMLElement} deps.manualLon - Manual longitude input
 * @param {HTMLElement} deps.gpsLatEl - GPS latitude display
 * @param {HTMLElement} deps.gpsLonEl - GPS longitude display
 * @param {HTMLElement} deps.gpsAltEl - GPS altitude display
 * @param {HTMLElement} deps.gpsAccEl - GPS accuracy display
 * @param {HTMLElement} deps.gpsCompassEl - GPS compass display
 * @param {HTMLElement} deps.gpsBearingEl - GPS bearing display
 * @param {Function} deps.debug - Debug logging function
 * @param {Function} deps.showError - Toast error function
 * @param {Function} [deps.onUserPositionChange] - Callback when user position changes
 * @param {Function} [deps.onGpsAccuracyChange] - Callback when GPS accuracy changes
 * @param {Function} [deps.onCompassAlphaChange] - Callback when compass alpha changes
 * @param {Function} [deps.onCompassAbsoluteChange] - Callback when compass absolute changes
 * @param {Function} [deps.onHeadingOffsetChange] - Callback when heading offset changes
 * @param {Function} [deps.onTrackedLocationIdChange] - Callback when tracked location ID changes
 * @returns {Object} GPS status controller
 */
export function initGPSStatus(deps) {
  const {
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
    onUserPositionChange,
    onGpsAccuracyChange,
    onCompassAlphaChange,
    onCompassAbsoluteChange,
    onHeadingOffsetChange,
    onTrackedLocationIdChange,
  } = deps;

  // Internal state
  let userPosition = null;
  let gpsAccuracy = null;
  let compassAlpha = null;
  let compassAbsolute = false;
  let headingOffset = 0;
  let trackedLocationId = null;
  let locations = [];

  // Helper to call setter callbacks
  const setUserPosition = (pos) => {
    userPosition = pos;
    onUserPositionChange?.(pos);
  };
  const setGpsAccuracy = (acc) => {
    gpsAccuracy = acc;
    onGpsAccuracyChange?.(acc);
  };
  const setCompassAlpha = (alpha) => {
    compassAlpha = alpha;
    onCompassAlphaChange?.(alpha);
  };
  const setCompassAbsolute = (abs) => {
    compassAbsolute = abs;
    onCompassAbsoluteChange?.(abs);
  };
  const setHeadingOffset = (offset) => {
    headingOffset = offset;
    onHeadingOffsetChange?.(offset);
  };
  const setTrackedLocationId = (id) => {
    trackedLocationId = id;
    onTrackedLocationIdChange?.(id);
  };

  // Cardinal directions for bearing display
  const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  function bearingToCardinal(heading) {
    const index = Math.round(heading / 22.5) % 16;
    return cardinals[index < 0 ? index + 16 : index];
  }

  /**
   * Update the GPS status pill
   */
  function updateStatus() {
    if (!statusGPS) return;

    if (userPosition && gpsAccuracy !== null) {
      statusGPS.textContent = `📍 ±${Math.round(gpsAccuracy)}m`;
      statusGPS.title = `${userPosition.lat.toFixed(6)}, ${userPosition.lon.toFixed(6)} — click to copy`;
    } else {
      statusGPS.textContent = `📍 GPS: —`;
      statusGPS.title = 'Click to copy coordinates';
    }
    statusGPS.className = gpsAccuracy && gpsAccuracy < 50 ? 'good' : 'warn';
  }

  /**
   * Update bearing display (cardinal + degrees)
   */
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
    const index = Math.round(heading / 22.5) % 16;
    const cardinal = cardinals[index];

    cardinalEl.textContent = cardinal;
    degreesEl.textContent = `${Math.round(heading)}°`;
  }

  /**
   * Show current location overlay
   */
  function showCurrentLocationOverlay() {
    debug('showCurrentLocationOverlay called');
    if (currentLocationOverlay) {
      currentLocationOverlay.style.display = 'flex';
      currentLocationOverlay.offsetHeight; // Force reflow
      updateCurrentLocationDisplay();
      debug('Current location overlay shown');
    } else {
      debug('ERROR: currentLocationOverlay element not found!');
    }
  }

  /**
   * Hide current location overlay
   */
  function hideCurrentLocationOverlay() {
    debug('hideCurrentLocationOverlay called');
    if (currentLocationOverlay) {
      currentLocationOverlay.style.display = 'none';
      debug('Current location overlay hidden');
    }
  }

  /**
   * Update current location overlay display
   */
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

  /**
   * Handle GPS position update
   * @param {Object} pos - Position {lat, lon, alt, accuracy}
   */
  function handleGPSUpdate(pos) {
    setUserPosition({ lat: pos.lat, lon: pos.lon, alt: pos.alt });
    setGpsAccuracy(pos.accuracy);
    debug(`GPS: lat=${pos.lat.toFixed(6)}, lon=${pos.lon.toFixed(6)}, alt=${pos.alt}, accuracy=${pos.accuracy}m`);
    updateStatus();
    // Update current location overlay if open (distance changes)
    if (currentLocationOverlay.style.display === 'flex') {
      updateCurrentLocationDisplay();
    }
  }

  /**
   * Handle GPS error
   * @param {Error} err - GPS error
   */
  function handleGPSError(err) {
    debug(`GPS Error: ${err.message} (code: ${err.code})`);
    showError(`GPS Error: ${err.message}`);
  }

  /**
   * Handle compass update (for bearing calculations)
   * @param {Object} data - Compass data {alpha, absolute, beta, gamma, isLevel}
   */
  function handleCompassUpdate(data) {
    debug(`handleCompassUpdate called: alpha=${data.alpha}, absolute=${data.absolute}, beta=${data.beta}, gamma=${data.gamma}, isLevel=${data.isLevel}`);

    // Apply compass direction fix: some devices report alpha inverted
    let alpha = data.alpha;
    const compassDirection = getSetting('compassDirection') || 1;
    if (compassDirection === -1) {
      alpha = (360 - data.alpha) % 360;
    }
    // Apply zero offset
    const compassZeroOffset = parseFloat(getSetting('compassZeroOffset')) || 0;
    alpha = (alpha + compassZeroOffset) % 360;

    setCompassAlpha(alpha);
    setCompassAbsolute(data.absolute);
    window.compassIsLevel = data.isLevel;

    updateBearingDisplay();
    // Update current location overlay if open
    if (currentLocationOverlay.style.display === 'flex') {
      updateCurrentLocationDisplay();
    }
  }

  /**
   * Set locations array (reference)
   * @param {Array} locs - Locations array
   */
  function setLocations(locs) {
    locations = locs;
  }

  /**
   * Copy coordinates to clipboard
   */
  function copyCoordinates() {
    if (!userPosition) {
      debug('No GPS position to copy');
      return;
    }
    const lat = userPosition.lat.toFixed(6);
    const lon = userPosition.lon.toFixed(6);
    const coords = `${lat},${lon}`;
    navigator.clipboard.writeText(coords).then(() => {
      debug(`Copied to clipboard: ${coords}`);
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
  }

  /**
   * Set manual location from input fields
   */
  function handleSetManualLocation() {
    const lat = parseFloat(manualLat.value);
    const lon = parseFloat(manualLon.value);

    if (isNaN(lat) || isNaN(lon)) {
      alert('Please enter valid coordinates');
      return;
    }

    setUserPosition({ lat, lon });
    setGpsAccuracy(0); // Manual has no accuracy
    debug(`Manual location set: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    updateStatus();
    updateCurrentLocationDisplay();
    hideCurrentLocationOverlay();
  }

  /**
   * Setup event listeners for current location overlay
   */
  function setupEvents() {
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

    // GPS status pill click to copy coordinates
    if (statusGPS) {
      statusGPS.style.cursor = 'pointer';
      statusGPS.title = 'Click to copy coordinates';
      statusGPS.addEventListener('click', copyCoordinates);
    }
  }

  // Initialize events
  setupEvents();

  // Return public API
  return {
    // State setters (called by app.js)
    setUserPosition,
    setGpsAccuracy,
    setCompassAlpha,
    setCompassAbsolute,
    setHeadingOffset,
    setTrackedLocationId,
    setLocations,

    // Handlers (called by app.js on updates)
    handleGPSUpdate,
    handleGPSError,
    handleCompassUpdate,

    // UI actions
    showCurrentLocationOverlay,
    hideCurrentLocationOverlay,
    updateCurrentLocationDisplay,
    updateStatus,
    updateBearingDisplay,
  };
}