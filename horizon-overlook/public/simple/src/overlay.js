/**
 * Canvas overlay drawing for Horizon Overlook Simple
 * Draws horizon line, compass ticks, and location markers
 */

import { normalizeBearing, formatDistance, deg2rad, rad2deg, EARTH_RADIUS_M } from './geo.js';

const FOV_DEG = 90; // Horizontal field of view assumption
const HORIZON_Y_RATIO = 0.5; // Horizon at vertical center

export class Overlay {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.locations = options.locations || [];
    this.userPosition = options.userPosition || null;
    this.compassHeading = options.compassHeading || 0;
    this.headingOffset = options.headingOffset || 0;
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
      const { bearing: trueBearing, distance } = this.calcBearingDistance(this.userPosition, loc);
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

  calcBearingDistance(from, to) {
    const lat1 = deg2rad(from.lat);
    const lat2 = deg2rad(to.lat);
    const dLon = deg2rad(to.lon - from.lon);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = normalizeBearing(rad2deg(Math.atan2(y, x)));

    const dLat = deg2rad(to.lat - from.lat);
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    const distance = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return { bearing, distance };
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