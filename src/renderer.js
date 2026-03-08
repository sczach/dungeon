/**
 * @file src/renderer.js
 * @description
 *   Chord Wars — Renderer.
 *   PURE OUTPUT: reads game state, draws to canvas.
 *   NEVER mutates any value in state.
 *   All draw calls route through Renderer.draw(state) → per-scene method.
 *
 *   Coordinate system: logical pixels (ctx already scaled for DPR by game.js).
 */

import {
  SCENE,
  LANE_Y, LANE_HEIGHT,
  BASE_WIDTH, PLAYER_BASE_X, ENEMY_BASE_X,
} from './constants.js';
import { renderHUD } from './ui/hud.js';

// ─────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────
const CLR = Object.freeze({
  BG:      '#0a0a0f',
  GRASS:   '#1a3d1a',
  STRIP:   '#0d1a0d',
  ACCENT:  '#e8a030',
  ACCENT2: '#5b8fff',
  DANGER:  '#ff4444',
  TEXT:    '#f0ead6',
  MUTED:   '#7a7060',
});

const TEAM_COLOUR = Object.freeze({ player: '#5b8fff', enemy: '#ff4444' });
const TEAM_STROKE = Object.freeze({ player: '#aac8ff', enemy: '#ff9988' });

// Note → QWERTY key label (right-hand layout, for sequence pill display)
const NOTE_TO_KEY = Object.freeze({
  'C3':  'H', 'D3':  'J', 'E3':  'K', 'F3':  'L',
  'G3':  ';', 'A3':  "'", 'B3':  '↵',
  'C#3': 'U', 'D#3': 'I', 'F#3': 'O', 'G#3': 'P', 'A#3': '[',
});

/**
 * Maps note name → staff step position (0 = bottom / C3, 6 = B3).
 * Sharps share the natural's integer position (same line/space, no accidentals drawn).
 */
const NOTE_TO_STAFF_POS = Object.freeze({
  'C3': 0, 'D3': 1, 'E3': 2, 'F3': 3, 'G3': 4, 'A3': 5, 'B3': 6,
  'C#3': 0, 'D#3': 1, 'F#3': 3, 'G#3': 4, 'A#3': 5,
  'C4': 7,  // fallback if attackSequence.js still uses C4
});

export class Renderer {
  /** @param {HTMLCanvasElement} canvas  @param {CanvasRenderingContext2D} ctx */
  constructor(canvas, ctx) {
    this.canvas      = canvas;
    this.ctx         = ctx;
    this._titlePhase = 0;
  }

  // ─────────────────────────────────────────
  // Public
  // ─────────────────────────────────────────

  /** @param {object} state */
  draw(state) {
    const { width: W, height: H } = state.canvas;
    if (W === 0 || H === 0) return;
    this._clear(W, H);
    switch (state.scene) {
      case SCENE.TITLE:       this._drawTitle(state, W, H);       break;
      case SCENE.CALIBRATION: this._drawCalibration(state, W, H); break;
      case SCENE.PLAYING:     this._drawPlaying(state, W, H);     break;
      case SCENE.VICTORY:     this._drawVictory(state, W, H);     break;
      case SCENE.DEFEAT:      this._drawDefeat(state, W, H);      break;
    }
  }

  // ─────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────

  _clear(W, H) {
    this.ctx.fillStyle = CLR.BG;
    this.ctx.fillRect(0, 0, W, H);
  }

  _text(text, x, y, opts = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle    = opts.fill  ?? CLR.TEXT;
    ctx.font         = opts.font  ?? '16px Georgia, serif';
    ctx.textAlign    = opts.align ?? 'center';
    ctx.textBaseline = 'middle';
    opts.maxWidth ? ctx.fillText(text, x, y, opts.maxWidth) : ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: TITLE
  // ─────────────────────────────────────────

  _drawTitle(state, W, H) {
    this._titlePhase += 0.008;
    const t  = this._titlePhase;
    const gx = W / 2, gy = H * 0.42;
    const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.55);
    glow.addColorStop(0,   `rgba(232,160,48,${0.07 + 0.03 * Math.sin(t)})`);
    glow.addColorStop(0.5, `rgba(91,143,255,${0.04 + 0.02 * Math.sin(t * 1.3)})`);
    glow.addColorStop(1,   'rgba(10,10,15,0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, W, H);
    this._drawStars(W, H, t);
  }

  _drawStars(W, H, t) {
    const ctx = this.ctx;
    let seed  = 0xdeadbeef;
    const rand = () => {
      seed = (seed ^ (seed >>> 15)) * 0x85ebca77;
      seed = (seed ^ (seed >>> 13)) * 0xc2b2ae3d;
      seed ^= (seed >>> 16);
      return (seed >>> 0) / 0xffffffff;
    };
    ctx.save();
    for (let i = 0; i < 120; i++) {
      const alpha = 0.3 + 0.5 * Math.sin(t * (0.5 + rand()) + rand() * Math.PI * 2);
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, rand() * 1.5 + 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,234,214,${alpha.toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: CALIBRATION
  // ─────────────────────────────────────────

  _drawCalibration(state, W, H) {
    const vig = this.ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.8);
    vig.addColorStop(0, 'rgba(10,10,15,0)');
    vig.addColorStop(1, 'rgba(10,10,15,0.7)');
    this.ctx.fillStyle = vig;
    this.ctx.fillRect(0, 0, W, H);

    const waveY = H * 0.72, waveW = Math.min(W * 0.7, 500);
    const waveX = (W - waveW) / 2, samples = 128;
    const t = performance.now() / 1000, data = state.audio.waveformData;
    this.ctx.save();
    this.ctx.strokeStyle = CLR.ACCENT2;
    this.ctx.lineWidth   = 2;
    this.ctx.globalAlpha = 0.6;
    this.ctx.beginPath();
    for (let i = 0; i < samples; i++) {
      const x   = waveX + (i / (samples - 1)) * waveW;
      const amp = (data && data.length)
        ? data[Math.floor((i / samples) * data.length)]
        : 0.15 * Math.sin(t * 3 + i * 0.25) * Math.sin(i * 0.08);
      const y = waveY + amp * 60;
      i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: PLAYING
  // Draw order matters for z-layering:
  //   tablature > map > bases > units > sequences > HUD
  // ─────────────────────────────────────────

  _drawPlaying(state, W, H) {
    // Map must come first — it fills the entire canvas with the grass background.
    // All UI overlays (tablature, cues, announcements) must come AFTER.
    this._drawMap(W, H);
    this._drawBases(state, W, H);
    this._drawUnits(state);
    this._drawEnemySequences(state, W, H);
    this._drawTablature(state, W, H);       // top-of-screen summon prompt (above map)
    this._drawChordCue(state, W, H);        // chord name + tab (above map)
    this._drawWaveAnnouncement(state, W, H);
    this._drawModeAnnouncement(state, W, H);
    renderHUD(this.ctx, state, W, H);
  }

  // ─────────────────────────────────────────
  // Tablature bar
  // ─────────────────────────────────────────

  /**
   * 3-note summon prompt bar at the top of the screen.
   * Only visible when state.inputMode === 'summon'.
   * Larger pills + 5-line staff notation above the pill row.
   * Red flash overlay when last summon was blocked by insufficient resources.
   */
  _drawTablature(state, W, H) {       // eslint-disable-line no-unused-vars
    if (state.inputMode !== 'summon') return;   // hidden in attack mode
    if (!state.tablature || !state.tablature.queue.length) return;
    const tab = state.tablature;

    const BAR_Y   = 8;
    const BAR_H   = 96;   // taller than kill cues for prominence
    const BAR_W   = W * 0.55;
    const BAR_X   = (W - BAR_W) / 2;
    const SLOTS   = 3;    // 3-note prompt
    const slotW   = BAR_W / SLOTS;
    const ctx     = this.ctx;
    const now     = performance.now();

    ctx.save();

    // Panel background
    ctx.fillStyle   = 'rgba(10, 10, 15, 0.88)';
    ctx.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
    ctx.strokeStyle = '#3a3040';
    ctx.lineWidth   = 1;
    ctx.strokeRect(BAR_X, BAR_Y, BAR_W, BAR_H);

    // "SUMMON" label — top-left of bar
    ctx.font         = 'bold 9px Georgia, serif';
    ctx.fillStyle    = '#44ff88';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('♪ SUMMON', BAR_X + 6, BAR_Y + 4);

    // ── 5-line staff spanning the full bar ─────────────────────────────────
    const STAFF_TOP  = BAR_Y + 14;
    const STAFF_H    = 24;    // 5 lines with 4 gaps of 6px each
    const STEP       = STAFF_H / 8;   // same formula as enemy sequences
    ctx.strokeStyle  = 'rgba(200,185,155,0.45)';
    ctx.lineWidth    = 0.5;
    for (let l = 0; l < 5; l++) {
      const ly = STAFF_TOP + STAFF_H - l * STEP * 2;
      ctx.beginPath();
      ctx.moveTo(BAR_X + 4, ly);
      ctx.lineTo(BAR_X + BAR_W - 4, ly);
      ctx.stroke();
    }

    // Note heads on staff, evenly distributed across bar width
    const headStep = BAR_W / (SLOTS + 1);
    for (let i = 0; i < SLOTS; i++) {
      if (i >= tab.queue.length) break;
      const slot    = tab.queue[i];
      const pos     = NOTE_TO_STAFF_POS[slot.note] ?? 3;
      const ny      = STAFF_TOP + STAFF_H - pos * STEP;
      const nx      = BAR_X + headStep * (i + 0.6);
      const isDone  = slot.status === 'hit';
      const isMiss  = slot.status === 'miss';
      ctx.beginPath();
      ctx.ellipse(nx, ny, 5.5, 3.5, -0.18, 0, Math.PI * 2);
      ctx.fillStyle   = isDone ? '#44ff88' : isMiss ? '#ff4444' : i === 0 ? CLR.ACCENT : 'rgba(240,234,214,0.55)';
      ctx.strokeStyle = 'rgba(30,20,10,0.7)';
      ctx.lineWidth   = 0.5;
      ctx.fill();
      ctx.stroke();
    }

    // ── Pill row ───────────────────────────────────────────────────────────
    const PILL_H  = 26;
    const PILL_W  = slotW * 0.78;
    const PILL_Y  = BAR_Y + BAR_H - PILL_H - 6;
    const t       = state.time || 0;

    for (let i = 0; i < SLOTS; i++) {
      if (i >= tab.queue.length) break;
      const slot      = tab.queue[i];
      const isActive  = (i === 0);
      const isDone    = slot.status === 'hit';
      const isMiss    = slot.status === 'miss';

      const scale = isActive ? 1 + 0.08 * Math.sin(t * 6) : 1;
      const pw    = PILL_W * scale;
      const ph    = PILL_H * scale;
      const px    = BAR_X + i * slotW + (slotW - pw) / 2;
      const py    = PILL_Y + (PILL_H - ph) / 2;

      ctx.fillStyle = isDone ? '#0d3a18' : isMiss ? '#3a0a0a' : isActive ? '#3a2800' : '#1e1e2e';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 4);
      else ctx.rect(px, py, pw, ph);
      ctx.fill();

      ctx.strokeStyle = isDone ? '#44ff88' : isMiss ? '#ff4444' : isActive ? CLR.ACCENT : '#4a4a5a';
      ctx.lineWidth   = isActive ? 2 : 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 4);
      else ctx.rect(px, py, pw, ph);
      ctx.stroke();

      const noteColor = isDone ? '#44ff88' : isMiss ? '#ff4444' : isActive ? CLR.ACCENT : CLR.TEXT;
      ctx.font         = `bold ${isActive ? 16 : 13}px Georgia, serif`;
      ctx.fillStyle    = noteColor;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.note, px + pw / 2, py + ph / 2 - 4);

      ctx.font      = `${isActive ? 11 : 9}px Georgia, serif`;
      ctx.fillStyle = isActive ? CLR.ACCENT : CLR.MUTED;
      ctx.fillText(`[${slot.key.toUpperCase()}]`, px + pw / 2, py + ph / 2 + 9);
    }

    // Combo counter (top-right of bar)
    if (tab.combo > 0) {
      ctx.font         = 'bold 11px Georgia, serif';
      ctx.fillStyle    = CLR.ACCENT;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`×${tab.combo}`, BAR_X + BAR_W - 6, BAR_Y + 4);
    }

    // ── Summon cooldown overlay ────────────────────────────────────────────
    const cooldownEnd = tab.summonCooldownEnd || 0;
    if (cooldownEnd > now) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle   = 'rgba(10, 10, 15, 0.6)';
      ctx.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
      ctx.globalAlpha  = 1;
      const secsLeft   = ((cooldownEnd - now) / 1000).toFixed(1);
      ctx.font         = 'bold 13px Georgia, serif';
      ctx.fillStyle    = CLR.ACCENT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Cooldown ${secsLeft}s`, BAR_X + BAR_W / 2, BAR_Y + BAR_H / 2);
    }

    // ── Resource-blocked red flash ─────────────────────────────────────────
    if (tab.blocked) {
      ctx.globalAlpha = 0.38;
      ctx.fillStyle   = '#ff2222';
      ctx.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);
      ctx.globalAlpha  = 1;
      ctx.font         = 'bold 13px Georgia, serif';
      ctx.fillStyle    = '#ff6666';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Not enough resources!', BAR_X + BAR_W / 2, BAR_Y + BAR_H / 2);
    }

    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Map
  // ─────────────────────────────────────────

  _drawMap(W, H) {
    const ctx    = this.ctx;
    const laneY  = LANE_Y * H;
    const laneH  = LANE_HEIGHT * H;
    const top    = laneY - laneH / 2;
    const bot    = laneY + laneH / 2;
    const margin = W * 0.03;

    ctx.fillStyle = CLR.GRASS;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = CLR.STRIP;
    ctx.beginPath();
    ctx.moveTo(margin,     top);
    ctx.lineTo(W - margin, top);
    ctx.lineTo(W,          bot);
    ctx.lineTo(0,          bot);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(margin,     top); ctx.lineTo(0, bot); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - margin, top); ctx.lineTo(W, bot); ctx.stroke();
  }

  // ─────────────────────────────────────────
  // Bases
  // ─────────────────────────────────────────

  _drawBases(state, W, H) {
    if (!state.playerBase || !state.enemyBase) return;
    const laneH = LANE_HEIGHT * H;
    const baseW = BASE_WIDTH * W;
    const baseH = laneH * 1.5;
    const laneY = LANE_Y * H;
    this._drawBase(state.playerBase, PLAYER_BASE_X * W, laneY - baseH / 2, baseW, baseH, '#7a4810', '#e8a030');
    this._drawBase(state.enemyBase,  ENEMY_BASE_X  * W, laneY - baseH / 2, baseW, baseH, '#6a1010', '#ff4444');
  }

  _drawBase(base, x, y, w, h, dark, light) {
    const ctx    = this.ctx;
    const hpFrac = base.hp / base.maxHp;
    ctx.save();

    ctx.fillStyle = dark; ctx.strokeStyle = light; ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);

    const mW = w / 7, mH = h * 0.14;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const mx = x + mW * (i * 1.5 + 0.25);
      ctx.fillRect(mx, y - mH, mW, mH); ctx.strokeRect(mx, y - mH, mW, mH);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y + h + 5, w, 6);
    ctx.fillStyle = hpFrac > 0.5 ? '#44ff88' : hpFrac > 0.25 ? '#ffcc00' : CLR.DANGER;
    ctx.fillRect(x, y + h + 5, w * hpFrac, 6);

    ctx.font         = `bold ${Math.max(9, Math.min(13, w * 0.18))}px Georgia, serif`;
    ctx.fillStyle    = light;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(hpFrac * 100)}%`, x + w / 2, y + h / 2);

    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Units
  // ─────────────────────────────────────────

  /**
   * Draw all units with HP bars and tier numbers.
   * Stunned enemy units get a purple outer ring at 1.5× radius.
   */
  _drawUnits(state) {
    const ctx = this.ctx;
    for (const unit of state.units) {
      if (!unit.alive) continue;

      const colour = TEAM_COLOUR[unit.team] ?? CLR.ACCENT2;
      const stroke = TEAM_STROKE[unit.team] ?? '#ffffff';
      const r      = unit.radius ?? 12;

      ctx.save();

      // Stun ring — purple, drawn behind the body
      if (unit.stunned) {
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, r * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#cc44ff';
        ctx.lineWidth   = 3;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Body circle
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = colour;
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();

      // Tier number
      ctx.font         = `bold ${Math.max(8, r * 0.8)}px Georgia, serif`;
      ctx.fillStyle    = 'rgba(255,255,255,0.85)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(unit.tier), unit.x, unit.y);

      // HP bar above unit
      const bw = r * 2.6, bh = 3;
      const bx = unit.x - bw / 2, by = unit.y - r - 6;
      const pct = Math.max(0, unit.hp / unit.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#44ff88' : pct > 0.25 ? '#ffcc00' : CLR.DANGER;
      ctx.fillRect(bx, by, bw * pct, bh);

      ctx.restore();
    }
  }

  // ─────────────────────────────────────────
  // Enemy attack sequences
  // ─────────────────────────────────────────

  /**
   * Draw the floating note-pill row above each live enemy unit.
   * Completed pills: green.  Current pill: amber + pulse.  Remaining: dim grey.
   * QWERTY key label shown below each pill.
   */
  _drawEnemySequences(state, W, H) {   // eslint-disable-line no-unused-vars
    const ctx   = this.ctx;
    const t     = state.time || 0;
    const style = state.cueDisplayStyle || 'note';  // 'note' | 'qwerty' | 'staff'

    for (const unit of state.units) {
      if (!unit.alive || unit.team !== 'enemy') continue;
      if (!unit.attackSeq || unit.attackSeq.length === 0) continue;

      const seqLen = unit.attackSeq.length;
      const r      = unit.radius ?? 12;
      const PILL_W = 30, PILL_H = 16, GAP = 3;
      const totalW = seqLen * (PILL_W + GAP) - GAP;
      const baseY  = unit.y - r - 14 - PILL_H;

      ctx.save();

      if (style === 'staff') {
        // ── Staff-only mode: 5-line staff + filled note heads, no pill row ───
        const STAFF_W = Math.max(totalW, 56);
        const STAFF_H = 20;
        const STEP    = STAFF_H / 8;
        const staffX  = unit.x - STAFF_W / 2;
        const staffY  = unit.y - r - 14 - STAFF_H;

        ctx.strokeStyle = 'rgba(200,185,155,0.55)';
        ctx.lineWidth   = 0.5;
        for (let l = 0; l < 5; l++) {
          const ly = staffY + STAFF_H - l * STEP * 2;
          ctx.beginPath();
          ctx.moveTo(staffX, ly);
          ctx.lineTo(staffX + STAFF_W, ly);
          ctx.stroke();
        }
        // Background behind staff for readability
        ctx.globalAlpha = 0.55;
        ctx.fillStyle   = '#0a0a0f';
        ctx.fillRect(staffX - 2, staffY - 2, STAFF_W + 4, STAFF_H + 10);
        ctx.globalAlpha = 1;
        // Re-draw staff lines on top of background
        ctx.strokeStyle = 'rgba(200,185,155,0.65)';
        ctx.lineWidth   = 0.5;
        for (let l = 0; l < 5; l++) {
          const ly = staffY + STAFF_H - l * STEP * 2;
          ctx.beginPath();
          ctx.moveTo(staffX, ly);
          ctx.lineTo(staffX + STAFF_W, ly);
          ctx.stroke();
        }

        const headStep = STAFF_W / (seqLen + 1);
        for (let i = 0; i < seqLen; i++) {
          const note      = unit.attackSeq[i];
          const pos       = NOTE_TO_STAFF_POS[note] ?? 3;
          const ny        = staffY + STAFF_H - pos * STEP;
          const nx        = staffX + headStep * (i + 0.6);
          const isDone    = i < unit.attackSeqProgress;
          const isCurrent = i === unit.attackSeqProgress;
          ctx.beginPath();
          ctx.ellipse(nx, ny, 5, 3.5, -0.18, 0, Math.PI * 2);
          ctx.fillStyle   = isDone ? '#44ff88' : isCurrent ? CLR.ACCENT : 'rgba(240,234,214,0.6)';
          ctx.strokeStyle = 'rgba(30,20,10,0.8)';
          ctx.lineWidth   = 0.5;
          ctx.fill();
          ctx.stroke();
        }
      } else {
        // ── Pill-row mode: 'note' shows note names, 'qwerty' shows key labels ─
        const baseX = unit.x - totalW / 2;

        for (let i = 0; i < seqLen; i++) {
          const note      = unit.attackSeq[i];
          const isDone    = i < unit.attackSeqProgress;
          const isCurrent = i === unit.attackSeqProgress;

          const scale = isCurrent ? 1 + 0.1 * Math.sin(t * 6) : 1;
          const pw = PILL_W * scale, ph = PILL_H * scale;
          const px = baseX + i * (PILL_W + GAP) + (PILL_W - pw) / 2;
          const py = baseY + (PILL_H - ph) / 2;

          ctx.fillStyle = isDone ? '#0d3a18' : isCurrent ? '#3a2800' : '#1e1e2e';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 3);
          else ctx.rect(px, py, pw, ph);
          ctx.fill();

          ctx.strokeStyle = isDone ? '#44ff88' : isCurrent ? CLR.ACCENT : '#4a4a5a';
          ctx.lineWidth   = isDone ? 1.5 : isCurrent ? 2 : 1;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 3);
          else ctx.rect(px, py, pw, ph);
          ctx.stroke();

          // Label: QWERTY key in qwerty mode, note name otherwise
          const label = style === 'qwerty'
            ? (NOTE_TO_KEY[note] || note)
            : note;
          ctx.font         = `bold ${isCurrent ? 10 : 9}px Georgia, serif`;
          ctx.fillStyle    = isDone ? '#44ff88' : isCurrent ? CLR.ACCENT : '#8a8a9a';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, px + pw / 2, py + ph / 2);
        }
      }

      ctx.restore();
    }
  }

  // ─────────────────────────────────────────
  // Wave announcement
  // ─────────────────────────────────────────

  /**
   * Briefly display "Attack Mode" or "Summon Mode" after Space-bar toggle.
   * Fades out over 1.5 s. Drawn above the piano strip.
   */
  _drawModeAnnouncement(state, W, H) {
    if (!state.modeAnnounce) return;
    const elapsed = performance.now() - state.modeAnnounce;
    if (elapsed >= 1500) return;
    const ctx     = this.ctx;
    const alpha   = 1 - elapsed / 1500;
    const label   = state.inputMode === 'summon' ? '♪ Summon Mode' : '⚔ Attack Mode';
    const colour  = state.inputMode === 'summon' ? '#44ff88' : '#ff6666';
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.font         = 'bold 42px Georgia, serif';
    ctx.fillStyle    = colour;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, H * 0.62);
    ctx.restore();
  }

  _drawWaveAnnouncement(state, W, H) {
    if (!state.waveAnnounce || state.wave <= 0) return;
    const elapsed = performance.now() - state.waveAnnounce;
    if (elapsed >= 2000) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha  = 1 - elapsed / 2000;
    ctx.font         = 'bold 80px Georgia, serif';
    ctx.fillStyle    = '#ffffff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`WAVE ${state.wave}`, W / 2, H / 2);
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: VICTORY / DEFEAT
  // ─────────────────────────────────────────

  _drawVictory(state, W, H) { this._drawEndScreen(W, H, CLR.ACCENT2, 0.18); }
  _drawDefeat(state, W, H)  { this._drawEndScreen(W, H, CLR.DANGER,  0.12); }

  _drawEndScreen(W, H, colour, alpha) {
    this.ctx.save();
    this.ctx.fillStyle   = colour;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillRect(0, 0, W, H);
    this.ctx.restore();
  }

  // ─────────────────────────────────────────
  // Chord cue — top-center chord name + tab
  // ─────────────────────────────────────────

  /**
   * Draws the active guitar-chord cue (name + tab notation) at the top-center
   * of the canvas, below the tablature bar.
   * Only visible when state.showChordCues is true and state.currentPrompt is set.
   */
  _drawChordCue(state, W, H) {    // eslint-disable-line no-unused-vars
    if (!state.currentPrompt || !state.showChordCues) return;

    const { chord, tab, difficulty } = state.currentPrompt;
    const ctx = this.ctx;

    // ── Layout ──────────────────────────────────────────────────────────────
    const PANEL_W = 220;
    const PANEL_H = 68;
    const PANEL_X = (W - PANEL_W) / 2;
    const PANEL_Y = 110;   // just below the 96-px tablature bar

    // ── Difficulty colour ────────────────────────────────────────────────────
    const diffColour = difficulty === 'hard'   ? '#ff6644'
                     : difficulty === 'medium' ? '#ffcc00'
                     : '#44ff88';  // easy / default

    // ── Glow when detected chord matches ────────────────────────────────────
    const isMatch = !!(state.audio && state.audio.detectedChord === chord);
    if (isMatch) console.log('[chord-cue] detected match — applying green glow');

    ctx.save();

    // Panel background
    ctx.shadowBlur  = isMatch ? 20 : 0;
    ctx.shadowColor = '#44ff88';
    ctx.fillStyle   = 'rgba(10,10,18,0.82)';
    ctx.strokeStyle = isMatch ? '#44ff88' : '#3a3050';
    ctx.lineWidth   = isMatch ? 1.5 : 1;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
      ctx.strokeRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    }
    ctx.shadowBlur = 0;

    // Chord name (large)
    ctx.font         = 'bold 48px Georgia, serif';
    ctx.fillStyle    = diffColour;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(chord, W / 2, PANEL_Y + 5);

    // Tab notation (small mono below chord name)
    ctx.font         = '13px monospace';
    ctx.fillStyle    = '#a09880';
    ctx.textBaseline = 'bottom';
    ctx.fillText(tab, W / 2, PANEL_Y + PANEL_H - 5);

    ctx.restore();
  }
}
