/**
 * Core geospatial math for Viewfinder
 * Pure JavaScript ES module, no dependencies
 */

export const EARTH_RADIUS_M = 6371000;
export const HORIZON_DIST_M = 100; // Fixed distance for horizon markers

export function deg2rad(deg) {
  return deg * Math.PI / 180;
}

export function rad2deg(rad) {
  return rad * 180 / Math.PI;
}

export function normalizeBearing(bearing) {
  const b = bearing % 360;
  return b < 0 ? b + 360 : b;
}

export function haversineDistance(from, to) {
  const lat1 = deg2rad(from.lat);
  const lat2 = deg2rad(to.lat);
  const dLat = deg2rad(to.lat - from.lat);
  const dLon = deg2rad(to.lon - from.lon);

  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

export function bearing(from, to) {
  const lat1 = deg2rad(from.lat);
  const lat2 = deg2rad(to.lat);
  const dLon = deg2rad(to.lon - from.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return normalizeBearing(rad2deg(Math.atan2(y, x)));
}

export function bearingDistance(from, to) {
  return {
    bearing: bearing(from, to),
    distance: haversineDistance(from, to),
  };
}

export function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}