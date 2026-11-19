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

// Keywords that identify rear-facing cameras
const REAR_CAMERA_KEYWORDS = [
  'back',
  'rear',
  'environment',
  'ultra wide',
  'wide',
  'telephoto',
  'main',
  'camera 1',
  'camera 2',
  'camera 3',
];

/**
 * Get available video input devices (cameras/lenses)
 * Returns array of { deviceId, label, kind }
 * @param {boolean} rearOnly - If true, only return rear-facing cameras (for lens switching)
 */
export async function getAvailableCameras(rearOnly = false) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    let filtered = devices.filter(d => d.kind === 'videoinput');

    if (rearOnly) {
      // Filter to rear-facing cameras only (environment)
      // Check device label for common rear camera identifiers
      filtered = filtered.filter(d => {
        const label = (d.label || '').toLowerCase();
        return REAR_CAMERA_KEYWORDS.some(keyword => label.includes(keyword));
      });

      // If filtering results in empty, fall back to all video inputs
      if (filtered.length === 0) {
        filtered = devices.filter(d => d.kind === 'videoinput');
      }
    }

    availableDevices = filtered;
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
 * Set available zoom levels
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
        // Keep only levels that are <= max zoom, plus the max if not already included
        const maxZoom = Math.floor(caps.max);
        const newLevels = DEFAULT_ZOOM_LEVELS.filter(z => z <= maxZoom);
        if (!newLevels.includes(maxZoom) && maxZoom > 1) {
          newLevels.push(maxZoom);
        }
        if (newLevels.length > 0) {
          availableZoomLevels = newLevels;
          setAvailableZoomLevels(newLevels);
        }
      }

      // Clamp zoom to new camera's capabilities
      let finalZoom = zoom;
      if (caps.supportsZoom && zoom > caps.max) {
        finalZoom = caps.max;
        currentZoomLevel = caps.max;
      }

      // Apply initial zoom if > 1
      if (finalZoom > 1) {
        await setZoom(videoTrack, finalZoom);
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

  // Start new camera with current zoom (will be clamped in startCamera)
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
  // Use rearOnly=true to only cycle through rear-facing cameras
  const devices = await getAvailableCameras(true);
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

/**
 * Setup zoom dial (iOS-style horizontal drag to zoom)
 * @param {HTMLCanvasElement} canvas - Canvas element for dial
 * @param {Function} onZoomChange - Callback when zoom changes
 * @returns {Function} Cleanup function
 */
export function setupZoomDial(canvas, onZoomChange) {
  const ctx = canvas.getContext('2d');
  let isDragging = false;
  let startX = 0;
  let startZoom = currentZoomLevel;
  let animationFrame = null;

  // Dial configuration
  const DIAL_HEIGHT = 80;
  const TRACK_HEIGHT = 4;
  const HANDLE_RADIUS = 16;
  const PADDING = 20;

  function drawDial(zoom) {
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;
    const trackY = centerY;
    const trackStartX = PADDING;
    const trackEndX = width - PADDING;
    const trackWidth = trackEndX - trackStartX;

    // Calculate handle position based on zoom level
    const zoomRange = availableZoomLevels[availableZoomLevels.length - 1] - availableZoomLevels[0];
    const zoomProgress = zoomRange > 0 ? (zoom - availableZoomLevels[0]) / zoomRange : 0;
    const handleX = trackStartX + zoomProgress * trackWidth;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background track
    ctx.beginPath();
    ctx.moveTo(trackStartX, trackY);
    ctx.lineTo(trackEndX, trackY);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = TRACK_HEIGHT;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw active track (from min to current position)
    ctx.beginPath();
    ctx.moveTo(trackStartX, trackY);
    ctx.lineTo(handleX, trackY);
    ctx.strokeStyle = '#4ECDC4'; // accent color
    ctx.lineWidth = TRACK_HEIGHT;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Draw zoom level markers
    availableZoomLevels.forEach((level, i) => {
      const markerProgress = zoomRange > 0 ? (level - availableZoomLevels[0]) / zoomRange : 0;
      const markerX = trackStartX + markerProgress * trackWidth;

      // Marker line
      ctx.beginPath();
      ctx.moveTo(markerX, trackY - 10);
      ctx.lineTo(markerX, trackY + 10);
      ctx.strokeStyle = markerProgress <= zoomProgress ? '#4ECDC4' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Marker label
      ctx.fillStyle = markerProgress <= zoomProgress ? '#4ECDC4' : 'rgba(255,255,255,0.7)';
      ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${level}×`, markerX, trackY - 14);
    });

    // Draw handle
    ctx.beginPath();
    ctx.arc(handleX, trackY, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fill();
    ctx.strokeStyle = '#4ECDC4';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw current zoom in center of handle
    ctx.fillStyle = '#4ECDC4';
    ctx.font = 'bold 14px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${zoom}×`, handleX, trackY);
  }

  function handlePointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

    // Check if click is near handle
    const width = canvas.width;
    const trackStartX = PADDING;
    const trackEndX = width - PADDING;
    const trackWidth = trackEndX - trackStartX;
    const zoomRange = availableZoomLevels[availableZoomLevels.length - 1] - availableZoomLevels[0];
    const zoomProgress = zoomRange > 0 ? (currentZoomLevel - availableZoomLevels[0]) / zoomRange : 0;
    const handleX = trackStartX + zoomProgress * trackWidth;
    const centerY = canvas.height / 2;

    const dx = x - handleX;
    const dy = y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= HANDLE_RADIUS + 20) { // Generous hit area
      isDragging = true;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startZoom = currentZoomLevel;
      e.preventDefault();

      // Start animation loop for smooth updates
      function animate() {
        drawDial(currentZoomLevel);
        animationFrame = requestAnimationFrame(animate);
      }
      animate();
    }
  }

  function handlePointerMove(e) {
    if (!isDragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - startX;

    // Map drag distance to zoom level
    const width = canvas.width;
    const trackStartX = PADDING;
    const trackEndX = width - PADDING;
    const trackWidth = trackEndX - trackStartX;

    const pixelsPerZoomLevel = trackWidth / (availableZoomLevels.length - 1);
    const zoomSteps = deltaX / pixelsPerZoomLevel;

    // Find target zoom level
    const startIdx = availableZoomLevels.indexOf(startZoom);
    const targetIdx = Math.round(startIdx + zoomSteps);
    const clampedIdx = Math.max(0, Math.min(availableZoomLevels.length - 1, targetIdx));
    const newZoom = availableZoomLevels[clampedIdx];

    if (newZoom !== currentZoomLevel && videoTrack) {
      setZoom(videoTrack, newZoom).then(success => {
        if (success && onZoomChange) {
          onZoomChange(newZoom);
        }
      });
    }

    e.preventDefault();
  }

  function handlePointerUp(e) {
    if (isDragging) {
      isDragging = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      // Final draw
      drawDial(currentZoomLevel);
    }
  }

  // Initialize canvas size
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = DIAL_HEIGHT * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    drawDial(currentZoomLevel);
  }

  // Initial draw
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Add event listeners
  canvas.addEventListener('mousedown', handlePointerDown, { passive: false });
  canvas.addEventListener('mousemove', handlePointerMove, { passive: false });
  canvas.addEventListener('mouseup', handlePointerUp, { passive: false });
  canvas.addEventListener('mouseleave', handlePointerUp, { passive: false });
  canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
  canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
  canvas.addEventListener('touchend', handlePointerUp, { passive: false });
  canvas.addEventListener('touchcancel', handlePointerUp, { passive: false });

  // Return cleanup function
  return () => {
    window.removeEventListener('resize', resizeCanvas);
    canvas.removeEventListener('mousedown', handlePointerDown);
    canvas.removeEventListener('mousemove', handlePointerMove);
    canvas.removeEventListener('mouseup', handlePointerUp);
    canvas.removeEventListener('mouseleave', handlePointerUp);
    canvas.removeEventListener('touchstart', handlePointerDown);
    canvas.removeEventListener('touchmove', handlePointerMove);
    canvas.removeEventListener('touchend', handlePointerUp);
    canvas.removeEventListener('touchcancel', handlePointerUp);
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  };
}