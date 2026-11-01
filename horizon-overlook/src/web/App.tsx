import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARCanvas } from './ARCanvas';
import { CompassRing } from './CompassRing';
import { CalibrationOverlay } from './CalibrationOverlay';
import { LocationList } from './LocationList';
import { Location, GeoPoint, bearingDistance, normalizeBearing, formatDistance } from '../core/geo';
import { loadCalibration, hasValidCalibration } from '../core/calibration';
import { localStorageAdapter, generateId, SAMPLE_LOCATIONS } from '../core/storage';
import { CONFIG } from '../shared/types';

/**
 * Main Horizon Overlook Web App
 * Handles GPS, compass, AR session, calibration, and location management
 */
const App: React.FC = () => {
  // Core state
  const [userPosition, setUserPosition] = useState<GeoPoint | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [compassAlpha, setCompassAlpha] = useState<number | null>(null);
  const [compassAbsolute, setCompassAbsolute] = useState(false);
  const [headingOffset, setHeadingOffset] = useState(0);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isARActive, setIsARActive] = useState(false);

  // UI state
  const [showCalibration, setShowCalibration] = useState(false);
  const [showLocationList, setShowLocationList] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs for smoothing
  const smoothedHeadingRef = useRef(0);
  const lastCompassTimeRef = useRef(0);

  // Initialize: load locations, check calibration
  useEffect(() => {
    // Load locations from localStorage
    const storedLocations = localStorageAdapter.getLocations();
    if (storedLocations.length > 0) {
      setLocations(storedLocations);
    } else {
      // Add sample locations for testing
      const samples = SAMPLE_LOCATIONS.map(f => ({ ...f, id: generateId() }));
      localStorageAdapter.saveLocations(samples);
      setLocations(samples);
    }

    // Check for existing calibration
    const cal = loadCalibration();
    if (cal && hasValidCalibration()) {
      setHeadingOffset(cal.headingOffset);
      setIsCalibrated(true);
    } else {
      // Auto-show calibration on first load
      setTimeout(() => setShowCalibration(true), 1000);
    }
  }, []);

  // GPS tracking
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          alt: pos.coords.altitude ?? undefined,
        });
        setGpsAccuracy(pos.coords.accuracy);
        setError(null);
      },
      (err) => {
        setError(`GPS error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Compass (DeviceOrientation) - with iOS permission handling
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null) return;

      const now = Date.now();
      // Throttle to ~10Hz
      if (now - lastCompassTimeRef.current < 100) return;
      lastCompassTimeRef.current = now;

      const alpha = event.alpha; // 0° = North (if absolute)
      const absolute = event.absolute;

      setCompassAlpha(alpha);
      setCompassAbsolute(absolute);

      // Smooth the heading
      if (isCalibrated) {
        const rawHeading = normalizeBearing(alpha - headingOffset);
        const diff = normalizeBearing(rawHeading - smoothedHeadingRef.current);
        const shortestDiff = diff > 180 ? diff - 360 : diff;
        smoothedHeadingRef.current = normalizeBearing(
          smoothedHeadingRef.current + shortestDiff * 0.2
        );
      } else {
        smoothedHeadingRef.current = alpha;
      }
    };

    // Request permission on iOS 13+
    const requestPermissionAndListen = async () => {
      if ('DeviceOrientationEvent' in window &&
          typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const state = await (DeviceOrientationEvent as any).requestPermission();
          if (state === 'granted') {
            window.addEventListener('deviceorientationabsolute', handleOrientation);
          } else {
            setError('Motion permission denied. Please enable in Settings > Safari > Motion & Orientation Access.');
          }
        } catch (e) {
          console.error('Permission request failed:', e);
          setError('Failed to request motion permission');
        }
      } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation);
      }
    };

    requestPermissionAndListen();

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
    };
  }, [headingOffset, isCalibrated]);

  // Location CRUD handlers
  const handleAddLocation = useCallback((location: Location) => {
    const newLocations = [...locations, location];
    setLocations(newLocations);
    localStorageAdapter.saveLocations(newLocations);
  }, [locations]);

  const handleUpdateLocation = useCallback((id: string, updates: Partial<Location>) => {
    const newLocations = locations.map(f => f.id === id ? { ...f, ...updates } : f);
    setLocations(newLocations);
    localStorageAdapter.saveLocations(newLocations);
  }, [locations]);

  const handleDeleteLocation = useCallback((id: string) => {
    const newLocations = locations.filter(f => f.id !== id);
    setLocations(newLocations);
    localStorageAdapter.saveLocations(newLocations);
  }, [locations]);

  const handleCalibrated = useCallback((offset: number) => {
    setHeadingOffset(offset);
    setIsCalibrated(true);
    setShowCalibration(false);
  }, []);

  const handleSelectLocation = useCallback((location: Location) => {
    setSelectedLocation(location);
    // Could auto-center AR view on this location
  }, []);

  // Computed calibrated heading for UI
  const calibratedHeading = isCalibrated && compassAlpha !== null
    ? normalizeBearing(compassAlpha - headingOffset)
    : compassAlpha ?? 0;

  // Check if we need figure-8 calibration (iOS)
  const needsFigure8 = !compassAbsolute && !isCalibrated;

  return (
    <div className="app">
      {/* AR Canvas - full screen */}
      <ARCanvas
        locations={locations}
        userPosition={userPosition}
        userHeading={smoothedHeadingRef.current}
        isCalibrated={isCalibrated}
        onMarkerSelect={handleSelectLocation}
      />

      {/* Top UI: Compass + Status */}
      <div className="top-bar">
        <CompassRing
          heading={calibratedHeading}
          isCalibrated={isCalibrated}
          calibrationProgress={needsFigure8 ? calibrationProgress : undefined}
        />

        <div className="status-indicators">
          <div className={`gps-status ${gpsAccuracy !== null && gpsAccuracy < CONFIG.MAX_GPS_ACCURACY_M ? 'good' : 'warn'}`}>
            📍 GPS: {gpsAccuracy ? `${Math.round(gpsAccuracy)}m` : '—'}
          </div>
          <div className={`compass-status ${compassAbsolute ? 'good' : 'warn'}`}>
            🧭 {compassAbsolute ? 'Absolute' : 'Relative'}
          </div>
        </div>
      </div>

      {/* Bottom: Location List Panel */}
      <LocationList
        locations={locations}
        userPosition={userPosition}
        onAddLocation={handleAddLocation}
        onUpdateLocation={handleUpdateLocation}
        onDeleteLocation={handleDeleteLocation}
        onSelectLocation={handleSelectLocation}
      />

      {/* Calibration Overlay */}
      <CalibrationOverlay
        isOpen={showCalibration}
        onClose={() => setShowCalibration(false)}
        userPosition={userPosition}
        compassAlpha={compassAlpha}
        locations={locations}
        onCalibrated={handleCalibrated}
      />

      {/* Selected Location Info Toast */}
      {selectedLocation && userPosition && (
        <div className="location-toast">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%',
              background: selectedLocation.color
            }} />
            <strong>{selectedLocation.name}</strong>
            {selectedLocation.type && (
              <span style={{ fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>
                • {selectedLocation.type}
              </span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#BBB' }}>
            {formatDistance(bearingDistance(userPosition, selectedLocation).distance)} away
          </div>
          <button onClick={() => setSelectedLocation(null)} style={styles.closeButton}>×</button>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="error-toast">{error}</div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0 8px',
  },
};

export default App;