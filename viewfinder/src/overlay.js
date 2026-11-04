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
    // Lane markers experiment: fan locations out above/below the horizon
    // instead of stacking all labels below it
    this.laneMode = options.laneMode || false;
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
    if (data.laneMode !== undefined) this.laneMode = data.laneMode;
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
    if (this.laneMode) {
      this.drawMarkersLanes(w);
    } else {
      this.drawMarkers(w);
    }

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

    // First pass: compute screen positions of visible markers so we can
    // stagger labels that would overlap
    const visible = [];
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
        visible.push({ loc, screenX, distance, relBearing });
      } else if (isOnScreen && isBehind) {
        // Draw at edge with arrow indicator
        this.drawEdgeMarker(screenX < 0 ? 20 : w - 20, this.horizonY, loc, distance, screenX < 0);
      }
    });

    // Sort by screen X and assign label rows: two markers whose label boxes
    // would overlap share the horizon, so push the later one's label a row
    // further down (rows stack downward, away from the compass ticks).
    const LABEL_GAP = 10; // px min horizontal gap between boxes in a row
    const sorted = [...visible].sort((a, b) => a.screenX - b.screenX);
    // Pre-measure each label box width so row assignment is accurate
    const { ctx: measureCtx } = this;
    for (const m of sorted) {
      measureCtx.font = 'bold 12px system-ui, sans-serif';
      const textWidth = measureCtx.measureText(`${m.loc.name} • ${formatDistance(m.distance)}`).width;
      measureCtx.font = '10px ui-monospace, monospace';
      const bearingWidth = measureCtx.measureText(`${Math.round(m.relBearing)}°`).width;
      m.boxW = textWidth + bearingWidth + 8 * 3; // padding*3 (matches drawMarker)
    }
    const rowRightEdge = []; // each row: rightmost box edge used
    for (const m of sorted) {
      let row = 0;
      const boxLeft = m.screenX - m.boxW / 2;
      while (rowRightEdge[row] !== undefined && boxLeft - rowRightEdge[row] < LABEL_GAP) {
        row++;
      }
      rowRightEdge[row] = m.screenX + m.boxW / 2;
      m.labelRow = row;
    }

    visible.forEach(m => {
      this.drawMarker(m.screenX, this.horizonY, m.loc, m.distance, m.relBearing, m.labelRow || 0);
    });
  }

  /**
   * EXPERIMENT: lane mode — the horizon stays a clean "center wheel"
   * (pointer triangles only), and each location's label lives in its own
   * horizontal lane above or below the line. Near-azimuth locations no
   * longer collide: their pointers sit together on the line while their
   * labels fan out vertically on separate rows.
   */
  drawMarkersLanes(w) {
    if (!this.userPosition) return;

    const { ctx } = this;
    const visible = [];
    this.locations.forEach(loc => {
      const trueBearing = bearing(this.userPosition, loc);
      const distance = haversineDistance(this.userPosition, loc);
      const calibratedBearing = normalizeBearing(trueBearing - this.headingOffset);
      const relBearing = normalizeBearing(calibratedBearing - this.compassHeading);

      let screenX = this.centerX + relBearing * this.pxPerDeg;
      if (relBearing > 180) {
        screenX = this.centerX + (relBearing - 360) * this.pxPerDeg;
      }

      const isOnScreen = screenX > -50 && screenX < w + 50;
      const isBehind = Math.abs(relBearing) > FOV_DEG / 2;

      if (isOnScreen && !isBehind) {
        visible.push({ loc, screenX, distance, relBearing });
      } else if (isOnScreen && isBehind) {
        this.drawEdgeMarker(screenX < 0 ? 20 : w - 20, this.horizonY, loc, distance, screenX < 0);
      }
    });

    // Sort left-to-right, then alternate lanes: even markers go above the
    // horizon, odd ones below. Within each side, deeper rows fan outward.
    const sorted = [...visible].sort((a, b) => a.screenX - b.screenX);

    // Pre-measure label widths
    for (const m of sorted) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      const textWidth = ctx.measureText(`${m.loc.name} • ${formatDistance(m.distance)}`).width;
      ctx.font = '10px ui-monospace, monospace';
      const bearingWidth = ctx.measureText(`${Math.round(m.relBearing)}°`).width;
      m.boxW = Math.min(textWidth + bearingWidth + 8 * 3, w - 24);
    }

    // Lane assignment: alternate above/below so neighbours never share a row
    let aboveCount = 0;
    let belowCount = 0;
    const LANE_GAP = 38;      // vertical spacing between lanes on the same side
    const FIRST_LANE = 46;    // distance of lane 0 from the horizon line
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i];
      const above = i % 2 === 0;
      const row = above ? aboveCount++ : belowCount++;
      m.laneY = above
        ? this.horizonY - FIRST_LANE - row * LANE_GAP
        : this.horizonY + FIRST_LANE + row * LANE_GAP;
    }

    // Draw each: pointer at the horizon + floating label in its lane
    for (const m of sorted) {
      // Pointer triangle on the horizon (the "wheel" itself stays clean)
      const TRI_H = 10;
      const TRI_W = 12;
      ctx.beginPath();
      ctx.moveTo(m.screenX, this.horizonY + TRI_H);
      ctx.lineTo(m.screenX - TRI_W / 2, this.horizonY);
      ctx.lineTo(m.screenX + TRI_W / 2, this.horizonY);
      ctx.closePath();
      ctx.fillStyle = m.loc.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label box centered in its lane, clamped to the viewport
      const boxH = 20;
      let boxX = m.screenX - m.boxW / 2;
      boxX = Math.max(8, Math.min(boxX, w - m.boxW - 8));
      const boxY = m.laneY - boxH / 2;

      // Subtle connector: hairline from pointer to lane (kept faint so it
      // doesn't recreate the clutter — easy to drop entirely)
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(m.screenX, m.laneY > this.horizonY ? this.horizonY + TRI_H : this.horizonY - TRI_H);
      ctx.lineTo(m.screenX, m.laneY + (m.laneY > this.horizonY ? -boxH / 2 : boxH / 2));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      this.roundRect(ctx, boxX, boxY, m.boxW, boxH, 6);
      ctx.fill();

      // Color strip on the left edge
      ctx.fillStyle = m.loc.color;
      this.roundRect(ctx, boxX, boxY, 4, boxH, 2);
      ctx.fill();

      const label = `${m.loc.name} • ${formatDistance(m.distance)}`;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, boxX + 12, boxY + boxH / 2 + 1);

      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(m.relBearing)}°`, boxX + m.boxW - 8, boxY + boxH / 2 + 1);
    }
  }

  /**
   * POI marker: tick + pointer triangle at the horizon line (like N/E/S/W
   * compass ticks), with a single label box BELOW the line holding
   * "name • distance". Overlapping POIs stagger downward (rows).
   */
  drawMarker(x, y, loc, distance, relBearing, labelRow = 0) {
    const { ctx } = this;
    const TRI_H = 10;        // triangle height below line
    const TRI_W = 12;

    // Pointer triangle pointing down at the horizon line
    ctx.beginPath();
    ctx.moveTo(x, y + TRI_H);
    ctx.lineTo(x - TRI_W / 2, y);
    ctx.lineTo(x + TRI_W / 2, y);
    ctx.closePath();
    ctx.fillStyle = loc.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Single label box below the line: name • distance
    const distStr = formatDistance(distance);
    const label = `${loc.name} • ${distStr}`;
    ctx.font = 'bold 12px system-ui, sans-serif';
    const textWidth = ctx.measureText(label).width;
    const bearingStr = `${Math.round(relBearing)}°`;
    ctx.font = '10px ui-monospace, monospace';
    const bearingWidth = ctx.measureText(bearingStr).width;
    const padding = 8;
    const boxH = 20;
    const boxW = textWidth + bearingWidth + padding * 3;
    const rowGap = 26;
    const boxY = y + TRI_H + 6 + labelRow * rowGap;
    const boxX = x - boxW / 2;

    // Box background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.roundRect(ctx, boxX, boxY, boxW, boxH, 6);
    ctx.fill();

    // Color strip on the left edge
    ctx.fillStyle = loc.color;
    this.roundRect(ctx, boxX, boxY, 4, boxH, 2);
    ctx.fill();

    // Name • distance (bold, centered in remaining space)
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, boxX + padding + 4, boxY + boxH / 2 + 1);

    // Bearing readout, right-aligned in the box
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(bearingStr, boxX + boxW - padding - bearingWidth, boxY + boxH / 2 + 1);
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