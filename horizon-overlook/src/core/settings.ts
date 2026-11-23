/**
 * Settings storage for Horizon Overlook
 * Manages user preferences in localStorage
 */

const SETTINGS_KEY = 'horizon-overlook:settings';

export interface CompassSettings {
  /** 'fixed' = N/E/S/W fixed, pointer rotates | 'dynamic' = wheel spins, pointer fixed at top */
  compassMode: 'fixed' | 'dynamic';
}

export interface AppSettings {
  compass: CompassSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  compass: {
    compassMode: 'fixed', // Default to fixed wheel with rotating pointer
  },
};

/**
 * Load settings from localStorage
 */
export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored);
    // Merge with defaults to handle new settings
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      compass: {
        ...DEFAULT_SETTINGS.compass,
        ...(parsed.compass || {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Update a specific setting
 */
export function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): AppSettings {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

/**
 * Get a specific setting
 */
export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const settings = loadSettings();
  return settings[key];
}