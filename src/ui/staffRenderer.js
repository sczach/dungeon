/**
 * @file src/ui/staffRenderer.js
 * Renders the unified musical staff at the top of the screen.
 *
 * Reads state.staffQueue (never mutates it) and draws:
 *   - 5-line treble staff with clef
 *   - Note heads positioned by pitch (C3–B3 mapped to staff lines/spaces)
 *   - Color coding: red-bordered = attack, blue-bordered = summon
 *   - Status colors: amber = active, green = hit, red = miss, dim = pending
 *   - Connector line from active attack note to targeted enemy
 *   - Charge gauge on the left side
 *   - Combo counter
 *
 * Pure output — never mutates state.
 */

import { staffQueueSystem } from '../systems/staffQueue.js';

// ─── Layout constants ───────────────────────────────────────────────────────

const STAFF_TOP    = 8;       // px from top of canvas
const STAFF_H      = 60;      // total height of the 5-line staff area
const STAFF_PAD_X  = 60;      // left padding (room for clef + charge gauge)
const STAFF_PAD_R  = 16;      // right padding
const NOTE_SPACING = 48;      // horizontal px between note centers
const PLAYHEAD_PCT = 0.20;    // active note sits at 20% from left

// Staff geometry: 5 lines, 4 spaces. Notes map to positions 0–6 (C3–B3).
// Position 0 (C3) = below bottom line (ledger line territory)
// Position 2 (E3) = bottom line
// Position 6 (B3) = above top line
const LINE_POSITIONS = [2, 3, 4, 5, 6]; // staff lines at positions E3, F3, G3, A3, B3
// Actually: standard staff with positions mapping:
// We use a simpler mapping: lineY = staffBottom - (pos * STEP)
// where STEP = STAFF_H / 8 gives us nice spacing

/** Note → staff position (0=C3 bottom, 6=B3 top). */
const NOTE_POS = {
  'C3': 0, 'D3': 1, 'E3': 2, 'F3': 3, 'G3': 4, 'A3': 5, 'B3': 6,
  'C#3': 0.5, 'D#3': 1.5, 'F#3': 3.5, 'G#3': 4.5, 'A#3': 5.5,
};

/** Note → QWERTY key label. */
const NOTE_KEY = {
  'C3': 'H', 'D3': 'J', 'E3': 'K', 'F3': 'L',
  'G3': ';', 'A3': "'", 'B3': '↵',
  'C#3': 'U', 'D#3': 'I', 'F#3': 'O', 'G#3': 'P', 'A#3': '[',
};

// ─── Colors ─────────────────────────────────────────────────────────────────

const CLR = {
  STAFF_LINE:  'rgba(200, 185, 155, 0.35)',
  STAFF_BG:    'rgba(10, 10, 15, 0.85)',
  ATTACK:      '#ff6666',   // red for attack notes
  SUMMON:      '#5b8fff',   // blue for summon notes
  HIT:         '#44ff88',   // green
  MISS:        '#ff4444',   // red
  ACTIVE:      '#e8a030',   // amber
  PENDING:     'rgba(200, 185, 155, 0.35)',
  CONNECTOR:   'rgba(232, 160, 48, 0.4)',
  CHARGE_BG:   'rgba(30, 30, 50, 0.7)',
  CHARGE_FILL: ['#5b8fff', '#44ddff', '#ffffff'],  // level 1, 2, 3
  TEXT:        '#f0ead6',
  MUTED:       '#7a7060',
};

// ─── Draw ───────────────────────────────────────────────────────────────────

/**
 * Draw the musical staff, notes, charge gauge, and connector lines.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state — full game state (read-only)
 * @param {number} W — logical canvas width
 * @param {number} H — logical canvas height
 */
export function drawStaff(ctx, state, W, H) {
  const sq = state.staffQueue;
  if (!sq || !sq.notes.length) return;

  const staffW   = W - STAFF_PAD_X - STAFF_PAD_R;
  const staffBot = STAFF_TOP + STAFF_H;
  const step     = STAFF_H / 8;  // vertical step per note position

  ctx.save();

  // ── Background panel ────────────────────────────────────────────────────
  ctx.fillStyle = CLR.STAFF_BG;
  ctx.fillRect(0, 0, W, staffBot + 26);  // extra space for key labels below

  // ── 5 staff lines ───────────────────────────────────────────────────────
  ctx.strokeStyle = CLR.STAFF_LINE;
  ctx.lineWidth = 0.8;
  // Lines at positions 2, 3, 4, 5, 6 (E3, F3, G3, A3, B3)
  for (let p = 2; p <= 6; p++) {
    const ly = staffBot - p * step;
    ctx.beginPath();
    ctx.moveTo(STAFF_PAD_X - 8, ly);
    ctx.lineTo(W - STAFF_PAD_R, ly);
    ctx.stroke();
  }

  // ── Treble clef symbol ──────────────────────────────────────────────────
  ctx.font = `${STAFF_H * 0.9}px Georgia`;
  ctx.fillStyle = 'rgba(200, 185, 155, 0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('𝄞', STAFF_PAD_X - 20, STAFF_TOP + STAFF_H * 0.45);

  // ── Playhead position ───────────────────────────────────────────────────
  const playheadX = STAFF_PAD_X + staffW * PLAYHEAD_PCT;

  // Find the active note index
  const activeIdx = sq.notes.findIndex(n => n.status === 'active');
  const refIdx = activeIdx >= 0 ? activeIdx : 0;

  // ── Draw notes ──────────────────────────────────────────────────────────
  const now = performance.now();
  for (let i = 0; i < sq.notes.length; i++) {
    const n = sq.notes[i];
    const noteX = playheadX + (i - refIdx) * NOTE_SPACING;

    // Skip if off-screen
    if (noteX < STAFF_PAD_X - 30 || noteX > W + 30) continue;

    const pos = NOTE_POS[n.note] ?? 0;
    const noteY = staffBot - pos * step;

    // ── Ledger line for C3 (below staff) ────────────────────────────────
    if (pos < 2) {
      ctx.strokeStyle = CLR.STAFF_LINE;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(noteX - 12, staffBot - 0 * step);  // C3 ledger
      ctx.lineTo(noteX + 12, staffBot - 0 * step);
      ctx.stroke();
    }
    if (pos < 1) {
      // D3 doesn't need a ledger — it sits in the space below bottom line
    }

    // ── Note color by status ────────────────────────────────────────────
    let fillColor, strokeColor, alpha;
    switch (n.status) {
      case 'hit':
        fillColor = CLR.HIT;
        strokeColor = CLR.HIT;
        alpha = Math.max(0.3, 1 - (now - n.statusTime) / 200);
        break;
      case 'miss':
        fillColor = CLR.MISS;
        strokeColor = CLR.MISS;
        alpha = 0.8 + 0.2 * Math.sin((now - n.statusTime) * 0.02);
        break;
      case 'active': {
        fillColor = CLR.ACTIVE;
        strokeColor = n.purpose === 'attack' ? CLR.ATTACK : CLR.SUMMON;
        // Gentle pulse
        const pulse = 1 + 0.08 * Math.sin(now * 0.006);
        alpha = pulse;
        break;
      }
      default:  // pending
        fillColor = CLR.PENDING;
        strokeColor = n.purpose === 'attack' ? CLR.ATTACK : CLR.SUMMON;
        alpha = 0.5;
    }

    ctx.globalAlpha = Math.min(1, alpha);

    // ── Purpose indicator (border color) ────────────────────────────────
    // Draw a colored circle behind the note for purpose
    ctx.fillStyle = strokeColor;
    ctx.globalAlpha = Math.min(1, alpha) * 0.15;
    ctx.beginPath();
    ctx.arc(noteX, noteY, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = Math.min(1, alpha);

    // ── Note head (filled ellipse) ──────────────────────────────────────
    ctx.save();
    ctx.translate(noteX, noteY);
    ctx.rotate(-0.18);  // slight tilt like real notation
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── Stem ────────────────────────────────────────────────────────────
    if (n.status !== 'hit') {
      const stemDir = pos < 4 ? -1 : 1;  // stems up for low notes, down for high
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = Math.min(1, alpha) * 0.7;
      ctx.beginPath();
      ctx.moveTo(noteX + (stemDir < 0 ? 6 : -6), noteY);
      ctx.lineTo(noteX + (stemDir < 0 ? 6 : -6), noteY + stemDir * 22);
      ctx.stroke();
    }

    // ── Key label below note ────────────────────────────────────────────
    if (n.status === 'active' || n.status === 'pending') {
      ctx.globalAlpha = n.status === 'active' ? 0.9 : 0.35;
      ctx.font = `${n.status === 'active' ? 'bold ' : ''}11px Georgia`;
      ctx.fillStyle = n.status === 'active' ? CLR.ACTIVE : CLR.MUTED;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(NOTE_KEY[n.note] || n.note, noteX, staffBot + 6);
    }

    ctx.globalAlpha = 1;
  }

  // ── Playhead marker ─────────────────────────────────────────────────────
  ctx.strokeStyle = CLR.ACTIVE;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(playheadX, STAFF_TOP - 2);
  ctx.lineTo(playheadX, staffBot + 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ── Combo counter (top-right of staff) ──────────────────────────────────
  if (sq.combo > 0) {
    ctx.font = 'bold 14px Georgia';
    ctx.fillStyle = sq.combo >= 5 ? CLR.HIT : CLR.ACTIVE;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`×${sq.combo}`, W - STAFF_PAD_R - 4, STAFF_TOP + 2);
  }

  // ── Charge gauge (left side) ────────────────────────────────────────────
  _drawChargeGauge(ctx, sq, STAFF_TOP, STAFF_H);

  // ── Connector line to targeted enemy ────────────────────────────────────
  const target = staffQueueSystem.getActiveTarget(state);
  if (target && target.alive) {
    const active = sq.notes.find(n => n.status === 'active');
    if (active) {
      const noteX = playheadX;
      const pos = NOTE_POS[active.note] ?? 0;
      const noteY = staffBot - pos * step;

      ctx.strokeStyle = CLR.CONNECTOR;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(noteX, noteY + 8);
      ctx.lineTo(target.x, target.y - 14);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small target indicator above enemy
      ctx.fillStyle = CLR.ATTACK;
      ctx.globalAlpha = 0.6 + 0.2 * Math.sin(now * 0.005);
      ctx.beginPath();
      ctx.arc(target.x, target.y - 18, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ── Mode label ──────────────────────────────────────────────────────────
  ctx.font = 'bold 10px Georgia';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = state.inputMode === 'attack' ? CLR.ATTACK : CLR.SUMMON;
  const modeLabel = state.inputMode === 'attack' ? '⚔ ATTACK' : '♪ SUMMON';
  ctx.fillText(modeLabel, STAFF_PAD_X, staffBot + 6);

  ctx.restore();
}

// ─── Charge gauge ───────────────────────────────────────────────────────────

/**
 * Draw a vertical battery gauge on the left showing charge level.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} sq — staffQueue state
 * @param {number} top — Y position of staff top
 * @param {number} h — staff height
 */
function _drawChargeGauge(ctx, sq, top, h) {
  const gaugeW = 12;
  const gaugeH = h - 4;
  const gaugeX = 8;
  const gaugeY = top + 2;

  // Background
  ctx.fillStyle = CLR.CHARGE_BG;
  ctx.fillRect(gaugeX, gaugeY, gaugeW, gaugeH);
  ctx.strokeStyle = 'rgba(200, 185, 155, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(gaugeX, gaugeY, gaugeW, gaugeH);

  // Fill (bottom-up)
  const fillPct = Math.min(1, sq.chargeLevel / 3.0);
  const fillH = gaugeH * fillPct;

  if (fillPct > 0) {
    const level = sq.chargeLevel >= 3 ? 2 : sq.chargeLevel >= 2 ? 1 : 0;
    ctx.fillStyle = CLR.CHARGE_FILL[level];
    ctx.globalAlpha = 0.7 + 0.15 * Math.sin(performance.now() * 0.004);
    ctx.fillRect(gaugeX + 1, gaugeY + gaugeH - fillH, gaugeW - 2, fillH);
    ctx.globalAlpha = 1;
  }

  // Level markers (horizontal lines at 1/3 and 2/3)
  ctx.strokeStyle = 'rgba(200, 185, 155, 0.2)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 2; i++) {
    const y = gaugeY + gaugeH * (1 - i / 3);
    ctx.beginPath();
    ctx.moveTo(gaugeX, y);
    ctx.lineTo(gaugeX + gaugeW, y);
    ctx.stroke();
  }

  // "⚡" label if charged
  if (sq.chargeLevel >= 1.0) {
    ctx.font = 'bold 10px Georgia';
    ctx.fillStyle = '#ffdd44';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('⚡', gaugeX + gaugeW / 2, gaugeY - 1);
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * Get the total height consumed by the staff panel (for layout below it).
 * @returns {number}
 */
export function getStaffHeight() {
  return STAFF_TOP + STAFF_H + 26;  // includes key labels area
}
