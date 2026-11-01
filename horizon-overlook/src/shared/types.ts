/**
 * Shared types for Horizon Overlook
 */

import { GeoPoint, Location } from '../core/geo';

// Re-export core types
export type { GeoPoint, Location };

/**
 * App state shared between web and native
 */
export interface AppState {
  userPosition: GeoPoint | null;
  userHeading: number; // degrees, calibrated
  headingOffset: number;
  isCalibrated: boolean;
  locations: Location[];
  isARActive: boolean;
  gpsAccuracy: number | null;
}

/**
 * AR session state
 */
export interface ARSessionState {
  isActive: boolean;
  cameraTexture: unknown | null; // Three.js texture
  session: unknown | null; // XRSession
  frame: unknown | null; // XRFrame
}

/**
 * Compass reading
 */
export interface CompassReading {
  alpha: number; // 0° = North (absolute)
  beta: number; // front-to-back tilt
  gamma: number; // left-to-right tilt
  absolute: boolean;
  timestamp: number;
}

/**
 * Configuration constants
 */
export const CONFIG = {
  HORIZON_DIST_M: 100,
  GPS_UPDATE_INTERVAL_MS: 1000,
  COMPASS_SMOOTHING_MS: 200,
  MARKER_SMOOTHING_MS: 200,
  CALIBRATION_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  MIN_FRIEND_DISTANCE_M: 100, // Only show friends > 100m in horizon mode
  MAX_GPS_ACCURACY_M: 50, // Warn if accuracy worse than this
} as const;