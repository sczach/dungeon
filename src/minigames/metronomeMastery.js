/**
 * @file src/minigames/metronomeMastery.js
 * Metronome Mastery — a rhythm precision minigame.
 *
 * Musical skill: tap in time with a metronome across four BPM phases.
 * Play time: 60 seconds (4 phases × 15 s each).
 * Input: any piano key = beat tap.
 *
 * Audio: Web Audio API lookahead scheduler (no setInterval).
 * Rendering: Canvas 2D only (no DOM elements).
 */

import { BaseMinigame } from '../systems/minigameEngine.js';
import { getAudioContext } from '../audio/capture.js';

// ─── Key map (same as keyboard.js) ──────────────────────────────────────────
const KEY_TO_NOTE = {
  'h': 'C3', 'j': 'D3', 'k': 'E3', 'l': 'F3',
  ';': 'G3', "'": 'A3', 'enter': 'B3',
  'u': 'C#3', 'i': 'D#3', 'o': 'F#3', 'p': 'G#3', '[': 'A#3',
};

// ─── Phase definitions ──────────────────────────────────────────────────────
const PHASES = Object.freeze([
  { bpm: 80,  label: 'Finding the beat' },
  { bpm: 95,  label: 'Locking in' },
  { bpm: 110, label: 'In the pocket' },
  { bpm: 125, label: 'Full tempo' },
]);
const PHASE_DURATION   = 15;   // seconds per phase
const TOTAL_DURATION   = PHASE_DURATION * PHASES.length; // 60s
const LOOKAHEAD        = 0.1;  // schedule beats 100ms ahead
const PERFECT_WINDOW   = 0.05; // ±50ms
const OK_WINDOW        = 0.15; // ±150ms
const CLICK_FREQ       = 1000; // Hz
const CLICK_DURATION   = 0.02; // 20ms
const FEEDBACK_FADE_MS = 400;
const HISTORY_SIZE     = 8;    // accuracy bar squares

// ─── Colours ────────────────────────────────────────────────────────────────
const COL_BG       = '#1a1a2e';
const COL_TEXT     = '#ffffff';
const COL_DIM      = '#aaaacc';
const COL_PERFECT  = '#44ee66';
const COL_OK       = '#eecc44';
const COL_MISS     = '#666688';
const COL_PENDULUM = '#6688ff';

export class MetronomeMastery extends BaseMinigame {
  start() {
    const audioCtx = getAudioContext();
    if (!audioCtx) {
      this.done({ stars: 0, score: 0, accuracyPct: 0, passed: false });
      return;
    }
    // Resume if suspended (mobile)
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    this._audioCtx = audioCtx;

    // ── Timing state ──────────────────────────────────────────────────────
    this._startTime     = audioCtx.currentTime;
    this._nextBeatTime  = this._startTime + 0.5; // first beat after 500ms grace
    this._currentPhase  = 0;
    this._beatQueue     = [];   // { time, judged }
    this._totalBeats    = 0;
    this._perfects      = 0;
    this._oks           = 0;
    this._misses        = 0;
    this._history       = [];   // last N tap results: 'perfect'|'ok'|'miss'
    this._feedback      = null; // { text, color, time }
    this._lastTapTime   = -1;
    this._finished      = false;

    // ── Pendulum state ────────────────────────────────────────────────────
    this._pendulumAngle = 0;

    // ── Input ─────────────────────────────────────────────────────────────
    this._onKeyDown = (e) => {
      if (e.repeat || this._finished) return;
      const note = KEY_TO_NOTE[e.key.toLowerCase()];
      if (!note) return;
      e.preventDefault();
      this._handleTap();
    };
    document.addEventListener('keydown', this._onKeyDown);

    // Touch input on canvas
    this._onTouchStart = (e) => {
      if (this._finished) return;
      e.preventDefault();
      this._handleTap();
    };
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('mousedown', this._onTouchStart);

    // ── Start rAF loop ────────────────────────────────────────────────────
    this._prevTime = performance.now();
    const loop = () => {
      if (this._finished) return;
      this._update();
      this._render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  destroy() {
    super.destroy();
    this._finished = true;
    if (this._onKeyDown) {
      document.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onTouchStart) {
      this.canvas.removeEventListener('touchstart', this._onTouchStart);
      this.canvas.removeEventListener('mousedown', this._onTouchStart);
      this._onTouchStart = null;
    }
    this._beatQueue = [];
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  _update() {
    const ctx  = this._audioCtx;
    const now  = ctx.currentTime;
    const elapsed = now - this._startTime;

    // ── Check game over ─────────────────────────────────────────────────
    if (elapsed >= TOTAL_DURATION) {
      this._finish();
      return;
    }

    // ── Current phase ───────────────────────────────────────────────────
    this._currentPhase = Math.min(
      PHASES.length - 1,
      Math.floor(elapsed / PHASE_DURATION)
    );
    const bpm      = PHASES[this._currentPhase].bpm;
    const beatSec  = 60 / bpm;

    // ── Lookahead scheduler ─────────────────────────────────────────────
    while (this._nextBeatTime < now + LOOKAHEAD) {
      // Mark any previous unjudged beat as a miss before scheduling next
      this._expireOldBeats(this._nextBeatTime - beatSec * 0.5);

      this._scheduleClick(this._nextBeatTime);
      this._beatQueue.push({ time: this._nextBeatTime, judged: false });
      this._totalBeats++;
      this._nextBeatTime += beatSec;
    }

    // Expire beats that are too old to hit (past OK_WINDOW)
    this._expireOldBeats(now - OK_WINDOW);
  }

  _expireOldBeats(cutoff) {
    for (let i = 0; i < this._beatQueue.length; i++) {
      const b = this._beatQueue[i];
      if (!b.judged && b.time < cutoff) {
        b.judged = true;
        this._misses++;
        this._pushHistory('miss');
      }
    }
    // Prune fully judged beats older than 1s
    const now = this._audioCtx.currentTime;
    while (this._beatQueue.length > 0 && this._beatQueue[0].time < now - 1) {
      this._beatQueue.shift();
    }
  }

  // ─── Audio ────────────────────────────────────────────────────────────────

  _scheduleClick(time) {
    const ctx  = this._audioCtx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = CLICK_FREQ;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.4, time + 0.001);
    gain.gain.linearRampToValueAtTime(0.0, time + CLICK_DURATION);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + CLICK_DURATION + 0.01);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  _handleTap() {
    const now = this._audioCtx.currentTime;

    // Debounce rapid double-taps (< 80ms apart)
    if (now - this._lastTapTime < 0.08) return;
    this._lastTapTime = now;

    // Find nearest unjudged beat
    let bestIdx   = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < this._beatQueue.length; i++) {
      const b = this._beatQueue[i];
      if (b.judged) continue;
      const delta = Math.abs(now - b.time);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx   = i;
      }
    }

    if (bestIdx < 0 || bestDelta > OK_WINDOW) {
      // No beat nearby — count as a miss tap
      this._setFeedback('MISS', COL_MISS);
      return;
    }

    this._beatQueue[bestIdx].judged = true;

    if (bestDelta <= PERFECT_WINDOW) {
      this._perfects++;
      this._pushHistory('perfect');
      this._setFeedback('PERFECT', COL_PERFECT);
    } else {
      this._oks++;
      this._pushHistory('ok');
      this._setFeedback('OK', COL_OK);
    }
  }

  _pushHistory(result) {
    this._history.push(result);
    if (this._history.length > HISTORY_SIZE) this._history.shift();
  }

  _setFeedback(text, color) {
    this._feedback = { text, color, time: performance.now() };
  }

  // ─── Finish ───────────────────────────────────────────────────────────────

  _finish() {
    if (this._finished) return;
    this._finished = true;

    const total    = this._perfects + this._oks + this._misses;
    const perfectPct = total > 0 ? Math.round((this._perfects / total) * 100) : 0;
    const missRate   = total > 0 ? this._misses / total : 0;

    let stars;
    if (missRate > 0.5)     stars = 0;
    else if (perfectPct >= 85) stars = 3;
    else if (perfectPct >= 65) stars = 2;
    else                       stars = 1;

    this.done({
      stars,
      score:       this._perfects * 10,
      accuracyPct: perfectPct,
      passed:      stars >= 1,
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render() {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.width / dpr;
    const H   = canvas.height / dpr;
    const now = this._audioCtx.currentTime;
    const elapsed = now - this._startTime;

    // ── Background ──────────────────────────────────────────────────────
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);

    // ── Phase label + BPM (top) ─────────────────────────────────────────
    const phase = PHASES[this._currentPhase];
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = COL_DIM;
    ctx.font         = `bold ${Math.max(14, W * 0.04)}px sans-serif`;
    ctx.fillText(`Phase ${this._currentPhase + 1}: ${phase.label}`, W / 2, H * 0.06);
    ctx.font         = `${Math.max(12, W * 0.03)}px sans-serif`;
    ctx.fillText(`${phase.bpm} BPM`, W / 2, H * 0.06 + Math.max(14, W * 0.04) + 6);

    // ── Pendulum (center) ───────────────────────────────────────────────
    const beatSec     = 60 / phase.bpm;
    const beatProgress = ((now - this._startTime) % beatSec) / beatSec;
    // Sine wave: 0→1→0→-1→0 over one beat cycle
    const swing = Math.sin(beatProgress * Math.PI * 2);

    const pendCx  = W / 2;
    const pendCy  = H * 0.42;
    const pendLen = Math.min(W, H) * 0.18;
    const bobX    = pendCx + swing * pendLen;
    const bobY    = pendCy;

    // Arm
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(pendCx, pendCy - pendLen * 0.5);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    // Bob — pulses brighter on beat (first 30% of beat cycle)
    const onBeat    = beatProgress < 0.15 || beatProgress > 0.85;
    const bobRadius = Math.min(W, H) * (onBeat ? 0.045 : 0.035);
    ctx.fillStyle   = onBeat ? '#aabbff' : COL_PENDULUM;
    ctx.beginPath();
    ctx.arc(bobX, bobY, bobRadius, 0, Math.PI * 2);
    ctx.fill();

    // ── Feedback text (below center) ────────────────────────────────────
    if (this._feedback) {
      const age   = performance.now() - this._feedback.time;
      const alpha = Math.max(0, 1 - age / FEEDBACK_FADE_MS);
      if (alpha > 0) {
        ctx.globalAlpha  = alpha;
        ctx.fillStyle    = this._feedback.color;
        ctx.font         = `bold ${Math.max(20, W * 0.07)}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(this._feedback.text, W / 2, H * 0.58);
        ctx.globalAlpha  = 1;
      }
    }

    // ── Accuracy bar (bottom strip) — last 8 taps ───────────────────────
    const barY   = H * 0.78;
    const sqSize = Math.min(W * 0.08, 36);
    const gap    = sqSize * 0.3;
    const totalW = HISTORY_SIZE * sqSize + (HISTORY_SIZE - 1) * gap;
    let barX     = (W - totalW) / 2;

    ctx.textBaseline = 'top';
    ctx.font         = `${Math.max(10, W * 0.025)}px sans-serif`;
    ctx.fillStyle    = COL_DIM;
    ctx.fillText('Last 8 taps', W / 2, barY - sqSize * 0.6);

    for (let i = 0; i < HISTORY_SIZE; i++) {
      const result = this._history[i];
      if (result === 'perfect')    ctx.fillStyle = COL_PERFECT;
      else if (result === 'ok')    ctx.fillStyle = COL_OK;
      else if (result === 'miss')  ctx.fillStyle = COL_MISS;
      else                         ctx.fillStyle = '#2a2a3e'; // empty slot
      const rx = barX + i * (sqSize + gap);
      ctx.fillRect(rx, barY, sqSize, sqSize);
      // Rounded corner effect
      ctx.strokeStyle = '#3a3a5e';
      ctx.lineWidth   = 1;
      ctx.strokeRect(rx, barY, sqSize, sqSize);
    }

    // ── Bottom left: perfect% ───────────────────────────────────────────
    const total = this._perfects + this._oks + this._misses;
    const pct   = total > 0 ? Math.round((this._perfects / total) * 100) : 0;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = COL_TEXT;
    ctx.font         = `bold ${Math.max(14, W * 0.035)}px sans-serif`;
    ctx.fillText(`Perfect: ${pct}%`, W * 0.05, H * 0.95);

    // ── Bottom right: time remaining ────────────────────────────────────
    const remaining = Math.max(0, Math.ceil(TOTAL_DURATION - elapsed));
    ctx.textAlign    = 'right';
    ctx.fillStyle    = remaining <= 5 ? '#ff6644' : COL_TEXT;
    ctx.fillText(`${remaining}s`, W * 0.95, H * 0.95);

    // ── Bottom center: score ────────────────────────────────────────────
    ctx.textAlign = 'center';
    ctx.fillStyle = COL_DIM;
    ctx.font      = `${Math.max(12, W * 0.028)}px sans-serif`;
    ctx.fillText(
      `${this._perfects} perfect · ${this._oks} ok · ${this._misses} miss`,
      W / 2, H * 0.95
    );
  }
}
