/**
 * Calibration logic for Horizon Overlook Simple
 * Handles compass offset computation and persistence
 */

import { bearing, normalizeBearing } from './geo.js';

const CALIBRATION_KEY = 'horizon-overlook:calibration';

export function computeHeadingOffset(compassAlpha, userPosition, landmarkPosition) {
  const trueBearing = bearing(userPosition, landmarkPosition);
  const offset = normalizeBearing(compassAlpha - trueBearing);
  return offset;
}

export function applyOffset(rawBearing, offset) {
  return normalizeBearing(rawBearing - offset);
}

export function saveCalibration(data) {
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(data));
}

export function loadCalibration() {
  try {
    const stored = localStorage.getItem(CALIBRATION_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function clearCalibration() {
  localStorage.removeItem(CALIBRATION_KEY);
}

export function hasValidCalibration(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cal = loadCalibration();
  if (!cal) return false;
  return Date.now() - cal.calibratedAt < maxAgeMs;
}