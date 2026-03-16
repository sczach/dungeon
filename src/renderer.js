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
import { WorldMapRenderer } from './ui/worldMapRenderer.js';

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

/** Human-readable description of the enemy composition for each wave range. */
function waveDescription(wave) {
  if (wave <= 2)  return 'Grunt scouts approaching';
  if (wave <= 4)  return 'Grunt forces on the march';
  if (wave <= 6)  return 'Grunts & Brutes closing in!';
  if (wave <= 8)  return 'Elite Brutes — stay sharp!';
  if (wave === 9) return 'Titan assault incoming!';
  return 'FINAL ASSAULT — all forces!';
}

export class Renderer {
  /** @param {HTMLCanvasElement} canvas  @param {CanvasRenderingContext2D} ctx */
  constructor(canvas, ctx) {
    this.canvas           = canvas;
    this.ctx              = ctx;
    this._titlePhase      = 0;
    // Base damage flash: stores performance.now() when HP last dropped
    this._basePrevHp        = { player: -1 };
    this._baseDmgFlash      = { player: 0  };
    // Per-enemy-base flash tracking (indexed by position in state.enemyBases)
    this._enemyBasePrevHp   = [];
    this._enemyBaseDmgFlash = [];
    // World map renderer (lazy-created)
    this._worldMapRenderer  = null;
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
      case SCENE.TITLE:             this._drawTitle(state, W, H);       break;
      case SCENE.INSTRUMENT_SELECT: this._drawInstrumentSelect(W, H);   break;
      case SCENE.LEVEL_SELECT:      this._drawLevelSelect(W, H);        break;
      case SCENE.WORLD_MAP:         this._drawWorldMap(state, W, H);    break;
      case SCENE.LEVEL_START:       this._drawLevelStart(state, W, H);  break;
      case SCENE.CALIBRATION:       this._drawCalibration(state, W, H); break;
      case SCENE.PLAYING:           this._drawPlaying(state, W, H);     break;
      case SCENE.VICTORY:           this._drawVictory(state, W, H);     break;
      case SCENE.DEFEAT:            this._drawDefeat(state, W, H);      break;
      case SCENE.ENDGAME:           this._drawEndgame(W, H);            break;
    }
    // Debug overlay — toggled by backtick key; always on top of all scenes
    if (state.debugOverlay) this._drawDebugOverlay(state, W, H);
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
    // ── Screen shake ──────────────────────────────────────────────────────
    let shaking = false;
    if (state.shakeTime > 0 && state.shakeIntensity > 0) {
      const age = performance.now() - state.shakeTime;
      if (age < 300) {
        const intensity = state.shakeIntensity * (1 - age / 300);
        this.ctx.save();
        this.ctx.translate(
          (Math.random() * 2 - 1) * intensity,
          (Math.random() * 2 - 1) * intensity,
        );
        shaking = true;
      } else {
        state.shakeTime = 0;
      }
    }

    // Map must come first — it fills the entire canvas with the grass background.
    // All UI overlays (tablature, cues, announcements) must come AFTER.
    this._drawMap(W, H);
    this._drawBases(state, W, H);
    this._drawUnits(state);
    this._drawLightningBolts(state, W, H);
    this._drawProjectiles(state);
    this._drawDamageNumbers(state);
    this._drawEnemySequences(state, W, H);
    this._drawTablature(state, W, H);       // top-of-screen summon prompt (above map)
    this._drawChargeBar(state, W, H);       // charge bar (charge mode only)
    this._drawWaveAnnouncement(state, W, H);
    this._drawPhaseAnnouncement(state, W, H);
    this._drawPhaseLabel(state, W, H);
    this._drawCueCard(state, W, H);
    this._drawAttackCooldown(state, W, H);
    this._drawModeIndicator(state, W, H);
    this._drawUiTint(state, W, H);
    this._drawModeAnnouncement(state, W, H);
    this._drawTutorialOverlay(state, W, H);
    renderHUD(this.ctx, state, W, H);

    if (shaking) this.ctx.restore();
  }

  /** Persistent tutorial hint banner drawn at the top of the PLAYING screen. */
  _drawTutorialOverlay(state, W, H) {
    const hint = state.currentLevel?.tutorialOverlay;
    if (!hint) return;
    const ctx  = this.ctx;
    const bw   = Math.min(460, W * 0.86);
    const bh   = 34;
    const bx   = (W - bw) / 2;
    const by   = 10;
    ctx.save();
    ctx.fillStyle   = 'rgba(10,10,20,0.78)';
    ctx.strokeStyle = 'rgba(232,160,48,0.40)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();
    ctx.font         = '12px Georgia, serif';
    ctx.fillStyle    = '#c8b090';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hint, W / 2, by + bh / 2, bw - 18);
    ctx.restore();
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

    // Unit type label — top-center of bar (Mage spawns ×3 swarm units)
    const _uType    = tab.unitType || 'archer';
    const _typeLabel = _uType === 'mage' ? '🔮 Mage ×3' : _uType === 'knight' ? '⚔ Knight' : '🏹 Archer';
    ctx.font         = 'bold 9px Georgia, serif';
    ctx.fillStyle    = '#88aaff';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(_typeLabel, BAR_X + BAR_W / 2, BAR_Y + 4);

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
      ctx.fillStyle   = isDone ? '#44ff88' : isMiss ? '#ff4444' : (i === tab.activeIndex) ? CLR.ACCENT : 'rgba(240,234,214,0.55)';
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
      const isActive  = (i === tab.activeIndex);
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

    // ── Large "Play: C3 → E3 → G3" cue below the bar ─────────────────────
    // Makes the summon prompt unmissable, especially for new players.
    {
      const parts  = tab.queue.map((s, i) => {
        const done = s.status === 'hit';
        const miss = s.status === 'miss';
        const active = (i === tab.activeIndex);
        return { note: s.note, done, miss, active };
      });
      const cueLabelY = BAR_Y + BAR_H + 18;
      const ARROW = ' → ';
      let fullText = 'Play: ';
      parts.forEach((p, i) => { fullText += p.note + (i < parts.length - 1 ? ARROW : ''); });

      // Shadow for readability over any map background
      ctx.font         = 'bold 18px Georgia, serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = 'rgba(0,0,0,0.7)';
      ctx.fillText(fullText, W / 2 + 1, cueLabelY + 1);

      // Draw each segment with per-note colour
      let xCursor = W / 2 - ctx.measureText(fullText).width / 2;
      const prefixW = ctx.measureText('Play: ').width;
      xCursor += prefixW;
      ctx.fillStyle = 'rgba(240,234,214,0.7)';
      ctx.textAlign = 'left';
      ctx.fillText('Play: ', W / 2 - ctx.measureText(fullText).width / 2, cueLabelY);

      parts.forEach((p, i) => {
        ctx.fillStyle = p.done ? '#44ff88' : p.miss ? '#ff4444' : p.active ? CLR.ACCENT : 'rgba(240,234,214,0.55)';
        ctx.fillText(p.note, xCursor, cueLabelY);
        xCursor += ctx.measureText(p.note).width;
        if (i < parts.length - 1) {
          ctx.fillStyle = 'rgba(200,185,155,0.4)';
          ctx.fillText(ARROW, xCursor, cueLabelY);
          xCursor += ctx.measureText(ARROW).width;
        }
      });
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
    const enemyBases = state.enemyBases ?? (state.enemyBase ? [state.enemyBase] : []);
    if (!state.playerBase || enemyBases.length === 0) return;

    const laneH = LANE_HEIGHT * H;
    const baseW = BASE_WIDTH * W;
    const baseH = laneH * 1.5;
    const laneY = LANE_Y * H;
    const now   = performance.now();

    // ── Player base ────────────────────────────────────────────────────────
    if (this._basePrevHp.player > 0 && state.playerBase.hp < this._basePrevHp.player) {
      this._baseDmgFlash.player = now;
    }
    this._basePrevHp.player = state.playerBase.hp;
    this._drawBase(state.playerBase, PLAYER_BASE_X * W, laneY - baseH / 2, baseW, baseH, '#7a4810', '#e8a030', false, this._baseDmgFlash.player);

    // ── Enemy bases (one or more) ──────────────────────────────────────────
    for (let i = 0; i < enemyBases.length; i++) {
      const b = enemyBases[i];
      if (!b) continue;

      // Track damage flash per-base
      const prevHp = this._enemyBasePrevHp[i] ?? -1;
      if (prevHp > 0 && b.hp < prevHp) {
        this._enemyBaseDmgFlash[i] = now;
      }
      this._enemyBasePrevHp[i] = b.hp;

      // Draw from (left-edge, top) computed from the base's own centre
      const drawX = b.x - baseW / 2;
      const drawY = b.y - baseH / 2;
      this._drawBase(b, drawX, drawY, baseW, baseH, '#6a1010', '#ff4444', true, this._enemyBaseDmgFlash[i] ?? 0);
    }
  }

  /**
   * @param {boolean} isEnemy  — enemy base fills right-to-left, player left-to-right
   * @param {number}  flashTime — performance.now() when damage was last taken (0 = none)
   */
  _drawBase(base, x, y, w, h, dark, light, isEnemy, flashTime) {
    const ctx    = this.ctx;
    const hpFrac = base.hp / base.maxHp;
    ctx.save();

    // Castle body + battlements
    ctx.fillStyle = dark; ctx.strokeStyle = light; ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);

    const mW = w / 7, mH = h * 0.14;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const mx = x + mW * (i * 1.5 + 0.25);
      ctx.fillRect(mx, y - mH, mW, mH); ctx.strokeRect(mx, y - mH, mW, mH);
    }

    // HP bar (8px, below castle)
    const barY    = y + h + 5;
    const barH    = 8;
    const barW    = w * hpFrac;
    const barColor = hpFrac > 0.6 ? '#44ff88' : hpFrac > 0.3 ? '#ffcc00' : CLR.DANGER;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, barY, w, barH);

    ctx.fillStyle = barColor;
    if (isEnemy) {
      // Enemy bar fills from right edge inward
      ctx.fillRect(x + w - barW, barY, barW, barH);
    } else {
      ctx.fillRect(x, barY, barW, barH);
    }

    // Damage flash — brief red overlay on the full bar
    const now = performance.now();
    if (flashTime > 0 && now - flashTime < 400) {
      const alpha = (1 - (now - flashTime) / 400) * 0.7;
      ctx.fillStyle = `rgba(255, 50, 50, ${alpha.toFixed(3)})`;
      ctx.fillRect(x, barY, w, barH);
    }

    // Percentage text inside castle
    ctx.font         = `bold ${Math.max(9, Math.min(13, w * 0.18))}px Georgia, serif`;
    ctx.fillStyle    = light;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(hpFrac * 100)}%`, x + w / 2, y + h / 2);

    // Protected overlay — shown during wave grace period when base is invulnerable
    if (isEnemy && !base.vulnerable && !base.isDestroyed()) {
      ctx.fillStyle = 'rgba(100, 160, 255, 0.18)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(140, 200, 255, 0.6)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.font         = `bold ${Math.max(8, Math.min(11, w * 0.14))}px Georgia, serif`;
      ctx.fillStyle    = 'rgba(160, 210, 255, 0.95)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('\uD83D\uDEE1 Protected', x + w / 2, barY + barH + 4);
    }

    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Units
  // ─────────────────────────────────────────

  /**
   * Draw all units with HP bars and tier labels.
   * Enemy tiers have distinct visuals (T1 plain, T2 ring+pulse, T3 spikes+glow).
   * Player units show type-specific shapes (archer=circle, knight=diamond, mage=glow).
   * Stunned enemies get a purple ring at 1.5× radius.
   */
  _drawUnits(state) {
    const ctx = this.ctx;
    const t   = state.time || 0;
    for (const unit of state.units) {
      if (!unit.alive) continue;
      const r = unit.radius ?? 12;
      ctx.save();

      if (unit.team === 'enemy') {
        this._drawEnemyBody(ctx, unit, r, t);
      } else {
        this._drawPlayerBody(ctx, unit, r, t);
      }

      // HP bar above unit (shared for both teams)
      const bw  = r * 2.6, bh = 3;
      const bx  = unit.x - bw / 2, by = unit.y - r - 7;
      const pct = Math.max(0, unit.hp / unit.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = pct > 0.5 ? '#44ff88' : pct > 0.25 ? '#ffcc00' : CLR.DANGER;
      ctx.fillRect(bx, by, bw * pct, bh);

      ctx.restore();
    }
  }

  /** Draw tier-specific enemy body. Called inside ctx.save()/restore(). */
  _drawEnemyBody(ctx, unit, r, t) {
    const tier = unit.tier || 1;

    // Stun ring — purple, behind body
    if (unit.stunned) {
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, r * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#cc44ff';
      ctx.lineWidth   = 3;
      ctx.globalAlpha = 0.7;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (tier === 1) {
      // Tier 1 — plain red circle
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = '#cc2222';
      ctx.strokeStyle = '#ff7755';
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();

    } else if (tier === 2) {
      // Tier 2 — darker red + orange ring, slow pulse (1 s period)
      const scale = 1 + 0.04 * Math.sin(t * Math.PI * 2);
      const vr    = r * scale;

      // Orange outer ring
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, vr + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth   = 2.5;
      ctx.stroke();

      // Dark-red body
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, vr, 0, Math.PI * 2);
      ctx.fillStyle   = '#8b0000';
      ctx.strokeStyle = '#cc3300';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();

    } else {
      // Tier 3 — FAST unit (80 px/s). Speed trail: 3 fading arcs behind movement direction.
      // Enemy units march left, so trail extends to the right (+x direction from unit).
      for (let ti = 1; ti <= 3; ti++) {
        const trailX  = unit.x + ti * 8;  // offset right (behind marching direction)
        const trailR  = r * (1 - ti * 0.18);
        ctx.beginPath();
        ctx.arc(trailX, unit.y, Math.max(2, trailR), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,50,50,${0.18 - ti * 0.05})`;
        ctx.fill();
      }

      // Deep crimson, purple glow ring, 4 spikes, faster pulse (0.5 s)
      const scale = 1 + 0.06 * Math.sin(t * Math.PI * 4);
      const vr    = r * scale;

      // Purple glow ring
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#cc44ff';
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, vr + 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#cc44ff';
      ctx.lineWidth   = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 4 triangular spikes at cardinal angles
      for (let s = 0; s < 4; s++) {
        const ang = s * Math.PI / 2;
        const tip = { x: unit.x + Math.cos(ang) * (vr + 11), y: unit.y + Math.sin(ang) * (vr + 11) };
        const bw  = 5;
        const b1  = { x: unit.x + Math.cos(ang) * vr + Math.cos(ang + Math.PI / 2) * bw,
                      y: unit.y + Math.sin(ang) * vr + Math.sin(ang + Math.PI / 2) * bw };
        const b2  = { x: unit.x + Math.cos(ang) * vr - Math.cos(ang + Math.PI / 2) * bw,
                      y: unit.y + Math.sin(ang) * vr - Math.sin(ang + Math.PI / 2) * bw };
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.closePath();
        ctx.fillStyle = '#aa22cc';
        ctx.fill();
      }

      // Deep crimson body on top
      ctx.beginPath();
      ctx.arc(unit.x, unit.y, vr, 0, Math.PI * 2);
      ctx.fillStyle   = '#6b0000';
      ctx.strokeStyle = '#ff2222';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
    }

    // Tier number
    ctx.font         = `bold ${Math.max(8, r * 0.75)}px Georgia, serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.9)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tier), unit.x, unit.y);
  }

  /**
   * Draw unit-type-specific player body.  Called inside ctx.save()/restore().
   * Supports the four new archetypes: tank / dps / ranged / mage.
   * Legacy types (archer, knight) fall through to a blue-circle default.
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../entities/unit.js').Unit} unit
   * @param {number} r   — logical radius
   * @param {number} t   — state.time (seconds, for pulsing animations)
   */
  _drawPlayerBody(ctx, unit, r, t) {
    const type = unit.unitType || 'dps';
    const x    = unit.x;
    const y    = unit.y;

    // ── Per-archetype body ────────────────────────────────────────────────
    if (type === 'tank') {
      // Gold circle, thick border, slow heartbeat pulse
      const vr = r * (1 + 0.025 * Math.sin(t * Math.PI));
      ctx.beginPath();
      ctx.arc(x, y, vr, 0, Math.PI * 2);
      ctx.fillStyle   = '#7a5510';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth   = 3;
      ctx.fill();
      ctx.stroke();
      // Cross / shield mark
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.45); ctx.lineTo(x, y + r * 0.5);
      ctx.moveTo(x - r * 0.38, y - r * 0.1); ctx.lineTo(x + r * 0.38, y - r * 0.1);
      ctx.stroke();

    } else if (type === 'dps') {
      // Small red/orange circle, fast pulse
      const vr = r * (1 + 0.07 * Math.sin(t * Math.PI * 3));
      ctx.beginPath();
      ctx.arc(x, y, vr, 0, Math.PI * 2);
      ctx.fillStyle   = '#aa2200';
      ctx.strokeStyle = '#ff6633';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
      // Speed-slash marks
      ctx.strokeStyle = '#ff9955';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.42, y - r * 0.25); ctx.lineTo(x + r * 0.18, y - r * 0.25);
      ctx.moveTo(x - r * 0.18, y + r * 0.25); ctx.lineTo(x + r * 0.42, y + r * 0.25);
      ctx.stroke();

    } else if (type === 'ranged') {
      // Teal/cyan circle with crosshair lines
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle   = '#0a3844';
      ctx.strokeStyle = '#44ccff';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
      // Crosshair outside the circle
      ctx.strokeStyle = '#44ccff';
      ctx.lineWidth   = 1.5;
      const gap = r + 3, ext = r + 9;
      ctx.beginPath();
      ctx.moveTo(x - ext, y); ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y); ctx.lineTo(x + ext, y);
      ctx.moveTo(x, y - ext); ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap); ctx.lineTo(x, y + ext);
      ctx.stroke();

    } else if (type === 'mage') {
      // Purple glow circle + faint AOE radius ring
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#aa44ff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle   = '#320055';
      ctx.strokeStyle = '#aa44ff';
      ctx.lineWidth   = 2.5;
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Faint AOE range indicator (120 px)
      ctx.beginPath();
      ctx.arc(x, y, 120, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(170, 68, 255, 0.10)';
      ctx.lineWidth   = 1;
      ctx.stroke();

    } else if (type === 'knight') {
      // Legacy diamond shape
      const hw = r * 1.05;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle   = '#2255cc';
      ctx.strokeStyle = '#aac8ff';
      ctx.lineWidth   = 2;
      ctx.fillRect(-hw, -hw, hw * 2, hw * 2);
      ctx.strokeRect(-hw, -hw, hw * 2, hw * 2);
      ctx.restore();

    } else {
      // Archer / fallback — plain blue circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle   = TEAM_COLOUR.player;
      ctx.strokeStyle = TEAM_STROKE.player;
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();
    }

    // ── Mage buff indicator — golden ring when damageMultiplier is active ─
    if (unit.buffTimer > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // ── Label (single letter) ─────────────────────────────────────────────
    const LABELS = { tank: 'T', dps: 'D', ranged: 'R', mage: 'M', knight: 'K', archer: 'A' };
    ctx.font         = `bold ${Math.max(8, r * 0.75)}px Georgia, serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.9)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LABELS[type] ?? '?', x, y);
  }

  // ─────────────────────────────────────────
  // Lightning bolts (direct attack visuals)
  // ─────────────────────────────────────────

  /**
   * Render active lightning bolt animations.
   * Each bolt fades from alpha=1.0 to 0 over bolt.duration ms.
   * Drawn as a jagged path (pre-computed segments) with:
   *   - Wide yellow glow layer (outer, 50 % alpha)
   *   - Narrow white core layer (inner, full alpha)
   *   - Brief full-screen yellow flash at the moment of impact (first 20 % lifetime)
   * @param {object} state
   * @param {number} W @param {number} H
   */
  _drawLightningBolts(state, W, H) {
    const bolts = state.lightningBolts;
    if (!bolts || bolts.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();

    ctx.save();
    for (let i = 0; i < bolts.length; i++) {
      const b    = bolts[i];
      const age  = now - b.startTime;
      if (age >= b.duration) continue;
      const alpha      = 1 - age / b.duration;   // 1.0 → 0.0 over duration
      const segs       = b.segments;
      const cl         = b.chargeLevel || 0;      // 0=normal, 1/2/3=charged
      if (!segs || segs.length < 2) continue;

      // Impact flash — scales with charge level
      if (alpha > 0.80) {
        const baseFlash = cl === 3 ? 0.20 : 0.07;
        const flashA    = (alpha - 0.80) / 0.20 * baseFlash;
        ctx.fillStyle   = cl >= 3
          ? `rgba(180, 220, 255, ${flashA.toFixed(3)})`
          : `rgba(255, 255, 160, ${flashA.toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Bolt colour per charge level: normal=yellow, 1=blue-white, 2=cyan, 3=white
      const glowColor  = cl === 0 ? 'rgba(255, 220, 60, ' :
                         cl === 1 ? 'rgba(80, 160, 255, '  :
                         cl === 2 ? 'rgba(60, 220, 255, '  :
                                    'rgba(200, 220, 255, ';
      const coreColor  = cl === 0 ? 'rgba(255, 255, 255, ' :
                         cl === 1 ? 'rgba(180, 210, 255, '  :
                         cl === 2 ? 'rgba(160, 240, 255, '  :
                                    'rgba(255, 255, 255, ';
      const outerW     = cl === 0 ? 6 : cl === 1 ? 8 : cl === 2 ? 10 : 14;
      const innerW     = cl === 0 ? 2 : cl === 1 ? 3 : cl === 2 ? 4  : 6;
      const glowBlur   = cl === 0 ? 12 : cl === 1 ? 16 : cl === 2 ? 20 : 28;

      // Build the jagged path once, reuse for both draw calls
      ctx.beginPath();
      ctx.moveTo(segs[0].x, segs[0].y);
      for (let j = 1; j < segs.length; j++) {
        ctx.lineTo(segs[j].x, segs[j].y);
      }

      // Outer glow
      ctx.strokeStyle = `${glowColor}${(alpha * 0.55).toFixed(3)})`;
      ctx.lineWidth   = outerW;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.shadowBlur  = glowBlur;
      ctx.shadowColor = `${glowColor}0.8)`;
      ctx.stroke();

      // Rebuild path for inner core
      ctx.beginPath();
      ctx.moveTo(segs[0].x, segs[0].y);
      for (let j = 1; j < segs.length; j++) {
        ctx.lineTo(segs[j].x, segs[j].y);
      }

      // Inner core
      ctx.strokeStyle = `${coreColor}${alpha.toFixed(3)})`;
      ctx.lineWidth   = innerW;
      ctx.shadowBlur  = 0;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Ranged unit projectiles
  // ─────────────────────────────────────────

  /**
   * Animate ranged-unit shot orbs from their launch position to their target.
   * Each projectile is a visual-only arc — damage was applied hitscan when the
   * shot was queued.  Orbs are removed by game.js once travelTime elapses.
   * @param {object} state
   */
  _drawProjectiles(state) {
    const projs = state.projectiles;
    if (!projs || projs.length === 0) return;
    const ctx = this.ctx;
    const now = performance.now();
    ctx.save();
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      const t = Math.min(1.0, (now - p.startTime) / p.travelTime);
      const x = p.x + (p.tx - p.x) * t;
      const y = p.y + (p.ty - p.y) * t;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = 'rgba(68, 200, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#44ccff';
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Floating damage numbers
  // ─────────────────────────────────────────

  /**
   * Draw floating damage / effect numbers from state.damageNumbers[].
   * Each entry: { x, y, value, startTime, color, label? }
   * Numbers float upward ~40 px and fade out over 1 200 ms.
   * @param {object} state
   */
  _drawDamageNumbers(state) {
    const nums = state.damageNumbers;
    if (!nums || nums.length === 0) return;
    const ctx      = this.ctx;
    const now      = performance.now();
    const LIFETIME = 1200;
    const RISE     = 40;    // px to float upward over full lifetime

    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = 'bold 18px Georgia, serif';
    ctx.shadowBlur   = 6;
    ctx.shadowColor  = 'rgba(0, 0, 0, 0.85)';

    for (let i = 0; i < nums.length; i++) {
      const n        = nums[i];
      const t        = now - n.startTime;
      if (t >= LIFETIME) continue;
      const progress = t / LIFETIME;
      const alpha    = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1.0;
      const dy       = -RISE * progress;
      const text     = n.label ?? `+${n.value}`;

      ctx.globalAlpha = alpha;
      ctx.fillStyle   = n.color || '#ffffff';
      ctx.fillText(text, n.x, n.y + dy);
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Charge bar
  // ─────────────────────────────────────────

  /**
   * Draw the 3-segment charge-level bar when state.inputMode === 'charge'.
   * Position: just above the mode-button row (mirrors hud.js PIANO_H + MODE_BTN_H).
   * @param {object} state
   * @param {number} W
   * @param {number} H
   */
  _drawChargeBar(state, W, H) {
    if (state.inputMode !== 'charge') return;
    const ctx      = this.ctx;
    const progress = state.chargeProgress || 0;   // 0.0–3.0

    const BAR_W   = 240;
    const BAR_H   = 16;
    const SEG_GAP = 4;
    const SEGS    = 3;
    const segW    = (BAR_W - SEG_GAP * (SEGS - 1)) / SEGS;
    const cx      = W / 2;

    // Sit just above the mode-buttons + piano panel (PIANO_H=70, MODE_BTN_H=48)
    const ABOVE_PANEL = 70 + 48;
    const barY        = H - ABOVE_PANEL - BAR_H - 12;
    const barX        = cx - BAR_W / 2;

    ctx.save();

    // Background pill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(barX - 10, barY - 8, BAR_W + 20, BAR_H + 30, 8);
    } else {
      ctx.rect(barX - 10, barY - 8, BAR_W + 20, BAR_H + 30);
    }
    ctx.fill();

    // Per-segment colours: blue → cyan → white
    const SEG_COLORS = [
      { empty: '#1a2a4a', fill: '#4488ff', glow: 'rgba(68,136,255,0.7)' },
      { empty: '#1a3a4a', fill: '#22ccff', glow: 'rgba(34,204,255,0.7)' },
      { empty: '#3a3a4a', fill: '#ddeeff', glow: 'rgba(200,220,255,0.9)' },
    ];

    for (let s = 0; s < SEGS; s++) {
      const sx     = barX + s * (segW + SEG_GAP);
      const filled = Math.max(0, Math.min(1, progress - s));
      const col    = SEG_COLORS[s];

      // Empty track
      ctx.fillStyle = col.empty;
      ctx.fillRect(sx, barY, segW, BAR_H);

      // Filled portion
      if (filled > 0) {
        ctx.fillStyle    = col.fill;
        ctx.shadowBlur   = 10;
        ctx.shadowColor  = col.glow;
        ctx.fillRect(sx, barY, segW * filled, BAR_H);
        ctx.shadowBlur   = 0;
      }

      // Border
      ctx.strokeStyle = filled >= 1 ? col.fill : '#2a3a5a';
      ctx.lineWidth   = 1;
      ctx.strokeRect(sx, barY, segW, BAR_H);
    }

    // Label row: ⚡ icons + note name (or idle hint)
    ctx.font         = 'bold 13px Georgia, serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const labelY = barY + BAR_H + 10;

    if (state.chargeNote !== null) {
      const level  = Math.min(3, Math.floor(progress));
      const icons  = '⚡'.repeat(Math.max(1, level));
      ctx.fillStyle = progress >= 3 ? '#ddeeff' : progress >= 2 ? '#22ccff' : '#4488ff';
      ctx.fillText(`${icons}  ${state.chargeNote}`, cx, labelY);
    } else {
      ctx.font      = '11px Georgia, serif';
      ctx.fillStyle = '#7a8898';
      ctx.fillText('Hold a key to charge', cx, labelY);
    }

    ctx.restore();
  }

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

    // Find nearest enemy to the player base (smallest x) for prominence highlighting
    let nearestEnemy = null;
    let nearestX     = Infinity;
    for (const u of state.units) {
      if (u.alive && u.team === 'enemy' && u.x < nearestX) {
        nearestX     = u.x;
        nearestEnemy = u;
      }
    }

    // Track occupied Y-bands to offset overlapping cue displays
    // Key: Math.round(unit.y / 30) bucket → count of cues already drawn at that band
    const yBandCount = new Map();

    for (const unit of state.units) {
      if (!unit.alive || unit.team !== 'enemy') continue;
      if (!unit.attackSeq || unit.attackSeq.length === 0) continue;

      const seqLen = unit.attackSeq.length;
      const r      = unit.radius ?? 12;
      const PILL_W = 30, PILL_H = 16, GAP = 3;
      const totalW = seqLen * (PILL_W + GAP) - GAP;

      // Offset overlapping units: units with similar Y get stacked vertically
      const yBand  = Math.round(unit.y / 40);
      const yCount = yBandCount.get(yBand) || 0;
      yBandCount.set(yBand, yCount + 1);
      const yOffset = yCount * (PILL_H + 6);   // each extra unit in same band shifts up

      const baseY  = unit.y - r - 14 - PILL_H - yOffset;

      // Dim non-nearest enemies when swarm is present
      const isNearest = unit === nearestEnemy;
      const dimAlpha  = isNearest ? 1.0 : 0.45;

      ctx.save();
      ctx.globalAlpha = dimAlpha;

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
    const label   = state.inputMode === 'summon' ? '♪ Summon Mode'
                  : state.inputMode === 'charge' ? '⚡ Charge Mode'
                  : '⚔ Attack Mode';
    const colour  = state.inputMode === 'summon' ? '#44ff88'
                  : state.inputMode === 'charge' ? '#ffaa22'
                  : '#ff6666';
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.font         = 'bold 42px Georgia, serif';
    ctx.fillStyle    = colour;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, H * 0.62);
    ctx.restore();
  }

  /**
   * Brief centred overlay shown for 2 s when a phase transition occurs.
   * Shows the new phase name in amber above a description sub-line.
   */
  _drawPhaseAnnouncement(state, W, H) {
    if (!state.phaseAnnounce || !state.phaseLabel) return;
    const elapsed = performance.now() - state.phaseAnnounce;
    const FADE_IN  = 300;
    const HOLD_END = 1800;
    const TOTAL    = 2400;
    if (elapsed >= TOTAL) return;

    let alpha;
    if (elapsed < FADE_IN) {
      alpha = elapsed / FADE_IN;
    } else if (elapsed < HOLD_END) {
      alpha = 1;
    } else {
      alpha = 1 - (elapsed - HOLD_END) / (TOTAL - HOLD_END);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha  = Math.max(0, alpha);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // Phase name — amber, 52px, lower half of screen to avoid wave overlap
    ctx.font      = 'bold 52px Georgia, serif';
    ctx.fillStyle = CLR.ACCENT;
    ctx.fillText(`— ${state.phaseLabel} —`, W / 2, H * 0.62);

    // Subline
    ctx.font      = '20px Georgia, serif';
    ctx.fillStyle = CLR.TEXT;
    const isFinal    = state.phaseLabel === 'Climax';
    const multiBase  = (state.enemyBases?.length ?? 1) > 1;
    const subLine    = isFinal
      ? (multiBase ? 'Destroy all enemy bases!' : 'Destroy the enemy base!')
      : 'Prepare your forces';
    ctx.fillText(subLine, W / 2, H * 0.62 + 40);
    ctx.restore();
  }

  /**
   * Small persistent phase label in the top-right corner during play.
   * Shows "▸ Climax" etc. so the player always knows the current phase.
   */
  _drawPhaseLabel(state, W, H) {   // eslint-disable-line no-unused-vars
    if (!state.phaseLabel) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.font         = '14px Georgia, serif';
    ctx.fillStyle    = 'rgba(240,234,214,0.7)';
    ctx.fillText(`▸ ${state.phaseLabel}`, W - 12, 12);
    ctx.restore();
  }

  /**
   * Cue card — top-right panel showing the active timed note cue.
   * Green flash on hit, red pulse on missed, amber timer bar shrinks to zero.
   * Hidden when no cue is active.
   *
   * @param {object} state
   * @param {number} W @param {number} H
   */
  _drawCueCard(state, W, H) {   // eslint-disable-line no-unused-vars
    const cue = state.currentCue;
    if (!cue) return;

    const ctx     = this.ctx;
    const now     = performance.now();
    const CARD_W  = 130;
    const CARD_H  = 64;
    const CARD_X  = W - CARD_W - 14;
    const CARD_Y  = 44;  // below the phase label line

    const elapsed  = now - cue.startTime;
    const window   = cue.deadline - cue.startTime;
    const progress = Math.max(0, 1 - elapsed / window);  // 1.0 → 0.0

    // Wrong-note flash check (300 ms red override)
    const wrongFlash = state.wrongNoteFlash
      && (now - state.wrongNoteFlash.time) < 300;

    // Card background colour by status
    let bgColor;
    if (wrongFlash) {
      bgColor = 'rgba(140,20,20,0.92)';
    } else if (cue.status === 'hit') {
      bgColor = 'rgba(30, 120, 50, 0.92)';
    } else if (cue.status === 'missed') {
      bgColor = 'rgba(120, 20, 20, 0.82)';
    } else {
      // Active — subtle pulse
      const pulse = 0.85 + 0.08 * Math.sin(now / 200);
      bgColor = `rgba(20, 20, 40, ${pulse.toFixed(2)})`;
    }

    ctx.save();

    // Card body
    ctx.fillStyle   = bgColor;
    ctx.strokeStyle = wrongFlash              ? '#ff3322'
                    : cue.status === 'hit'    ? '#44ff88'
                    : cue.status === 'missed' ? '#ff5544'
                    : CLR.ACCENT;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect?.(CARD_X, CARD_Y, CARD_W, CARD_H, 8) ??
      ctx.rect(CARD_X, CARD_Y, CARD_W, CARD_H);
    ctx.fill();
    ctx.stroke();

    // Header label — changes to "✗ Wrong note" during red flash
    ctx.fillStyle    = wrongFlash ? '#ff8888' : 'rgba(240,234,214,0.6)';
    ctx.font         = '11px Georgia, serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(wrongFlash ? '✗ Wrong note' : '♪ Play', CARD_X + CARD_W / 2, CARD_Y + 6);

    // Note name — large
    ctx.fillStyle    = cue.status === 'hit' ? '#88ffaa' : CLR.TEXT;
    ctx.font         = `bold 22px Georgia, serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(cue.note, CARD_X + CARD_W * 0.42, CARD_Y + CARD_H * 0.52);

    // Key label — right side
    const NOTE_TO_KEY_MAP = {
      'C3': 'H', 'D3': 'J', 'E3': 'K', 'F3': 'L',
      'G3': ';', 'A3': "'", 'B3': '↵',
    };
    const keyLabel = NOTE_TO_KEY_MAP[cue.note] ?? '?';
    ctx.font         = 'bold 16px Georgia, serif';
    ctx.fillStyle    = CLR.ACCENT;
    ctx.textAlign    = 'center';
    ctx.fillText(`[${keyLabel}]`, CARD_X + CARD_W * 0.78, CARD_Y + CARD_H * 0.52);

    // Status / result text
    if (cue.status === 'hit') {
      ctx.font      = 'bold 11px Georgia, serif';
      ctx.fillStyle = '#44ff88';
      ctx.fillText('+10', CARD_X + CARD_W / 2, CARD_Y + CARD_H - 9);
    } else if (cue.status === 'missed') {
      ctx.font      = '11px Georgia, serif';
      ctx.fillStyle = '#ff8888';
      ctx.fillText('missed', CARD_X + CARD_W / 2, CARD_Y + CARD_H - 9);
    } else {
      // Timing bar — shrinks as deadline approaches
      const BAR_H   = 5;
      const BAR_Y   = CARD_Y + CARD_H - BAR_H - 4;
      const BAR_PAD = 8;
      const maxW    = CARD_W - BAR_PAD * 2;
      const barW    = maxW * progress;
      const barClr  = progress > 0.5 ? '#44ff88' : progress > 0.25 ? '#ffcc00' : '#ff4444';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(CARD_X + BAR_PAD, BAR_Y, maxW, BAR_H);
      ctx.fillStyle = barClr;
      ctx.fillRect(CARD_X + BAR_PAD, BAR_Y, barW, BAR_H);
    }

    ctx.restore();
  }

  /**
   * Draw a depleting arc around the bottom-center mode indicator area
   * showing remaining attack cooldown (400ms after each attack fires).
   * Only visible in ATTACK mode. Disappears when cooldown expires.
   */
  _drawAttackCooldown(state, W, H) {
    if (state.inputMode !== 'attack') return;
    const now     = performance.now();
    const coolEnd = state.attackCooldownEnd ?? 0;
    if (now >= coolEnd) return;

    const frac = (coolEnd - now) / 400;  // 1.0 → 0.0 over 400ms
    const ctx  = this.ctx;
    const cx   = W / 2;
    const cy   = H - 44;  // matches future mode indicator pill centre
    const r    = 22;
    const startAngle = -Math.PI / 2;  // top of circle

    ctx.save();
    ctx.strokeStyle = `rgba(255,60,60,${(0.5 + 0.5 * frac).toFixed(2)})`;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Persistent mode indicator — pill at bottom center (W/2, H-44).
   * Mode colors: SUMMON=#2244aa, ATTACK=#aa2222, CHARGE=#aa6600.
   * Pulsing red glow ring added when attackSuggestPulse is true.
   */
  _drawModeIndicator(state, W, H) {
    const mode  = state.inputMode;
    const ctx   = this.ctx;
    const cx    = W / 2;
    const cy    = H - 44;
    const PW    = 120;
    const PH    = 28;
    const px    = cx - PW / 2;
    const py    = cy - PH / 2;

    const COLOR = { summon: '#2244aa', attack: '#aa2222', charge: '#aa6600' };
    const LABEL = { summon: '♪ SUMMON',  attack: '⚔ ATTACK', charge: '⚡ CHARGE' };
    const clr   = COLOR[mode] ?? '#444466';
    const lbl   = LABEL[mode] ?? mode.toUpperCase();

    // Auto-suggest pulse ring (red glow, oscillates when enemies present)
    if (state.attackSuggestPulse) {
      const pulse = 0.4 + 0.35 * Math.sin(performance.now() / 1000 * Math.PI * 2.4);
      ctx.save();
      ctx.strokeStyle = `rgba(255,60,60,${pulse.toFixed(2)})`;
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.roundRect?.(px - 6, py - 6, PW + 12, PH + 12, 10) ??
        ctx.rect(px - 6, py - 6, PW + 12, PH + 12);
      ctx.stroke();
      ctx.restore();
    }

    // Pill background
    ctx.save();
    ctx.fillStyle   = clr + 'cc';   // mode color at 80% opacity
    ctx.strokeStyle = clr;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect?.(px, py, PW, PH, 8) ?? ctx.rect(px, py, PW, PH);
    ctx.fill();
    ctx.stroke();

    // Label
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 13px Georgia, serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lbl, cx, cy + 1);
    ctx.restore();
  }

  /**
   * Thin colored edge vignette strips (4px, 40% alpha) matching the current mode.
   * Drawn as 4 fillRects along canvas edges — cheap and visually clear.
   */
  _drawUiTint(state, W, H) {
    const mode  = state.inputMode;
    const COLOR = { summon: '#2244aa', attack: '#aa2222', charge: '#aa6600' };
    const hex   = COLOR[mode] ?? '#444466';
    // Parse hex to rgba
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const fill = `rgba(${r},${g},${b},0.40)`;
    const T    = 4;  // strip thickness px
    const ctx  = this.ctx;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(0,     0,     W, T);   // top
    ctx.fillRect(0,     H - T, W, T);   // bottom
    ctx.fillRect(0,     0,     T, H);   // left
    ctx.fillRect(W - T, 0,     T, H);   // right
    ctx.restore();
  }

  _drawWaveAnnouncement(state, W, H) {
    if (!state.waveAnnounce || state.wave <= 0) return;
    const elapsed = performance.now() - state.waveAnnounce;
    // Total: 0.3s fade-in + 1.2s hold + 0.5s fade-out = 2.0s
    const FADE_IN  = 300;
    const HOLD_END = 1500;
    const TOTAL    = 2000;
    if (elapsed >= TOTAL) return;

    let alpha;
    if (elapsed < FADE_IN) {
      alpha = elapsed / FADE_IN;
    } else if (elapsed < HOLD_END) {
      alpha = 1;
    } else {
      alpha = 1 - (elapsed - HOLD_END) / (TOTAL - HOLD_END);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha  = Math.max(0, alpha);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // "WAVE N" — gold, 64px
    ctx.font      = 'bold 64px Georgia, serif';
    ctx.fillStyle = CLR.ACCENT;
    ctx.fillText(`WAVE ${state.wave}`, W / 2, H / 2 - 22);

    // Subtext description — white, 22px
    ctx.font      = 'bold 22px Georgia, serif';
    ctx.fillStyle = CLR.TEXT;
    ctx.fillText(waveDescription(state.wave), W / 2, H / 2 + 26);

    ctx.restore();
  }

  // ─────────────────────────────────────────
  // Scene: VICTORY / DEFEAT
  // ─────────────────────────────────────────

  // ─────────────────────────────────────────
  // Scene: INSTRUMENT_SELECT
  // ─────────────────────────────────────────

  /** Canvas background only — all content rendered by InstrumentSelectUI overlay. */
  _drawInstrumentSelect(W, H) {
    this._titlePhase += 0.005;
    const t  = this._titlePhase;
    const gx = W / 2, gy = H * 0.5;
    const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.65);
    glow.addColorStop(0,   `rgba(91,143,255,${0.07 + 0.025 * Math.sin(t)})`);
    glow.addColorStop(0.5, `rgba(232,160,48,${0.03 + 0.012 * Math.sin(t * 1.15)})`);
    glow.addColorStop(1,   'rgba(10,10,15,0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, W, H);
    this._drawStars(W, H, t);
  }

  // ─────────────────────────────────────────
  // Scene: LEVEL_SELECT
  // ─────────────────────────────────────────

  /** Canvas background only — all content is rendered by the HTML overlay. */
  _drawLevelSelect(W, H) {
    this._titlePhase += 0.005;
    const t  = this._titlePhase;
    const gx = W / 2, gy = H * 0.55;
    const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.6);
    glow.addColorStop(0,   `rgba(91,143,255,${0.05 + 0.02 * Math.sin(t)})`);
    glow.addColorStop(0.5, `rgba(232,160,48,${0.03 + 0.015 * Math.sin(t * 1.2)})`);
    glow.addColorStop(1,   'rgba(10,10,15,0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, W, H);
    this._drawStars(W, H, t);
  }

  // ─────────────────────────────────────────
  // Scene: WORLD_MAP
  // ─────────────────────────────────────────

  _drawWorldMap(state, W, H) {
    if (!this._worldMapRenderer) {
      this._worldMapRenderer = new WorldMapRenderer();
    }
    const prog = state._progression ?? { bestStars: {}, purchased: [], tutorialComplete: false };
    this._worldMapRenderer.draw(this.ctx, state, W, H, prog);
  }

  // ─────────────────────────────────────────
  // Scene: LEVEL_START
  // ─────────────────────────────────────────

  _drawLevelStart(state, W, H) {
    this._titlePhase += 0.006;
    const t  = this._titlePhase;
    const gx = W / 2, gy = H * 0.38;
    const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.55);
    glow.addColorStop(0,   `rgba(232,160,48,${0.08 + 0.04 * Math.sin(t)})`);
    glow.addColorStop(0.5, `rgba(91,143,255,${0.04 + 0.02 * Math.sin(t * 1.3)})`);
    glow.addColorStop(1,   'rgba(10,10,15,0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, W, H);
    this._drawStars(W, H, t);

    // Tutorial overlay hint (persistent text during PLAYING is in _drawPlaying;
    // here we draw a "coming up" preview for the selected level)
    const lvl = state.pendingLevel;
    if (lvl?.isTutorial && lvl.tutorialOverlay) {
      const ctx  = this.ctx;
      const bw   = Math.min(440, W * 0.85);
      const bh   = 36;
      const bx   = (W - bw) / 2;
      const by   = H * 0.82;
      ctx.fillStyle   = 'rgba(10,10,20,0.72)';
      ctx.strokeStyle = 'rgba(232,160,48,0.35)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 6);
      ctx.fill();
      ctx.stroke();
      ctx.font         = '13px Georgia, serif';
      ctx.fillStyle    = '#c8b090';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lvl.tutorialOverlay, W / 2, by + bh / 2, bw - 20);
    }
  }

  _drawVictory(state, W, H) { this._drawEndScreen(W, H, CLR.ACCENT2, 0.18); }
  _drawDefeat(state, W, H)  { this._drawEndScreen(W, H, CLR.DANGER,  0.12); }

  // ─────────────────────────────────────────
  // Scene: ENDGAME
  // ─────────────────────────────────────────

  /** Golden triumphant glow — all realms conquered. */
  _drawEndgame(W, H) {
    this._titlePhase += 0.004;
    const t  = this._titlePhase;
    const gx = W / 2, gy = H * 0.42;
    const glow = this.ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.65);
    glow.addColorStop(0,   `rgba(232,160,48,${0.14 + 0.06 * Math.sin(t)})`);
    glow.addColorStop(0.4, `rgba(232,100,48,${0.06 + 0.025 * Math.sin(t * 1.1)})`);
    glow.addColorStop(1,   'rgba(10,10,15,0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, W, H);
    this._drawStars(W, H, t);
  }

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

  // ─────────────────────────────────────────
  // Debug overlay (backtick toggle)
  // ─────────────────────────────────────────

  /**
   * Draw an audio-pipeline diagnostic HUD in the top-left corner.
   * Toggled by pressing the backtick (`) key.
   * Reads only from state.audio.* — no imports needed.
   *
   * @param {object} state
   * @param {number} W
   * @param {number} H
   */
  _drawDebugOverlay(state, W, H) {   // eslint-disable-line no-unused-vars
    const ctx  = this.ctx;
    const au   = state.audio;

    // ── Background panel ──────────────────────────────────────────────────
    const PAD   = 10;
    const LH    = 18;                      // line height
    const lines = [
      `scene:       ${state.scene}`,
      `ctx:         ${au.ctxState ?? '—'}`,
      `ready:       ${au.ready}`,
      `rms:         ${(au.rms ?? 0).toFixed(4)}`,
      `noiseFloor:  ${(au.noiseFloor ?? 0).toFixed(4)}`,
      `pitchStable: ${au.pitchStable}`,
      `detNote:     ${au.detectedNote ?? '—'}`,
      `detChord:    ${au.detectedChord ?? '—'}`,
      `confidence:  ${(au.confidence ?? 0).toFixed(3)}`,
    ];

    const PW = 220;
    const PH = PAD * 2 + lines.length * LH;
    const PX = 6;
    const PY = 6;

    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = '#0a0a1a';
    ctx.fillRect(PX, PY, PW, PH);
    ctx.strokeStyle = '#e8a030';
    ctx.lineWidth   = 1;
    ctx.strokeRect(PX, PY, PW, PH);
    ctx.globalAlpha = 1;

    ctx.font         = '12px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';

    lines.forEach((line, i) => {
      // Colour-code problem states
      let fill = '#c8c0a0';
      if (line.startsWith('ctx') && au.ctxState !== 'running') fill = '#ff6655';
      if (line.startsWith('ready') && !au.ready)               fill = '#ff6655';
      if (line.startsWith('rms') && (au.rms ?? 0) === 0)       fill = '#ffbb44';
      ctx.fillStyle = fill;
      ctx.fillText(line, PX + PAD, PY + PAD + i * LH);
    });

    // Header label
    ctx.fillStyle    = '#e8a030';
    ctx.font         = 'bold 11px monospace';
    ctx.textAlign    = 'center';
    ctx.fillText('◉ AUDIO DEBUG  [`] to close', PX + PW / 2, PY + 2);

    ctx.restore();
  }
}
