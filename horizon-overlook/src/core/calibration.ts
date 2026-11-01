/**
 * Heading calibration logic for Horizon Overlook
 * Handles compass offset computation and persistence
 */

import { GeoPoint, bearing, normalizeBearing } from './geo';

export type { GeoPoint };

const CALIBRATION_KEY = 'horizon-overlook:calibration';

export interface CalibrationData {
  headingOffset: number; // degrees: compass alpha - true bearing
  calibratedAt: number; // timestamp
  landmarkName?: string;
  landmarkPosition?: GeoPoint;
}

/**
 * Compute heading offset from compass reading and known landmark
 * @param compassAlpha - Current compass heading (0° = North)
 * @param userPosition - User's GPS position
 * @param landmarkPosition - Known landmark's GPS position
 * @returns headingOffset to apply to all bearings
 */
export function computeHeadingOffset(
  compassAlpha: number,
  userPosition: GeoPoint,
  landmarkPosition: GeoPoint
): number {
  const trueBearing = bearing(userPosition, landmarkPosition);
  const offset = normalizeBearing(compassAlpha - trueBearing);
  return offset;
}

/**
 * Apply heading offset to a raw bearing
 */
export function applyOffset(rawBearing: number, offset: number): number {
  return normalizeBearing(rawBearing - offset);
}

/**
 * Save calibration to localStorage
 */
export function saveCalibration(data: CalibrationData): void {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(data));
}

/**
 * Load calibration from localStorage
 */
export function loadCalibration(): CalibrationData | null {
  try {
    const stored = localStorage.getItem(CALIBRATION_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Clear calibration
 */
export function clearCalibration(): void {
  localStorage.removeItem(CALIBRATION_KEY);
}

/**
 * Check if calibration exists and is recent (within 24 hours)
 */
export function hasValidCalibration(maxAgeMs: number = 24 * 60 * 60 * 1000): boolean {
  const cal = loadCalibration();
  if (!cal) return false;
  return Date.now() - cal.calibratedAt < maxAgeMs;
}