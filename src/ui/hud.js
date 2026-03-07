/**
 * @file src/ui/hud.js
 * Canvas-drawn HUD — overlaid on top of the game world during PLAYING.
 *
 * Layout
 * ──────
 *   Top-left     Wave counter      "Wave N/10"
 *   Top-right    Score             amber number
 *   Top-centre   Hearts            ♥ × 5 reflecting player-base HP
 *
 *   Bottom strip (140 px tall) — dark panel behind piano
 *     Row 1: Resource bar + "RESOURCES" label, action-hint text
 *     Row 2: Piano keyboard (full width, 80 px tall)
 *              White keys: A S D F G H J K  (C3–C4)
 *              Black keys: W E _ T Y U      (C#3 D#3 _ F#3 G#3 A#3)
 *              Pressed keys highlight in amber
 *              Each key labelled: QWERTY letter + note name
 *
 * Called once per frame by renderer.js.
 * Reads state; never mutates it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state — canonical game state (read-only)
 * @param {number} W     — logical canvas width
 * @param {number} H     — logical canvas height
 */

// ─────────────────────────────────────────────────────────────────────────────
// Piano key definitions
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Array<{note:string, key:string, idx:number}>} */
const WHITE_KEYS = [
  { note: 'C3',  key: 'a', idx: 0 },
  { note: 'D3',  key: 's', idx: 1 },
  { note: 'E3',  key: 'd', idx: 2 },
  { note: 'F3',  key: 'f', idx: 3 },
  { note: 'G3',  key: 'g', idx: 4 },
  { note: 'A3',  key: 'h', idx: 5 },
  { note: 'B3',  key: 'j', idx: 6 },
  { note: 'C4',  key: 'k', idx: 7 },
];

/**
 * afterIdx — the white-key index to the left of this black key.
 * Black key is centred at (afterIdx + 0.67) × wkW.
 * @type {Array<{note:string, key:string, afterIdx:number}>}
 */
const BLACK_KEYS = [
  { note: 'C#3', key: 'w', afterIdx: 0 },
  { note: 'D#3', key: 'e', afterIdx: 1 },
  { note: 'F#3', key: 't', afterIdx: 3 },
  { note: 'G#3', key: 'y', afterIdx: 4 },
  { note: 'A#3', key: 'u', afterIdx: 5 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Colours
// ─────────────────────────────────────────────────────────────────────────────
const AMBER        = '#e8a030';
const WHITE_KEY_BG = '#f0ead6';
const BLACK_KEY_BG = '#1a1a28';
const KEY_PRESSED  = '#e8a030';
const PANEL_BG     = 'rgba(10, 10, 15, 0.88)';
const RES_BAR_BG   = '#2a2010';
const MUTED_TEXT   = '#7a7060';

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export function renderHUD(ctx, state, W, H) {
  ctx.save();
  ctx.textBaseline = 'middle';

  const PAD  = 16;
  const topY = PAD + 8;

  // ── Wave counter — top-left ──────────────────────────────────────────────
  ctx.font      = 'bold 16px Georgia, serif';
  ctx.fillStyle = '#f0ead6';
  ctx.textAlign = 'left';
  ctx.fillText(`Wave ${state.wave || 1}/10`, PAD, topY);

  // ── Score — top-right ────────────────────────────────────────────────────
  ctx.fillStyle = AMBER;
  ctx.textAlign = 'right';
  ctx.fillText(String(state.score || 0), W - PAD, topY);

  // ── Hearts (player base HP) — top-centre ─────────────────────────────────
  const MAX_HEARTS   = 5;
  const pbHpFrac     = state.playerBase
    ? state.playerBase.hp / state.playerBase.maxHp
    : 1;
  const filledHearts = Math.ceil(pbHpFrac * MAX_HEARTS);
  ctx.font      = 'bold 18px Georgia, serif';
  ctx.textAlign = 'center';
  const heartSpacing = 22;
  const heartStartX  = W / 2 - ((MAX_HEARTS - 1) * heartSpacing) / 2;
  for (let i = 0; i < MAX_HEARTS; i++) {
    ctx.fillStyle = i < filledHearts ? '#ff4444' : '#3a3030';
    ctx.fillText('\u2665', heartStartX + i * heartSpacing, topY);
  }

  // ── Bottom panel ─────────────────────────────────────────────────────────
  const PIANO_H   = 80;
  const PANEL_H   = 55 + PIANO_H;    // resource row (55) + piano (80)
  const panelY    = H - PANEL_H;
  const pianoY    = H - PIANO_H;

  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, panelY, W, PANEL_H);

  // ── Resource bar ─────────────────────────────────────────────────────────
  const MAX_RES  = 200;
  const res      = state.resources != null ? state.resources : 0;
  const resFrac  = res / MAX_RES;
  const barW     = Math.min(W * 0.55, 520);
  const barH     = 14;
  const barX     = (W - barW) / 2;
  const barY     = panelY + 12;

  // Background trough
  ctx.fillStyle = RES_BAR_BG;
  ctx.fillRect(barX, barY, barW, barH);
  // Fill — amber fading to gold
  ctx.fillStyle = AMBER;
  ctx.fillRect(barX, barY, barW * resFrac, barH);
  // Border
  ctx.strokeStyle = '#5a4010';
  ctx.lineWidth   = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  // Label left / value right
  ctx.font      = 'bold 11px Georgia, serif';
  ctx.fillStyle = '#f0ead6';
  ctx.textAlign = 'left';
  ctx.fillText('RESOURCES', barX, barY + barH / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.floor(res)} / ${MAX_RES}`, barX + barW, barY + barH / 2);

  // ── Action hint ──────────────────────────────────────────────────────────
  ctx.font      = '11px Georgia, serif';
  ctx.fillStyle = MUTED_TEXT;
  ctx.textAlign = 'center';
  ctx.fillText(
    '1 note = Tier 1 (20)  |  2 notes = Tier 2 (50)  |  3 notes = Tier 3 (100)  |  Z/X = octave',
    W / 2, panelY + 40,
  );

  // ── Piano keyboard ────────────────────────────────────────────────────────
  const wkCount = WHITE_KEYS.length;       // 8
  const wkW     = W / wkCount;
  const wkH     = PIANO_H;
  const bkW     = wkW * 0.58;
  const bkH     = wkH * 0.62;

  const pressedKeys = (state.audio && state.audio.pressedKeys) || new Set();

  // ── White keys ───────────────────────────────────────────────────────────
  for (let i = 0; i < wkCount; i++) {
    const wk      = WHITE_KEYS[i];
    const kx      = wk.idx * wkW;
    const pressed = pressedKeys.has(wk.key);

    ctx.fillStyle   = pressed ? KEY_PRESSED : WHITE_KEY_BG;
    ctx.strokeStyle = '#2a2010';
    ctx.lineWidth   = 1;
    ctx.fillRect(kx, pianoY, wkW - 1, wkH);
    ctx.strokeRect(kx, pianoY, wkW - 1, wkH);

    // QWERTY label
    const kFontSize = Math.max(10, Math.min(16, wkW * 0.22));
    ctx.font         = `bold ${kFontSize}px Georgia, serif`;
    ctx.fillStyle    = pressed ? '#3a2000' : '#3a3030';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wk.key.toUpperCase(), kx + wkW / 2, pianoY + wkH * 0.33);

    // Note name
    const nFontSize = Math.max(8, Math.min(11, wkW * 0.15));
    ctx.font      = `${nFontSize}px Georgia, serif`;
    ctx.fillStyle = pressed ? '#3a2000' : MUTED_TEXT;
    ctx.fillText(wk.note, kx + wkW / 2, pianoY + wkH * 0.70);
  }

  // ── Black keys (drawn on top) ─────────────────────────────────────────────
  for (let i = 0; i < BLACK_KEYS.length; i++) {
    const bk      = BLACK_KEYS[i];
    const kx      = (bk.afterIdx + 0.67) * wkW - bkW / 2;
    const pressed = pressedKeys.has(bk.key);

    ctx.fillStyle   = pressed ? KEY_PRESSED : BLACK_KEY_BG;
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth   = 1;
    ctx.fillRect(kx, pianoY, bkW, bkH);
    ctx.strokeRect(kx, pianoY, bkW, bkH);

    // QWERTY label
    const kFontSize = Math.max(8, Math.min(13, bkW * 0.32));
    ctx.font         = `bold ${kFontSize}px Georgia, serif`;
    ctx.fillStyle    = pressed ? '#3a2000' : '#f0ead6';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bk.key.toUpperCase(), kx + bkW / 2, pianoY + bkH * 0.28);

    // Note name
    const nFontSize = Math.max(7, Math.min(9, bkW * 0.22));
    ctx.font      = `${nFontSize}px Georgia, serif`;
    ctx.fillStyle = pressed ? '#3a2000' : MUTED_TEXT;
    ctx.fillText(bk.note, kx + bkW / 2, pianoY + bkH * 0.65);
  }

  ctx.restore();
}
