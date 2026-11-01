import React, { useState, useEffect } from 'react';
import type { Location, GeoPoint } from '../core/geo';
import { generateId, LOCATION_COLORS, getNextColor } from '../core/storage';

interface LocationListProps {
  locations: Location[];
  userPosition: GeoPoint | null;
  onAddLocation: (location: Location) => void;
  onUpdateLocation: (id: string, updates: Partial<Location>) => void;
  onDeleteLocation: (id: string) => void;
  onSelectLocation: (location: Location) => void;
}

const LOCATION_TYPES = ['building', 'landmark', 'poi', 'custom'] as const;

/**
 * Location management panel - add/edit/delete locations
 */
export const LocationList: React.FC<LocationListProps> = ({
  locations,
  userPosition,
  onAddLocation,
  onUpdateLocation,
  onDeleteLocation,
  onSelectLocation,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    lat: '',
    lon: '',
    alt: '',
    color: LOCATION_COLORS[0],
    type: 'custom' as Location['type'],
  });

  const resetForm = () => {
    setFormData({
      name: '',
      lat: userPosition?.lat.toFixed(6) || '',
      lon: userPosition?.lon.toFixed(6) || '',
      alt: userPosition?.alt?.toString() || '',
      color: getNextColor(locations),
      type: 'custom',
    });
  };

  useEffect(() => {
    resetForm();
  }, [userPosition, locations]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const lat = parseFloat(formData.lat);
    const lon = parseFloat(formData.lon);
    const alt = formData.alt ? parseFloat(formData.alt) : undefined;

    if (isNaN(lat) || isNaN(lon)) {
      alert('Please enter valid coordinates');
      return;
    }

    const location: Location = {
      id: generateId(),
      name: formData.name.trim(),
      lat,
      lon,
      alt,
      color: formData.color,
      type: formData.type,
    };

    if (editingId) {
      onUpdateLocation(editingId, location);
      setEditingId(null);
    } else {
      onAddLocation(location);
    }
    resetForm();
    setIsAdding(false);
  };

  const handleEdit = (location: Location) => {
    setEditingId(location.id);
    setFormData({
      name: location.name,
      lat: location.lat.toString(),
      lon: location.lon.toString(),
      alt: location.alt?.toString() || '',
      color: location.color,
      type: location.type || 'custom',
    });
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this location?')) {
      onDeleteLocation(id);
    }
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h3 style={styles.title}>Locations ({locations.length})</h3>
        <button style={styles.addButton} onClick={() => { resetForm(); setIsAdding(true); setEditingId(null); }}>
          + Add Location
        </button>
      </div>

      {isAdding && (
        <form style={styles.form} onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label}>Name</label>
            <input
              style={styles.input}
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Location name (e.g., Golden Gate Bridge)"
              required
              autoFocus
            />
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>Latitude</label>
              <input
                style={styles.input}
                type="number"
                step="0.000001"
                value={formData.lat}
                onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                placeholder="37.8199"
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Longitude</label>
              <input
                style={styles.input}
                type="number"
                step="0.000001"
                value={formData.lon}
                onChange={(e) => setFormData({ ...formData, lon: e.target.value })}
                placeholder="-122.4783"
                required
              />
            </div>
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>Altitude (m)</label>
              <input
                style={styles.input}
                type="number"
                value={formData.alt}
                onChange={(e) => setFormData({ ...formData, alt: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Type</label>
              <select
                style={styles.select}
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as Location['type'] })}
              >
                {LOCATION_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>Color</label>
              <select
                style={styles.select}
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              >
                {LOCATION_COLORS.map(c => (
                  <option key={c} value={c} style={{ background: c, color: '#fff' }}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.formActions}>
            <button type="button" style={styles.cancelButton} onClick={() => { setIsAdding(false); setEditingId(null); }}>
              Cancel
            </button>
            <button type="submit" style={styles.saveButton}>
              {editingId ? 'Save Changes' : 'Add Location'}
            </button>
          </div>
        </form>
      )}

      <div style={styles.list}>
        {locations.length === 0 && !isAdding && (
          <p style={styles.empty}>No locations added yet. Tap "Add Location" to get started.</p>
        )}
        {locations.map(location => (
          <div key={location.id} style={styles.locationItem}>
            <div style={styles.locationInfo} onClick={() => onSelectLocation(location)}>
              <div
                style={{
                  ...styles.colorDot,
                  background: location.color,
                }}
              />
              <div style={styles.locationDetails}>
                <span style={styles.locationName}>{location.name}</span>
                <span style={styles.locationMeta}>
                  {location.type && (
                    <span style={{ ...styles.typeBadge, background: location.color }}>
                      {location.type}
                    </span>
                  )}
                  {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
                  {location.alt !== undefined && ` • ${location.alt}m`}
                </span>
              </div>
            </div>
            <div style={styles.locationActions}>
              <button
                style={styles.iconButton}
                onClick={(e) => { e.stopPropagation(); handleEdit(location); }}
                aria-label="Edit location"
              >
                ✏️
              </button>
              <button
                style={styles.iconButton}
                onClick={(e) => { e.stopPropagation(); handleDelete(location.id); }}
                aria-label="Delete location"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: '#1A1A2E',
    borderRadius: '16px 16px 0 0',
    padding: '16px',
    maxHeight: '70vh',
    overflowY: 'auto',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  addButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#FFFFFF',
    background: '#4ECDC4',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
    padding: '16px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '12px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldRow: {
    display: 'flex',
    gap: '12px',
  },
  label: {
    fontSize: '12px',
    color: '#B0B0B0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '12px',
    fontSize: '16px',
    color: '#FFFFFF',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    outline: 'none',
  },
  select: {
    padding: '12px',
    fontSize: '16px',
    color: '#FFFFFF',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
  },
  formActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#FFFFFF',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#FFFFFF',
    background: '#4ECDC4',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  empty: {
    textAlign: 'center',
    color: '#888',
    padding: '24px',
    margin: 0,
  },
  locationItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  locationInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    cursor: 'pointer',
  },
  colorDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  locationDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  locationName: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#FFFFFF',
  },
  locationMeta: {
    fontSize: '12px',
    color: '#888',
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  typeBadge: {
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: '4px',
    color: '#FFFFFF',
  },
  locationActions: {
    display: 'flex',
    gap: '8px',
  },
  iconButton: {
    padding: '8px',
    fontSize: '16px',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    opacity: 0.7,
    transition: 'opacity 0.2s',
  },
};