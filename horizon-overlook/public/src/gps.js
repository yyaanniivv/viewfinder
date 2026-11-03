/**
 * GPS tracking for Horizon Overlook Simple
 * Uses navigator.geolocation.watchPosition
 */

export function startGPS(onPositionChange, onError) {
  if (!('geolocation' in navigator)) {
    onError?.('Geolocation not supported');
    return null;
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onPositionChange({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        alt: pos.coords.altitude ?? null,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
    },
    (err) => {
      onError?.(`GPS error: ${err.message}`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    }
  );

  return {
    stop: () => navigator.geolocation.clearWatch(watchId),
  };
}