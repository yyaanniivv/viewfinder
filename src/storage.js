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
    lat: 32.0724238,
    lon: 34.7962598,
    color: '#FF6B6B',
    type: 'building',
  },
  {
    name: 'KFS Water Tower',
    lat: 32.184258,
    lon: 34.9103777,
    color: '#4ECDC4',
    type: 'landmark',
    hidden: true,
  },
  {
    name: 'Sharonim Mall',
    lat: 32.132263,
    lon: 34.903191,
    color: '#45B7D1',
    type: 'building',
    hidden: true,
  },
  {
    name: 'Antipatris Fort',
    lat: 32.105094,
    lon: 34.9304287,
    color: '#FFBE0B',
    type: 'landmark',
    hidden: true,
  },
  {
    name: 'Menivim Tower',
    lat: 32.173583501562206,
    lon: 34.891439377458674,
    color: '#FB5607',
    type: 'building',
    hidden: true,
  },
  {
    name: 'Migdal Tsedek',
    lat: 32.0810141,
    lon: 34.9575718,
    color: '#FB5607',
    type: 'building',
  },
  {
    name: 'Reading Power Station',
    lat: 32.10547791636009,
    lon: 34.77893655386753,
    color: '#8338EC',
    type: 'landmark',
  },
  {
    name: "Andromeda's Rock",
    lat: 32.05615249585027,
    lon: 34.75081837867895,
    color: '#3A86FF',
    type: 'landmark',
  },
  {
    name: 'Ariel Sharon Park',
    lat: 32.030747601022235,
    lon: 34.821610185523795,
    color: '#06D6A0',
    type: 'park',
  },
  {
    name: 'Surf Park Lagoona',
    lat: 32.04203563698836,
    lon: 34.807756528580654,
    color: '#FF006E',
    type: 'park',
  },
  {
    name: 'Kikar Levana',
    lat: 32.059469318700486,
    lon: 34.805666539324704,
    color: '#8AC926',
    type: 'landmark',
  },
  {
    name: 'Migdal Atidim',
    lat: 32.115486405472986,
    lon: 34.84288194619571,
    color: '#FF6B6B',
    type: 'building',
  },
  {
    name: 'BIG Fashion',
    lat: 32.14868551856639,
    lon: 34.80560336797036,
    color: '#4ECDC4',
    type: 'building',
  }
];