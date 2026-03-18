/**
 * @file src/minigames/metronomeMastery.js
 * Metronome Mastery — a rhythm precision minigame.
 *
 * Musical skill: tap in time with a metronome across four BPM phases.
 * Play time: 60 seconds (4 phases × 15 s each).
 * Input: any piano key tap counts as a beat hit.
 *
 * Audio: Web Audio API lookahead scheduler (no setInterval).
 * Rendering: Canvas 2D scrolling note highway (no DOM elements).
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
const PHASE_DURATION = 15;                      // seconds per phase
const TOTAL_DURATION = PHASE_DURATION * PHASES.length; // 60s
const LOOKAHEAD      = 0.1;                     // schedule beats 100ms ahead
const PERFECT_WINDOW = 0.05;                    // ±50ms
const OK_WINDOW      = 0.15;                    // ±150ms
const CLICK_FREQ     = 1000;                    // Hz
const CLICK_DURATION = 0.02;                    // 20ms

// Speed formula: each beat travels 40% of canvas width per beat period.
// pixelsPerSec = (W * 0.4) / beatSec  →  higher BPM = faster scroll.
const PIXELS_PER_BEAT_FRACTION = 0.4;

const FEEDBACK_FADE_MS = 400;
const BEAT_FADE_SEC    = 0.7;   // seconds for judged beats to fade out
const HISTORY_SIZE     = 8;     // kept for _pushHistory tracking

// ─── Colours ────────────────────────────────────────────────────────────────
const COL_BG       = '#1a1a2e';
const COL_TEXT     = '#ffffff';
const COL_DIM      = '#aaaacc';
const COL_PERFECT  = '#44ee66';
const COL_OK       = '#eecc44';
const COL_MISS_X   = '#ff4444';
const COL_HIT_LINE = '#6677cc';

export class MetronomeMastery extends BaseMinigame {
  start() {
    const audioCtx = getAudioContext();
    if (!audioCtx) {
      this.done({ stars: 0, score: 0, accuracyPct: 0, passed: false });
      return;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    this._audioCtx = audioCtx;

    // ── Timing state ──────────────────────────────────────────────────────
    this._startTime    = audioCtx.currentTime;
    this._nextBeatTime = this._startTime + 0.5; // first beat after 500ms grace
    this._currentPhase = 0;
    this._beatQueue    = [];   // { time, judged, result?, judgedAt? }
    this._totalBeats   = 0;
    this._perfects     = 0;
    this._oks          = 0;
    this._misses       = 0;
    this._history      = [];
    this._feedback     = null; // { text, color, time }
    this._lastTapTime  = -1;
    this._finished     = false;

    // ── Input ─────────────────────────────────────────────────────────────
    this._onKeyDown = (e) => {
      if (e.repeat || this._finished) return;
      const note = KEY_TO_NOTE[e.key.toLowerCase()];
      if (!note) return;
      e.preventDefault();
      this._handleTap();
    };
    document.addEventListener('keydown', this._onKeyDown);

    this._onTouchStart = (e) => {
      if (this._finished) return;
      e.preventDefault();
      this._handleTap();
    };
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('mousedown', this._onTouchStart);

    // ── rAF loop ──────────────────────────────────────────────────────────
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
    const ctx     = this._audioCtx;
    const now     = ctx.currentTime;
    const elapsed = now - this._startTime;

    if (elapsed >= TOTAL_DURATION) {
      this._finish();
      return;
    }

    this._currentPhase = Math.min(
      PHASES.length - 1,
      Math.floor(elapsed / PHASE_DURATION)
    );
    const bpm     = PHASES[this._currentPhase].bpm;
    const beatSec = 60 / bpm;

    // ── Lookahead scheduler ─────────────────────────────────────────────
    while (this._nextBeatTime < now + LOOKAHEAD) {
      this._expireOldBeats(this._nextBeatTime - beatSec * 0.5);
      this._scheduleClick(this._nextBeatTime);
      this._beatQueue.push({ time: this._nextBeatTime, judged: false, result: null, judgedAt: null });
      this._totalBeats++;
      this._nextBeatTime += beatSec;
    }

    this._expireOldBeats(now - OK_WINDOW);

    // Prune beats that have fully faded from view (judged + faded out)
    while (
      this._beatQueue.length > 0 &&
      this._beatQueue[0].judged &&
      now - this._beatQueue[0].judgedAt > BEAT_FADE_SEC + 0.2
    ) {
      this._beatQueue.shift();
    }
  }

  _expireOldBeats(cutoff) {
    for (let i = 0; i < this._beatQueue.length; i++) {
      const b = this._beatQueue[i];
      if (!b.judged && b.time < cutoff) {
        b.judged   = true;
        b.result   = 'miss';
        b.judgedAt = b.time;
        this._misses++;
        this._pushHistory('miss');
      }
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

    // Debounce rapid double-taps (< 30ms apart)
    if (now - this._lastTapTime < 0.03) return;
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
      this._setFeedback('MISS', COL_MISS_X);
      return;
    }

    const b    = this._beatQueue[bestIdx];
    b.judged   = true;
    b.judgedAt = now;

    if (bestDelta <= PERFECT_WINDOW) {
      b.result = 'perfect';
      this._perfects++;
      this._pushHistory('perfect');
      this._setFeedback('PERFECT', COL_PERFECT);
    } else {
      b.result = 'ok';
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

    const total      = this._perfects + this._oks + this._misses;
    const perfectPct = total > 0 ? Math.round((this._perfects / total) * 100) : 0;
    const missRate   = total > 0 ? this._misses / total : 0;

    let stars;
    if (missRate > 0.5)        stars = 0;
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
    const dpr     = window.devicePixelRatio || 1;
    const W       = canvas.width / dpr;
    const H       = canvas.height / dpr;
    const now     = this._audioCtx.currentTime;
    const elapsed = now - this._startTime;
    const phase   = PHASES[this._currentPhase];
    const bpm     = phase.bpm;
    const beatSec = 60 / bpm;

    // How many pixels a beat travels per second at this BPM
    const pixelsPerSec = (W * PIXELS_PER_BEAT_FRACTION) / beatSec;

    // ── Layout ────────────────────────────────────────────────────────────
    const headerH    = H * 0.14;
    const highwayTop = headerH;
    const highwayH   = H * 0.60;
    const highwayBot = highwayTop + highwayH;
    const highwayCy  = highwayTop + highwayH / 2;
    const hitX       = W / 2;
    const beatRadius = Math.min(highwayH * 0.16, 22);

    // ── Background ──────────────────────────────────────────────────────
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);

    // ── Highway background ──────────────────────────────────────────────
    ctx.fillStyle = '#12122a';
    ctx.fillRect(0, highwayTop, W, highwayH);

    // Lane edges
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, highwayTop); ctx.lineTo(W, highwayTop);
    ctx.moveTo(0, highwayBot); ctx.lineTo(W, highwayBot);
    ctx.stroke();

    // Centre guide rail (faint dashed line)
    ctx.strokeStyle = '#1e1e38';
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(0, highwayCy); ctx.lineTo(W, highwayCy);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Hit line glow + bar ──────────────────────────────────────────────
    const nearHit = this._beatQueue.some(b => !b.judged && Math.abs(b.time - now) < 0.05);

    const grd = ctx.createLinearGradient(hitX - 24, 0, hitX + 24, 0);
    const glowA = nearHit ? 0.45 : 0.12;
    grd.addColorStop(0,   `rgba(100,120,255,0)`);
    grd.addColorStop(0.5, `rgba(160,180,255,${glowA})`);
    grd.addColorStop(1,   `rgba(100,120,255,0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(hitX - 24, highwayTop, 48, highwayH);

    ctx.strokeStyle = nearHit ? '#aabbff' : COL_HIT_LINE;
    ctx.lineWidth   = nearHit ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(hitX, highwayTop);
    ctx.lineTo(hitX, highwayBot);
    ctx.stroke();

    // ── Beat circles ────────────────────────────────────────────────────
    for (const b of this._beatQueue) {
      const bx = hitX + (b.time - now) * pixelsPerSec;

      // Cull well off-screen
      if (bx < -beatRadius * 3 || bx > W + beatRadius * 3) continue;

      if (!b.judged) {
        // Upcoming beat — brighter as it approaches the hit line
        const proximity = 1 - Math.min(1, Math.abs(b.time - now) / (beatSec * 1.5));
        const r = Math.round(80  + proximity * 120);
        const g = Math.round(80  + proximity * 120);
        const bl = Math.round(120 + proximity * 135);
        ctx.fillStyle   = `rgb(${r},${g},${bl})`;
        ctx.strokeStyle = proximity > 0.5 ? '#8899ff' : '#333355';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(bx, highwayCy, beatRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Ring pulse when beat is right at the hit line (±30ms)
        if (Math.abs(b.time - now) < 0.03) {
          const pulseR = beatRadius + 8 + (0.03 - Math.abs(b.time - now)) * 200;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.arc(bx, highwayCy, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        // Past beat — fade based on time since judgment
        const timeSince  = now - (b.judgedAt ?? b.time);
        const fadeAlpha  = Math.max(0, 1 - timeSince / BEAT_FADE_SEC);
        if (fadeAlpha <= 0) continue;

        ctx.globalAlpha = fadeAlpha;

        if (b.result === 'perfect') {
          ctx.fillStyle   = COL_PERFECT;
          ctx.strokeStyle = '#22cc44';
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.arc(bx, highwayCy, beatRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (b.result === 'ok') {
          ctx.fillStyle   = COL_OK;
          ctx.strokeStyle = '#cc9922';
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.arc(bx, highwayCy, beatRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Miss — red X
          ctx.strokeStyle = COL_MISS_X;
          ctx.lineWidth   = 3;
          const s = beatRadius * 0.65;
          ctx.beginPath();
          ctx.moveTo(bx - s, highwayCy - s); ctx.lineTo(bx + s, highwayCy + s);
          ctx.moveTo(bx + s, highwayCy - s); ctx.lineTo(bx - s, highwayCy + s);
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      }
    }

    // ── Header: phase label, BPM, timer ─────────────────────────────────
    const headerCy = headerH / 2;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = COL_DIM;
    ctx.font         = `bold ${Math.max(13, W * 0.036)}px sans-serif`;
    ctx.fillText(phase.label, W / 2, headerCy - 9);
    ctx.font      = `${Math.max(11, W * 0.026)}px sans-serif`;
    ctx.fillStyle = '#6666aa';
    ctx.fillText(`${bpm} BPM  ·  Phase ${this._currentPhase + 1} / ${PHASES.length}`, W / 2, headerCy + 9);

    const remaining = Math.max(0, Math.ceil(TOTAL_DURATION - elapsed));
    ctx.textAlign = 'right';
    ctx.font      = `bold ${Math.max(15, W * 0.042)}px sans-serif`;
    ctx.fillStyle = remaining <= 5 ? '#ff6644' : COL_TEXT;
    ctx.fillText(`${remaining}s`, W * 0.96, headerCy);

    // ── Feedback text (below highway) ────────────────────────────────────
    const feedY = highwayBot + (H - highwayBot) * 0.38;
    if (this._feedback) {
      const age   = performance.now() - this._feedback.time;
      const alpha = Math.max(0, 1 - age / FEEDBACK_FADE_MS);
      if (alpha > 0) {
        ctx.globalAlpha  = alpha;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = this._feedback.color;
        ctx.font         = `bold ${Math.max(28, Math.min(48, W * 0.1))}px sans-serif`;
        ctx.fillText(this._feedback.text, W / 2, feedY);
        ctx.globalAlpha  = 1;
      }
    }

    // ── Live stats (bottom of below-highway area) ─────────────────────────
    const statsY = highwayBot + (H - highwayBot) * 0.76;
    const total  = this._perfects + this._oks + this._misses;
    const pct    = total > 0 ? Math.round((this._perfects / total) * 100) : 0;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = COL_DIM;
    ctx.font         = `${Math.max(11, W * 0.027)}px sans-serif`;
    ctx.fillText(
      `${pct}% perfect  ·  ${this._perfects} perfect  ·  ${this._oks} ok  ·  ${this._misses} miss`,
      W / 2, statsY
    );
  }
}
