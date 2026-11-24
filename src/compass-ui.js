/**
 * Compass UI Module
 * Handles compass drawing, calibration overlay, and manual compass dial adjustment
 */

import { loadCalibration, saveCalibration, computeHeadingOffset, hasValidCalibration } from './calibration.js';
import { getSetting } from './settings.js';
import { bearing, normalizeBearing } from './geo.js';

/**
 * Initialize Compass UI module
 * @param {Object} deps - Dependencies
 * @param {HTMLCanvasElement} deps.compassCanvas - Compass canvas element
 * @param {HTMLElement} deps.calibrationOverlay - Calibration overlay element
 * @param {HTMLElement} deps.compassBtn - Compass button
 * @param {Function} deps.debug - Debug logging function
 * @param {Function} deps.showError - Toast error function
 * @param {Function} [deps.onCompassAlphaChange] - Callback when compass alpha changes
 * @param {Function} [deps.onCompassAbsoluteChange] - Callback when compass absolute changes
 * @param {Function} [deps.onHeadingOffsetChange] - Callback when heading offset changes
 * @param {Function} [deps.onIsCalibratedChange] - Callback when calibration state changes
 * @param {Function} [deps.onCompassDirectionChange] - Callback when compass direction changes
 * @param {Function} [deps.onCompassZeroOffsetChange] - Callback when compass zero offset changes
 * @param {Function} [deps.onLevelPitchChange] - Callback when level pitch changes
 * @param {Function} [deps.onLevelRollChange] - Callback when level roll changes
 * @param {Function} [deps.onCompassModeChange] - Callback when compass mode changes
 * @param {Function} [deps.onUserPositionChange] - Callback when user position changes
 * @returns {Object} Compass UI controller
 */
export function initCompassUI(deps) {
  const {
    compassCanvas,
    calibrationOverlay,
    compassBtn,
    debug,
    showError,
    onCompassAlphaChange,
    onCompassAbsoluteChange,
    onHeadingOffsetChange,
    onIsCalibratedChange,
    onCompassDirectionChange,
    onCompassZeroOffsetChange,
    onLevelPitchChange,
    onLevelRollChange,
    onCompassModeChange,
    onUserPositionChange,
  } = deps;

  // Get compass context
  const compassCtx = compassCanvas ? compassCanvas.getContext('2d') : null;

  // Internal state
  let compassAlpha = null;
  let compassAbsolute = false;
  let headingOffset = 0;
  let isCalibrated = false;
  let compassDirection = 1;
  let compassZeroOffset = 0;
  let levelPitch = null;
  let levelRoll = null;
  let compassMode = 'fixed'; // 'fixed' | 'dynamic'
  let userPosition = null;
  let locations = [];
  let selectedCalibrationLocation = null;

  let compassModule = null;
  let compassDialAbortController = null;
  let compassDialActive = false;
  let compassDialStartAngle = 0;
  let compassDialStartOffset = 0;
  let compassPermissionRequested = false;

  // Cardinal directions
  const cardinals = ['N', 'E', 'S', 'W'];

  // Helper to call setter callbacks
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
  const setIsCalibrated = (val) => {
    isCalibrated = val;
    onIsCalibratedChange?.(val);
  };
  const setCompassDirection = (dir) => {
    compassDirection = dir;
    onCompassDirectionChange?.(dir);
  };
  const setCompassZeroOffset = (offset) => {
    compassZeroOffset = offset;
    onCompassZeroOffsetChange?.(offset);
  };
  const setLevelPitch = (pitch) => {
    levelPitch = pitch;
    onLevelPitchChange?.(pitch);
  };
  const setLevelRoll = (roll) => {
    levelRoll = roll;
    onLevelRollChange?.(roll);
  };
  const setCompassMode = (mode) => {
    compassMode = mode;
    onCompassModeChange?.(mode);
  };
  const setUserPosition = (pos) => {
    userPosition = pos;
    onUserPositionChange?.(pos);
  };

  /**
   * Request compass permission on user gesture
   */
  async function requestCompassPermission() {
    if (!compassModule) {
      debug('Compass module not initialized');
      return Promise.resolve(false);
    }

    if (compassPermissionRequested) {
      debug('Compass permission already requested');
      return Promise.resolve(true);
    }
    compassPermissionRequested = true;
    debug('Requesting compass permission on user gesture...');
    try {
      await compassModule.requestPermission();
      debug('Compass permission granted');
      return true;
    } catch (err) {
      debug('Compass permission error: ' + err.message);
      showError(`Compass permission denied. Enable in Settings > Safari > Motion & Orientation Access.`);
      throw err;
    }
  }

  /**
   * Setup compass dial event listeners for manual calibration
   */
  function setupCompassDial() {
    if (!compassCanvas || !compassCtx) return;

    // Clean up any existing listeners
    if (compassDialAbortController) {
      compassDialAbortController.abort();
    }
    compassDialAbortController = new AbortController();
    const { signal } = compassDialAbortController;

    compassCanvas.addEventListener('mousedown', handleCompassDialStart, { signal });
    window.addEventListener('mousemove', handleCompassDialMove, { signal });
    window.addEventListener('mouseup', handleCompassDialEnd, { signal });

    compassCanvas.addEventListener('touchstart', handleCompassDialStart, { signal, passive: false });
    window.addEventListener('touchmove', handleCompassDialMove, { signal, passive: false });
    window.addEventListener('touchend', handleCompassDialEnd, { signal });

    debug('Compass dial event listeners attached');
  }

  /**
   * Handle compass dial start (mousedown/touchstart)
   */
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

  /**
   * Handle compass dial move (mousemove/touchmove)
   */
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

  /**
   * Handle compass dial end (mouseup/touchend)
   */
  function handleCompassDialEnd(e) {
    if (!compassDialActive) return;
    compassDialActive = false;
    isCalibrated = true;
    if (compassCanvas) {
      compassCanvas.style.cursor = 'grab';
    }
    debug(`Compass dial ended: offset=${headingOffset.toFixed(1)}°`);
  }

  /**
   * Show calibration overlay
   */
  function showCalibration() {
    calibrationOverlay.style.display = 'flex';
    // Reset button/result state
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

  /**
   * Hide calibration overlay
   */
  function hideCalibration() {
    calibrationOverlay.style.display = 'none';
  }

  /**
   * Render calibration location selector
   */
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

  /**
   * Update calibration overlay display
   */
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

  /**
   * Setup calibration overlay events
   */
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

  /**
   * Handle calibrate button click
   */
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

  /**
   * Setup compass button events
   */
  function setupCompassButtonEvents() {
    if (!compassBtn) {
      debug('ERROR: compass-btn not found!');
      return;
    }

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
  }

  /**
   * Handle compass data update
   * @param {Object} data - Compass data {alpha, absolute, beta, gamma, isLevel}
   */
  function handleCompassUpdate(data) {
    debug(`handleCompassUpdate called: alpha=${data.alpha}, absolute=${data.absolute}, beta=${data.beta}, gamma=${data.gamma}, isLevel=${data.isLevel}`);

    // Apply compass direction fix: some devices report alpha inverted
    let alpha = data.alpha;
    if (compassDirection === -1) {
      alpha = (360 - data.alpha) % 360;
    }
    // Apply zero offset
    alpha = (alpha + compassZeroOffset) % 360;

    setCompassAlpha(alpha);
    setCompassAbsolute(data.absolute);
    window.compassIsLevel = data.isLevel;
    setLevelPitch(data.beta);
    setLevelRoll(data.gamma);

    // Update bearing display
    updateBearingDisplay();
    // Update calibration overlay if open
    if (calibrationOverlay.style.display === 'flex') {
      updateCalibrationDisplay();
    }
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
   * Draw compass on canvas
   * @param {number} heading - Current heading in degrees
   */
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
    compassCtx.save();
    compassCtx.translate(centerX, centerY);

    // FIRST: Draw the fixed pointer at top of screen (12 o'clock) BEFORE rotating
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

  /**
   * Load saved calibration
   */
  function loadSavedCalibration() {
    const cal = loadCalibration();
    if (cal && hasValidCalibration()) {
      setHeadingOffset(cal.headingOffset);
      setIsCalibrated(true);
      debug(`Loaded calibration: offset=${headingOffset.toFixed(1)}° from ${cal.landmarkName}`);
      return true;
    }
    debug('No valid calibration - showing calibration on first use');
    return false;
  }

  /**
   * Initialize the module
   * @param {Object} module - Compass module from startCompass()
   * @param {string} mode - Compass mode ('fixed' | 'dynamic')
   */
  function init(module, mode) {
    compassModule = module;
    compassMode = mode;
    debug(`Compass UI initialized (mode: ${compassMode})`);

    // Setup events
    setupCompassButtonEvents();
    setupCalibrationEvents();
    setupCompassDial();

    // Load saved calibration
    loadSavedCalibration();
  }

  // Return public API
  return {
    // State setters (called by app.js)
    setCompassAlpha,
    setCompassAbsolute,
    setHeadingOffset,
    setIsCalibrated,
    setCompassDirection,
    setCompassZeroOffset,
    setLevelPitch,
    setLevelRoll,
    setCompassMode,
    setUserPosition,
    setLocations: (locs) => { locations = locs; },

    // Handlers (called by app.js on updates)
    handleCompassUpdate,

    // UI actions
    showCalibration,
    hideCalibration,
    drawCompass,
    updateBearingDisplay,
    init,

    // For cleanup
    abortCompassDial: () => {
      if (compassDialAbortController) {
        compassDialAbortController.abort();
      }
    },
  };
}