import React, { useState, useEffect } from 'react';
import { GeoPoint, bearing } from '../core/geo';
import { computeHeadingOffset, saveCalibration, type CalibrationData } from '../core/calibration';
import type { Location } from '../core/storage';

interface CalibrationOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  userPosition: GeoPoint | null;
  compassAlpha: number | null;
  locations: Location[];
  onCalibrated: (offset: number) => void;
}

/**
 * Calibration overlay - point at known landmark to calibrate compass
 */
export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({
  isOpen,
  onClose,
  userPosition,
  compassAlpha,
  locations,
  onCalibrated,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [instruction, setInstruction] = useState('Select a location you can see, then point your phone at it and tap "Calibrate"');
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calibrationResult, setCalibrationResult] = useState<{
    offset: number;
    userLat: number;
    userLon: number;
    timestamp: number;
  } | null>(null);

  // Auto-select first location if available
  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
  }, [locations, selectedLocation]);

  const handleCalibrate = () => {
    if (!userPosition || compassAlpha === null || !selectedLocation) {
      setError('Need GPS position, compass reading, and a selected location');
      return;
    }

    setIsCalibrating(true);
    setError(null);
    setCalibrationResult(null);

    try {
      const offset = computeHeadingOffset(compassAlpha, userPosition, selectedLocation);
      const now = Date.now();

      const calData: CalibrationData = {
        headingOffset: offset,
        calibratedAt: now,
        landmarkName: selectedLocation.name,
        landmarkPosition: selectedLocation,
      };

      saveCalibration(calData);
      onCalibrated(offset);

      // Show calibration result with user location and timestamp
      setCalibrationResult({
        offset,
        userLat: userPosition.lat,
        userLon: userPosition.lon,
        timestamp: now,
      });
      setInstruction(`Calibrated using ${selectedLocation.name}! Offset: ${offset.toFixed(1)}°`);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calibration failed');
    } finally {
      setIsCalibrating(false);
    }
  };

  if (!isOpen) return null;

  const bearingToLocation = userPosition && selectedLocation
    ? bearing(userPosition, selectedLocation).toFixed(1)
    : '—';

  // Format timestamp
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <h2 style={styles.title}>Compass Calibration</h2>

        <p style={styles.instruction}>{instruction}</p>

        {/* Location selector */}
        <div style={styles.friendSelector}>
          <label style={styles.label}>Visible Location:</label>
          <select
            style={styles.select}
            value={selectedLocation?.id || ''}
            onChange={(e) => {
              const location = locations.find(f => f.id === e.target.value);
              setSelectedLocation(location || null);
            }}
            disabled={isCalibrating}
          >
            {locations.map(f => (
              <option key={f.id} value={f.id} style={{ color: f.color }}>
                {f.name} {f.type && `(${f.type})`}
              </option>
            ))}
          </select>
        </div>

        {/* Status info */}
        <div style={styles.statusGrid}>
          <div style={styles.statusItem}>
            <span style={styles.statusLabel}>Compass Heading</span>
            <span style={styles.statusValue}>
              {compassAlpha !== null ? `${compassAlpha.toFixed(1)}°` : '—'}
            </span>
          </div>
          <div style={styles.statusItem}>
            <span style={styles.statusLabel}>True Bearing to {selectedLocation?.name}</span>
            <span style={styles.statusValue}>{bearingToLocation}°</span>
          </div>
          <div style={styles.statusItem}>
            <span style={styles.statusLabel}>GPS Accuracy</span>
            <span style={styles.statusValue}>
              {userPosition ? 'Available' : 'Waiting...'}
            </span>
          </div>
        </div>

        {/* Calibration result with user location */}
        {calibrationResult && (
          <div style={styles.resultBox}>
            <h3 style={styles.resultTitle}>Calibration Successful</h3>
            <div style={styles.resultGrid}>
              <div style={styles.resultItem}>
                <span style={styles.resultLabel}>Compass Offset</span>
                <span style={styles.resultValue}>{calibrationResult.offset.toFixed(2)}°</span>
              </div>
              <div style={styles.resultItem}>
                <span style={styles.resultLabel}>Your Latitude</span>
                <span style={styles.resultValue}>{calibrationResult.userLat.toFixed(6)}°</span>
              </div>
              <div style={styles.resultItem}>
                <span style={styles.resultLabel}>Your Longitude</span>
                <span style={styles.resultValue}>{calibrationResult.userLon.toFixed(6)}°</span>
              </div>
              <div style={styles.resultItem}>
                <span style={styles.resultLabel}>Calibrated At</span>
                <span style={styles.resultValue}>{formatTime(calibrationResult.timestamp)}</span>
              </div>
              <div style={styles.resultItem}>
                <span style={styles.resultLabel}>Landmark</span>
                <span style={styles.resultValue}>{selectedLocation?.name}</span>
              </div>
              <div style={styles.resultItem}>
                <span style={styles.resultLabel}>True Bearing</span>
                <span style={styles.resultValue}>{bearingToLocation}°</span>
              </div>
            </div>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.buttonRow}>
          <button
            style={styles.cancelButton}
            onClick={onClose}
            disabled={isCalibrating}
          >
            Cancel
          </button>
          <button
            style={styles.calibrateButton}
            onClick={handleCalibrate}
            disabled={isCalibrating || !userPosition || compassAlpha === null || !selectedLocation}
          >
            {isCalibrating ? 'Calibrating...' : 'Calibrate Now'}
          </button>
        </div>

        <p style={styles.hint}>
          Tip: Stand still, point phone directly at the location, hold steady, then tap Calibrate.
        </p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '20px',
  },
  panel: {
    background: '#1A1A2E',
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '400px',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  title: {
    margin: '0 0 16px',
    fontSize: '22px',
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  instruction: {
    margin: '0 0 20px',
    fontSize: '15px',
    color: '#B0B0B0',
    lineHeight: 1.5,
    textAlign: 'center',
  },
  friendSelector: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#B0B0B0',
  },
  select: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    color: '#FFFFFF',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    appearance: 'none',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '20px',
    padding: '16px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '8px',
  },
  statusItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statusLabel: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statusValue: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
  error: {
    margin: '0 0 16px',
    padding: '12px',
    fontSize: '14px',
    color: '#FF6B6B',
    background: 'rgba(255,107,107,0.15)',
    borderRadius: '8px',
    textAlign: 'center',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  cancelButton: {
    flex: 1,
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#FFFFFF',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  calibrateButton: {
    flex: 1,
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#FFFFFF',
    background: '#4ECDC4',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  hint: {
    margin: '16px 0 0',
    fontSize: '13px',
    color: '#888',
    textAlign: 'center',
  },
  resultBox: {
    marginTop: '16px',
    padding: '16px',
    background: 'rgba(78, 205, 196, 0.15)',
    border: '1px solid rgba(78, 205, 196, 0.3)',
    borderRadius: '8px',
  },
  resultTitle: {
    margin: '0 0 12px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#4ECDC4',
    textAlign: 'center',
  },
  resultGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  resultItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  resultLabel: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  resultValue: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#FFFFFF',
    fontFamily: 'monospace',
  },
};