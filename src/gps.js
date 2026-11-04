/**
 * GPS tracking for Viewfinder
 * Uses navigator.geolocation.watchPosition, throttled to a configurable rate
 */

export function startGPS(onPositionChange, onError, options = {}) {
  if (!('geolocation' in navigator)) {
    onError?.('Geolocation not supported');
    return null;
  }

  let { updateRateMs = 10000 } = options;
  let lastEmit = 0;
  let stopped = false;
  let watchId = null;

  const options_ = {
    enableHighAccuracy: true,
    maximumAge: updateRateMs, // allow cached fixes up to our rate
    timeout: 20000,
  };

  const emit = (pos) => {
    const now = Date.now();
    // Throttle: pass through at most one update per rate window.
    // The first fix always passes so the UI isn't blank on start.
    if (lastEmit !== 0 && now - lastEmit < updateRateMs) return;
    lastEmit = now;
    onPositionChange({
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      alt: pos.coords.altitude ?? null,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp,
    });
  };

  const handleError = (err) => {
    // Code 1 = permission denied: fatal for this watch, surface it.
    // Code 3 = timeout: keep waiting, the watch may still deliver.
    if (err.code === 1) {
      onError?.(`GPS error: ${err.message}`);
    }
  };

  watchId = navigator.geolocation.watchPosition(emit, handleError, options_);

  return {
    stop: () => {
      stopped = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    },
    /** Change the throttle window and restart the watch cleanly. */
    setUpdateRate: (rateMs) => {
      updateRateMs = rateMs;
      options_.maximumAge = rateMs;
      lastEmit = 0; // next fix passes immediately
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (!stopped) {
        watchId = navigator.geolocation.watchPosition(emit, handleError, options_);
      }
      return watchId;
    },
    getUpdateRate: () => updateRateMs,
  };
}
