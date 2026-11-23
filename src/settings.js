/**
 * Settings storage for Viewfinder
 * Manages user preferences in localStorage
 */

const SETTINGS_KEY = 'viewfinder:settings';

export function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return getDefaultSettings();
    const parsed = JSON.parse(stored);
    // Merge with defaults to handle new settings
    return {
      ...getDefaultSettings(),
      ...parsed,
    };
  } catch {
    return getDefaultSettings();
  }
}

function getDefaultSettings() {
  return {
    compassMode: 'fixed', // 'fixed' = N/E/S/W fixed, pointer rotates | 'dynamic' = wheel spins, pointer fixed at top
  };
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

export function getSetting(key) {
  const settings = loadSettings();
  return settings[key];
}