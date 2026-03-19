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
const PIANO_H    = 88;   // piano strip height (88 px = Apple HIG min touch target)
const ROW1_H     = 28;   // hint + mode badge row
const MODE_BTN_H = 48;   // SUMMON / ATTACK toggle buttons (mobile-friendly)
const PANEL_H    = ROW1_H + MODE_BTN_H + PIANO_H;

// ─── Helpers: piano geometry (computed from W / H each frame) ─────────────
function pianoGeom(W, H) {
  // On narrow screens (mobile) use 90 % width so each key ≥ 44 px wide.
  // On wide screens (desktop / tablet) keep the centred 50 % layout.
  const PIANO_W  = W < 600 ? W * 0.90 : W * 0.5;
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

  // ── Combo counter — below wave (shown when combo ≥ 3) ───────────────────
  if ((state.combo || 0) >= 3) {
    ctx.font      = 'bold 13px Georgia, serif';
    ctx.fillStyle = '#ff8822';
    ctx.textAlign = 'left';
    ctx.fillText(`x${state.combo} COMBO`, PAD, topY + 20);
  }

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

  // Color-coded top border on the panel: blue=summon, red=attack
  const modeBorderColor = state.inputMode === 'summon' ? 'rgba(68,136,255,0.9)'
    : 'rgba(255,80,80,0.9)';
  ctx.fillStyle = modeBorderColor;
  ctx.fillRect(0, panelY, W, 3);

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
    const mode  = state.inputMode;
    const color = mode === 'summon' ? '#44ff88' : '#ff6666';
    const label = mode === 'summon' ? '♪ SUMMON' : '⚔ ATTACK';
    ctx.font      = 'bold 11px Georgia, serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.fillText(label, W - PAD, hintY);
  }

  // ── SUMMON / ATTACK mode toggle buttons (above piano, mobile-friendly) ──
  const modeBtnY  = H - PIANO_H - MODE_BTN_H;
  const curMode   = state.inputMode || 'summon';
  const ALL_MODES = [
    { id: 'summon', label: '♪  SUMMON', activeColor: '#44ff88', activeBg: 'rgba(68,255,136,0.18)' },
    { id: 'attack', label: '⚔  ATTACK', activeColor: '#ff6666', activeBg: 'rgba(255,80,80,0.18)'  },
  ];
  // Filter to only the modes allowed by the current level (null = all three)
  const allowed   = state.allowedModes ?? null;
  const MODES_CFG = allowed ? ALL_MODES.filter(m => allowed.includes(m.id)) : ALL_MODES;
  const btnW      = MODES_CFG.length > 0 ? W / MODES_CFG.length : W / 3;

  for (let mi = 0; mi < MODES_CFG.length; mi++) {
    const m      = MODES_CFG[mi];
    const active = curMode === m.id;
    const bx     = mi * btnW;

    ctx.fillStyle   = active ? m.activeBg : 'rgba(20,20,30,0.92)';
    ctx.fillRect(bx, modeBtnY, btnW, MODE_BTN_H);
    ctx.strokeStyle = active ? m.activeColor : '#2a2a3a';
    ctx.lineWidth   = active ? 2 : 1;
    ctx.strokeRect(bx, modeBtnY, btnW, MODE_BTN_H);

    ctx.font         = 'bold 16px Georgia, serif';
    ctx.fillStyle    = active ? m.activeColor : '#505060';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.label, bx + btnW / 2, modeBtnY + MODE_BTN_H / 2);
  }

  // Dividers between buttons
  ctx.strokeStyle = '#2a2a3a';
  ctx.lineWidth   = 1;
  for (let di = 1; di < MODES_CFG.length; di++) {
    ctx.beginPath();
    ctx.moveTo(di * btnW, modeBtnY);
    ctx.lineTo(di * btnW, modeBtnY + MODE_BTN_H);
    ctx.stroke();
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

    // QWERTY + note labels — both hidden when showNoteLabels is off
    if (showLabels) {
      // QWERTY label — large and dominant (≥18px), shrink only if key too narrow
      ctx.font = 'bold 22px Georgia, serif';
      const lw = ctx.measureText(wk.key).width;
      if (lw > wkW - 6) {
        ctx.font = `bold ${Math.max(18, (22 * (wkW - 6) / lw)) | 0}px Georgia, serif`;
      }
      ctx.fillStyle    = pressed ? '#3a2000' : '#2a2020';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wk.key, kx + wkW / 2, pianoY + PIANO_H * 0.38);

      // Note name — smaller, secondary below QWERTY label
      ctx.font      = '11px Georgia, serif';
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

    // QWERTY + note labels — both hidden when showNoteLabels is off
    if (showLabels) {
      // QWERTY label — min 14px for readability on narrow black keys
      const kFs = Math.max(14, Math.min(18, bkW * 0.45)) | 0;
      ctx.font         = `bold ${kFs}px Georgia, serif`;
      ctx.fillStyle    = pressed ? '#3a2000' : '#f0ead6';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bk.key, kx + bkW / 2, pianoY + bkH * 0.30);

      // Note name — smaller secondary below QWERTY label
      const nFs = Math.max(8, Math.min(10, bkW * 0.22)) | 0;
      ctx.font      = `${nFs}px Georgia, serif`;
      ctx.fillStyle = pressed ? '#3a2000' : MUTED;
      ctx.fillText(bk.note, kx + bkW / 2, pianoY + bkH * 0.70);
    }
  }

  // ── Combo bonus flash — center screen ───────────────────────────────────
  if (state.comboBonusTime) {
    const elapsed = performance.now() - state.comboBonusTime;
    if (elapsed < 1500) {
      const alpha = Math.max(0, 1 - elapsed / 1500);
      ctx.save();
      ctx.globalAlpha  = alpha;
      ctx.font         = 'bold 28px Georgia, serif';
      ctx.fillStyle    = '#ff8822';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+COMBO BONUS  +25`, W / 2, H * 0.55);
      ctx.restore();
    }
  }

  ctx.restore();
}

// ─── Touch / click support ─────────────────────────────────────────────────

/**
 * Return which mode button was tapped, or null if the point is outside.
 * Mode buttons span the full screen width above the piano:
 *   Left half  → 'summon'
 *   Right half → 'attack'
 *
 * @param {number} px  — x in logical (CSS) pixels
 * @param {number} py  — y in logical (CSS) pixels
 * @param {number} W   — logical canvas width
 * @param {number} H   — logical canvas height
 * @returns {'summon'|'attack'|null}
 */
export function getModeButtonAtPoint(px, py, W, H) {
  const modeBtnTop = H - PIANO_H - MODE_BTN_H;
  const modeBtnBot = H - PIANO_H;
  if (py < modeBtnTop || py >= modeBtnBot) return null;
  if (px < 0 || px > W) return null;
  const btnW = W / 2;
  if (px < btnW) return 'summon';
  return 'attack';
}

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
 * Dispatches to onNote(note) for piano key hits, or onModeToggle(mode)
 * for SUMMON/ATTACK mode button taps.
 * Must be called only once per canvas element.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {function(string):void} onNote
 * @param {function('summon'|'attack'):void} [onModeToggle]
 */
export function initPianoTouchInput(canvas, onNote, onModeToggle) {
  function handlePoint(px, py) {
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    // Piano key takes priority
    const note = getKeyAtPoint(px, py, W, H);
    if (note) { onNote(note); return; }
    // Mode button
    if (onModeToggle) {
      const mode = getModeButtonAtPoint(px, py, W, H);
      if (mode) onModeToggle(mode);
    }
  }
  function onClick(e) {
    const r    = canvas.getBoundingClientRect();
    const px   = e.clientX - r.left;
    const py   = e.clientY - r.top;
    const W    = canvas.offsetWidth, H = canvas.offsetHeight;
    const note = getKeyAtPoint(px, py, W, H);
    console.log(`[piano click] x=${px.toFixed(0)} y=${py.toFixed(0)} note=${note}`);
    handlePoint(px, py);
  }
  function onTouchStart(e) {
    e.preventDefault();   // block ghost clicks & page scroll on mobile / iOS
    const t = e.touches[0];
    if (!t) return;
    const r = canvas.getBoundingClientRect();
    handlePoint(t.clientX - r.left, t.clientY - r.top);
  }
  canvas.style.pointerEvents = 'auto';
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  console.log('[touch init] listeners attached to canvas');
}
