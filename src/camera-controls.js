/**
 * Camera Controls module for Viewfinder
 * Handles camera toggle, zoom controls, lens switching, and pinch zoom
 */

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

/**
 * Initialize camera controls
 * @param {Object} deps - Dependencies from app.js
 * @param {HTMLVideoElement} deps.video - Video element
 * @param {HTMLElement} deps.cameraToggleBtn - Camera toggle button
 * @param {HTMLElement} deps.zoomIndicator - Zoom indicator element
 * @param {HTMLElement} deps.lensSwitchBtn - Lens switch button
 * @param {Function} deps.debug - Debug logging function
 * @param {Function} deps.showError - Toast notification function
 * @param {Object} deps.state - Mutable state object to update
 * @returns {Object} API for controlling camera
 */
export function initCameraControls(deps) {
  const {
    video,
    cameraToggleBtn,
    zoomIndicator,
    lensSwitchBtn,
    debug,
    showError,
    state,
  } = deps;

  // State is a mutable object passed by reference
  // Properties that camera controls manages:
  // cameraEnabled, cameraStream, currentZoomLevel, availableZoomLevels, pinchZoomCleanup

  // Zoom settings checkboxes (from settings overlay)
  const zoomGestureEnabledCheckbox = document.getElementById('zoom-gesture-enabled');
  const zoomButtonsEnabledCheckbox = document.getElementById('zoom-buttons-enabled');
  const zoomCycleEnabledCheckbox = document.getElementById('zoom-cycle-enabled');

  // Set default zoom levels
  state.availableZoomLevels = [...DEFAULT_ZOOM_LEVELS];
  state.currentZoomLevel = 1;

  // Toggle camera on/off
  async function toggleCamera() {
    if (!state.cameraEnabled) {
      try {
        debug('Starting camera...');
        state.cameraStream = await startCamera(video, { zoom: state.currentZoomLevel });
        video.style.display = 'block';
        updateCameraButtonUI(true);
        state.cameraEnabled = true;
        localStorage.setItem('viewfinder:cameraEnabled', true);
        debug('Camera started');

        setupZoomControls();
        setupLensSwitch();
      } catch (err) {
        debug('Camera error: ' + err.message);
        showError(`Camera: ${err.message}`);
      }
    } else {
      if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
      }
      video.style.display = 'none';
      updateCameraButtonUI(false);
      state.cameraEnabled = false;
      localStorage.setItem('viewfinder:cameraEnabled', false);
      debug('Camera stopped');

      cleanupZoomControls();
      cleanupLensSwitch();
    }
  }

  /**
   * Update camera toggle button UI
   */
  function updateCameraButtonUI(enabled) {
    if (!cameraToggleBtn) return;
    cameraToggleBtn.querySelector('.camera-icon-off').style.display = enabled ? 'none' : 'block';
    cameraToggleBtn.querySelector('.camera-icon-on').style.display = enabled ? 'block' : 'none';
    cameraToggleBtn.classList.toggle('off', !enabled);
    cameraToggleBtn.title = enabled ? 'Turn off camera' : 'Turn on camera';
    cameraToggleBtn.setAttribute('aria-pressed', enabled);
    cameraToggleBtn.setAttribute('aria-label', enabled ? 'Turn off camera' : 'Turn on camera');
  }

  /**
   * Setup zoom controls
   */
  function setupZoomControls() {
    state.availableZoomLevels = [1, 2, 5, 10];
    setAvailableZoomLevels(state.availableZoomLevels);

    state.currentZoomLevel = getCurrentZoom();
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
      state.pinchZoomCleanup = setupPinchZoom(video, (newZoom) => {
        state.currentZoomLevel = newZoom;
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
    if (state.pinchZoomCleanup) {
      state.pinchZoomCleanup();
      state.pinchZoomCleanup = null;
    }
  }

  /**
   * Update zoom indicator display
   */
  function updateZoomIndicator() {
    if (zoomIndicator) {
      zoomIndicator.textContent = `${state.currentZoomLevel}×`;
    }
  }

  /**
   * Handle zoom cycle (tap zoom indicator)
   */
  function handleZoomCycle() {
    if (!state.cameraStream || !video) return;

    const newZoom = cycleZoomLevel();
    applyZoom(newZoom);
  }

  /**
   * Apply zoom level to camera
   * @param {number} zoom - Zoom level to apply
   */
  async function applyZoom(zoom) {
    if (!state.cameraStream) return;

    const track = state.cameraStream.getVideoTracks()[0];
    if (!track) return;

    try {
      const success = await setZoom(track, zoom);
      if (success) {
        state.currentZoomLevel = zoom;
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

        if (enabled && video && state.cameraEnabled) {
          state.pinchZoomCleanup = setupPinchZoom(video, (newZoom) => {
            state.currentZoomLevel = newZoom;
            updateZoomIndicator();
            debug(`Pinch zoom: ${newZoom}×`);
          });
          debug('Pinch-to-zoom enabled');
        } else if (!enabled && state.pinchZoomCleanup) {
          state.pinchZoomCleanup();
          state.pinchZoomCleanup = null;
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
          zoomIndicator.style.display = enabled && state.cameraEnabled ? 'flex' : 'none';
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
      if (!state.cameraStream || !state.cameraEnabled) return;

      try {
        debug('Switching camera lens...');
        const result = await cycleCamera(video, state.cameraStream);
        state.cameraStream = result.stream;

        // Update zoom indicator after lens switch (zoom may have been clamped)
        state.currentZoomLevel = getCurrentZoom();
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

  // Initialize zoom settings from localStorage
  if (zoomGestureEnabledCheckbox) {
    zoomGestureEnabledCheckbox.checked = localStorage.getItem('viewfinder:zoomGestureEnabled') !== 'false';
  }
  if (zoomButtonsEnabledCheckbox) {
    zoomButtonsEnabledCheckbox.checked = localStorage.getItem('viewfinder:zoomButtonsEnabled') !== 'false';
  }
  if (zoomCycleEnabledCheckbox) {
    zoomCycleEnabledCheckbox.checked = localStorage.getItem('viewfinder:zoomCycleEnabled') !== 'false';
  }

  return {
    toggleCamera,
    setupZoomControls,
    cleanupZoomControls,
    updateZoomIndicator,
    handleZoomCycle,
    applyZoom,
    setupLensSwitch,
    cleanupLensSwitch,
  };
}