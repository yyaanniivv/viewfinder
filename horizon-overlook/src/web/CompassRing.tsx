import React, { useEffect, useRef, useState } from 'react';
import { normalizeBearing, deg2rad } from '../core/geo';
import { loadSettings } from '../core/settings';

interface CompassRingProps {
  heading: number; // calibrated heading, 0° = North
  isCalibrated: boolean;
  calibrationProgress?: number; // 0-1 for figure-8 progress
  onCalibrate?: () => void;
}

/**
 * Compass ring component showing N/E/S/W and current heading
 * Smoothly animates to match phone orientation
 * Tap compass ring or N/E/S/W labels to calibrate
 */
export const CompassRing: React.FC<CompassRingProps> = ({
  heading,
  isCalibrated,
  calibrationProgress,
  onCalibrate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animatedHeadingRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const [showCalibrationHint, setShowCalibrationHint] = useState(false);
  const [compassMode, setCompassMode] = useState<'fixed' | 'dynamic'>(() => {
    const settings = loadSettings();
    return settings.compass.compassMode;
  });

  // Smooth heading animation
  useEffect(() => {
    animatedHeadingRef.current = heading;
    const animate = () => {
      const diff = normalizeBearing(heading - animatedHeadingRef.current);
      // Shortest path
      const shortestDiff = diff > 180 ? diff - 360 : diff;
      animatedHeadingRef.current = normalizeBearing(
        animatedHeadingRef.current + shortestDiff * 0.15
      );

      if (canvasRef.current) {
        drawCompass(canvasRef.current, animatedHeadingRef.current, isCalibrated, calibrationProgress, showCalibrationHint, compassMode);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [heading, isCalibrated, calibrationProgress, showCalibrationHint, compassMode]);

  // Initial draw
  useEffect(() => {
    if (canvasRef.current) {
      drawCompass(canvasRef.current, heading, isCalibrated, calibrationProgress, showCalibrationHint, compassMode);
    }
  }, [heading, isCalibrated, calibrationProgress, showCalibrationHint, compassMode]);

  // Listen for settings changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'horizon-overlook:settings') {
        const settings = loadSettings();
        setCompassMode(settings.compass.compassMode);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCalibrate || isCalibrated) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to canvas coordinates (accounting for display scaling)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (x * scaleX) - canvas.width / 2;
    const canvasY = (y * scaleY) - canvas.height / 2;

    // Check if click is on compass ring area (within radius ± 30px)
    const centerX = 0;
    const centerY = 0;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 4;
    const dist = Math.sqrt(canvasX * canvasX + canvasY * canvasY);

    if (dist >= radius - 30 && dist <= radius + 30) {
      onCalibrate();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      style={{
        width: '120px',
        height: '120px',
        touchAction: 'none',
        cursor: isCalibrated ? 'default' : 'pointer',
      }}
      aria-label="Compass showing current heading"
      onClick={handleClick}
      onMouseEnter={() => !isCalibrated && setShowCalibrationHint(true)}
      onMouseLeave={() => setShowCalibrationHint(false)}
    />
  );
};

function drawCompass(
  canvas: HTMLCanvasElement,
  heading: number,
  isCalibrated: boolean,
  calibrationProgress?: number,
  showHint: boolean = false,
  compassMode: 'fixed' | 'dynamic' = 'fixed'
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 4;

  ctx.clearRect(0, 0, width, height);

  if (compassMode === 'fixed') {
    // FIXED MODE: Wheel stays fixed (N at top), pointer rotates to show heading
    drawFixedWheel(ctx, centerX, centerY, radius, heading, isCalibrated);
  } else {
    // DYNAMIC MODE: Wheel rotates with heading, pointer fixed at top
    drawDynamicWheel(ctx, centerX, centerY, radius, heading, isCalibrated);
  }

  // Center dot (always same)
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
  ctx.fillStyle = isCalibrated ? '#4ECDC4' : '#FFBE0B';
  ctx.fill();

  // Heading text
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${Math.round(heading)}°`, centerX, centerY + radius + 8);

  // Calibration progress ring
  if (calibrationProgress !== undefined && calibrationProgress < 1 && !isCalibrated) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 6, -Math.PI / 2, -Math.PI / 2 + calibrationProgress * Math.PI * 2);
    ctx.strokeStyle = '#FFBE0B';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Uncalibrated warning
  if (!isCalibrated) {
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#FFBE0B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('UNCALIBRATED', centerX, centerY - radius - 8);
  }

  // Tap to calibrate hint
  if (showHint && !isCalibrated) {
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 190, 11, 0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Tap to calibrate', centerX, centerY + radius + 28);
  }
}

function drawFixedWheel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  heading: number,
  isCalibrated: boolean
): void {
  // Outer ring (fixed)
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = isCalibrated ? '#FFFFFF' : '#FFBE0B';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Cardinal directions (fixed - N always at top)
  const cardinals = ['N', 'E', 'S', 'W'];
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  cardinals.forEach((dir, i) => {
    const angle = (i * Math.PI / 2) - Math.PI / 2; // 0° = North (up)
    const x = centerX + Math.cos(angle) * (radius - 20);
    const y = centerY + Math.sin(angle) * (radius - 20);
    ctx.fillText(dir, x, y);
  });

  // Degree marks every 30° (fixed)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI / 6) - Math.PI / 2; // 0° = North (up)
    const inner = radius - 10;
    const outer = radius;
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
    ctx.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer);
    ctx.stroke();
  }

  // Heading pointer (rotates to show current heading)
  // No fixed red triangle at N - the pointer IS the indicator
  ctx.save();
  ctx.translate(centerX, centerY);
  // Rotate to heading: 0° = North (up), so we rotate by heading degrees clockwise
  ctx.rotate(heading * Math.PI / 180);

  // Draw the heading pointer (triangle pointing up = North)
  ctx.fillStyle = isCalibrated ? '#4ECDC4' : '#FFBE0B';
  ctx.beginPath();
  ctx.moveTo(0, -radius + 10); // Tip of pointer at top
  ctx.lineTo(-10, -radius + 30); // Left base
  ctx.lineTo(10, -radius + 30);  // Right base
  ctx.closePath();
  ctx.fill();

  // Add a small line extending from center to pointer base for clarity
  ctx.strokeStyle = isCalibrated ? '#4ECDC4' : '#FFBE0B';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -radius + 15);
  ctx.stroke();

  ctx.restore();
}

function drawDynamicWheel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  heading: number,
  isCalibrated: boolean
): void {
  // In dynamic mode, rotate the entire wheel so that the current heading points UP
  // This is the original behavior: wheel spins, N moves to show where North is relative to you
  ctx.save();
  ctx.translate(centerX, centerY);

  // FIRST: Draw the fixed pointer at top of screen (12 o'clock) BEFORE rotating
  // This shows "you are here" - the device orientation relative to the spinning wheel
  ctx.fillStyle = '#FF6B6B';
  ctx.beginPath();
  ctx.moveTo(0, -radius + 5);
  ctx.lineTo(-8, -radius + 20);
  ctx.lineTo(8, -radius + 20);
  ctx.closePath();
  ctx.fill();

  // THEN: Rotate the wheel so that heading points UP (North at top of screen)
  // Canvas 0° = East, we want heading = North (up), so rotate by -(90° + heading)
  ctx.rotate(-Math.PI / 2 - heading * Math.PI / 180);

  // Outer ring
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = isCalibrated ? '#FFFFFF' : '#FFBE0B';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Cardinal directions (rotate with wheel)
  const cardinals = ['N', 'E', 'S', 'W'];
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  cardinals.forEach((dir, i) => {
    const angle = (i * Math.PI / 2);
    const x = Math.cos(angle) * (radius - 20);
    const y = Math.sin(angle) * (radius - 20);
    ctx.fillText(dir, x, y);
  });

  // Degree marks every 30°
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const inner = radius - 10;
    const outer = radius;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }

  ctx.restore();
}