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

import { SCENE }         from './constants.js';
import { CAMPFIRE_PATH } from './systems/path.js';

// ─────────────────────────────────────────────
// Palette (mirrors CSS variables; kept in sync
// manually so canvas and DOM look identical)
// ─────────────────────────────────────────────
const CLR = Object.freeze({
  BG:       '#0a0a0f',
  SURFACE:  'rgba(15, 15, 25, 0.85)',
  ACCENT:   '#e8a030',
  ACCENT2:  '#5b8fff',
  DANGER:   '#ff4444',
  TEXT:     '#f0ead6',
  MUTED:    '#7a7060',
  PATH:     '#1a1a28',
  GRASS:    '#0d1a0d',
});

/** One distinct colour per unit type. */
const UNIT_COLOURS = Object.freeze({
  Shield:    '#8888ff',   // blue-purple — defensive
  Archer:    '#44cc44',   // green        — ranged
  Swordsman: '#ffaa44',   // orange       — heavy melee
  Mage:      '#cc44ff',   // purple       — AoE magic
  Healer:    '#44ffcc',   // teal         — support
  Lancer:    '#ff6644',   // red-orange   — fast attacker
});

export class Renderer {
  /**
   * @param {HTMLCanvasElement}     canvas
   * @param {CanvasRenderingContext2D} ctx
   */
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx    = ctx;
    this._titlePhase = 0;  // internal animation counter (renderer-private)
  }

  // ─────────────────────────────────────────
  // Public entry point — called every frame
  // ─────────────────────────────────────────
  /**
   * @param {object} state — canonical game state from game.js (read-only)
   */
  draw(state) {
    const { width: W, height: H } = state.canvas;
    if (W === 0 || H === 0) return;  // guard against first-frame race

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

  /** Fill canvas with background colour. Called every frame before drawing. */
  _clear(W, H) {
    this.ctx.fillStyle = CLR.BG;
    this.ctx.fillRect(0, 0, W, H);
  }

  /**
   * Draw centred text with optional max-width.
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {string} [opts.fill]
   * @param {string} [opts.font]
   * @param {string} [opts.align]
   * @param {number} [opts.maxWidth]
   */
  _text(text, x, y, opts = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle   = opts.fill  ?? CLR.TEXT;
    ctx.font        = opts.font  ?? '16px Georgia, serif';
    ctx.textAlign   = opts.align ?? 'center';
    ctx.textBaseline = 'middle';
    opts.maxWidth
      ? ctx.fillText(text, x, y, opts.maxWidth)
      : ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: TITLE
  // Animated star-field + subtle pulse on logo area.
  // The actual logo/buttons are HTML (see index.html).
  // Canvas provides the atmospheric background only.
  // ─────────────────────────────────────────
  _drawTitle(state, W, H) {
    this._titlePhase += 0.008;
    const t = this._titlePhase;

    // Radial glow centred slightly above middle (behind the logo)
    const gx = W / 2;
    const gy = H * 0.42;
    const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.55);
    glow.addColorStop(0,   `rgba(232, 160, 48, ${0.07 + 0.03 * Math.sin(t)})`);
    glow.addColorStop(0.5, `rgba(91, 143, 255, ${0.04 + 0.02 * Math.sin(t * 1.3)})`);
    glow.addColorStop(1,   'rgba(10, 10, 15, 0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, W, H);

    // Pseudo-random stars (seeded by index so they're stable across frames)
    this._drawStars(W, H, t);
  }

  /**
   * Draw a field of twinkling stars.
   * Stars are deterministic — same positions every frame.
   * @param {number} W
   * @param {number} H
   * @param {number} t — animation phase
   */
  _drawStars(W, H, t) {
    const ctx   = this.ctx;
    const count = 120;
    // Cheap seedable PRNG inline (mulberry32)
    let seed = 0xdeadbeef;
    const rand = () => {
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
  // Show a simple waveform placeholder.
  // Phase 1A will pass real waveformData in state.audio.
  // ─────────────────────────────────────────
  _drawCalibration(state, W, H) {
    // Soft vignette
    const vig = this.ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.8);
    vig.addColorStop(0, 'rgba(10,10,15,0)');
    vig.addColorStop(1, 'rgba(10,10,15,0.7)');
    this.ctx.fillStyle = vig;
    this.ctx.fillRect(0, 0, W, H);

    // Waveform area (placeholder — animated sine until real data arrives)
    const waveY   = H * 0.72;
    const waveW   = Math.min(W * 0.7, 500);
    const waveH   = 60;
    const waveX   = (W - waveW) / 2;
    const samples = 128;
    const t       = performance.now() / 1000;

    this.ctx.save();
    this.ctx.strokeStyle = CLR.ACCENT2;
    this.ctx.lineWidth   = 2;
    this.ctx.globalAlpha = 0.6;
    this.ctx.beginPath();

    const data = state.audio.waveformData;

    for (let i = 0; i < samples; i++) {
      const x    = waveX + (i / (samples - 1)) * waveW;
      let amp;
      if (data && data.length) {
        // Real waveform from audio subsystem
        const idx = Math.floor((i / samples) * data.length);
        amp = data[idx];            // already normalised –1…1
      } else {
        // Animated placeholder
        amp = 0.15 * Math.sin(t * 3 + i * 0.25) * Math.sin(i * 0.08);
      }
      const y = waveY + amp * waveH;
      i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: PLAYING
  // Draws the game world: map, units, enemies.
  // Phase 1B will flesh out each sub-draw.
  // ─────────────────────────────────────────
  _drawPlaying(state, W, H) {
    this._drawMap(state, W, H);
    this._drawUnits(state);
    this._drawEnemies(state);
    this._drawAudioFeedback(state, W, H);
    this._drawPrompt(state, W, H);
  }

  /** Render the Campfire map (straight path placeholder). */
  _drawMap(state, W, H) {
    const ctx = this.ctx;

    // Ground
    ctx.fillStyle = CLR.GRASS;
    ctx.fillRect(0, 0, W, H);

    // Single straight path (Campfire map) — derive Y from actual path data
    // so the visual strip always aligns with where enemies walk.
    const pathY  = CAMPFIRE_PATH[0].y * H;  // fractional y → logical pixels
    const pathHH = H * 0.08;                 // half-height of path strip

    ctx.fillStyle = CLR.PATH;
    ctx.fillRect(0, pathY - pathHH, W, pathHH * 2);

    // Path edge highlights
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, pathY - pathHH); ctx.lineTo(W, pathY - pathHH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, pathY + pathHH); ctx.lineTo(W, pathY + pathHH); ctx.stroke();

    // Castle icon (right edge)
    this._drawCastle(state, W, H, pathY);

    // Spawn marker (left edge)
    ctx.fillStyle = 'rgba(255,100,100,0.25)';
    ctx.fillRect(0, pathY - pathHH, 6, pathHH * 2);
  }

  /**
   * Draw a minimal castle silhouette at the path exit.
   * Phase 1B will replace with proper sprite.
   */
  _drawCastle(state, W, H, pathY) {
    const ctx = this.ctx;
    const x   = W - 48;
    const y   = pathY;
    const s   = Math.min(H * 0.06, 32);

    ctx.save();
    ctx.fillStyle = state.lives > 5 ? CLR.ACCENT : CLR.DANGER;
    ctx.globalAlpha = 0.85;

    // Tower silhouette (simple rect + battlements)
    ctx.fillRect(x - s, y - s * 2.2, s * 2, s * 2);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(x - s + i * (s * 0.75), y - s * 2.2 - s * 0.4, s * 0.5, s * 0.4);
    }
    ctx.restore();
  }

  /** Render defender units — coloured circle per type + faint range ring. */
  _drawUnits(state) {
    const ctx = this.ctx;
    for (const unit of state.units) {
      const colour = UNIT_COLOURS[unit.type] ?? CLR.ACCENT2;
      const r      = unit.radius ?? 12;

      ctx.save();

      // Range ring (30 % opacity)
      if (unit.range) {
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, unit.range, 0, Math.PI * 2);
        ctx.strokeStyle = colour;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Body circle
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = colour;
      ctx.strokeStyle = CLR.TEXT;
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();

      // HP bar — only shown when damaged
      if (unit.maxHp && unit.hp !== undefined && unit.hp < unit.maxHp) {
        const bw  = r * 2.5;
        const bh  = 3;
        const bx  = unit.x - bw / 2;
        const by  = unit.y - r - 8;
        const pct = Math.max(0, unit.hp / unit.maxHp);

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#44ff88';
        ctx.fillRect(bx, by, bw * pct, bh);
      }

      ctx.restore();
    }
  }

  /** Render enemy units (placeholder circles). */
  _drawEnemies(state) {
    const ctx = this.ctx;
    for (const enemy of state.enemies) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius ?? 10, 0, Math.PI * 2);
      ctx.fillStyle   = CLR.DANGER;
      ctx.strokeStyle = '#ff8888';
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();

      // HP bar above enemy
      if (enemy.maxHp && enemy.hp !== undefined) {
        const bw  = (enemy.radius ?? 10) * 2.5;
        const bh  = 3;
        const bx  = enemy.x - bw / 2;
        const by  = enemy.y - (enemy.radius ?? 10) - 8;
        const pct = Math.max(0, enemy.hp / enemy.maxHp);

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = pct > 0.5 ? '#44ff88' : CLR.DANGER;
        ctx.fillRect(bx, by, bw * pct, bh);
      }
      ctx.restore();
    }
  }

  /**
   * Visualise detected chord / audio confidence.
   * Drawn as a small indicator in the lower-left corner.
   * Phase 1C will expand this with the prompt system.
   */
  _drawAudioFeedback(state, W, H) {
    const { detectedChord, confidence } = state.audio;
    if (!detectedChord) return;

    const ctx  = this.ctx;
    const pad  = 20;
    const x    = pad;
    const y    = H - pad - 60;

    ctx.save();
    ctx.globalAlpha = 0.85;

    // Background pill
    ctx.fillStyle   = CLR.SURFACE;
    ctx.beginPath();
    ctx.roundRect(x, y, 160, 60, 8);
    ctx.fill();

    // Chord name
    this._text(detectedChord, x + 50, y + 22, {
      fill:  CLR.ACCENT,
      font:  'bold 20px Georgia, serif',
      align: 'center',
    });

    // Confidence bar
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 10, y + 40, 140, 8);
    ctx.fillStyle = CLR.ACCENT2;
    ctx.fillRect(x + 10, y + 40, 140 * Math.min(confidence, 1), 8);

    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Prompt overlay — chord to play next
  // ─────────────────────────────────────────

  /**
   * Draw the current chord prompt centred at the bottom of the screen.
   * Visible whenever state.prompt.active is true and a chord is set.
   *
   * Layout (from bottom):
   *   H - 50  — subtitle "play this chord to spawn a unit" (16 px)
   *   H - 90  — chord name in bold 48 px (vertically centred at that y)
   */
  _drawPrompt(state, W, H) {
    if (!state.prompt.active || !state.prompt.chord) return;

    // Chord name
    this._text(state.prompt.chord, W / 2, H - 90, {
      fill:  CLR.ACCENT,
      font:  'bold 48px Georgia, serif',
      align: 'center',
    });

    // Subtitle
    this._text('play this chord to spawn a unit', W / 2, H - 50, {
      fill:  CLR.MUTED,
      font:  '16px Georgia, serif',
      align: 'center',
    });
  }

  // ─────────────────────────────────────────
  // Scene: VICTORY / DEFEAT
  // Canvas provides a background wash only;
  // HTML overlay carries the text and buttons.
  // ─────────────────────────────────────────
  _drawVictory(state, W, H) {
    this._drawEndScreen(W, H, CLR.ACCENT2, 0.18);
  }

  _drawDefeat(state, W, H) {
    this._drawEndScreen(W, H, CLR.DANGER, 0.12);
  }

  /**
   * Shared full-screen colour wash for end screens.
   * @param {number} W
   * @param {number} H
   * @param {string} colour  — CSS colour string
   * @param {number} alpha
   */
  _drawEndScreen(W, H, colour, alpha) {
    this.ctx.save();
    this.ctx.fillStyle = colour;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillRect(0, 0, W, H);
    this.ctx.restore();
  }
}
