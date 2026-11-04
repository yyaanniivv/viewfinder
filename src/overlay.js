/**
 * Canvas overlay drawing for Viewfinder
 * Draws horizon line, compass ticks, location markers, and level indicator
 *
 * ── LANE LOGIC (lane mode) ──────────────────────────────────────────────
 * Lane mode fans location labels out above/below the horizon instead of
 * stacking everything on the line. Two layouts, per `cleanWheel`:
 *
 * 1. FIXED 5-LANE (cleanWheel on, default) — `drawFixedLanes`.
 *    The horizon carries only N/E/S/W. Four label lanes: 42px above,
 *    42px below, 86px above, 86px below. Each location is a self-
 *    contained box: name • distance + chevron pointing at its azimuth.
 *    Placement (per sorted screen order):
 *      a. prefer the side the chevron points toward;
 *      b. inner lanes first, sharing a slot only when boxes don't
 *         horizontally overlap (≥12px);
 *      c. overflow → 3rd row outward, dimmed plumb line.
 *    Every box gets a dashed plumb line anchored at its TRUE azimuth
 *    (screenX) — never at the box, so label width never shifts it.
 *
 * 2. ADAPTIVE (cleanWheel off) — the rest of `drawMarkersLanes`.
 *    Pointer triangles back on the horizon; row gap compresses 38→27px
 *    with row count; boxes reuse rows when horizontally separated.
 *
 * EDGE LOCATIONS: |relSigned| > 45° (FOV/2) → chevron at the screen edge
 * pointing toward the real marker + label in a lane. relSigned must be
 * the SIGNED relative bearing (>180 → −360); unsigned values send
 * near-north locations to the wrong edge.
 *
 * VISIBILITY: `visibleLocations()` filters out locations flagged hidden
 * (eye toggle in the Locations panel) in both marker modes.
 * ────────────────────────────────────────────────────────────────────────
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
    // Clean wheel: hide pointer triangles on the horizon — lane labels
    // become the markers themselves
    this.cleanWheel = options.cleanWheel || false;
    this.pitch = null;   // front-to-back tilt (beta), degrees
    this.roll = null;    // left-to-right tilt (gamma), degrees
    this.horizonY = null;
    this.pxPerDeg = null;
    this.centerX = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Locations shown on the overlay — respects the `hidden` flag
   * toggled from the locations panel.
   */
  visibleLocations() {
    return this.locations.filter(l => !l.hidden);
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
    if (data.cleanWheel !== undefined) this.cleanWheel = data.cleanWheel;
    if (data.edgeArrowMargin !== undefined) this.edgeArrowMargin = data.edgeArrowMargin;
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
      this.drawMarkersLanes(w, h);
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
    this.visibleLocations().forEach(loc => {
      const trueBearing = bearing(this.userPosition, loc);
      const distance = haversineDistance(this.userPosition, loc);
      const calibratedBearing = normalizeBearing(trueBearing - this.headingOffset);
      const relBearing = normalizeBearing(calibratedBearing - this.compassHeading);

      // Convert to screen X (shortest path around circle)
      const relSigned = relBearing > 180 ? relBearing - 360 : relBearing;
      const screenX = this.centerX + relSigned * this.pxPerDeg;

      const isOnScreen = screenX > -50 && screenX < w + 50;
      const isBehind = Math.abs(relSigned) > FOV_DEG / 2;

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
   * EXPERIMENT: lane mode — the horizon stays a clean "center wheel", and
   * each location's label lives in its own horizontal lane above or below
   * the line. A dashed plumb line at the location's true azimuth anchors
   * label to horizon; it never moves with label width (boxes clamp at the
   * screen edge, the plumb line doesn't). Near-azimuth locations no longer
   * collide: their plumb lines sit together while labels fan out on
   * separate rows. Off-screen locations get a direction chevron at the
   * wheel edge and their label in a lane like everyone else.
   */
  drawMarkersLanes(w, h) {
    if (!this.userPosition) return;

    const { ctx } = this;
    const visible = [];
    const edge = [];
    this.visibleLocations().forEach(loc => {
      const trueBearing = bearing(this.userPosition, loc);
      const distance = haversineDistance(this.userPosition, loc);
      const calibratedBearing = normalizeBearing(trueBearing - this.headingOffset);
      const relBearing = normalizeBearing(calibratedBearing - this.compassHeading);

      const relSigned = relBearing > 180 ? relBearing - 360 : relBearing;
      const screenX = this.centerX + relSigned * this.pxPerDeg;

      const isBehind = Math.abs(relSigned) > FOV_DEG / 2;

      if (!isBehind) {
        visible.push({ loc, screenX, distance, relBearing, relSigned, isEdge: false });
      } else {
        // Off-screen: clamp just inside the viewport; side = direction to
        // the actual marker (chevron points that way)
        const clampedX = screenX < 0 ? 26 : w - 26;
        edge.push({ loc, screenX: clampedX, distance, relBearing, relSigned, isEdge: true, side: relSigned < 0 ? -1 : 1 });
      }
    });

    // Sort left-to-right (edge markers participate in lane layout)
    const sorted = [...visible, ...edge].sort((a, b) => a.screenX - b.screenX);

    // Pre-measure label widths
    for (const m of sorted) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      const textWidth = ctx.measureText(`${m.loc.name} • ${formatDistance(m.distance)}`).width;
      ctx.font = '10px ui-monospace, monospace';
      const bearingWidth = ctx.measureText(`${Math.round(m.relBearing)}°`).width;
      m.boxW = Math.min(textWidth + bearingWidth + 8 * 3 + (m.isEdge ? 14 : 0), w - 24);
    }

    // Clean wheel → fixed 5-lane layout: the horizon carries only the
    // cardinal letters; every location is a self-contained label box
    // (name + direction pointer) in one of 4 label lanes (2 above, 2 below)
    if (this.cleanWheel) {
      this.drawFixedLanes(sorted, w, h);
      return;
    }

    // --- Lane assignment ---
    // Alternate sides by sorted order (neighbors split above/below), then
    // within each side greedily reuse rows when boxes don't overlap.
    // Row gap adapts: many rows squeeze down to MIN_GAP, few get MAX_GAP.
    const FIRST_LANE = 44;    // distance of lane 0 from the horizon line
    const MIN_GAP = 27;
    const MAX_GAP = 38;
    const TOP_RESERVE = 56;   // keep clear: uncalibrated warning + ticks
    const BOTTOM_RESERVE = 110; // keep clear: panels / level gauge
    const topAvail = this.horizonY - TOP_RESERVE;
    const botAvail = h - this.horizonY - BOTTOM_RESERVE;

    let aboveCount = 0;
    let belowCount = 0;
    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i];
      m.side = i % 2 === 0 ? -1 : 1;
      if (m.side < 0) m.row = aboveCount++; else m.row = belowCount++;
    }

    const assignLanes = (side, available) => {
      const members = sorted.filter(m => m.side === side);
      if (members.length === 0) return;
      // Greedy row reuse: two boxes in the same lane only if horizontally
      // separated by a gap
      const rowRight = [];
      for (const m of members) {
        let row = 0;
        const boxLeft = m.screenX - m.boxW / 2;
        while (rowRight[row] !== undefined && boxLeft - rowRight[row] < 10) row++;
        rowRight[row] = m.screenX + m.boxW / 2;
        m.row = row;
      }
      const nRows = rowRight.length;
      const gap = nRows > 1
        ? Math.max(MIN_GAP, Math.min(MAX_GAP, (available - FIRST_LANE) / (nRows - 1)))
        : MAX_GAP;
      for (const m of members) {
        const y = side < 0
          ? this.horizonY - FIRST_LANE - m.row * gap
          : this.horizonY + FIRST_LANE + m.row * gap;
        // Clamp into the safe area if lanes overflow it
        m.laneY = side < 0
          ? Math.max(FIRST_LANE / 2 + 12, Math.min(y, this.horizonY - FIRST_LANE))
          : Math.min(h - FIRST_LANE / 2 - 12, Math.max(y, this.horizonY + FIRST_LANE));
      }
    };
    assignLanes(-1, topAvail);
    assignLanes(1, botAvail);

    // --- Drawing ---
    const boxH = 22;
    const pointerOnLine = !this.cleanWheel;
    const TRI_H = 10;
    const TRI_W = 12;

    for (const m of sorted) {
      const boxY = m.laneY - boxH / 2;
      let boxX = m.screenX - m.boxW / 2;
      boxX = Math.max(8, Math.min(boxX, w - m.boxW - 8));
      const below = m.laneY > this.horizonY;

      if (m.isEdge) {
        // Direction chevron at the wheel edge, pointing off-screen
        this.drawEdgeMarker(m.screenX, this.horizonY, m.loc, m.distance, m.side < 0, true);
      } else if (pointerOnLine) {
        // Pointer triangle on the horizon
        ctx.beginPath();
        ctx.moveTo(m.screenX, below ? this.horizonY - TRI_H : this.horizonY + TRI_H);
        ctx.lineTo(m.screenX - TRI_W / 2, this.horizonY);
        ctx.lineTo(m.screenX + TRI_W / 2, this.horizonY);
        ctx.closePath();
        ctx.fillStyle = m.loc.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Clean wheel: tiny colored dot at the azimuth — a "center" that
        // never shifts with label width
        ctx.beginPath();
        ctx.arc(m.screenX, this.horizonY, 3, 0, Math.PI * 2);
        ctx.fillStyle = m.loc.color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Dashed plumb line at the true azimuth (at screenX — independent of
      // where the clamped label box ended up), horizon → lane
      const lineTop = m.isEdge
        ? null
        : (below ? this.horizonY + (pointerOnLine ? TRI_H : 5) : this.horizonY - (pointerOnLine ? TRI_H : 5));
      if (lineTop !== null) {
        const lineEnd = below ? boxY - 3 : boxY + boxH + 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(m.screenX, lineTop);
        ctx.lineTo(m.screenX, lineEnd);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label box (its x clamps at screen edges; the plumb line above
      // still marks the true azimuth)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      this.roundRect(ctx, boxX, boxY, m.boxW, boxH, 6);
      ctx.fill();

      // Color strip on the left edge
      ctx.fillStyle = m.loc.color;
      this.roundRect(ctx, boxX, boxY, 4, boxH, 2);
      ctx.fill();

      let textX = boxX + 12;
      if (m.isEdge) {
        // Direction chevron inside the box, on the side of the real marker
        ctx.strokeStyle = m.loc.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const cx = m.side < 0 ? boxX + 14 : boxX + m.boxW - 14;
        const cy = boxY + boxH / 2;
        if (m.side < 0) {
          ctx.moveTo(cx + 4, cy - 5);
          ctx.lineTo(cx - 2, cy);
          ctx.lineTo(cx + 4, cy + 5);
        } else {
          ctx.moveTo(cx - 4, cy - 5);
          ctx.lineTo(cx + 2, cy);
          ctx.lineTo(cx - 4, cy + 5);
        }
        ctx.stroke();
        textX = m.side < 0 ? boxX + 24 : boxX + 12;
      }

      const label = `${m.loc.name} • ${formatDistance(m.distance)}`;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, textX, boxY + boxH / 2 + 1);

      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'right';
      // Edge boxes carry a direction chevron instead of the bearing readout
      // (the chevron sits where the bearing would render)
      if (!m.isEdge) {
        ctx.fillText(`${Math.round(m.relBearing)}°`, boxX + m.boxW - 8, boxY + boxH / 2 + 1);
      }
    }
  }

  /**
   * FIXED LANES (clean wheel): the horizon keeps only N/E/S/W. Every
   * location renders as a self-contained label box — name • distance
   * plus a pointer chevron on the side of its true azimuth — placed in
   * one of 4 lanes: L1/L2 above the horizon, L-1/L-2 below. The box is
   * centered on the azimuth; when the azimuth would push it off-screen
   * it clamps and the chevron + plumb line still mark the true spot.
   *
   * More than 4 locations: lanes 1 (inner) are shared first — a box is
   * accepted into a shared lane only when it doesn't horizontally
   * overlap the box already there; otherwise it spills to lane 2, then
   * (beyond 5 locations) stacks further out with a dimmed plumb line
   * still anchoring it to its azimuth.
   */
  drawFixedLanes(sorted, w, h) {
    const { ctx } = this;
    const boxH = 24;
    const LANE_1 = 42;        // inner lane distance from the horizon
    const LANE_2 = 86;        // outer lane distance
    const MAX_LANES_PER_SIDE = 2;

    // Pass 1: assign each location to a (side, lane). Inner lanes first;
    // a shared slot requires ≥12px horizontal separation from the box
    // already in it.
    const slots = { above: [-1, -1], below: [-1, -1] }; // right edge per slot
    for (const m of sorted) {
      const chevronSide = m.isEdge ? m.side : (m.relSigned < 0 ? -1 : 1);
      m.chev = chevronSide;
      // Prefer the side the chevron points toward (label drifts toward
      // where the user should look); fall back by order for balance
      let sides = chevronSide < 0 ? ['above', 'below'] : ['below', 'above'];
      let placed = false;
      for (const sName of sides) {
        for (let lane = 0; lane < MAX_LANES_PER_SIDE; lane++) {
          const right = slots[sName][lane];
          const left = m.screenX - m.boxW / 2;
          if (right === -1 || left - right >= 12) {
            slots[sName][lane] = m.screenX + m.boxW / 2;
            m.laneSide = sName;
            m.laneIdx = lane;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) {
        // All 4 lanes' slots taken at this x — stack on the outermost
        // lane of the chevron side, further out
        m.laneSide = chevronSide < 0 ? 'above' : 'below';
        m.laneIdx = MAX_LANES_PER_SIDE; // lane 3rd row (overflow)
        slots[m.laneSide][MAX_LANES_PER_SIDE - 1] = m.screenX + m.boxW / 2;
      }
    }

    // Pass 2: draw
    for (const m of sorted) {
      const below = m.laneSide === 'below';
      const laneY = below
        ? this.horizonY + (m.laneIdx === 0 ? LANE_1 : LANE_2) + (m.laneIdx > 1 ? (m.laneIdx - 1) * 34 : 0)
        : this.horizonY - (m.laneIdx === 0 ? LANE_1 : LANE_2) - (m.laneIdx > 1 ? (m.laneIdx - 1) * 34 : 0);
      const boxY = laneY - boxH / 2;
      let boxX = m.screenX - m.boxW / 2;
      boxX = Math.max(8, Math.min(boxX, w - m.boxW - 8));

      // Dashed plumb line at the true azimuth: wheel → lane. This is the
      // only thing crossing the wheel area — cardinal letters stay alone.
      const lineStart = below ? this.horizonY + 6 : this.horizonY - 6;
      const lineEnd = below ? boxY - 4 : boxY + boxH + 4;
      ctx.strokeStyle = m.laneIdx > 1 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(m.screenX, lineStart);
      ctx.lineTo(m.screenX, lineEnd);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label box
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      this.roundRect(ctx, boxX, boxY, m.boxW, boxH, 6);
      ctx.fill();

      // Color strip on the left edge
      ctx.fillStyle = m.loc.color;
      this.roundRect(ctx, boxX, boxY, 4, boxH, 2);
      ctx.fill();

      // Pointer chevron inside the box, on the side of the azimuth
      const cx = m.chev < 0 ? boxX + 16 : boxX + m.boxW - 16;
      const cy = boxY + boxH / 2;
      ctx.strokeStyle = m.loc.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (m.chev < 0) {
        ctx.moveTo(cx + 5, cy - 6);
        ctx.lineTo(cx - 2, cy);
        ctx.lineTo(cx + 5, cy + 6);
      } else {
        ctx.moveTo(cx - 5, cy - 6);
        ctx.lineTo(cx + 2, cy);
        ctx.lineTo(cx - 5, cy + 6);
      }
      ctx.stroke();

      // Name • distance
      const label = `${m.loc.name} • ${formatDistance(m.distance)}`;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, m.chev < 0 ? boxX + 26 : boxX + 12, boxY + boxH / 2 + 1);

      // Bearing readout (hidden on edge boxes — chevron takes that slot)
      if (!m.isEdge) {
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(m.relBearing)}°`, boxX + m.boxW - 8, boxY + boxH / 2 + 1);
      }
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

  /**
   * Edge marker for a location just off-screen: chevron pointing toward the
   * marker's actual direction (off the left edge = chevron points left, so
   * panning left will bring it in), plus a mini label on the inner side.
   */
  drawEdgeMarker(x, y, loc, distance, isLeft, laneMode = false) {
    const { ctx } = this;
    const arrowSize = 16;

    // Arrow pointing toward the marker (off-screen)
    ctx.fillStyle = loc.color;
    ctx.beginPath();
    if (isLeft) {
      // Marker is further LEFT — chevron points left
      ctx.moveTo(x + arrowSize, y - 10);
      ctx.lineTo(x, y);
      ctx.lineTo(x + arrowSize, y + 10);
    } else {
      // Marker is further RIGHT — chevron points right
      ctx.moveTo(x - arrowSize, y - 10);
      ctx.lineTo(x, y);
      ctx.lineTo(x - arrowSize, y + 10);
    }
    ctx.closePath();
    ctx.fill();

    if (laneMode) {
      // Label rendered as a lane box; caller handles it. Only the chevron
      // belongs to the wheel.
      return;
    }

    // Mini label (non-lane mode)
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