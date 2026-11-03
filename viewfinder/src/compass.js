/**
 * Compass heading for Viewfinder - tries OrientationSensor API first (modern, absolute heading + level detection)
 * Falls back to DeviceOrientation API for iOS/unsupported browsers
 */

export function startCompass(onHeadingChange, options = {}) {
  let { updateRate = 100 } = options;
  let hasPermission = false;
  let lastUpdate = 0;
  let sensor = null;
  let sensorSupported = false;

  // Try modern OrientationSensor API first
  const tryOrientationSensor = async () => {
    if (typeof AbsoluteOrientationSensor === 'undefined' &&
        typeof RelativeOrientationSensor === 'undefined') {
      return false;
    }

    try {
      // Try absolute first (true north)
      sensor = new AbsoluteOrientationSensor({
        frequency: 1000 / updateRate,
        referenceFrame: 'device'
      });

      sensor.onreading = () => {
        const now = Date.now();
        if (now - lastUpdate < updateRate) return;
        lastUpdate = now;

        // Get quaternion: [x, y, z, w]
        const quaternion = sensor.quaternion;
        if (!quaternion) return;

        // Convert quaternion to Euler angles (heading, pitch, roll)
        const { heading, pitch, roll } = quaternionToEuler(quaternion);

        onHeadingChange({
          alpha: heading,           // 0° = true North (absolute)
          beta: pitch,              // front-to-back tilt (-180 to 180)
          gamma: roll,              // left-to-right tilt (-90 to 90)
          absolute: true,           // always absolute with this sensor
          isLevel: Math.abs(pitch) < 5 && Math.abs(roll) < 5, // level if pitch/roll < 5°
          timestamp: Date.now(),
        });
      };

      sensor.onerror = (err) => {
        console.warn('[Compass] AbsoluteOrientationSensor error:', err.message);
        // Try relative orientation sensor
        tryRelativeOrientationSensor();
      };

      sensor.start();
      sensorSupported = true;
      console.log('[Compass] Using AbsoluteOrientationSensor (modern API)');
      return true;
    } catch (err) {
      console.log('[Compass] AbsoluteOrientationSensor not available:', err.message);
      return tryRelativeOrientationSensor();
    }
  };

  const tryRelativeOrientationSensor = async () => {
    if (typeof RelativeOrientationSensor === 'undefined') return false;

    try {
      sensor = new RelativeOrientationSensor({
        frequency: 1000 / updateRate,
        referenceFrame: 'device'
      });

      sensor.onreading = () => {
        const now = Date.now();
        if (now - lastUpdate < updateRate) return;
        lastUpdate = now;

        const quaternion = sensor.quaternion;
        if (!quaternion) return;

        const { heading, pitch, roll } = quaternionToEuler(quaternion);

        onHeadingChange({
          alpha: heading,           // relative heading (0° = arbitrary)
          beta: pitch,
          gamma: roll,
          absolute: false,
          isLevel: Math.abs(pitch) < 5 && Math.abs(roll) < 5,
          timestamp: Date.now(),
        });
      };

      sensor.onerror = (err) => {
        console.warn('[Compass] RelativeOrientationSensor error:', err.message);
      };

      sensor.start();
      sensorSupported = true;
      console.log('[Compass] Using RelativeOrientationSensor (modern API)');
      return true;
    } catch (err) {
      console.log('[Compass] RelativeOrientationSensor not available:', err.message);
      return false;
    }
  };

  // Fallback: DeviceOrientation API (iOS Safari, older browsers)
  const fallbackDeviceOrientation = () => {
    let hasPermission = false;
    let lastAbsoluteAt = 0; // dedupe: absolute events win over relative ones

    /**
     * Extract the best available heading from a DeviceOrientation event.
     *
     * Priority:
     * 1. iOS `webkitCompassHeading` — magnetometer true-north heading
     *    (absolute). iOS Safari never fires `deviceorientationabsolute`
     *    and its `alpha` is relative, so this is the ONLY way to get an
     *    absolute bearing on iOS.
     * 2. `deviceorientationabsolute` event alpha — absolute heading
     *    (Android Chrome without the sensor API).
     * 3. `deviceorientation` alpha — relative heading (last resort).
     */
    const extractHeading = (event) => {
      if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        return { heading: event.webkitCompassHeading, absolute: true, source: 'webkitCompassHeading' };
      }
      if (event.absolute === true && event.alpha !== null) {
        return { heading: event.alpha, absolute: true, source: 'absolute-event' };
      }
      return { heading: event.alpha, absolute: false, source: 'relative-event' };
    };

    const emitHeading = (event) => {
      const { heading, absolute, source } = extractHeading(event);
      if (heading === null || heading === undefined) return;

      // Dedupe: when both event types fire (Android fallback), don't let a
      // relative reading clobber a recent absolute one (webkitCompassHeading
      // and deviceorientationabsolute both count as absolute sources).
      if (absolute) {
        lastAbsoluteAt = Date.now();
      } else if (Date.now() - lastAbsoluteAt < 2000) {
        return;
      }

      const now = Date.now();
      if (now - lastUpdate < updateRate) return;
      lastUpdate = now;

      onHeadingChange({
        alpha: heading,
        beta: event.beta,
        gamma: event.gamma,
        absolute,
        isLevel: Math.abs(event.beta) < 5 && Math.abs(event.gamma) < 5,
        timestamp: Date.now(),
      });
    };

    const handleOrientation = (event) => emitHeading(event);           // deviceorientationabsolute
    const handleOrientationFallback = (event) => emitHeading(event);   // deviceorientation

    const requestPermission = async () => {
      if ('DeviceOrientationEvent' in window &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const state = await DeviceOrientationEvent.requestPermission();
          if (state === 'granted') {
            hasPermission = true;
            window.addEventListener('deviceorientationabsolute', handleOrientation);
            window.addEventListener('deviceorientation', handleOrientationFallback);
            console.log('[Compass] Permission granted, using DeviceOrientation fallback');
            return true;
          } else {
            throw new Error('Motion permission denied');
          }
        } catch (err) {
          console.error('Permission error:', err);
          throw err;
        }
      } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation);
        window.addEventListener('deviceorientation', handleOrientationFallback);
        console.log('[Compass] Using DeviceOrientation fallback (non-iOS)');
        return true;
      }
    };

    return {
      requestPermission,
      stop: () => {
        window.removeEventListener('deviceorientationabsolute', handleOrientation);
        window.removeEventListener('deviceorientation', handleOrientationFallback);
      },
      hasPermission: () => hasPermission,
      setUpdateRate: (rate) => { updateRate = rate; },
      isFallback: true,
    };
  };

  // Initialize: try modern API, fallback to DeviceOrientation
  let compassAPI = null;

  const init = async () => {
    const modernWorked = await tryOrientationSensor();
    if (!modernWorked) {
      console.log('[Compass] Falling back to DeviceOrientation API');
      return fallbackDeviceOrientation();
    }
    return {
      requestPermission: async () => true, // No permission needed for OrientationSensor
      stop: () => { if (sensor) sensor.stop(); },
      hasPermission: () => true,
      setUpdateRate: (rate) => { updateRate = rate; },
      isFallback: false,
    };
  };
  // Convert quaternion [x, y, z, w] to Euler angles (heading, pitch, roll)
  function quaternionToEuler(q) {
    const [x, y, z, w] = q;

    // Heading (yaw) - Z axis rotation
    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    const heading = Math.atan2(siny_cosp, cosy_cosp) * 180 / Math.PI;

    // Pitch - X axis rotation
    const sinp = 2 * (w * x - y * z);
    const pitch = Math.abs(sinp) >= 1
      ? Math.sign(sinp) * 90
      : Math.asin(sinp) * 180 / Math.PI;

    // Roll - Y axis rotation
    const sinr_cosp = 2 * (w * y + z * x);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    const roll = Math.atan2(sinr_cosp, cosr_cosp) * 180 / Math.PI;

    return { heading: (heading + 360) % 360, pitch, roll };
  }

  return init();
}