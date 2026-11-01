import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { horizonProjection } from '../core/geo';
import { loadCalibration } from '../core/calibration';
import type { Location } from '../core/storage';

interface ARCanvasProps {
  locations: Location[];
  userPosition: { lat: number; lon: number; alt?: number } | null;
  userHeading: number; // calibrated heading
  isCalibrated: boolean;
  onMarkerSelect?: (location: Location) => void;
}

/**
 * AR Canvas - WebXR camera feed with horizon markers
 * Handles Three.js scene, WebXR session, and marker rendering
 */
export const ARCanvas: React.FC<ARCanvasProps> = ({
  locations,
  userPosition,
  userHeading,
  isCalibrated,
  onMarkerSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const markerRefsRef = useRef<Map<string, THREE.Group>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const [isARSupported, setIsARSupported] = useState(false);
  const [isARActive, setIsARActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera (will be updated by WebXR)
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraRef.current = camera;

    // Check WebXR support
    if ('xr' in navigator) {
      (navigator as Navigator & { xr: XRSystem }).xr.isSessionSupported('immersive-ar')
        .then((supported) => {
          setIsARSupported(supported);
        })
        .catch(() => setIsARSupported(false));
    }

    // Resize handler
    const handleResize = () => {
      if (rendererRef.current && cameraRef.current) {
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
        (cameraRef.current as THREE.PerspectiveCamera).aspect = window.innerWidth / window.innerHeight;
        (cameraRef.current as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    };
    window.addEventListener('resize', handleResize);

    // Start render loop (non-XR fallback)
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (!sessionRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (sessionRef.current) {
        sessionRef.current.end();
      }
      renderer.dispose();
    };
  }, []);

  // Start AR session
  const startAR = async () => {
    if (!rendererRef.current || !sceneRef.current) return;

    try {
      const xr = (navigator as Navigator & { xr: XRSystem }).xr;
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['camera-access', 'local-floor'],
        optionalFeatures: ['hit-test', 'light-estimation'],
      });

      sessionRef.current = session;
      await rendererRef.current.xr.setSession(session);
      setIsARActive(true);
      setError(null);

      session.addEventListener('end', () => {
        sessionRef.current = null;
        setIsARActive(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start AR session');
      console.error('AR session error:', err);
    }
  };

  // Update markers based on locations and user position
  useEffect(() => {
    if (!sceneRef.current || !userPosition || !isCalibrated) return;

    const calibration = loadCalibration();
    const headingOffset = calibration?.headingOffset ?? 0;

    locations.forEach((location) => {
      let marker = markerRefsRef.current.get(location.id);

      if (!marker) {
        // Create new marker
        marker = createMarker(location);
        sceneRef.current!.add(marker);
        markerRefsRef.current.set(location.id, marker);
      }

      // Update marker position
      const proj = horizonProjection(
        userPosition,
        location,
        headingOffset
      );

      // Smooth position update
      marker.position.lerp(new THREE.Vector3(proj.x, proj.y, proj.z), 0.15);

      // Update distance badge
      const label = marker.userData.label as THREE.Sprite | undefined;
      if (label && label.material instanceof THREE.SpriteMaterial) {
        const texture = label.material.map;
        if (texture) {
          updateLabelTexture(texture as THREE.CanvasTexture, location.name, proj.distance);
        }
      }
    });

    // Remove markers for deleted locations
    const currentIds = new Set(locations.map(f => f.id));
    markerRefsRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        sceneRef.current!.remove(marker);
        markerRefsRef.current.delete(id);
      }
    });
  }, [locations, userPosition, userHeading, isCalibrated]);

  // Render loop for XR (handled by renderer.xr.setAnimationLoop)
  useEffect(() => {
    if (rendererRef.current && sessionRef.current) {
      rendererRef.current.setAnimationLoop(() => {
        if (sceneRef.current && cameraRef.current) {
          rendererRef.current!.render(sceneRef.current, cameraRef.current);
        }
      });
    } else {
      rendererRef.current?.setAnimationLoop(null);
    }
  }, [sessionRef.current]);

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>{error}</p>
        <button style={styles.button} onClick={startAR}>Retry AR</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        aria-label="AR camera feed with horizon markers"
      />
      {!isARActive && isARSupported && (
        <button style={styles.startButton} onClick={startAR}>
          Start AR Session
        </button>
      )}
      {!isARSupported && (
        <div style={styles.unsupported}>
          WebXR AR not supported on this browser/device.
        </div>
      )}
    </div>
  );
};

function createMarker(location: Location): THREE.Group {
  const group = new THREE.Group();

  // Main pin sprite
  const pinTexture = createPinTexture(location.color);
  const pinMaterial = new THREE.SpriteMaterial({ map: pinTexture, transparent: true });
  const pin = new THREE.Sprite(pinMaterial);
  pin.scale.set(4, 4, 1);
  pin.userData.locationId = location.id;
  group.add(pin);

  // Name + distance label
  const labelTexture = createLabelTexture(location.name, 0);
  const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
  const label = new THREE.Sprite(labelMaterial);
  label.scale.set(8, 2, 1);
  label.position.set(0, -3.5, 0);
  label.userData.label = true;
  group.add(label);

  // Store location reference for click handling
  group.userData.location = location;

  return group;
}

function createPinTexture(color: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Draw pin
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 3, size / 3, 0, Math.PI * 2);
  ctx.fill();

  // White inner circle
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(size / 2, size / 3, size / 5, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createLabelTexture(name: string, distanceM: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSize = 28;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;

  const distanceStr = distanceM > 1000
    ? `${(distanceM / 1000).toFixed(1)} km`
    : `${Math.round(distanceM)} m`;
  const text = `${name}  •  ${distanceStr}`;

  const padding = 16;
  const textWidth = ctx.measureText(text).width;
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 8);
  ctx.fill();

  // Text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function updateLabelTexture(texture: THREE.CanvasTexture, name: string, distanceM: number): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const fontSize = 28;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;

  const distanceStr = distanceM > 1000
    ? `${(distanceM / 1000).toFixed(1)} km`
    : `${Math.round(distanceM)} m`;
  const text = `${name}  •  ${distanceStr}`;

  const padding = 16;
  const textWidth = ctx.measureText(text).width;
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 8);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  texture.needsUpdate = true;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  startButton: {
    position: 'absolute',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: '600',
    color: '#FFFFFF',
    background: 'rgba(0, 0, 0, 0.8)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    zIndex: 10,
  },
  unsupported: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '24px',
    textAlign: 'center',
    color: '#FFFFFF',
    background: 'rgba(0, 0, 0, 0.8)',
    borderRadius: '12px',
    zIndex: 10,
  },
  errorContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '24px',
    textAlign: 'center',
    color: '#FF6B6B',
    background: 'rgba(0, 0, 0, 0.9)',
    borderRadius: '12px',
    zIndex: 10,
  },
  errorText: {
    marginBottom: '16px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    color: '#FFFFFF',
    background: '#FF6B6B',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};