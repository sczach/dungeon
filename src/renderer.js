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

// ─────────────────────────────────────────────
// Unit team colours
// ─────────────────────────────────────────────
const TEAM_COLOUR = Object.freeze({
  player: '#5b8fff',   // blue
  enemy:  '#ff4444',   // red
});

const TEAM_STROKE = Object.freeze({
  player: '#aac8ff',
  enemy:  '#ff9988',
});

export class Renderer {
  /**
   * @param {HTMLCanvasElement}        canvas
   * @param {CanvasRenderingContext2D} ctx
   */
  constructor(canvas, ctx) {
    this.canvas      = canvas;
    this.ctx         = ctx;
    this._titlePhase = 0;
  }

  // ─────────────────────────────────────────
  // Public entry point — called every frame
  // ─────────────────────────────────────────

  /** @param {object} state — canonical game state (read-only) */
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
    opts.maxWidth
      ? ctx.fillText(text, x, y, opts.maxWidth)
      : ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: TITLE
  // ─────────────────────────────────────────

  _drawTitle(state, W, H) {
    this._titlePhase += 0.008;
    const t  = this._titlePhase;
    const gx = W / 2;
    const gy = H * 0.42;

    const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.55);
    glow.addColorStop(0,   `rgba(232, 160, 48, ${0.07 + 0.03 * Math.sin(t)})`);
    glow.addColorStop(0.5, `rgba(91, 143, 255, ${0.04 + 0.02 * Math.sin(t * 1.3)})`);
    glow.addColorStop(1,   'rgba(10, 10, 15, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, W, H);

    this._drawStars(W, H, t);
  }

  _drawStars(W, H, t) {
    const ctx   = this.ctx;
    const count = 120;
    let seed    = 0xdeadbeef;
    const rand  = () => {
      seed = (seed ^ (seed >>> 15)) * 0x85ebca77;
      seed = (seed ^ (seed >>> 13)) * 0xc2b2ae3d;
      seed ^= (seed >>> 16);
      return (seed >>> 0) / 0xffffffff;
    };

    ctx.save();
    for (let i = 0; i < count; i++) {
      const x     = rand() * W;
      const y     = rand() * H;
      const size  = rand() * 1.5 + 0.3;
      const phase = rand() * Math.PI * 2;
      const alpha = 0.3 + 0.5 * Math.sin(t * (0.5 + rand()) + phase);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240, 234, 214, ${alpha.toFixed(3)})`;
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

    const waveY   = H * 0.72;
    const waveW   = Math.min(W * 0.7, 500);
    const waveH   = 60;
    const waveX   = (W - waveW) / 2;
    const samples = 128;
    const t       = performance.now() / 1000;
    const data    = state.audio.waveformData;

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
      const y = waveY + amp * waveH;
      i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: PLAYING
  // ─────────────────────────────────────────

  _drawPlaying(state, W, H) {
    this._drawMap(W, H);
    this._drawBases(state, W, H);
    this._drawUnits(state);
    this._drawWaveAnnouncement(state, W, H);
    renderHUD(this.ctx, state, W, H);
  }

  /** Grass field + perspective combat strip. */
  _drawMap(W, H) {
    const ctx  = this.ctx;
    const laneY = LANE_Y * H;
    const laneH = LANE_HEIGHT * H;
    const top   = laneY - laneH / 2;
    const bot   = laneY + laneH / 2;

    // Dark green grass fills entire canvas
    ctx.fillStyle = CLR.GRASS;
    ctx.fillRect(0, 0, W, H);

    // Combat strip — trapezoid slightly wider at the bottom (perspective hint)
    const margin = W * 0.03;
    ctx.fillStyle = CLR.STRIP;
    ctx.beginPath();
    ctx.moveTo(margin,         top);
    ctx.lineTo(W - margin,     top);
    ctx.lineTo(W,              bot);
    ctx.lineTo(0,              bot);
    ctx.closePath();
    ctx.fill();

    // Subtle edge highlights
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(margin,     top); ctx.lineTo(0,     bot); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - margin, top); ctx.lineTo(W,     bot); ctx.stroke();
  }

  /**
   * Draw both bases — player (amber) on left, enemy (red) on right.
   * Each has a castle body, battlements, and an HP bar below.
   */
  _drawBases(state, W, H) {
    if (!state.playerBase || !state.enemyBase) return;

    const laneY = LANE_Y * H;
    const laneH = LANE_HEIGHT * H;
    const baseW = BASE_WIDTH * W;
    const baseH = laneH * 1.5;    // taller than the lane strip

    this._drawBase(
      state.playerBase,
      PLAYER_BASE_X * W,
      laneY - baseH / 2,
      baseW, baseH,
      '#7a4810', '#e8a030',   // player: amber/gold
    );

    this._drawBase(
      state.enemyBase,
      ENEMY_BASE_X * W,
      laneY - baseH / 2,
      baseW, baseH,
      '#6a1010', '#ff4444',   // enemy: red
    );
  }

  /**
   * Draw a single castle base with battlements + HP bar.
   * @param {import('./systems/base.js').Base} base
   * @param {number} x      — left edge of base rectangle
   * @param {number} y      — top edge of base rectangle
   * @param {number} w
   * @param {number} h
   * @param {string} dark   — body fill colour
   * @param {string} light  — stroke / accent colour
   */
  _drawBase(base, x, y, w, h, dark, light) {
    const ctx    = this.ctx;
    const hpFrac = base.hp / base.maxHp;

    ctx.save();

    // Main body
    ctx.fillStyle   = dark;
    ctx.strokeStyle = light;
    ctx.lineWidth   = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // Battlements — 4 merlons across the top
    const mW = w / 7;
    const mH = h * 0.14;
    ctx.fillStyle   = dark;
    ctx.strokeStyle = light;
    ctx.lineWidth   = 1.5;
    for (let i = 0; i < 4; i++) {
      const mx = x + mW * (i * 1.5 + 0.25);
      ctx.fillRect(mx, y - mH, mW, mH);
      ctx.strokeRect(mx, y - mH, mW, mH);
    }

    // HP bar below the base
    const barW = w;
    const barH = 6;
    const barX = x;
    const barY = y + h + 5;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = hpFrac > 0.5
      ? '#44ff88'
      : hpFrac > 0.25
        ? '#ffcc00'
        : CLR.DANGER;
    ctx.fillRect(barX, barY, barW * hpFrac, barH);

    // HP text inside the base body
    const pctText = `${Math.round(hpFrac * 100)}%`;
    ctx.font         = `bold ${Math.max(9, Math.min(13, w * 0.18))}px Georgia, serif`;
    ctx.fillStyle    = light;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pctText, x + w / 2, y + h / 2);

    ctx.restore();
  }

  /**
   * Draw all units — player units as blue circles, enemy units as red circles.
   * Tier determines radius. HP bar shown above each unit.
   */
  _drawUnits(state) {
    const ctx = this.ctx;
    for (const unit of state.units) {
      if (!unit.alive) continue;

      const colour = TEAM_COLOUR[unit.team] ?? CLR.ACCENT2;
      const stroke = TEAM_STROKE[unit.team] ?? '#ffffff';
      const r      = unit.radius ?? 12;

      ctx.save();

      // Body circle
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = colour;
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();

      // Tier number inside circle
      ctx.font         = `bold ${Math.max(8, r * 0.8)}px Georgia, serif`;
      ctx.fillStyle    = 'rgba(255,255,255,0.85)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(unit.tier), unit.x, unit.y);

      // HP bar above unit (always shown)
      const bw  = r * 2.6;
      const bh  = 3;
      const bx  = unit.x - bw / 2;
      const by  = unit.y - r - 6;
      const pct = Math.max(0, unit.hp / unit.maxHp);

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#44ff88' : pct > 0.25 ? '#ffcc00' : CLR.DANGER;
      ctx.fillRect(bx, by, bw * pct, bh);

      ctx.restore();
    }
  }

  /** "WAVE N" fade-out announcement. */
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
}
