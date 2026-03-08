/**
 * @file src/ui/hud.js
 * Canvas-drawn HUD. Pure renderer — reads state, never mutates it.
 * Also exports piano touch/click input helpers.
 *
 * Layout
 * ──────
 *   Top row (16 px pad):
 *     left  — Wave N/10
 *     centre— Resources: N/200
 *     right — Score
 *
 *   Bottom panel (PANEL_H px):
 *     Row 1 (28 px): hint text + current mode badge
 *     Row 2 (70 px): Piano keyboard (50 % screen width, centred)
 *
 * Piano key dimensions
 * ────────────────────
 *   7 white keys (C3–B3), 5 black keys.
 *   PIANO_W = W × 0.5, PIANO_X = (W − PIANO_W) / 2.
 *   QWERTY labels: 24 px bold (shrunk by measureText if key too narrow).
 *   Note labels (C3 etc.): shown only when state.showNoteLabels === true.
 *
 * Touch / click
 * ─────────────
 *   getKeyAtPoint(px, py, W, H) → note string | null
 *   initPianoTouchInput(canvas, onNote) — wires click + touchstart once.
 *
 * iOS: touchstart listener uses { passive: false } + preventDefault() to
 * prevent scroll interference.
 */

// ─── Piano key definitions ─────────────────────────────────────────────────
/** White keys in piano order, left → right. */
const WHITE_KEYS = [
  { note: 'C3', key: 'H',  idx: 0 },
  { note: 'D3', key: 'J',  idx: 1 },
  { note: 'E3', key: 'K',  idx: 2 },
  { note: 'F3', key: 'L',  idx: 3 },
  { note: 'G3', key: ';',  idx: 4 },
  { note: 'A3', key: "'",  idx: 5 },
  { note: 'B3', key: '↵',  idx: 6 },
];

/**
 * Black keys.
 * afterIdx = index of the white key immediately to the left.
 * Centre x = PIANO_X + (afterIdx + 0.67) × wkW.
 */
const BLACK_KEYS = [
  { note: 'C#3', key: 'U', afterIdx: 0 },
  { note: 'D#3', key: 'I', afterIdx: 1 },
  { note: 'F#3', key: 'O', afterIdx: 3 },
  { note: 'G#3', key: 'P', afterIdx: 4 },
  { note: 'A#3', key: '[', afterIdx: 5 },
];

// ─── Colours ───────────────────────────────────────────────────────────────
const AMBER       = '#e8a030';
const PANEL_BG    = 'rgba(10, 10, 15, 0.88)';
const MUTED       = '#7a7060';
const KEY_WHITE   = '#f0ead6';    // beige white keys
const KEY_BLACK   = '#2e2e2e';    // dark grey black keys
const KEY_PRESS   = AMBER;

// ─── Dimensions ───────────────────────────────────────────────────────────
const PIANO_H  = 70;    // piano strip height
const ROW1_H   = 28;    // hint + mode row
const PANEL_H  = ROW1_H + PIANO_H;

// ─── Helpers: piano geometry (computed from W / H each frame) ─────────────
function pianoGeom(W, H) {
  const PIANO_W  = W * 0.5;
  const PIANO_X  = (W - PIANO_W) / 2;
  const wkW      = PIANO_W / WHITE_KEYS.length;
  const bkW      = wkW * 0.58;
  const bkH      = PIANO_H * 0.62;
  const pianoY   = H - PIANO_H;
  return { PIANO_W, PIANO_X, wkW, bkW, bkH, pianoY };
}

// ─── Main render ───────────────────────────────────────────────────────────
/**
 * Render the full in-game HUD.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state
 * @param {number} W
 * @param {number} H
 */
export function renderHUD(ctx, state, W, H) {
  ctx.save();
  ctx.textBaseline = 'middle';

  const PAD  = 16;
  const topY = PAD + 8;

  // ── Wave — top-left ──────────────────────────────────────────────────────
  ctx.font      = 'bold 16px Georgia, serif';
  ctx.fillStyle = '#f0ead6';
  ctx.textAlign = 'left';
  ctx.fillText(`Wave ${state.wave || 1}/10`, PAD, topY);

  // ── Resources — top-centre ───────────────────────────────────────────────
  const res = state.resources != null ? Math.floor(state.resources) : 0;
  ctx.font      = 'bold 14px Georgia, serif';
  ctx.fillStyle = AMBER;
  ctx.textAlign = 'center';
  ctx.fillText(`Resources: ${res} / 200`, W / 2, topY);

  // ── Score — top-right ────────────────────────────────────────────────────
  ctx.font      = 'bold 16px Georgia, serif';
  ctx.fillStyle = AMBER;
  ctx.textAlign = 'right';
  ctx.fillText(String(state.score || 0), W - PAD, topY);

  // ── Bottom panel background ──────────────────────────────────────────────
  const panelY = H - PANEL_H;
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(0, panelY, W, PANEL_H);

  // ── Row 1: hint text + mode badge ────────────────────────────────────────
  const hintY = panelY + ROW1_H / 2;
  ctx.font      = '10px Georgia, serif';
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'center';
  ctx.fillText(
    "H=C3 J=D3 K=E3 L=F3 ;=G3 '=A3 Enter=B3 | U I O P [=sharps | Space=mode",
    W / 2, hintY,
  );

  // Mode badge — top-right of panel row
  if (state.inputMode) {
    const isSummon = state.inputMode === 'summon';
    ctx.font      = 'bold 11px Georgia, serif';
    ctx.fillStyle = isSummon ? '#44ff88' : '#ff6666';
    ctx.textAlign = 'right';
    ctx.fillText(isSummon ? '♪ SUMMON' : '⚔ ATTACK', W - PAD, hintY);
  }

  // ── Piano keyboard ───────────────────────────────────────────────────────
  const { PIANO_X, wkW, bkW, bkH, pianoY } = pianoGeom(W, H);
  const pressedKeys = (state.input && state.input.pressedKeys) || new Set();
  const showLabels  = state.showNoteLabels === true;

  // White keys
  for (let i = 0; i < WHITE_KEYS.length; i++) {
    const wk      = WHITE_KEYS[i];
    const kx      = PIANO_X + wk.idx * wkW;
    const pressed = pressedKeys.has(wk.note);

    ctx.fillStyle   = pressed ? KEY_PRESS : KEY_WHITE;
    ctx.strokeStyle = '#2a2010';
    ctx.lineWidth   = 1;
    ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
    ctx.strokeRect(kx, pianoY, wkW - 1, PIANO_H);

    const labelY = showLabels ? pianoY + PIANO_H * 0.30 : pianoY + PIANO_H * 0.44;

    // QWERTY label — 24 px bold, shrink if needed
    ctx.font = 'bold 24px Georgia, serif';
    const lw = ctx.measureText(wk.key).width;
    if (lw > wkW - 6) {
      ctx.font = `bold ${Math.max(9, (24 * (wkW - 6) / lw)) | 0}px Georgia, serif`;
    }
    ctx.fillStyle    = pressed ? '#3a2000' : '#2a2020';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wk.key, kx + wkW / 2, labelY);

    // Note label (optional)
    if (showLabels) {
      ctx.font      = `${Math.max(7, Math.min(10, wkW * 0.13)) | 0}px Georgia, serif`;
      ctx.fillStyle = pressed ? '#3a2000' : MUTED;
      ctx.fillText(wk.note, kx + wkW / 2, pianoY + PIANO_H * 0.70);
    }
  }

  // Black keys
  for (let i = 0; i < BLACK_KEYS.length; i++) {
    const bk      = BLACK_KEYS[i];
    const kx      = PIANO_X + (bk.afterIdx + 0.67) * wkW - bkW / 2;
    const pressed = pressedKeys.has(bk.note);

    ctx.fillStyle   = pressed ? KEY_PRESS : KEY_BLACK;
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth   = 1;
    ctx.fillRect(kx, pianoY, bkW, bkH);
    ctx.strokeRect(kx, pianoY, bkW, bkH);

    // QWERTY label (bold, sized to fit narrow key)
    const kFs = Math.max(7, Math.min(13, bkW * 0.34)) | 0;
    ctx.font         = `bold ${kFs}px Georgia, serif`;
    ctx.fillStyle    = pressed ? '#3a2000' : '#f0ead6';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bk.key, kx + bkW / 2, pianoY + bkH * (showLabels ? 0.25 : 0.38));

    if (showLabels) {
      const nFs = Math.max(6, Math.min(9, bkW * 0.20)) | 0;
      ctx.font      = `${nFs}px Georgia, serif`;
      ctx.fillStyle = pressed ? '#3a2000' : MUTED;
      ctx.fillText(bk.note, kx + bkW / 2, pianoY + bkH * 0.65);
    }
  }

  ctx.restore();
}

// ─── Touch / click support ─────────────────────────────────────────────────

/**
 * Map a canvas-relative point to a note name, or null if outside the piano.
 * Uses the same 50 %-centred geometry as renderHUD.
 *
 * Check black keys first — they sit on top of white keys visually.
 *
 * @param {number} px   — x in logical (CSS) pixels
 * @param {number} py   — y in logical (CSS) pixels
 * @param {number} W    — logical canvas width
 * @param {number} H    — logical canvas height
 * @returns {string|null}
 */
export function getKeyAtPoint(px, py, W, H) {
  const { PIANO_X, PIANO_W, wkW, bkW, bkH, pianoY } = pianoGeom(W, H);
  if (py < pianoY || py > H || px < PIANO_X || px > PIANO_X + PIANO_W) return null;
  // Black keys first (higher z-order)
  for (const bk of BLACK_KEYS) {
    const kx = PIANO_X + (bk.afterIdx + 0.67) * wkW - bkW / 2;
    if (px >= kx && px <= kx + bkW && py <= pianoY + bkH) return bk.note;
  }
  // White keys
  for (const wk of WHITE_KEYS) {
    const kx = PIANO_X + wk.idx * wkW;
    if (px >= kx && px <= kx + wkW - 1) return wk.note;
  }
  return null;
}

/**
 * Register click and touchstart listeners on `canvas`.
 * When a piano key is hit, calls `onNote(noteString)`.
 * Must be called only once per canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {function(string):void} onNote
 */
export function initPianoTouchInput(canvas, onNote) {
  function coordsFromMouse(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onClick(e) {
    const { x, y } = coordsFromMouse(e);
    const note = getKeyAtPoint(x, y, canvas.offsetWidth, canvas.offsetHeight);
    console.log(`[mouse/click] px=${x.toFixed(1)} py=${y.toFixed(1)} → ${note ?? 'miss'}`);
    if (note) {
      console.log('[mouse/click] hit note: ' + note);
      onNote(note);
    }
  }
  function onTouchStart(e) {
    e.preventDefault();   // block ghost clicks & page scroll on mobile / iOS
    const t = e.touches[0];
    if (!t) return;
    const r    = canvas.getBoundingClientRect();
    const px   = t.clientX - r.left;
    const py   = t.clientY - r.top;
    const note = getKeyAtPoint(px, py, canvas.offsetWidth, canvas.offsetHeight);
    console.log(`[touch] px=${px.toFixed(1)} py=${py.toFixed(1)} → ${note ?? 'miss'}`);
    if (note) {
      console.log('[mouse/click] hit note: ' + note);
      onNote(note);
    }
  }
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  console.log('[touch init] registered');
}
