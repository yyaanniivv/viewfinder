/**
 * Compass heading via DeviceOrientation API
 * Handles iOS permission request
 */

export function startCompass(onHeadingChange) {
  let hasPermission = false;

  const handleOrientation = (event) => {
    if (event.alpha === null) return;
    onHeadingChange({
      alpha: event.alpha,        // 0° = North (if absolute)
      beta: event.beta,          // front-to-back tilt
      gamma: event.gamma,        // left-to-right tilt
      absolute: event.absolute,  // true if alpha is absolute (true north)
      timestamp: Date.now(),
    });
  };

  // Also listen to non-absolute as fallback
  const handleOrientationFallback = (event) => {
    if (event.alpha === null) return;
    onHeadingChange({
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      absolute: false,  // explicitly mark as relative
      timestamp: Date.now(),
    });
  };

  // Request permission on iOS 13+
  const requestPermission = async () => {
    if ('DeviceOrientationEvent' in window &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state === 'granted') {
          hasPermission = true;
          window.addEventListener('deviceorientationabsolute', handleOrientation);
          // Also add fallback listener
          window.addEventListener('deviceorientation', handleOrientationFallback);
          console.log('[Compass] Permission granted, listening to deviceorientationabsolute + fallback');
          return true;
        } else {
          throw new Error('Motion permission denied');
        }
      } catch (err) {
        console.error('Permission error:', err);
        throw err;
      }
    } else {
      // Non-iOS or older iOS
      window.addEventListener('deviceorientationabsolute', handleOrientation);
      window.addEventListener('deviceorientation', handleOrientationFallback);
      console.log('[Compass] Non-iOS, listening to deviceorientationabsolute + fallback');
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
  };
}