/**
 * Core geospatial math for Horizon Overlook
 * Pure TypeScript, no dependencies — fully testable
 */

export const EARTH_RADIUS_M = 6371000;
export const HORIZON_DIST_M = 100; // Fixed distance for horizon markers

export interface GeoPoint {
  lat: number;
  lon: number;
  alt?: number; // meters above sea level
}

export interface Location extends GeoPoint {
  id: string;
  name: string;
  color: string;
  type?: 'building' | 'landmark' | 'poi' | 'custom' | 'park' | 'mountain' | 'lake' | 'restaurant' | 'hotel' | 'airport' | 'station' | 'museum' | 'beach' | 'tower' | 'bridge';
}

export interface BearingDistance {
  bearing: number; // degrees, 0 = North, clockwise
  distance: number; // meters
  elevationAngle?: number; // degrees, positive = above horizon
}

/**
 * Convert degrees to radians
 */
export function deg2rad(deg: number): number {
  return deg * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
export function rad2deg(rad: number): number {
  return rad * 180 / Math.PI;
}

/**
 * Normalize angle to [0, 360)
 */
export function normalizeBearing(bearing: number): number {
  const b = bearing % 360;
  return b < 0 ? b + 360 : b;
}

/**
 * Haversine distance between two points (meters)
 */
export function haversineDistance(from: GeoPoint, to: GeoPoint): number {
  const lat1 = deg2rad(from.lat);
  const lat2 = deg2rad(to.lat);
  const dLat = deg2rad(to.lat - from.lat);
  const dLon = deg2rad(to.lon - from.lon);

  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Initial bearing from point A to point B (degrees, 0 = North)
 */
export function bearing(from: GeoPoint, to: GeoPoint): number {
  const lat1 = deg2rad(from.lat);
  const lat2 = deg2rad(to.lat);
  const dLon = deg2rad(to.lon - from.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return normalizeBearing(rad2deg(Math.atan2(y, x)));
}

/**
 * Calculate bearing and distance from user to friend
 */
export function bearingDistance(from: GeoPoint, to: GeoPoint): BearingDistance {
  return {
    bearing: bearing(from, to),
    distance: haversineDistance(from, to),
  };
}

/**
 * Horizon projection: convert GPS bearing to AR world coordinates
 *
 * In Three.js: +Z is forward (North), +X is right (East), +Y is up
 * Camera looks down -Z initially
 *
 * Bearing 0° (North) → -Z
 * Bearing 90° (East) → +X
 * Bearing 180° (South) → +Z
 * Bearing 270° (West) → -X
 *
 * @param userPosition - User's current GPS position
 * @param friendPosition - Friend's GPS position
 * @param headingOffset - Calibration offset (compass alpha - true bearing to known landmark)
 * @returns Three.js position vector components [x, y, z]
 */
export function horizonProjection(
  userPosition: GeoPoint,
  friendPosition: GeoPoint,
  headingOffset: number = 0
): { x: number; y: number; z: number; bearing: number; distance: number } {
  const { bearing: rawBearing, distance } = bearingDistance(userPosition, friendPosition);

  // Apply calibration offset
  const calibratedBearing = normalizeBearing(rawBearing - headingOffset);

  // Convert to Three.js coordinates
  // bearing 0° = North = -Z, 90° = East = +X
  const rad = deg2rad(calibratedBearing);
  const x = HORIZON_DIST_M * Math.sin(rad);  // East
  const z = -HORIZON_DIST_M * Math.cos(rad); // North (negative Z)
  const y = 0; // On horizon line

  return { x, y, z, bearing: calibratedBearing, distance };
}

/**
 * Check if a bearing is behind the camera (outside FOV)
 * @param bearing - Bearing relative to camera forward (0° = forward)
 * @param fov - Camera field of view in degrees
 * @returns true if behind camera
 */
export function isBehindCamera(bearing: number, fov: number = 90): boolean {
  const halfFov = fov / 2;
  const normalized = normalizeBearing(bearing + 180); // 0° = behind
  return normalized < halfFov || normalized > 360 - halfFov;
}

/**
 * Get screen-edge clamp position for markers behind camera
 * @param bearing - Marker bearing relative to camera
 * @returns {x, y} normalized screen coordinates (-1 to 1)
 */
export function getEdgeIndicatorPosition(bearing: number): { x: number; y: number } {
  const rad = deg2rad(normalizeBearing(bearing));
  return {
    x: Math.sin(rad),
    y: -Math.cos(rad),
  };
}

/**
 * Elevation angle from user to friend (degrees)
 * Positive = friend is above user
 */
export function elevationAngle(from: GeoPoint, to: GeoPoint): number {
  const distance = haversineDistance(from, to);
  const altFrom = from.alt ?? 0;
  const altTo = to.alt ?? 0;
  const altDiff = altTo - altFrom;

  if (distance === 0) return 0;
  return rad2deg(Math.atan2(altDiff, distance));
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}