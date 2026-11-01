/**
 * Location/POI storage for Horizon Overlook
 * localStorage CRUD with type safety
 */

import { Location, GeoPoint } from './geo';

export type { Location, GeoPoint };

const LOCATIONS_KEY = 'horizon-overlook:locations';

export interface StorageAdapter {
  getLocations(): Location[];
  saveLocations(locations: Location[]): void;
  addLocation(location: Location): void;
  updateLocation(id: string, updates: Partial<Location>): void;
  deleteLocation(id: string): void;
}

/**
 * Default localStorage adapter
 */
export const localStorageAdapter: StorageAdapter = {
  getLocations(): Location[] {
    try {
      const stored = localStorage.getItem(LOCATIONS_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      // Validate structure
      return Array.isArray(parsed) ? parsed.filter(isValidLocation) : [];
    } catch {
      return [];
    }
  },

  saveLocations(locations: Location[]): void {
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
  },

  addLocation(location: Location): void {
    const locations = this.getLocations();
    locations.push(location);
    this.saveLocations(locations);
  },

  updateLocation(id: string, updates: Partial<Location>): void {
    const locations = this.getLocations();
    const idx = locations.findIndex(f => f.id === id);
    if (idx >= 0) {
      locations[idx] = { ...locations[idx], ...updates };
      this.saveLocations(locations);
    }
  },

  deleteLocation(id: string): void {
    const locations = this.getLocations().filter(f => f.id !== id);
    this.saveLocations(locations);
  },
};

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validate location object
 */
function isValidLocation(obj: unknown): obj is Location {
  if (!obj || typeof obj !== 'object') return false;
  const f = obj as Record<string, unknown>;
  return (
    typeof f.id === 'string' &&
    typeof f.name === 'string' &&
    typeof f.lat === 'number' &&
    typeof f.lon === 'number' &&
    typeof f.color === 'string' &&
    (f.alt === undefined || typeof f.alt === 'number') &&
    (f.type === undefined || typeof f.type === 'string')
  );
}

/**
 * Default location colors
 */
export const LOCATION_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFBE0B', // Yellow
  '#FB5607', // Orange
  '#8338EC', // Purple
  '#3A86FF', // Bright Blue
  '#06D6A0', // Green
  '#FF006E', // Pink
  '#8AC926', // Lime
];

/**
 * Get next available color
 */
export function getNextColor(existingLocations: Location[]): string {
  const used = new Set(existingLocations.map(f => f.color));
  for (const color of LOCATION_COLORS) {
    if (!used.has(color)) return color;
  }
  // Fallback: random color
  return `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
}

/**
 * Create a new location with defaults
 */
export function createLocation(
  name: string,
  position: GeoPoint,
  existingLocations: Location[] = [],
  type?: Location['type']
): Location {
  return {
    id: generateId(),
    name,
    ...position,
    color: getNextColor(existingLocations),
    type,
  };
}

/**
 * Sample locations for testing (nearby + far)
 */
export const SAMPLE_LOCATIONS: Omit<Location, 'id'>[] = [
  {
    name: 'Golden Gate Bridge',
    lat: 37.8199,
    lon: -122.4783,
    alt: 67,
    color: '#FF6B6B',
    type: 'landmark',
  },
  {
    name: 'Alcatraz Island',
    lat: 37.8270,
    lon: -122.4230,
    alt: 41,
    color: '#4ECDC4',
    type: 'landmark',
  },
  {
    name: 'Salesforce Tower',
    lat: 37.7897,
    lon: -122.3969,
    alt: 326,
    color: '#45B7D1',
    type: 'building',
  },
];