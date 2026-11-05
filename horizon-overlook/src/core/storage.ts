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
    name: 'TelAviv ToHa2',
    lat: 32.0724238,
    lon: 34.7962598,
    alt: 150,
    color: '#FF6B6B',
    type: 'building',
  },
  {
    name: 'KFS Water Tower',
    lat: 32.184258,
    lon: 34.9103777,
    alt: 80,
    color: '#4ECDC4',
    type: 'landmark',
  },
  {
    name: 'Sharonim Mall',
    lat: 32.132263,
    lon: 34.903191,
    alt: 50,
    color: '#45B7D1',
    type: 'building',
  },
  {
    name: 'Antipatris Fort',
    lat: 32.105094,
    lon: 34.9304287,
    alt: 70,
    color: '#FFBE0B',
    type: 'landmark',
  },
  {
    name: 'Menivim Tower',
    lat: 32.173583501562206,
    lon: 34.891439377458674,
    alt: 100,
    color: '#FB5607',
    type: 'building',
  },
  {
    name: 'Migdal Tsedek',
    lat: 32.0810141,
    lon: 34.9575718,
    alt: 250,
    color: '#FB5607',
    type: 'building',
  },
  {
    name: 'Reading Power Station',
    lat: 32.10547791636009,
    lon: 34.77893655386753,
    alt: 30,
    color: '#8338EC',
    type: 'landmark',
  },
  {
    name: "Andromeda's Rock",
    lat: 32.05615249585027,
    lon: 34.75081837867895,
    alt: 10,
    color: '#3A86FF',
    type: 'landmark',
  },
  {
    name: 'Ariel Sharon Park',
    lat: 32.030747601022235,
    lon: 34.821610185523795,
    alt: 50,
    color: '#06D6A0',
    type: 'park',
  },
  {
    name: 'Surf Park Lagoona',
    lat: 32.04203563698836,
    lon: 34.807756528580654,
    alt: 10,
    color: '#FF006E',
    type: 'park',
  },
  {
    name: 'Kikar Levana',
    lat: 32.059469318700486,
    lon: 34.805666539324704,
    alt: 40,
    color: '#8AC926',
    type: 'poi',
  },
  {
    name: 'Migdal Atidim',
    lat: 32.115486405472986,
    lon: 34.84288194619571,
    alt: 100,
    color: '#FF6B6B',
    type: 'building',
  },
];