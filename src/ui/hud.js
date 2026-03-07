/**
 * @file src/ui/hud.js
 * Canvas-drawn HUD — overlaid on top of the game world during PLAYING.
 *
 * Layout
 * ──────
 *   Top-left    Wave counter  "Wave N/10"
 *   Top-right   Score         amber number
 *   Top-centre  Hearts        ♥ × 5, red = alive, dark = lost
 *   Bottom-centre Chord prompt  48 px amber chord + "play this chord" subtitle
 *   Bottom-left  Mic status   coloured dot + text label
 *
 * Called once per frame by renderer.js after all world geometry is drawn.
 * Reads state; never mutates it.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state — canonical game state (read-only)
 * @param {number} W     — logical canvas width
 * @param {number} H     — logical canvas height
 */
export function renderHUD(ctx, state, W, H) {
  ctx.save();
  ctx.textBaseline = 'middle';

  const PAD = 16;
  const topY = PAD + 8;

  // ── Wave counter — top-left ─────────────────────────────────────────────
  ctx.font      = 'bold 16px Georgia, serif';
  ctx.fillStyle = '#f0ead6';
  ctx.textAlign = 'left';
  ctx.fillText(`Wave ${state.wave > 0 ? state.wave : 1}/10`, PAD, topY);

  // ── Score — top-right ───────────────────────────────────────────────────
  ctx.fillStyle = '#e8a030';
  ctx.textAlign = 'right';
  ctx.fillText(String(state.score), W - PAD, topY);

  // ── Lives hearts — top-centre ───────────────────────────────────────────
  const MAX_HEARTS = 5;
  const shown      = Math.min(state.lives, MAX_HEARTS);
  ctx.font      = 'bold 18px Georgia, serif';
  ctx.textAlign = 'center';
  const heartSpacing = 22;
  const startX = W / 2 - ((MAX_HEARTS - 1) * heartSpacing) / 2;
  for (let i = 0; i < MAX_HEARTS; i++) {
    ctx.fillStyle = i < shown ? '#ff4444' : '#3a3030';
    ctx.fillText('\u2665', startX + i * heartSpacing, topY);
  }

  // ── Chord prompt — bottom-centre ────────────────────────────────────────
  if (state.prompt.active && state.prompt.chord) {
    ctx.textAlign = 'center';
    ctx.font      = 'bold 48px Georgia, serif';
    ctx.fillStyle = '#e8a030';
    ctx.fillText(state.prompt.chord, W / 2, H - 90);

    ctx.font      = '14px Georgia, serif';
    ctx.fillStyle = '#7a7060';
    ctx.fillText('play this chord', W / 2, H - 55);
  }

  // ── Mic status dot — bottom-left ────────────────────────────────────────
  const micY  = H - PAD - 8;
  const dotX  = PAD + 5;
  const alive = state.audio.ready;

  ctx.beginPath();
  ctx.arc(dotX, micY, 5, 0, Math.PI * 2);
  ctx.fillStyle = alive ? '#44ff88' : '#ff4444';
  ctx.fill();

  ctx.font      = '13px Georgia, serif';
  ctx.fillStyle = alive ? '#44ff88' : '#7a7060';
  ctx.textAlign = 'left';
  ctx.fillText(alive ? 'MIC LIVE' : 'NO MIC', dotX + 11, micY);

  ctx.restore();
}
