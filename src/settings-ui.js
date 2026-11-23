/**
 * Settings UI module for Viewfinder
 * Handles settings overlay, event listeners, and localStorage sync
 */

import { loadSettings, updateSetting, getSetting } from './settings.js';

/**
 * Initialize settings UI
 * @param {Object} deps - Dependencies from app.js
 * @param {HTMLElement} deps.settingsBtn - Settings button (version badge)
 * @param {HTMLElement} deps.settingsOverlay - Settings overlay element
 * @param {HTMLElement} deps.settingsCloseBtn - Close button in settings
 * @param {HTMLElement} deps.settingsVersion - Version display in settings
 * @param {Function} deps.debug - Debug logging function
 * @param {Function} deps.updateViewportForPanels - Function to update viewport
 * @param {Object} deps.state - Mutable state object to update
 * @returns {Object} API for controlling settings
 */
export function initSettingsUI(deps) {
  const {
    settingsBtn,
    settingsOverlay,
    settingsCloseBtn,
    settingsVersion,
    versionBadge,
    debug,
    updateViewportForPanels,
    state,
  } = deps;

  // State is a mutable object passed by reference
  // Properties that settings UI manages:
  // cameraEnabled, cameraDefaultOn, compassDirection, compassRate, compassZeroOffset,
  // compassAutoCalibrate, levelIndicatorEnabled, levelTagEnabled, laneModeEnabled,
  // cleanWheelEnabled, compassMode

  // DOM elements for settings
  const elements = {
    toggleLocationsPanel: document.getElementById('toggle-locations-panel'),
    toggleDebugPane: document.getElementById('toggle-debug-pane'),
    toggleCompass: document.getElementById('toggle-compass'),
    cameraEnabledCheckbox: document.getElementById('camera-enabled'),
    cameraDefaultOnCheckbox: document.getElementById('camera-default-on'),
    compassInvertCheckbox: document.getElementById('compass-invert'),
    compassRateSlider: document.getElementById('compass-rate'),
    compassRateValue: document.getElementById('compass-rate-value'),
    compassZeroOffsetInput: document.getElementById('compass-zero-offset-input'),
    compassAutoCalibrateCheckbox: document.getElementById('compass-auto-calibrate'),
    compassModeSelect: document.getElementById('compass-mode-select'),
    levelIndicatorToggle: document.getElementById('toggle-level-indicator'),
    levelTagToggle: document.getElementById('toggle-level-tag'),
    laneModeToggle: document.getElementById('toggle-lane-mode'),
    cleanWheelToggle: document.getElementById('toggle-clean-wheel'),
    gpsRateSlider: document.getElementById('gps-rate'),
    gpsRateValue: document.getElementById('gps-rate-value'),
    clearStorageBtn: document.getElementById('clear-storage-btn'),
    locationsPanel: document.getElementById('locations-panel'),
    debugPane: document.getElementById('debug-pane'),
    compassBtn: document.getElementById('compass-btn'),
    minimizeLocationsBtn: document.getElementById('minimize-locations-btn'),
    maximizeLocationsBtn: document.getElementById('maximize-locations-btn'),
    minimizeDebugBtn: document.getElementById('minimize-debug-btn'),
    maximizeDebugBtn: document.getElementById('maximize-debug-btn'),
  };

  // Set version in settings
  if (settingsVersion && versionBadge) {
    const version = 'v1.0.0';
    settingsVersion.textContent = version;
    versionBadge.textContent = version;
  }

  // Load settings from storage
  const settings = loadSettings();
  state.compassMode = settings.compassMode || 'fixed';

  // Open settings overlay
  function openSettings() {
    settingsOverlay.style.display = 'flex';
    // Sync UI with current state
    elements.toggleLocationsPanel.checked = elements.locationsPanel.style.display !== 'none';
    elements.toggleDebugPane.checked = elements.debugPane.style.display !== 'none';
    elements.toggleCompass.checked = elements.compassBtn.style.display !== 'none';
    elements.cameraEnabledCheckbox.checked = state.cameraEnabled;
  }

  // Close settings overlay
  function closeSettings() {
    settingsOverlay.style.display = 'none';
  }

  // Event listeners
  settingsBtn?.addEventListener('click', openSettings);
  settingsCloseBtn?.addEventListener('click', closeSettings);
  settingsOverlay?.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  // Panel toggles
  elements.toggleLocationsPanel?.addEventListener('change', (e) => {
    const show = e.target.checked;
    elements.locationsPanel.style.display = show ? 'flex' : 'none';
    elements.locationsPanel.dataset.state = show ? 'maximized' : 'minimized';
    elements.minimizeLocationsBtn.style.display = show ? 'flex' : 'none';
    elements.maximizeLocationsBtn.style.display = show ? 'none' : 'flex';
    localStorage.setItem('viewfinder:showLocations', show);
    updateViewportForPanels();
  });

  elements.toggleDebugPane?.addEventListener('change', (e) => {
    const show = e.target.checked;
    elements.debugPane.style.display = show ? 'flex' : 'none';
    elements.debugPane.dataset.state = show ? 'maximized' : 'minimized';
    if (show) {
      elements.minimizeDebugBtn.style.display = 'flex';
      elements.maximizeDebugBtn.style.display = 'none';
    } else {
      elements.minimizeDebugBtn.style.display = 'none';
      elements.maximizeDebugBtn.style.display = 'flex';
    }
    localStorage.setItem('viewfinder:showDebug', show);
    updateViewportForPanels();
  });

  elements.toggleCompass?.addEventListener('change', (e) => {
    const show = e.target.checked;
    elements.compassBtn.style.display = show ? 'flex' : 'none';
    localStorage.setItem('viewfinder:showCompass', show);
  });

  // Camera settings
  elements.cameraEnabledCheckbox?.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    localStorage.setItem('viewfinder:cameraEnabled', enabled);
    state.cameraEnabled = enabled;
    // Note: toggleCamera() must be called by app.js
    if (state.onCameraToggle) state.onCameraToggle(enabled);
  });

  elements.cameraDefaultOnCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('viewfinder:cameraDefaultOn', e.target.checked);
  });

  // Compass settings
  elements.compassInvertCheckbox?.addEventListener('change', (e) => {
    state.compassDirection = e.target.checked ? -1 : 1;
    localStorage.setItem('viewfinder:compassInvert', e.target.checked);
    debug(`Compass direction: ${state.compassDirection === -1 ? 'inverted' : 'normal'}`);
  });

  elements.compassRateSlider?.addEventListener('input', (e) => {
    const rate = parseInt(e.target.value);
    elements.compassRateValue.textContent = `${rate}ms`;
    localStorage.setItem('viewfinder:compassRate', rate);
    if (state.compassModule && state.compassModule.setUpdateRate) {
      state.compassModule.setUpdateRate(rate);
    }
    debug(`Compass update rate: ${rate}ms`);
  });

  elements.compassZeroOffsetInput?.addEventListener('input', (e) => {
    let offset = parseInt(e.target.value);
    if (isNaN(offset)) offset = 0;
    if (offset < 0) offset = 0;
    if (offset > 359) offset = 359;
    e.target.value = offset;
    state.compassZeroOffset = offset;
    localStorage.setItem('viewfinder:compassZeroOffset', offset);
    debug(`Compass zero offset: ${offset}°`);
  });

  elements.compassAutoCalibrateCheckbox?.addEventListener('change', (e) => {
    localStorage.setItem('viewfinder:compassAutoCalibrate', e.target.checked);
    debug(`Compass auto-calibrate: ${e.target.checked ? 'on' : 'off'}`);
  });

  // Compass mode toggle
  if (elements.compassModeSelect) {
    elements.compassModeSelect.value = state.compassMode;
    elements.compassModeSelect.addEventListener('change', (e) => {
      state.compassMode = e.target.value;
      updateSetting('compassMode', state.compassMode);
      debug(`Compass mode: ${state.compassMode}`);
    });
  }

  // Level indicator
  elements.levelIndicatorToggle?.addEventListener('change', (e) => {
    state.levelIndicatorEnabled = e.target.checked;
    localStorage.setItem('viewfinder:levelIndicator', state.levelIndicatorEnabled);
    debug(`Level indicator: ${state.levelIndicatorEnabled ? 'on' : 'off'}`);
  });

  elements.levelTagToggle?.addEventListener('change', (e) => {
    state.levelTagEnabled = e.target.checked;
    localStorage.setItem('viewfinder:levelTag', state.levelTagEnabled);
    // Note: updateStatus() must be called by app.js
    if (state.onLevelTagChange) state.onLevelTagChange();
    debug(`Level tag: ${state.levelTagEnabled ? 'on' : 'off'}`);
  });

  // Lane mode
  elements.laneModeToggle?.addEventListener('change', (e) => {
    state.laneModeEnabled = e.target.checked;
    localStorage.setItem('viewfinder:laneMode', state.laneModeEnabled);
    debug(`Lane markers: ${state.laneModeEnabled ? 'on' : 'off'}`);
  });

  // Clean wheel
  elements.cleanWheelToggle?.addEventListener('change', (e) => {
    state.cleanWheelEnabled = e.target.checked;
    localStorage.setItem('viewfinder:cleanWheel', state.cleanWheelEnabled);
    debug(`Clean wheel: ${state.cleanWheelEnabled ? 'on' : 'off'}`);
  });

  // GPS rate
  elements.gpsRateSlider?.addEventListener('input', (e) => {
    const rateMs = parseInt(e.target.value);
    elements.gpsRateValue.textContent = `${rateMs / 1000}s`;
    localStorage.setItem('viewfinder:gpsRate', rateMs);
    if (state.gpsModule && state.gpsModule.setUpdateRate) {
      state.gpsModule.setUpdateRate(rateMs);
    }
    debug(`GPS update rate: ${rateMs / 1000}s`);
  });

  // Clear storage
  elements.clearStorageBtn?.addEventListener('click', () => {
    if (confirm('Clear all stored data? This will reset locations, settings, and calibration.')) {
      localStorage.clear();
      debug('All localStorage cleared');
      location.reload();
    }
  });

  // Load persisted UI state
  loadPersistedUIState();

  return {
    openSettings,
    closeSettings,
    loadPersistedUIState,
    elements,
  };
}

/**
 * Load persisted UI state from localStorage
 */
function loadPersistedUIState() {
  const elements = {
    locationsPanel: document.getElementById('locations-panel'),
    debugPane: document.getElementById('debug-pane'),
    compassBtn: document.getElementById('compass-btn'),
    toggleLocationsPanel: document.getElementById('toggle-locations-panel'),
    toggleDebugPane: document.getElementById('toggle-debug-pane'),
    toggleCompass: document.getElementById('toggle-compass'),
    cameraEnabledCheckbox: document.getElementById('camera-enabled'),
    cameraDefaultOnCheckbox: document.getElementById('camera-default-on'),
    compassInvertCheckbox: document.getElementById('compass-invert'),
    compassRateSlider: document.getElementById('compass-rate'),
    compassRateValue: document.getElementById('compass-rate-value'),
    compassZeroOffsetInput: document.getElementById('compass-zero-offset-input'),
    compassAutoCalibrateCheckbox: document.getElementById('compass-auto-calibrate'),
    levelIndicatorToggle: document.getElementById('toggle-level-indicator'),
    levelTagToggle: document.getElementById('toggle-level-tag'),
    laneModeToggle: document.getElementById('toggle-lane-mode'),
    cleanWheelToggle: document.getElementById('toggle-clean-wheel'),
    gpsRateSlider: document.getElementById('gps-rate'),
    gpsRateValue: document.getElementById('gps-rate-value'),
    minimizeLocationsBtn: document.getElementById('minimize-locations-btn'),
    maximizeLocationsBtn: document.getElementById('maximize-locations-btn'),
    minimizeDebugBtn: document.getElementById('minimize-debug-btn'),
    maximizeDebugBtn: document.getElementById('maximize-debug-btn'),
  };

  const showLocations = localStorage.getItem('viewfinder:showLocations');
  if (showLocations !== null) {
    const show = showLocations === 'true';
    elements.locationsPanel.style.display = show ? 'flex' : 'none';
    elements.locationsPanel.dataset.state = show ? 'maximized' : 'minimized';
    elements.toggleLocationsPanel.checked = show;
  } else {
    elements.locationsPanel.style.display = 'flex';
    elements.locationsPanel.dataset.state = 'minimized';
    elements.toggleLocationsPanel.checked = false;
  }

  const showDebug = localStorage.getItem('viewfinder:showDebug');
  if (showDebug !== null) {
    const show = showDebug === 'true';
    elements.debugPane.style.display = show ? 'flex' : 'none';
    elements.debugPane.dataset.state = show ? 'maximized' : 'minimized';
    elements.toggleDebugPane.checked = show;
  } else {
    elements.debugPane.style.display = 'flex';
    elements.debugPane.dataset.state = 'minimized';
    elements.toggleDebugPane.checked = false;
  }

  const showCompass = localStorage.getItem('viewfinder:showCompass');
  if (showCompass !== null) {
    const show = showCompass === 'true';
    elements.compassBtn.style.display = show ? 'flex' : 'none';
    elements.toggleCompass.checked = show;
  } else {
    elements.compassBtn.style.display = 'flex';
    elements.toggleCompass.checked = true;
  }

  const cameraEnabledPref = localStorage.getItem('viewfinder:cameraEnabled');
  if (cameraEnabledPref !== null) {
    const enabled = cameraEnabledPref === 'true';
    elements.cameraEnabledCheckbox.checked = enabled;
  }

  const cameraDefaultOnPref = localStorage.getItem('viewfinder:cameraDefaultOn');
  if (cameraDefaultOnPref !== null) {
    elements.cameraDefaultOnCheckbox.checked = cameraDefaultOnPref === 'true';
  }

  const compassInvertPref = localStorage.getItem('viewfinder:compassInvert');
  if (compassInvertPref !== null) {
    const invert = compassInvertPref === 'true';
    elements.compassInvertCheckbox.checked = invert;
  } else {
    elements.compassInvertCheckbox.checked = false;
  }

  const compassRatePref = localStorage.getItem('viewfinder:compassRate');
  if (compassRatePref !== null) {
    const rate = parseInt(compassRatePref);
    elements.compassRateSlider.value = rate;
    elements.compassRateValue.textContent = `${rate}ms`;
  }

  const compassAutoCalibratePref = localStorage.getItem('viewfinder:compassAutoCalibrate');
  if (compassAutoCalibratePref !== null) {
    elements.compassAutoCalibrateCheckbox.checked = compassAutoCalibratePref === 'true';
  } else {
    elements.compassAutoCalibrateCheckbox.checked = false;
  }

  const compassZeroOffsetPref = localStorage.getItem('viewfinder:compassZeroOffset');
  if (compassZeroOffsetPref !== null) {
    const offset = parseInt(compassZeroOffsetPref);
    if (elements.compassZeroOffsetInput) elements.compassZeroOffsetInput.value = offset;
  }

  const levelIndicatorPref = localStorage.getItem('viewfinder:levelIndicator');
  if (levelIndicatorPref !== null) {
    elements.levelIndicatorToggle.checked = levelIndicatorPref === 'true';
  } else {
    elements.levelIndicatorToggle.checked = false;
  }

  const levelTagPref = localStorage.getItem('viewfinder:levelTag');
  if (levelTagPref !== null) {
    elements.levelTagToggle.checked = levelTagPref === 'true';
  } else {
    elements.levelTagToggle.checked = false;
  }

  const laneModePref = localStorage.getItem('viewfinder:laneMode');
  if (laneModePref !== null) {
    elements.laneModeToggle.checked = laneModePref === 'true';
  } else {
    elements.laneModeToggle.checked = false;
  }

  const cleanWheelPref = localStorage.getItem('viewfinder:cleanWheel');
  if (cleanWheelPref !== null) {
    elements.cleanWheelToggle.checked = cleanWheelPref === 'true';
  } else {
    elements.cleanWheelToggle.checked = true;
  }

  const gpsRatePref = localStorage.getItem('viewfinder:gpsRate');
  if (gpsRatePref !== null) {
    const rateMs = parseInt(gpsRatePref);
    elements.gpsRateSlider.value = rateMs;
    elements.gpsRateValue.textContent = `${rateMs / 1000}s`;
  }
}