/**
 * @file src/minigames/rhythmChallenge.js
 * Rhythm Challenge — read and tap pre-authored rhythm patterns.
 *
 * Musical skill: rhythm reading and pattern recognition.
 * Structure: 3 rounds of increasing difficulty, ~75–90 seconds total.
 * Input: any piano key tap counts as a note hit.
 *
 * Audio: Web Audio API lookahead scheduler (no setInterval).
 * Rendering: Canvas 2D scrolling highway (no DOM elements).
 *
 * Round anatomy:
 *   Round 1 — Quarter Notes  (80 BPM, 8 bars, no syncopation)
 *   Round 2 — Eighth Notes   (90 BPM, 8 bars, eighths + one syncopation per bar)
 *   Round 3 — Syncopation    (100 BPM, 8 bars, off-beat hits, deliberate rests)
 */

import { BaseMinigame } from '../systems/minigameEngine.js';
import { getAudioContext } from '../audio/capture.js';

// ─── Hit detection windows ────────────────────────────────────────────────────
const PERFECT_WINDOW = 0.05;   // ±50ms
const OK_WINDOW      = 0.15;   // ±150ms
const LOOKAHEAD      = 0.10;   // schedule clicks 100ms ahead (AudioContext time)
const BEAT_FADE_SEC  = 0.65;   // seconds for judged note markers to fade out

// ─── Click audio ─────────────────────────────────────────────────────────────
const CLICK_FREQ_ACCENT = 1200;  // Hz — beat 1 of each bar (louder)
const CLICK_FREQ_NORMAL = 800;   // Hz — all other eighth positions
const CLICK_GAIN_ACCENT = 0.55;  // gain for accent click
const CLICK_GAIN_NORMAL = 0.28;  // gain for off-beat click
const CLICK_DURATION    = 0.018; // 18ms burst

// ─── Visual ───────────────────────────────────────────────────────────────────
const PIXELS_PER_BEAT  = 0.4;   // each beat travels 40% of canvas width
const FEEDBACK_FADE_MS = 400;
const TRANSITION_MS    = 3000;

// ─── Colours (match MetronomeMastery palette) ─────────────────────────────────
const COL_BG       = '#1a1a2e';
const COL_DIM      = '#aaaacc';
const COL_TEXT     = '#ffffff';
const COL_PERFECT  = '#44ee66';
const COL_OK       = '#eecc44';
const COL_MISS_X   = '#ff4444';
const COL_HIT_LINE = '#6677cc';
const COL_REST_FG  = '#3a3a5e';

// ─── Key map (same as keyboard.js) ───────────────────────────────────────────
const KEY_TO_NOTE = {
  'h': 'C3', 'j': 'D3', 'k': 'E3', 'l': 'F3',
  ';': 'G3', "'": 'A3', 'enter': 'B3',
  'u': 'C#3', 'i': 'D#3', 'o': 'F#3', 'p': 'G#3', '[': 'A#3',
};

// ─── Round definitions ────────────────────────────────────────────────────────
//
// barPattern: array of { offset, type } where:
//   offset — quarter-beat position within the bar (0 = beat 1, 1 = beat 2, …)
//   type   — 'quarter' | 'eighth' | 'half' | 'rest'
//
// 'rest' entries are rendered (so the player can SEE the empty beat) but are
// not hittable — they are pre-judged as neutral on generation.
//
const ROUNDS = Object.freeze([
  {
    bpm:         80,
    label:       'Quarter Notes',
    subtitle:    'Find the pulse',
    bars:        8,
    beatsPerBar: 4,
    barPattern: Object.freeze([
      { offset: 0, type: 'quarter' },
      { offset: 1, type: 'quarter' },
      { offset: 2, type: 'quarter' },
      { offset: 3, type: 'quarter' },
    ]),
  },
  {
    bpm:         90,
    label:       'Eighth Notes',
    subtitle:    'Feel the subdivisions',
    bars:        8,
    beatsPerBar: 4,
    // Beat 1 = quarter, then two eighths on beat 2, quarter on beat 3,
    // syncopated eighth on & of beat 3 (after a rest), eighth on & of 4.
    barPattern: Object.freeze([
      { offset: 0,   type: 'quarter' },
      { offset: 1.0, type: 'eighth'  },
      { offset: 1.5, type: 'eighth'  },
      { offset: 2.0, type: 'quarter' },
      { offset: 2.5, type: 'rest'    }, // gap on & of 3 — makes beat 4 feel syncopated
      { offset: 3.0, type: 'eighth'  },
      { offset: 3.5, type: 'eighth'  },
    ]),
  },
  {
    bpm:         100,
    label:       'Syncopation',
    subtitle:    'Hit the off-beat',
    bars:        8,
    beatsPerBar: 4,
    // Classic syncopation: rest on beat 2 and beat 4, hits on their off-beats.
    barPattern: Object.freeze([
      { offset: 0,   type: 'quarter' }, // beat 1 — anchor
      { offset: 0.5, type: 'eighth'  }, // & of 1
      { offset: 1,   type: 'rest'    }, // beat 2 intentionally empty
      { offset: 1.5, type: 'eighth'  }, // & of 2 — syncopated hit
      { offset: 2,   type: 'quarter' }, // beat 3 — anchor
      { offset: 2.5, type: 'eighth'  }, // & of 3
      { offset: 3,   type: 'rest'    }, // beat 4 intentionally empty
      { offset: 3.5, type: 'eighth'  }, // & of 4 — syncopated hit
    ]),
  },
]);

// ─── Main class ───────────────────────────────────────────────────────────────

export class RhythmChallenge extends BaseMinigame {
  start() {
    const audioCtx = getAudioContext();
    if (!audioCtx) {
      this.done({ stars: 0, score: 0, accuracyPct: 0, passed: false });
      return;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    this._audioCtx = audioCtx;

    // ── Global score (accumulates across all rounds) ───────────────────────
    this._perfects = 0;
    this._oks      = 0;
    this._misses   = 0;

    // ── UI state ──────────────────────────────────────────────────────────
    this._feedback    = null;   // { text, color, time }
    this._lastTapTime = -1;
    this._finished    = false;

    // ── Round / transition state ──────────────────────────────────────────
    this._roundIdx           = 0;
    this._roundState         = 'idle'; // 'playing' | 'transitioning'
    this._transitionStartMs  = null;
    this._nextTransitionRound = 0;

    // Per-round — set by _beginRound()
    this._notes          = [];
    this._nextClickTime  = 0;
    this._roundEndTime   = 0;
    this._roundBeatSec   = 0;
    this._roundStartT    = 0;
    this._roundBeatsPerBar = 4;

    // ── Input ─────────────────────────────────────────────────────────────
    this._onKeyDown = (e) => {
      if (e.repeat || this._finished) return;
      if (!KEY_TO_NOTE[e.key.toLowerCase()]) return;
      e.preventDefault();
      this._handleTap();
    };
    document.addEventListener('keydown', this._onKeyDown);

    this._onPointer = (e) => {
      if (this._finished) return;
      e.preventDefault();
      this._handleTap();
    };
    this.canvas.addEventListener('touchstart', this._onPointer, { passive: false });
    this.canvas.addEventListener('mousedown', this._onPointer);

    // ── Start first round ─────────────────────────────────────────────────
    this._beginRound(0);

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
    if (this._onPointer) {
      this.canvas.removeEventListener('touchstart', this._onPointer);
      this.canvas.removeEventListener('mousedown', this._onPointer);
      this._onPointer = null;
    }
    this._notes = [];
  }

  // ─── Round management ─────────────────────────────────────────────────────

  _beginRound(roundIdx) {
    const round   = ROUNDS[roundIdx];
    const beatSec = 60 / round.bpm;
    const startT  = this._audioCtx.currentTime + 0.5; // 500ms grace before first note

    // Pre-generate every note event for the round
    const notes = [];
    for (let bar = 0; bar < round.bars; bar++) {
      for (const spec of round.barPattern) {
        const t      = startT + (bar * round.beatsPerBar + spec.offset) * beatSec;
        const isRest = spec.type === 'rest';
        notes.push({
          time:     t,
          type:     spec.type,
          isRest,
          judged:   isRest,    // rests are pre-judged — they can't be hit
          result:   null,
          judgedAt: null,
        });
      }
    }

    const lastNoteTime = notes[notes.length - 1].time;

    this._roundIdx       = roundIdx;
    this._roundState     = 'playing';
    this._notes          = notes;
    this._roundBeatSec   = beatSec;
    this._roundEndTime   = lastNoteTime + 2 * beatSec; // 2-beat buffer after last note
    this._roundStartT    = startT;
    this._nextClickTime  = startT;                     // metronome starts on beat 1
    this._roundBeatsPerBar = round.beatsPerBar;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  _update() {
    const now = this._audioCtx.currentTime;

    if (this._roundState === 'playing') {
      // ── Metronome lookahead scheduler (eighth-note grid) ──────────────
      const eighthSec = this._roundBeatSec / 2;
      while (this._nextClickTime < now + LOOKAHEAD) {
        const offsetSec  = this._nextClickTime - this._roundStartT;
        const eighthNum  = Math.round(offsetSec / eighthSec);
        const isAccent   = eighthNum % (this._roundBeatsPerBar * 2) === 0;
        this._scheduleClick(this._nextClickTime, isAccent);
        this._nextClickTime += eighthSec;
      }

      // ── Expire missed notes (past OK_WINDOW) ──────────────────────────
      for (const n of this._notes) {
        if (!n.judged && n.time < now - OK_WINDOW) {
          n.judged   = true;
          n.result   = 'miss';
          n.judgedAt = n.time;
          this._misses++;
        }
      }

      // ── Prune fully-faded judged notes from front ─────────────────────
      while (
        this._notes.length > 0 &&
        this._notes[0].judged &&
        this._notes[0].judgedAt !== null &&
        now - this._notes[0].judgedAt > BEAT_FADE_SEC + 0.3
      ) {
        this._notes.shift();
      }

      // ── Round-end detection ───────────────────────────────────────────
      if (now >= this._roundEndTime) {
        if (this._roundIdx < ROUNDS.length - 1) {
          this._roundState         = 'transitioning';
          this._transitionStartMs  = performance.now();
          this._nextTransitionRound = this._roundIdx + 1;
        } else {
          this._finish();
        }
      }

    } else if (this._roundState === 'transitioning') {
      if (performance.now() - this._transitionStartMs >= TRANSITION_MS) {
        this._beginRound(this._nextTransitionRound);
      }
    }
  }

  // ─── Audio ────────────────────────────────────────────────────────────────

  _scheduleClick(time, accent) {
    const ctx  = this._audioCtx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = accent ? CLICK_FREQ_ACCENT : CLICK_FREQ_NORMAL;
    const peak          = accent ? CLICK_GAIN_ACCENT  : CLICK_GAIN_NORMAL;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.001);
    gain.gain.linearRampToValueAtTime(0, time + CLICK_DURATION);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + CLICK_DURATION + 0.01);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  _handleTap() {
    if (this._roundState !== 'playing') return;
    const now = this._audioCtx.currentTime;

    // Debounce (same threshold as MetronomeMastery)
    if (now - this._lastTapTime < 0.03) return;
    this._lastTapTime = now;

    // Find nearest unjudged, non-rest note
    let bestIdx   = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < this._notes.length; i++) {
      const n = this._notes[i];
      if (n.judged || n.isRest) continue;
      const delta = Math.abs(now - n.time);
      if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
    }

    if (bestIdx < 0 || bestDelta > OK_WINDOW) {
      this._setFeedback('MISS', COL_MISS_X);
      return;
    }

    const n    = this._notes[bestIdx];
    n.judged   = true;
    n.judgedAt = now;

    if (bestDelta <= PERFECT_WINDOW) {
      n.result = 'perfect';
      this._perfects++;
      this._setFeedback('PERFECT', COL_PERFECT);
    } else {
      n.result = 'ok';
      this._oks++;
      this._setFeedback('OK', COL_OK);
    }
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
    else if (perfectPct >= 80) stars = 3;
    else if (perfectPct >= 60) stars = 2;
    else                       stars = 1;

    this.done({ stars, score: this._perfects * 10, accuracyPct: perfectPct, passed: stars >= 1 });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render() {
    const { ctx, canvas } = this;
    const dpr     = window.devicePixelRatio || 1;
    const W       = canvas.width / dpr;
    const H       = canvas.height / dpr;
    const now     = this._audioCtx.currentTime;
    const round   = ROUNDS[this._roundIdx] ?? ROUNDS[0];
    const beatSec = this._roundBeatSec || (60 / round.bpm);
    const pps     = (W * PIXELS_PER_BEAT) / beatSec; // pixels per AudioContext second

    // ── Layout constants ──────────────────────────────────────────────────
    const headerH    = H * 0.14;
    const highwayTop = headerH;
    const highwayH   = H * 0.60;
    const highwayBot = highwayTop + highwayH;
    const highwayCy  = highwayTop + highwayH / 2;
    const hitX       = W / 2;
    const qRadius    = Math.min(highwayH * 0.15, 20); // quarter note circle
    const eRadius    = qRadius * 0.58;                // eighth note circle (smaller)
    const pillExtra  = qRadius * 2.2;                 // extra width for half-note pill

    // ── Background ────────────────────────────────────────────────────────
    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);

    // ── Highway background + edge lines ───────────────────────────────────
    ctx.fillStyle = '#12122a';
    ctx.fillRect(0, highwayTop, W, highwayH);

    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, highwayTop); ctx.lineTo(W, highwayTop);
    ctx.moveTo(0, highwayBot); ctx.lineTo(W, highwayBot);
    ctx.stroke();

    ctx.strokeStyle = '#1e1e38';
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.moveTo(0, highwayCy); ctx.lineTo(W, highwayCy);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Hit line glow + bar ───────────────────────────────────────────────
    const nearHit = this._notes.some(n => !n.judged && !n.isRest && Math.abs(n.time - now) < 0.05);
    const grd     = ctx.createLinearGradient(hitX - 24, 0, hitX + 24, 0);
    const glowA   = nearHit ? 0.45 : 0.12;
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

    // ── Note and rest markers ─────────────────────────────────────────────
    for (const n of this._notes) {
      const nx     = hitX + (n.time - now) * pps;
      const radius = n.type === 'eighth' ? eRadius : qRadius;

      // Cull off-screen
      if (nx < -(qRadius + pillExtra) * 2 || nx > W + (qRadius + pillExtra) * 2) continue;

      // ─ Rest: horizontal line + small diamond ─────────────────────────
      if (n.isRest) {
        ctx.strokeStyle = COL_REST_FG;
        ctx.lineWidth   = 2;
        const hw = eRadius * 1.2;
        ctx.beginPath();
        ctx.moveTo(nx - hw, highwayCy);
        ctx.lineTo(nx + hw, highwayCy);
        ctx.stroke();
        // Diamond
        ctx.fillStyle = '#252540';
        ctx.beginPath();
        ctx.moveTo(nx,      highwayCy - 6);
        ctx.lineTo(nx + 6,  highwayCy);
        ctx.lineTo(nx,      highwayCy + 6);
        ctx.lineTo(nx - 6,  highwayCy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = COL_REST_FG;
        ctx.lineWidth   = 1;
        ctx.stroke();
        continue;
      }

      // ─ Unjudged (approaching) ─────────────────────────────────────────
      if (!n.judged) {
        const proximity = 1 - Math.min(1, Math.abs(n.time - now) / (beatSec * 1.5));
        const r  = Math.round(80  + proximity * 100);
        const g  = Math.round(80  + proximity * 100);
        const bl = Math.round(120 + proximity * 135);
        ctx.fillStyle   = `rgb(${r},${g},${bl})`;
        ctx.strokeStyle = proximity > 0.5 ? '#8899ff' : '#333355';
        ctx.lineWidth   = 2;
        this._drawNote(ctx, nx, highwayCy, radius, n.type === 'half' ? pillExtra : 0);

        // Ring pulse exactly at hit line
        if (Math.abs(n.time - now) < 0.03) {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.arc(nx, highwayCy, radius + 9, 0, Math.PI * 2);
          ctx.stroke();
        }
        continue;
      }

      // ─ Judged (fading) ────────────────────────────────────────────────
      const timeSince = now - (n.judgedAt ?? n.time);
      const alpha     = Math.max(0, 1 - timeSince / BEAT_FADE_SEC);
      if (alpha <= 0) continue;

      ctx.globalAlpha = alpha;
      const xW = n.type === 'half' ? pillExtra : 0;

      if (n.result === 'perfect') {
        ctx.fillStyle   = COL_PERFECT;
        ctx.strokeStyle = '#22cc44';
        ctx.lineWidth   = 2;
        this._drawNote(ctx, nx, highwayCy, radius, xW);
      } else if (n.result === 'ok') {
        ctx.fillStyle   = COL_OK;
        ctx.strokeStyle = '#cc9922';
        ctx.lineWidth   = 2;
        this._drawNote(ctx, nx, highwayCy, radius, xW);
      } else {
        // Miss — red X
        ctx.strokeStyle = COL_MISS_X;
        ctx.lineWidth   = 3;
        const s = radius * 0.65;
        ctx.beginPath();
        ctx.moveTo(nx - s, highwayCy - s); ctx.lineTo(nx + s, highwayCy + s);
        ctx.moveTo(nx + s, highwayCy - s); ctx.lineTo(nx - s, highwayCy + s);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Header: round label + BPM + progress dots ─────────────────────────
    const headerCy = headerH / 2;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = COL_DIM;
    ctx.font         = `bold ${Math.max(13, W * 0.036)}px sans-serif`;
    ctx.fillText(`Round ${this._roundIdx + 1}: ${round.label}`, W / 2, headerCy - 9);
    ctx.font      = `${Math.max(11, W * 0.026)}px sans-serif`;
    ctx.fillStyle = '#6666aa';
    ctx.fillText(`${round.bpm} BPM  ·  ${round.subtitle}`, W / 2, headerCy + 9);

    // Round progress dots (top right)
    const dotR   = 5;
    const dotGap = 14;
    const dotsX  = W * 0.92;
    for (let i = 0; i < ROUNDS.length; i++) {
      ctx.fillStyle = i <= this._roundIdx ? '#8899ff' : '#2a2a4a';
      ctx.beginPath();
      ctx.arc(dotsX - (ROUNDS.length - 1 - i) * dotGap, headerCy, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Transition overlay ────────────────────────────────────────────────
    if (this._roundState === 'transitioning') {
      const elapsed = performance.now() - this._transitionStartMs;
      const fadeIn  = Math.min(1, elapsed / 300);
      const fadeOut = elapsed > TRANSITION_MS - 400
        ? Math.max(0, 1 - (elapsed - (TRANSITION_MS - 400)) / 400)
        : 1;
      ctx.globalAlpha = fadeIn * fadeOut;

      ctx.fillStyle = 'rgba(10,10,28,0.88)';
      ctx.fillRect(0, 0, W, H);

      const next = ROUNDS[this._nextTransitionRound];
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = COL_TEXT;
      ctx.font         = `bold ${Math.max(24, W * 0.07)}px sans-serif`;
      ctx.fillText(`Round ${this._nextTransitionRound + 1}`, W / 2, H * 0.42);
      ctx.font      = `${Math.max(16, W * 0.045)}px sans-serif`;
      ctx.fillStyle = '#8899ff';
      ctx.fillText(next.label, W / 2, H * 0.52);
      ctx.font      = `${Math.max(12, W * 0.03)}px sans-serif`;
      ctx.fillStyle = COL_DIM;
      ctx.fillText(next.subtitle, W / 2, H * 0.60);

      ctx.globalAlpha = 1;
    }

    // ── Feedback text (below highway) ─────────────────────────────────────
    if (this._feedback && this._roundState !== 'transitioning') {
      const age   = performance.now() - this._feedback.time;
      const alpha = Math.max(0, 1 - age / FEEDBACK_FADE_MS);
      if (alpha > 0) {
        ctx.globalAlpha  = alpha;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = this._feedback.color;
        ctx.font         = `bold ${Math.max(28, Math.min(48, W * 0.10))}px sans-serif`;
        ctx.fillText(this._feedback.text, W / 2, highwayBot + (H - highwayBot) * 0.38);
        ctx.globalAlpha = 1;
      }
    }

    // ── Live stats (bottom of below-highway area) ─────────────────────────
    const total  = this._perfects + this._oks + this._misses;
    const pct    = total > 0 ? Math.round((this._perfects / total) * 100) : 0;
    const statsY = highwayBot + (H - highwayBot) * 0.76;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = COL_DIM;
    ctx.font         = `${Math.max(11, W * 0.027)}px sans-serif`;
    ctx.fillText(
      `${pct}% perfect  ·  ${this._perfects} perfect  ·  ${this._oks} ok  ·  ${this._misses} miss`,
      W / 2, statsY
    );
  }

  // ─── Note drawing helper ──────────────────────────────────────────────────

  /**
   * Draw a filled + stroked circle (or pill for half notes).
   * Fill/stroke styles must be set before calling.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x      centre x
   * @param {number} y      centre y
   * @param {number} radius circle radius (= pill height / 2)
   * @param {number} extraW extra horizontal extension for pill (0 = circle)
   */
  _drawNote(ctx, x, y, radius, extraW) {
    ctx.beginPath();
    if (extraW > 0) {
      // Pill: two arcs joined by straight edges
      const lx = x - extraW / 2;
      const rx = x + extraW / 2;
      ctx.arc(lx, y, radius, Math.PI / 2,       Math.PI * 3 / 2); // left cap
      ctx.arc(rx, y, radius, -Math.PI / 2,      Math.PI / 2);     // right cap
      ctx.closePath();
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
}
