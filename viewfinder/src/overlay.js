/**
 * Canvas overlay drawing for Viewfinder
 * Draws horizon line, compass ticks, location markers, and level indicator
 */

import { normalizeBearing, formatDistance, haversineDistance, bearing } from './geo.js';

const FOV_DEG = 90; // Horizontal field of view assumption
const HORIZON_Y_RATIO = 0.5; // Horizon at vertical center

// Level indicator thresholds (degrees)
const LEVEL_GREEN = 2;
const LEVEL_AMBER = 5;

export class Overlay {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.locations = options.locations || [];
    this.userPosition = options.userPosition || null;
    this.compassHeading = options.compassHeading || 0;
    this.headingOffset = options.headingOffset || 0;
    this.isCalibrated = options.isCalibrated || false;
    // Level indicator
    this.showLevel = options.showLevel !== false; // default on
    this.pitch = null;   // front-to-back tilt (beta), degrees
    this.roll = null;    // left-to-right tilt (gamma), degrees
    this.horizonY = null;
    this.pxPerDeg = null;
    this.centerX = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    this.horizonY = rect.height * HORIZON_Y_RATIO;
    this.centerX = rect.width / 2;
    this.pxPerDeg = rect.width / FOV_DEG;
  }

  update(data) {
    if (data.locations !== undefined) this.locations = data.locations;
    if (data.userPosition !== undefined) this.userPosition = data.userPosition;
    if (data.compassHeading !== undefined) this.compassHeading = data.compassHeading;
    if (data.headingOffset !== undefined) this.headingOffset = data.headingOffset;
    if (data.isCalibrated !== undefined) this.isCalibrated = data.isCalibrated;
    if (data.pitch !== undefined) this.pitch = data.pitch;
    if (data.roll !== undefined) this.roll = data.roll;
    if (data.showLevel !== undefined) this.showLevel = data.showLevel;
  }

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, w, h);

    // Draw horizon line
    this.drawHorizonLine(w);

    // Draw compass ticks (N/E/S/W)
    this.drawCompassTicks(w);

    // Draw location markers
    this.drawMarkers(w);

    // Draw level indicator (center, wide — helps align device while panning)
    if (this.showLevel && this.pitch !== null && this.roll !== null) {
      this.drawLevel(w, h);
    }

    // Draw calibration status
    if (!this.isCalibrated) {
      this.drawUncalibratedWarning(w);
    }
  }

  drawHorizonLine(w) {
    const { ctx } = this;
    ctx.strokeStyle = '#4ECDC4';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, this.horizonY);
    ctx.lineTo(w, this.horizonY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Wide centered level indicator, drawn below the horizon line.
   *
   * Roll: horizontal gauge with a moving bubble (like a spirit level)
   * Pitch: the gauge frame shifts vertically with pitch against a fixed
   *   dashed reference line — both axes readable at a glance while panning.
   * Color: green |pitch|<2 && |roll|<2, amber <5, red beyond.
   */
  drawLevel(w, h) {
    const { ctx } = this;
    const gaugeWidth = Math.min(w * 0.55, 420);   // wide, but bounded
    const gaugeHalf = gaugeWidth / 2;
    const cx = this.centerX;
    const cy = h * 0.62;                           // below the horizon line
    const MAX_TILT = 10;                           // degrees at full deflection
    const MAX_SHIFT = 22;                          // px of vertical pitch shift

    // Clamp for display
    const roll = Math.max(-MAX_TILT, Math.min(MAX_TILT, this.roll));
    const pitch = Math.max(-MAX_TILT, Math.min(MAX_TILT, this.pitch));

    // Color by worst axis
    const worst = Math.max(Math.abs(this.pitch), Math.abs(this.roll));
    const color = worst < LEVEL_GREEN ? '#06D6A0' : worst < LEVEL_AMBER ? '#FFBE0B' : '#FF6B6B';

    ctx.save();

    // --- Roll gauge: frame + bubble (frame shifts vertically with pitch) ---
    const frameY = cy - (pitch / MAX_TILT) * MAX_SHIFT;

    // End posts |-----|
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    const postH = 10;
    for (const x of [cx - gaugeHalf, cx + gaugeHalf]) {
      ctx.beginPath();
      ctx.moveTo(x, frameY - postH);
      ctx.lineTo(x, frameY + postH);
      ctx.stroke();
    }

    // Guide line between posts
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - gaugeHalf, frameY);
    ctx.lineTo(cx + gaugeHalf, frameY);
    ctx.stroke();

    // Center tick on the frame
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, frameY - 8);
    ctx.lineTo(cx, frameY + 8);
    ctx.stroke();

    // Bubble (moves with roll)
    const bubbleX = cx - (roll / MAX_TILT) * gaugeHalf;
    const bubbleR = 8;
    ctx.beginPath();
    ctx.arc(bubbleX, frameY, bubbleR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- Fixed dashed reference line (the true level target) ---
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - gaugeHalf - 20, cy);
    ctx.lineTo(cx + gaugeHalf + 20, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small readout
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const p = this.pitch >= 0 ? '+' : '';
    const r = this.roll >= 0 ? '+' : '';
    ctx.fillText(`P${p}${this.pitch.toFixed(0)}° R${r}${this.roll.toFixed(0)}°`, cx, cy + 14);

    ctx.restore();
  }

  drawCompassTicks(w) {
    const { ctx } = this;
    const cardinals = ['N', 'E', 'S', 'W'];

    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    cardinals.forEach((dir, i) => {
      const bearing = i * 90; // 0, 90, 180, 270
      const relBearing = normalizeBearing(bearing - this.compassHeading + this.headingOffset);
      const x = this.centerX + relBearing * this.pxPerDeg;

      // Only draw if on screen (with margin)
      if (x > -30 && x < w + 30) {
        // Tick mark
        ctx.beginPath();
        ctx.moveTo(x, this.horizonY - 10);
        ctx.lineTo(x, this.horizonY + 10);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillText(dir, x, this.horizonY - 25);
      }
    });
  }

  drawMarkers(w) {
    if (!this.userPosition) return;

    const { ctx } = this;

    this.locations.forEach(loc => {
      const trueBearing = bearing(this.userPosition, loc);
      const distance = haversineDistance(this.userPosition, loc);
      const calibratedBearing = normalizeBearing(trueBearing - this.headingOffset);
      const relBearing = normalizeBearing(calibratedBearing - this.compassHeading);

      // Convert to screen X (shortest path around circle)
      let screenX = this.centerX + relBearing * this.pxPerDeg;

      // Handle wrap-around for bearings near ±180
      if (relBearing > 180) {
        screenX = this.centerX + (relBearing - 360) * this.pxPerDeg;
      }

      const isOnScreen = screenX > -50 && screenX < w + 50;
      const isBehind = Math.abs(relBearing) > FOV_DEG / 2;

      if (isOnScreen && !isBehind) {
        this.drawMarker(screenX, this.horizonY, loc, distance, relBearing);
      } else if (isOnScreen && isBehind) {
        // Draw at edge with arrow indicator
        this.drawEdgeMarker(screenX < 0 ? 20 : w - 20, this.horizonY, loc, distance, screenX < 0);
      }
    });
  }

  drawMarker(x, y, loc, distance, relBearing) {
    const { ctx } = this;
    const pinRadius = 12;
    const labelOffset = 25;

    // Pin body (circle)
    ctx.beginPath();
    ctx.arc(x, y - labelOffset, pinRadius, 0, Math.PI * 2);
    ctx.fillStyle = loc.color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pin point (triangle down)
    ctx.beginPath();
    ctx.moveTo(x, y - labelOffset + pinRadius);
    ctx.lineTo(x - 6, y - labelOffset + pinRadius + 10);
    ctx.lineTo(x + 6, y - labelOffset + pinRadius + 10);
    ctx.closePath();
    ctx.fillStyle = loc.color;
    ctx.fill();

    // White inner dot
    ctx.beginPath();
    ctx.arc(x, y - labelOffset, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Label background
    const distStr = formatDistance(distance);
    const label = `${loc.name} • ${distStr}`;
    ctx.font = 'bold 13px system-ui, sans-serif';
    const textWidth = ctx.measureText(label).width;
    const padding = 8;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.roundRect(ctx, x - textWidth/2 - padding, y - labelOffset - 30, textWidth + padding*2, 20, 6);
    ctx.fill();

    // Label text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - labelOffset - 20);

    // Bearing indicator (small)
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const bearingStr = `${Math.round(relBearing)}°`;
    ctx.fillText(bearingStr, x, y - labelOffset - 45);
  }

  drawEdgeMarker(x, y, loc, distance, isLeft) {
    const { ctx } = this;
    const arrowSize = 16;

    // Arrow pointing toward marker
    ctx.fillStyle = loc.color;
    ctx.beginPath();
    if (isLeft) {
      // Arrow pointing right (marker is to the left/behind)
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + arrowSize, y);
      ctx.lineTo(x, y + 10);
    } else {
      // Arrow pointing left (marker is to the right/behind)
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x - arrowSize, y);
      ctx.lineTo(x, y + 10);
    }
    ctx.closePath();
    ctx.fill();

    // Mini label
    const distStr = formatDistance(distance);
    const label = `${loc.name} • ${distStr}`;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = isLeft ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, isLeft ? x + arrowSize + 8 : x - arrowSize - 8, y);
  }

  drawUncalibratedWarning(w) {
    const { ctx } = this;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#FFBE0B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('UNCALIBRATED - Tap compass to calibrate', w/2, 20);
  }

  roundRect(ctx, x, y, w, h, r) {
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
}