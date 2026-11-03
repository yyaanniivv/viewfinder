/**
 * Location storage for Viewfinder
 * localStorage CRUD with type safety
 */

const LOCATIONS_KEY = 'viewfinder:locations';

export const LOCATION_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFBE0B', '#FB5607',
  '#8338EC', '#3A86FF', '#06D6A0', '#FF006E', '#8AC926',
];

// Emoji mapping for location types
export const LOCATION_TYPE_EMOJIS = {
  building: '🏢',
  landmark: '🗼',
  poi: '📍',
  custom: '⭐',
  mountain: '⛰️',
  lake: '🏞️',
  park: '🌳',
  restaurant: '🍽️',
  hotel: '🏨',
  airport: '✈️',
  station: '🚉',
  museum: '🏛️',
  beach: '🏖️',
  tower: '🗼',
  bridge: '🌉',
  default: '📍',
};

export function getTypeEmoji(type) {
  return LOCATION_TYPE_EMOJIS[type] || LOCATION_TYPE_EMOJIS.default;
}

export const LOCATION_TYPES = [
  { value: 'building', label: 'Building', emoji: '🏢' },
  { value: 'landmark', label: 'Landmark', emoji: '🗼' },
  { value: 'poi', label: 'Point of Interest', emoji: '📍' },
  { value: 'mountain', label: 'Mountain', emoji: '⛰️' },
  { value: 'lake', label: 'Lake', emoji: '🏞️' },
  { value: 'park', label: 'Park', emoji: '🌳' },
  { value: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { value: 'hotel', label: 'Hotel', emoji: '🏨' },
  { value: 'airport', label: 'Airport', emoji: '✈️' },
  { value: 'station', label: 'Station', emoji: '🚉' },
  { value: 'museum', label: 'Museum', emoji: '🏛️' },
  { value: 'beach', label: 'Beach', emoji: '🏖️' },
  { value: 'tower', label: 'Tower', emoji: '🗼' },
  { value: 'bridge', label: 'Bridge', emoji: '🌉' },
  { value: 'custom', label: 'Custom', emoji: '⭐' },
];

export function getLocations() {
  try {
    const stored = localStorage.getItem(LOCATIONS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isValidLocation) : [];
  } catch {
    return [];
  }
}

export function saveLocations(locations) {
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
}

export function addLocation(location) {
  const locations = getLocations();
  locations.push(location);
  saveLocations(locations);
}

export function updateLocation(id, updates) {
  const locations = getLocations();
  const idx = locations.findIndex(l => l.id === id);
  if (idx >= 0) {
    locations[idx] = { ...locations[idx], ...updates };
    saveLocations(locations);
  }
}

export function deleteLocation(id) {
  const locations = getLocations().filter(l => l.id !== id);
  saveLocations(locations);
}

function isValidLocation(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const l = obj;
  return (
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    typeof l.lat === 'number' &&
    typeof l.lon === 'number' &&
    typeof l.color === 'string' &&
    (l.alt === undefined || typeof l.alt === 'number') &&
    (l.type === undefined || typeof l.type === 'string')
  );
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getNextColor(existingLocations) {
  const used = new Set(existingLocations.map(l => l.color));
  for (const color of LOCATION_COLORS) {
    if (!used.has(color)) return color;
  }
  return `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
}

export function createLocation(name, position, existingLocations = [], type) {
  return {
    id: generateId(),
    name,
    ...position,
    color: getNextColor(existingLocations),
    type,
  };
}

export const SAMPLE_LOCATIONS = [
  {
    name: 'TelAviv ToHa2',
    lat: 32.068444,
    lon: 34.784437,
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
    lat: 32.13226,
    lon: 34.9052418,
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
];