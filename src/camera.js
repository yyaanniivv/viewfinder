/**
 * Camera handling for Viewfinder
 * Uses getUserMedia for camera access with multi-lens/zoom support
 */

// Default zoom levels
export const DEFAULT_ZOOM_LEVELS = [1, 2, 5, 10];

// State for zoom management
let currentZoomLevel = 1;
let availableZoomLevels = [...DEFAULT_ZOOM_LEVELS];
let videoTrack = null;
let currentDeviceId = null;
let availableDevices = [];

/**
 * Get available video input devices (cameras/lenses)
 * Returns array of { deviceId, label, kind }
 */
export async function getAvailableCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableDevices = devices.filter(d => d.kind === 'videoinput');
    return availableDevices;
  } catch (err) {
    console.error('Error enumerating devices:', err);
    return [];
  }
}

/**
 * Check if device supports zoom
 * @param {MediaStreamTrack} track - Video track to check
 * @returns {Promise<{supportsZoom: boolean, min: number, max: number, step: number}>}
 */
export async function getZoomCapabilities(track) {
  if (!track || typeof track.getCapabilities !== 'function') {
    return { supportsZoom: false, min: 1, max: 1, step: 0 };
  }

  try {
    const capabilities = track.getCapabilities();
    const zoom = capabilities.zoom;

    if (zoom !== undefined) {
      return {
        supportsZoom: true,
        min: zoom.min || 1,
        max: zoom.max || 10,
        step: zoom.step || 0.1,
      };
    }
  } catch (err) {
    console.warn('Could not get zoom capabilities:', err);
  }

  return { supportsZoom: false, min: 1, max: 1, step: 0 };
}

/**
 * Set zoom level on video track
 * @param {MediaStreamTrack} track - Video track
 * @param {number} zoom - Zoom factor (e.g., 1, 2, 5, 10)
 * @returns {Promise<boolean>} Success
 */
export async function setZoom(track, zoom) {
  if (!track || typeof track.applyConstraints !== 'function') {
    return false;
  }

  try {
    await track.applyConstraints({ advanced: [{ zoom }] });
    currentZoomLevel = zoom;
    return true;
  } catch (err) {
    console.warn(`Failed to set zoom to ${zoom}x:`, err);
    return false;
  }
}

/**
 * Get current zoom level
 * @returns {number} Current zoom level
 */
export function getCurrentZoom() {
  return currentZoomLevel;
}

/**
 * Get available zoom levels
 * @returns {number[]} Available zoom levels
 */
export function getAvailableZoomLevels() {
  return availableZoomLevels;
}

/**
 * Set available zoom levels (can be customized by user)
 * @param {number[]} levels - Array of zoom levels (e.g., [1, 2, 5, 10])
 */
export function setAvailableZoomLevels(levels) {
  availableZoomLevels = [...levels].sort((a, b) => a - b);
  // Ensure current zoom is valid
  if (!availableZoomLevels.includes(currentZoomLevel)) {
    currentZoomLevel = availableZoomLevels[0] || 1;
  }
}

/**
 * Cycle to next zoom level
 * @returns {number} New zoom level
 */
export function cycleZoomLevel() {
  const idx = availableZoomLevels.indexOf(currentZoomLevel);
  const nextIdx = (idx + 1) % availableZoomLevels.length;
  currentZoomLevel = availableZoomLevels[nextIdx];
  return currentZoomLevel;
}

/**
 * Cycle to previous zoom level
 * @returns {number} New zoom level
 */
export function cycleZoomLevelBack() {
  const idx = availableZoomLevels.indexOf(currentZoomLevel);
  const prevIdx = idx <= 0 ? availableZoomLevels.length - 1 : idx - 1;
  currentZoomLevel = availableZoomLevels[prevIdx];
  return currentZoomLevel;
}

/**
 * Start camera with specific device and zoom
 * @param {HTMLVideoElement} videoElement - Video element
 * @param {Object} options - Options
 * @param {string} options.deviceId - Specific device ID (optional)
 * @param {number} options.zoom - Initial zoom level (optional)
 * @returns {Promise<MediaStream>} Camera stream
 */
export async function startCamera(videoElement, options = {}) {
  const { deviceId, zoom = 1 } = options;

  try {
    // Build constraints
    const constraints = {
      video: {
        facingMode: deviceId ? undefined : 'environment',
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        zoom: zoom > 1 ? { ideal: zoom } : undefined,
      },
    };

    // Remove undefined properties
    Object.keys(constraints.video).forEach(key => {
      if (constraints.video[key] === undefined) {
        delete constraints.video[key];
      }
    });

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoTrack = stream.getVideoTracks()[0];

    // Update current device ID
    if (videoTrack) {
      currentDeviceId = videoTrack.getSettings().deviceId;

      // Get actual zoom capabilities
      const caps = await getZoomCapabilities(videoTrack);
      if (caps.supportsZoom) {
        // Update available zoom levels based on device capabilities
        const maxZoom = Math.floor(caps.max);
        const newLevels = [];
        for (let z = 1; z <= maxZoom; z++) {
          if (DEFAULT_ZOOM_LEVELS.includes(z) || z === maxZoom) {
            newLevels.push(z);
          }
        }
        if (newLevels.length > 0) {
          availableZoomLevels = newLevels;
        }
      }

      // Apply initial zoom if > 1
      if (zoom > 1) {
        await setZoom(videoTrack, zoom);
      }
    }

    videoElement.srcObject = stream;
    await videoElement.play();
    return stream;
  } catch (err) {
    console.error('Camera error:', err);
    throw new Error(`Camera access denied: ${err.message}`);
  }
}

/**
 * Switch to a different camera device
 * @param {HTMLVideoElement} videoElement - Video element
 * @param {string} deviceId - Device ID to switch to
 * @param {MediaStream} currentStream - Current stream to stop
 * @returns {Promise<MediaStream>} New stream
 */
export async function switchCamera(videoElement, deviceId, currentStream) {
  // Stop current stream
  stopCamera(currentStream);

  // Start new camera with current zoom
  return startCamera(videoElement, {
    deviceId,
    zoom: currentZoomLevel
  });
}

/**
 * Cycle through available cameras (lenses)
 * @param {HTMLVideoElement} videoElement - Video element
 * @param {MediaStream} currentStream - Current stream
 * @returns {Promise<{stream: MediaStream, deviceId: string, label: string}>}
 */
export async function cycleCamera(videoElement, currentStream) {
  const devices = await getAvailableCameras();
  if (devices.length <= 1) {
    return { stream: currentStream, deviceId: currentDeviceId, label: devices[0]?.label || 'Camera' };
  }

  // Find current device index
  const currentIdx = devices.findIndex(d => d.deviceId === currentDeviceId);
  const nextIdx = (currentIdx + 1) % devices.length;
  const nextDevice = devices[nextIdx];

  const stream = await switchCamera(videoElement, nextDevice.deviceId, currentStream);

  return {
    stream,
    deviceId: nextDevice.deviceId,
    label: nextDevice.label || `Camera ${nextIdx + 1}`
  };
}

/**
 * Stop camera stream
 * @param {MediaStream} stream - Stream to stop
 */
export function stopCamera(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  videoTrack = null;
  currentDeviceId = null;
}

/**
 * Get video dimensions
 * @param {HTMLVideoElement} video - Video element
 * @returns {{width: number, height: number}}
 */
export function getVideoDimensions(video) {
  return {
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

/**
 * Setup pinch-to-zoom gesture on video element
 * @param {HTMLVideoElement} videoElement - Video element
 * @param {Function} onZoomChange - Callback when zoom changes
 * @returns {Function} Cleanup function
 */
export function setupPinchZoom(videoElement, onZoomChange) {
  let initialDistance = 0;
  let initialZoom = currentZoomLevel;
  let isPinching = false;

  function getDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      initialDistance = getDistance(e.touches);
      initialZoom = currentZoomLevel;
      isPinching = true;
      e.preventDefault();
    }
  }

  function handleTouchMove(e) {
    if (!isPinching || e.touches.length < 2) return;

    const currentDistance = getDistance(e.touches);
    const scale = currentDistance / initialDistance;

    // Calculate new zoom level based on pinch scale
    // Map pinch to discrete zoom levels
    const targetZoom = Math.round(initialZoom * scale * 10) / 10;

    // Find closest available zoom level
    let closestZoom = availableZoomLevels[0];
    let minDiff = Infinity;
    for (const level of availableZoomLevels) {
      const diff = Math.abs(level - targetZoom);
      if (diff < minDiff) {
        minDiff = diff;
        closestZoom = level;
      }
    }

    if (closestZoom !== currentZoomLevel && videoTrack) {
      setZoom(videoTrack, closestZoom).then(success => {
        if (success && onZoomChange) {
          onZoomChange(closestZoom);
        }
      });
    }

    e.preventDefault();
  }

  function handleTouchEnd(e) {
    if (e.touches.length < 2) {
      isPinching = false;
    }
  }

  videoElement.addEventListener('touchstart', handleTouchStart, { passive: false });
  videoElement.addEventListener('touchmove', handleTouchMove, { passive: false });
  videoElement.addEventListener('touchend', handleTouchEnd, { passive: false });
  videoElement.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  // Return cleanup function
  return () => {
    videoElement.removeEventListener('touchstart', handleTouchStart);
    videoElement.removeEventListener('touchmove', handleTouchMove);
    videoElement.removeEventListener('touchend', handleTouchEnd);
    videoElement.removeEventListener('touchcancel', handleTouchEnd);
  };
}