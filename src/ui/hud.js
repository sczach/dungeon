/**
 * @file src/ui/hud.js
 * Canvas-drawn HUD — overlaid on top of the game world during PLAYING.
 *
 * Layout
 * ──────
 *   Top-left   Wave counter   "Wave N/10"
 *   Top-right  Score          amber number
 *
 *   Bottom panel (125 px tall — resource row + piano strip)
 *     Row 1 (55 px): Resource bar + RESOURCES label + action hint
 *     Row 2 (70 px): Piano keyboard — right-hand layout
 *                     White keys  H J K L ; ' Enter  →  C3–B3
 *                     Black keys  U I _ O P [        →  C#3 D#3 _ F#3 G#3 A#3
 *                     Pressed keys highlight in amber (reads state.input.pressedKeys note strings)
 *
 * Called once per frame by renderer.js; reads state, never mutates it.
 *
 * LAYOUT NOTES
 * ────────────
 *   • 7 white keys, 5 black keys (standard one-octave layout C3–B3, no C4).
 *   • Black key label uses short identifiers: '[' stays as '[', Enter shown as '↵'.
 *   • ctx.measureText() used to guard against text overflow on small screens.
 *   • Two-line key labels: large QWERTY label centred at 32% height,
 *     small note name at 68% height.  Fixed row heights prevent overlap.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Piano key definitions — right-hand layout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * White keys in piano order left→right.
 * `key` is the display label shown on the key face.
 */
const WHITE_KEYS = [
  { note: 'C3', key: 'H',  idx: 0 },
  { note: 'D3', key: 'J',  idx: 1 },
  { note: 'E3', key: 'K',  idx: 2 },
  { note: 'F3', key: 'L',  idx: 3 },
  { note: 'G3', key: ';',  idx: 4 },
  { note: 'A3', key: "'",  idx: 5 },
  { note: 'B3', key: '↵',  idx: 6 },   // Enter key — ↵ fits the key width
];

/**
 * Black keys.
 * `afterIdx` — zero-based index of the white key immediately to the left.
 * Centre x = (afterIdx + 0.67) × wkW.
 */
const BLACK_KEYS = [
  { note: 'C#3', key: 'U', afterIdx: 0 },
  { note: 'D#3', key: 'I', afterIdx: 1 },
  // no black between E (idx 2) and F (idx 3)
  { note: 'F#3', key: 'O', afterIdx: 3 },
  { note: 'G#3', key: 'P', afterIdx: 4 },
  { note: 'A#3', key: '[', afterIdx: 5 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Colours
// ─────────────────────────────────────────────────────────────────────────────
const AMBER      = '#e8a030';
const PANEL_BG   = 'rgba(10, 10, 15, 0.88)';
const RES_BAR_BG = '#2a2010';
const MUTED      = '#7a7060';

// ─────────────────────────────────────────────────────────────────────────────
// Dimensions
// ─────────────────────────────────────────────────────────────────────────────
const PIANO_H = 70;                  // height of the piano key strip
const ROW1_H  = 55;                  // height of the resource/hint row above piano
const PANEL_H = ROW1_H + PIANO_H;   // total bottom panel height

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render the full in-game HUD.
 * Pure read of state — never mutates anything.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state — canonical game state (read-only)
 * @param {number} W     — logical canvas width
 * @param {number} H     — logical canvas height
 */
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

  // ── Bottom panel background ──────────────────────────────────────────────
  const panelY = H - PANEL_H;
  const pianoY = H - PIANO_H;

  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, panelY, W, PANEL_H);

  // ── Resource bar ─────────────────────────────────────────────────────────
  const MAX_RES = 200;
  const res     = state.resources != null ? state.resources : 0;
  const barW    = Math.min(W * 0.55, 520);
  const barH    = 14;
  const barX    = (W - barW) / 2;
  const barY    = panelY + 11;

  ctx.fillStyle = RES_BAR_BG;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = AMBER;
  ctx.fillRect(barX, barY, barW * Math.min(1, res / MAX_RES), barH);
  ctx.strokeStyle = '#5a4010';
  ctx.lineWidth   = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.font      = 'bold 11px Georgia, serif';
  ctx.fillStyle = '#f0ead6';
  ctx.textAlign = 'left';
  ctx.fillText('RESOURCES', barX, barY + barH / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.floor(res)} / ${MAX_RES}`, barX + barW, barY + barH / 2);

  // ── Action hint ──────────────────────────────────────────────────────────
  ctx.font      = '10px Georgia, serif';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  ctx.fillText(
    'H–↵ = notes  |  U I O P [ = sharps  |  , / . = octave ↓↑',
    W / 2, panelY + 38,
  );

  // ── Piano keyboard ─────────────────────────────────────────────────────
  const wkCount = WHITE_KEYS.length;   // 7 (C3 through B3)
  const wkW     = W / wkCount;
  const bkW     = wkW * 0.58;
  const bkH     = PIANO_H * 0.62;

  const pressedKeys = (state.input && state.input.pressedKeys) || new Set();

  // White keys
  for (let i = 0; i < wkCount; i++) {
    const wk      = WHITE_KEYS[i];
    const kx      = wk.idx * wkW;
    const pressed = pressedKeys.has(wk.note);

    ctx.fillStyle   = pressed ? AMBER : '#f0ead6';
    ctx.strokeStyle = '#2a2010';
    ctx.lineWidth   = 1;
    ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
    ctx.strokeRect(kx, pianoY, wkW - 1, PIANO_H);

    // QWERTY label — centred at 32% height; font sized to fit
    const kFs = Math.max(9, Math.min(15, wkW * 0.22));
    ctx.font         = `bold ${kFs}px Georgia, serif`;
    ctx.fillStyle    = pressed ? '#3a2000' : '#3a3030';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Measure and shrink if overflowing (e.g. '↵' can be wide on some fonts)
    const labelW = ctx.measureText(wk.key).width;
    if (labelW > wkW - 4) {
      ctx.font = `bold ${Math.max(7, kFs * ((wkW - 4) / labelW)) | 0}px Georgia, serif`;
    }
    ctx.fillText(wk.key, kx + wkW / 2, pianoY + PIANO_H * 0.32);

    // Note name — centred at 68% height
    const nFs = Math.max(7, Math.min(10, wkW * 0.14));
    ctx.font      = `${nFs}px Georgia, serif`;
    ctx.fillStyle = pressed ? '#3a2000' : MUTED;
    ctx.fillText(wk.note, kx + wkW / 2, pianoY + PIANO_H * 0.68);
  }

  // Black keys (drawn on top)
  for (let i = 0; i < BLACK_KEYS.length; i++) {
    const bk      = BLACK_KEYS[i];
    const kx      = (bk.afterIdx + 0.67) * wkW - bkW / 2;
    const pressed = pressedKeys.has(bk.note);

    ctx.fillStyle   = pressed ? AMBER : '#1a1a28';
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth   = 1;
    ctx.fillRect(kx, pianoY, bkW, bkH);
    ctx.strokeRect(kx, pianoY, bkW, bkH);

    // QWERTY label
    const kFs = Math.max(7, Math.min(12, bkW * 0.32));
    ctx.font         = `bold ${kFs}px Georgia, serif`;
    ctx.fillStyle    = pressed ? '#3a2000' : '#f0ead6';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bk.key, kx + bkW / 2, pianoY + bkH * 0.28);

    // Note name
    const nFs = Math.max(6, Math.min(9, bkW * 0.22));
    ctx.font      = `${nFs}px Georgia, serif`;
    ctx.fillStyle = pressed ? '#3a2000' : MUTED;
    ctx.fillText(bk.note, kx + bkW / 2, pianoY + bkH * 0.65);
  }

  ctx.restore();
}
