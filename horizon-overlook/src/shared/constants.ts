/**
 * Shared constants for Horizon Overlook
 */

export const HORIZON_DIST_M = 100;
export const GPS_UPDATE_INTERVAL_MS = 1000;
export const COMPASS_SMOOTHING_MS = 200;
export const MARKER_SMOOTHING_MS = 200;
export const CALIBRATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MIN_FRIEND_DISTANCE_M = 100;
export const MAX_GPS_ACCURACY_M = 50;

export const FRIEND_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFBE0B',
  '#FB5607',
  '#8338EC',
  '#3A86FF',
  '#06D6A0',
  '#FF006E',
  '#8AC926',
] as const;

export const STORAGE_KEYS = {
  FRIENDS: 'horizon-overlook:friends',
  CALIBRATION: 'horizon-overlook:calibration',
} as const;

export const WEBXR_REQUIRED_FEATURES = ['camera-access', 'local-floor'] as const;
export const WEBXR_OPTIONAL_FEATURES = ['hit-test', 'light-estimation'] as const;