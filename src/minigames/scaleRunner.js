/**
 * @file src/minigames/scaleRunner.js
 * Scale Runner — play the C major scale ascending and descending, in time.
 *
 * Musical skill: scale familiarity, muscle memory, left-right hand position.
 * Structure: 3 rounds, each a full ascending + descending C major scale.
 *   Round 1 — 60 BPM  (one note per beat — slow, learn the positions)
 *   Round 2 — 75 BPM  (ascending + descending — keep moving)
 *   Round 3 — 90 BPM  (ascending + descending — approaching comfortable tempo)
 *
 * Input: piano keys (keyboard + on-screen click/touch).
 * Scoring: hitting a note within ±200ms of its target beat = ok;
 *          within ±80ms = perfect. Missing = miss.
 *
 * Visual:
 *   - Piano at bottom (full width, same layout as callResponse.js).
 *   - Next expected note pulses bright white on the keyboard.
 *   - Upcoming notes in sequence dim-highlighted in region blue.
 *   - A horizontal note ladder above the keyboard shows the scale
 *     arc: each note occupies a column, active note is highlighted.
 *   - Feedback text (PERFECT / OK / MISS) fades below the ladder.
 *   - Round progress dots + BPM label in header.
 */

import { BaseMinigame }   from '../systems/minigameEngine.js';
import { getAudioContext } from '../audio/capture.js';

// ─── C major scale ────────────────────────────────────────────────────────────
const SCALE = Object.freeze(['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3']);

// Full sequence per round: ascending then descending (top note not repeated)
// e.g. C D E F G A B A G F E D C  (13 notes)
function makeSequence() {
  const asc  = [...SCALE];
  const desc = [...SCALE].reverse().slice(1); // B A G F E D C (drop B duplicate)
  return [...asc, ...desc];
}

// ─── Round config ─────────────────────────────────────────────────────────────
const ROUNDS = Object.freeze([
  { bpm: 60,  label: 'Slow',   subtitle: 'Find every key' },
  { bpm: 75,  label: 'Medium', subtitle: 'Keep it flowing' },
  { bpm: 90,  label: 'Fast',   subtitle: 'Stay in time'   },
]);

// ─── Hit windows ──────────────────────────────────────────────────────────────
const PERFECT_SEC = 0.08;   // ±80ms
const OK_SEC      = 0.20;   // ±200ms
const LOOKAHEAD   = 0.10;   // audio schedule lookahead

// ─── Note frequencies (C3 octave, same as callResponse.js) ───────────────────
const BASE_FREQ = {
  'C': 130.81, 'C#': 138.59, 'D': 146.83, 'D#': 155.56, 'E': 164.81,
  'F': 174.61, 'F#': 185.00, 'G': 196.00, 'G#': 207.65,
  'A': 220.00, 'A#': 233.08, 'B': 246.94,
};

function noteFreq(note) {
  const m = note.match(/^([A-G]#?)(\d+)$/);
  if (!m) return null;
  const base = BASE_FREQ[m[1]];
  return base != null ? base * Math.pow(2, parseInt(m[2], 10) - 3) : null;
}

// ─── Key map ──────────────────────────────────────────────────────────────────
const KEY_TO_NOTE = {
  'h': 'C3', 'j': 'D3', 'k': 'E3', 'l': 'F3',
  ';': 'G3', "'": 'A3', 'enter': 'B3',
  'u': 'C#3', 'i': 'D#3', 'o': 'F#3', 'p': 'G#3', '[': 'A#3',
};

// ─── Piano key definitions (mirrored from callResponse.js) ───────────────────
const WHITE_KEYS = [
  { note: 'C3', key: 'H', idx: 0 },
  { note: 'D3', key: 'J', idx: 1 },
  { note: 'E3', key: 'K', idx: 2 },
  { note: 'F3', key: 'L', idx: 3 },
  { note: 'G3', key: ';', idx: 4 },
  { note: 'A3', key: "'", idx: 5 },
  { note: 'B3', key: '↵', idx: 6 },
];

const BLACK_KEYS = [
  { note: 'C#3', key: 'U', afterIdx: 0 },
  { note: 'D#3', key: 'I', afterIdx: 1 },
  { note: 'F#3', key: 'O', afterIdx: 3 },
  { note: 'G#3', key: 'P', afterIdx: 4 },
  { note: 'A#3', key: '[', afterIdx: 5 },
];

// ─── Colours ──────────────────────────────────────────────────────────────────
const COL_BG      = '#1a1a2e';
const COL_TEXT    = '#ffffff';
const COL_DIM     = '#aaaacc';
const COL_PERFECT = '#44ee66';
const COL_OK      = '#eecc44';
const COL_MISS    = '#ff4444';
const COL_ACTIVE  = '#ffffff';    // next note on keyboard
const COL_UPCOMING = '#4466cc';   // upcoming notes on keyboard
const COL_DONE    = '#336633';    // already played notes in ladder
const KEY_WHITE   = '#f0ead6';
const KEY_BLACK   = '#2e2e2e';

const FEEDBACK_FADE_MS  = 500;
const RESULT_DISPLAY_MS = 2500;
const INTERSTITIAL_MS   = 2000;

// ─── Main class ───────────────────────────────────────────────────────────────

export class ScaleRunner extends BaseMinigame {
  start() {
    const audioCtx = getAudioContext();
    if (!audioCtx) {
      this.done({ stars: 0, score: 0, accuracyPct: 0, passed: false });
      return;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    this._audioCtx = audioCtx;

    // ── Global score ──────────────────────────────────────────────────────
    this._perfects = 0;
    this._oks      = 0;
    this._misses   = 0;

    // ── State ─────────────────────────────────────────────────────────────
    this._roundIdx   = 0;
    this._phase      = 'playing';   // 'playing' | 'result' | 'interstitial'
    this._finished   = false;
    this._feedback   = null;        // { text, color, time }
    this._keyFlash   = null;        // { note, color, time }
    this._timers     = [];
    this._nextClickTime = 0;

    // Per-round note sequence state
    this._notes      = [];          // { note, time, judged, result, judgedAt }
    this._noteIdx    = 0;           // index of next note player must hit

    // ── Input ─────────────────────────────────────────────────────────────
    this._onKeyDown = (e) => {
      if (e.repeat || this._finished) return;
      const note = KEY_TO_NOTE[e.key.toLowerCase()];
      if (!note) return;
      e.preventDefault();
      this._handleNote(note);
    };
    document.addEventListener('keydown', this._onKeyDown);

    this._onCanvasClick = (e) => {
      if (this._finished) return;
      const note = this._noteAtPoint(e.clientX, e.clientY);
      if (note) this._handleNote(note);
    };
    this._onTouchStart = (e) => {
      if (this._finished) return;
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const note = this._noteAtPoint(t.clientX, t.clientY);
      if (note) this._handleNote(note);
    };
    this.canvas.addEventListener('click',      this._onCanvasClick);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });

    // ── Begin round 0 ─────────────────────────────────────────────────────
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
    document.removeEventListener('keydown', this._onKeyDown);
    this.canvas.removeEventListener('click',      this._onCanvasClick);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    for (const id of this._timers) clearTimeout(id);
    this._timers = [];
  }

  // ─── Round management ─────────────────────────────────────────────────────

  _beginRound(roundIdx) {
    const round   = ROUNDS[roundIdx];
    const beatSec = 60 / round.bpm;
    const seq     = makeSequence();
    // 1-beat lead-in before first note so player can orient
    const startT  = this._audioCtx.currentTime + beatSec;

    const notes = seq.map((note, i) => ({
      note,
      time:     startT + i * beatSec,
      judged:   false,
      result:   null,
      judgedAt: null,
    }));

    this._roundIdx      = roundIdx;
    this._phase         = 'playing';
    this._notes         = notes;
    this._noteIdx       = 0;
    this._nextClickTime = this._audioCtx.currentTime; // metronome starts immediately
    this._beatSec       = beatSec;
    this._roundStartT   = startT;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  _update() {
    if (this._phase !== 'playing') return;
    const now = this._audioCtx.currentTime;

    // ── Metronome click lookahead ──────────────────────────────────────────
    while (this._nextClickTime < now + LOOKAHEAD) {
      this._scheduleClick(this._nextClickTime);
      this._nextClickTime += this._beatSec;
    }

    // ── Expire missed notes ────────────────────────────────────────────────
    for (const n of this._notes) {
      if (!n.judged && n.time < now - OK_SEC) {
        n.judged   = true;
        n.result   = 'miss';
        n.judgedAt = n.time;
        this._misses++;
        // Advance noteIdx past missed note
        if (this._noteIdx <= this._notes.indexOf(n)) {
          this._noteIdx = this._notes.indexOf(n) + 1;
        }
      }
    }

    // ── Round complete: all notes judged ──────────────────────────────────
    const allJudged = this._notes.length > 0 && this._notes.every(n => n.judged);
    const lastNoteTime = this._notes.length > 0
      ? this._notes[this._notes.length - 1].time
      : 0;

    if (allJudged || now > lastNoteTime + this._beatSec * 2) {
      this._phase = 'result';
      this._after(RESULT_DISPLAY_MS, () => {
        const next = this._roundIdx + 1;
        if (next >= ROUNDS.length) {
          this._finish();
        } else {
          this._phase = 'interstitial';
          this._after(INTERSTITIAL_MS, () => this._beginRound(next));
        }
      });
    }
  }

  // ─── Audio ────────────────────────────────────────────────────────────────

  _scheduleClick(time) {
    const ctx  = this._audioCtx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = 900;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.001);
    gain.gain.linearRampToValueAtTime(0,    time + 0.018);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.025);
  }

  _playTone(note) {
    const freq = noteFreq(note);
    if (!freq) return;
    const ctx  = this._audioCtx;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.40);
  }

  // ─── Input handling ───────────────────────────────────────────────────────

  _handleNote(note) {
    if (this._phase !== 'playing' || this._finished) return;
    const now = this._audioCtx.currentTime;

    // Find the next unjudged note in sequence
    const target = this._notes[this._noteIdx];
    if (!target) return;

    this._playTone(note);

    const delta = Math.abs(now - target.time);

    if (note !== target.note) {
      // Wrong note — flash key red, no advance
      this._keyFlash = { note, color: COL_MISS, time: performance.now() };
      this._setFeedback('WRONG NOTE', COL_MISS);
      return;
    }

    // Correct note — judge timing
    target.judged   = true;
    target.judgedAt = now;
    this._noteIdx++;

    if (delta <= PERFECT_SEC) {
      target.result = 'perfect';
      this._perfects++;
      this._keyFlash = { note, color: COL_PERFECT, time: performance.now() };
      this._setFeedback('PERFECT', COL_PERFECT);
    } else if (delta <= OK_SEC) {
      target.result = 'ok';
      this._oks++;
      this._keyFlash = { note, color: COL_OK, time: performance.now() };
      this._setFeedback('OK', COL_OK);
    } else {
      target.result = 'miss';
      this._misses++;
      this._keyFlash = { note, color: COL_MISS, time: performance.now() };
      this._setFeedback('LATE', COL_MISS);
    }
  }

  _setFeedback(text, color) {
    this._feedback = { text, color, time: performance.now() };
  }

  // ─── Scoring ──────────────────────────────────────────────────────────────

  _finish() {
    if (this._finished) return;
    this._finished = true;

    const total      = this._perfects + this._oks + this._misses;
    const perfectPct = total > 0 ? Math.round((this._perfects / total) * 100) : 0;
    const hitPct     = total > 0 ? (this._perfects + this._oks) / total : 0;

    let stars;
    if (hitPct < 0.5)        stars = 0;
    else if (perfectPct >= 70) stars = 3;
    else if (perfectPct >= 45) stars = 2;
    else                       stars = 1;

    this.done({ stars, score: this._perfects * 10, accuracyPct: perfectPct, passed: stars >= 1 });
  }

  // ─── Input helpers ────────────────────────────────────────────────────────

  _noteAtPoint(clientX, clientY) {
    const r   = this.canvas.getBoundingClientRect();
    const px  = clientX - r.left;
    const py  = clientY - r.top;
    const dpr = window.devicePixelRatio || 1;
    const W   = this.canvas.width  / dpr;
    const H   = this.canvas.height / dpr;
    return this._getKeyAt(px, py, W, H);
  }

  _getKeyAt(px, py, W, H) {
    const { PIANO_X, PIANO_W, PIANO_H, wkW, bkW, bkH, pianoY } = this._pianoGeom(W, H);
    if (py < pianoY || py > pianoY + PIANO_H || px < PIANO_X || px > PIANO_X + PIANO_W) return null;
    for (const bk of BLACK_KEYS) {
      const kx = PIANO_X + (bk.afterIdx + 0.67) * wkW - bkW / 2;
      if (px >= kx && px <= kx + bkW && py <= pianoY + bkH) return bk.note;
    }
    for (const wk of WHITE_KEYS) {
      const kx = PIANO_X + wk.idx * wkW;
      if (px >= kx && px <= kx + wkW - 1) return wk.note;
    }
    return null;
  }

  _pianoGeom(W, H) {
    const PIANO_W = W < 600 ? W * 0.98 : W * 0.80;
    const PIANO_X = (W - PIANO_W) / 2;
    const PIANO_H = Math.min(H * 0.22, 140);
    const wkW     = PIANO_W / WHITE_KEYS.length;
    const bkW     = wkW * 0.58;
    const bkH     = PIANO_H * 0.62;
    const pianoY  = H - PIANO_H - 10;
    return { PIANO_W, PIANO_X, PIANO_H, wkW, bkW, bkH, pianoY };
  }

  // ─── Timer helper ─────────────────────────────────────────────────────────

  _after(ms, fn) {
    const id = setTimeout(() => {
      this._timers = this._timers.filter(t => t !== id);
      if (!this._finished) fn();
    }, ms);
    this._timers.push(id);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  _render() {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.width  / dpr;
    const H   = canvas.height / dpr;

    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);

    const { pianoY } = this._pianoGeom(W, H);

    this._renderHeader(ctx, W, H);
    this._renderLadder(ctx, W, pianoY);
    this._renderFeedback(ctx, W, pianoY);
    this._renderPiano(ctx, W, H);

    if (this._phase === 'result') this._renderResult(ctx, W, H);
    if (this._phase === 'interstitial') this._renderInterstitial(ctx, W, H);
  }

  // ── Header: round label + BPM + progress dots ───────────────────────────

  _renderHeader(ctx, W, H) {
    const round    = ROUNDS[this._roundIdx] ?? ROUNDS[0];
    const headerCy = H * 0.07;

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = COL_DIM;
    ctx.font         = `bold ${Math.max(13, W * 0.036)}px sans-serif`;
    ctx.fillText(`Round ${this._roundIdx + 1}: ${round.label}`, W / 2, headerCy - 8);
    ctx.font      = `${Math.max(11, W * 0.026)}px sans-serif`;
    ctx.fillStyle = '#6666aa';
    ctx.fillText(`${round.bpm} BPM  ·  ${round.subtitle}`, W / 2, headerCy + 10);

    // Progress dots
    const dotR   = 5;
    const dotGap = 14;
    const dotsX  = W * 0.92;
    for (let i = 0; i < ROUNDS.length; i++) {
      ctx.fillStyle = i <= this._roundIdx ? '#8899ff' : '#2a2a4a';
      ctx.beginPath();
      ctx.arc(dotsX - (ROUNDS.length - 1 - i) * dotGap, headerCy - 4, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Scale ladder: note columns above the piano ──────────────────────────

  _renderLadder(ctx, W, pianoY) {
    if (this._notes.length === 0) return;

    const seq    = makeSequence();
    const count  = seq.length;
    const now    = this._audioCtx?.currentTime ?? 0;

    const ladderTop = W < 500 ? pianoY * 0.22 : pianoY * 0.18;
    const ladderBot = pianoY - 20;
    const ladderH   = ladderBot - ladderTop;
    const colW      = Math.min((W * 0.86) / count, 38);
    const startX    = (W - colW * count) / 2;
    const dotR      = Math.min(colW * 0.32, 13);

    // Centre line
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(startX, ladderTop + ladderH / 2);
    ctx.lineTo(startX + colW * count, ladderTop + ladderH / 2);
    ctx.stroke();

    // Note columns — position dot on vertical axis by pitch (C=bottom, B=top)
    const pitchOrder = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];

    for (let i = 0; i < count; i++) {
      const note   = seq[i];
      const ni     = this._notes[i];
      const cx     = startX + i * colW + colW / 2;
      const pitch  = pitchOrder.indexOf(note);
      const cy     = ladderBot - (pitch / (pitchOrder.length - 1)) * ladderH;

      // Connect dots with a faint line to the previous dot
      if (i > 0) {
        const prevNote  = seq[i - 1];
        const prevPitch = pitchOrder.indexOf(prevNote);
        const prevCy    = ladderBot - (prevPitch / (pitchOrder.length - 1)) * ladderH;
        const prevCx    = startX + (i - 1) * colW + colW / 2;
        const isDone    = ni?.judged && this._notes[i - 1]?.judged;
        ctx.strokeStyle = isDone ? '#22aa44' : '#1e1e38';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(prevCx, prevCy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }

      // Dot colour based on state
      let fill, stroke, alpha = 1;

      if (!ni) {
        fill = '#1e1e38'; stroke = '#2a2a4a';
      } else if (ni.judged) {
        if (ni.result === 'perfect') { fill = COL_PERFECT; stroke = '#22cc44'; }
        else if (ni.result === 'ok') { fill = COL_OK;      stroke = '#cc9922'; }
        else                          { fill = '#441111';   stroke = COL_MISS;  }
      } else if (i === this._noteIdx) {
        // Active — pulse
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 180);
        fill   = `rgba(255,255,255,${pulse.toFixed(2)})`;
        stroke = '#ffffff';
      } else if (i > this._noteIdx && i <= this._noteIdx + 3) {
        // Upcoming — dim blue
        fill   = 'rgba(70,90,200,0.35)';
        stroke = '#4466cc';
      } else {
        fill = '#1e1e38'; stroke = '#2a2a4a';
      }

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle   = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = 2;
      ctx.stroke();

      // Note name label below dot (only for active + upcoming)
      if (i === this._noteIdx || (i > this._noteIdx && i <= this._noteIdx + 3)) {
        const noteName = note.replace('3', '');
        ctx.font         = `bold ${Math.max(9, dotR * 0.85)}px sans-serif`;
        ctx.fillStyle    = i === this._noteIdx ? COL_TEXT : '#4466cc';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(noteName, cx, cy + dotR + 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Feedback text ────────────────────────────────────────────────────────

  _renderFeedback(ctx, W, pianoY) {
    if (!this._feedback) return;
    const age   = performance.now() - this._feedback.time;
    const alpha = Math.max(0, 1 - age / FEEDBACK_FADE_MS);
    if (alpha <= 0) return;

    ctx.globalAlpha  = alpha;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = this._feedback.color;
    ctx.font         = `bold ${Math.max(26, Math.min(44, W * 0.09))}px sans-serif`;
    ctx.fillText(this._feedback.text, W / 2, pianoY - 28);
    ctx.globalAlpha = 1;
  }

  // ── Round result overlay ─────────────────────────────────────────────────

  _renderResult(ctx, W, H) {
    ctx.fillStyle = 'rgba(10,10,28,0.72)';
    ctx.fillRect(0, 0, W, H);

    const total      = this._perfects + this._oks + this._misses;
    const perfectPct = total > 0 ? Math.round((this._perfects / total) * 100) : 0;
    const round      = ROUNDS[this._roundIdx];

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = COL_TEXT;
    ctx.font         = `bold ${Math.max(28, W * 0.075)}px sans-serif`;
    ctx.fillText(`Round ${this._roundIdx + 1} complete`, W / 2, H * 0.38);

    ctx.font      = `${Math.max(15, W * 0.038)}px sans-serif`;
    ctx.fillStyle = COL_DIM;
    ctx.fillText(`${perfectPct}% perfect  ·  ${this._perfects}★ ${this._oks}✓ ${this._misses}✗`, W / 2, H * 0.50);

    if (this._roundIdx < ROUNDS.length - 1) {
      const next = ROUNDS[this._roundIdx + 1];
      ctx.font      = `${Math.max(13, W * 0.030)}px sans-serif`;
      ctx.fillStyle = '#6666aa';
      ctx.fillText(`Up next: ${next.bpm} BPM`, W / 2, H * 0.60);
    }
  }

  // ── Interstitial splash ──────────────────────────────────────────────────

  _renderInterstitial(ctx, W, H) {
    ctx.fillStyle = 'rgba(10,10,28,0.80)';
    ctx.fillRect(0, 0, W, H);

    const round = ROUNDS[this._roundIdx];
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = COL_TEXT;
    ctx.font         = `bold ${Math.max(30, W * 0.080)}px sans-serif`;
    ctx.fillText(`Round ${this._roundIdx + 1}`, W / 2, H * 0.42);
    ctx.font      = `${Math.max(16, W * 0.040)}px sans-serif`;
    ctx.fillStyle = '#8899ff';
    ctx.fillText(`${round.bpm} BPM  —  ${round.subtitle}`, W / 2, H * 0.54);
  }

  // ── Piano ────────────────────────────────────────────────────────────────

  _renderPiano(ctx, W, H) {
    const now = performance.now();
    const { PIANO_X, PIANO_W, PIANO_H, wkW, bkW, bkH, pianoY } = this._pianoGeom(W, H);

    const activeNote   = this._notes[this._noteIdx]?.note ?? null;
    const upcomingSet  = new Set(
      this._notes.slice(this._noteIdx + 1, this._noteIdx + 4).map(n => n.note)
    );

    const flashNote  = this._keyFlash?.note;
    const flashColor = this._keyFlash?.color;
    const flashAge   = this._keyFlash ? now - this._keyFlash.time : Infinity;
    const flashAlpha = flashAge < 350 ? Math.max(0, 1 - flashAge / 350) : 0;

    // Piano panel background
    ctx.fillStyle = 'rgba(8,8,18,0.92)';
    ctx.fillRect(PIANO_X - 6, pianoY - 8, PIANO_W + 12, PIANO_H + 18);

    // White keys
    for (const wk of WHITE_KEYS) {
      const kx        = PIANO_X + wk.idx * wkW;
      const isActive  = wk.note === activeNote;
      const isUpcoming = upcomingSet.has(wk.note);

      ctx.fillStyle   = isActive ? COL_ACTIVE : KEY_WHITE;
      ctx.strokeStyle = '#2a2010';
      ctx.lineWidth   = 1;
      ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
      ctx.strokeRect(kx, pianoY, wkW - 1, PIANO_H);

      // Upcoming note hint
      if (!isActive && isUpcoming) {
        ctx.fillStyle = 'rgba(68,102,204,0.28)';
        ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
      }

      // Flash overlay
      if (flashAlpha > 0 && flashNote === wk.note) {
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle   = flashColor;
        ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
        ctx.restore();
      }

      // Key label
      const keyFs = Math.max(10, Math.min(18, wkW * 0.42)) | 0;
      ctx.font         = `bold ${keyFs}px sans-serif`;
      ctx.fillStyle    = isActive ? '#111122' : '#2a2020';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wk.key, kx + wkW / 2, pianoY + PIANO_H * 0.36);

      ctx.font      = `${Math.max(8, keyFs - 4)}px sans-serif`;
      ctx.fillStyle = isActive ? '#333355' : '#888878';
      ctx.fillText(wk.note.replace('3', ''), kx + wkW / 2, pianoY + PIANO_H * 0.70);
    }

    // Black keys
    for (const bk of BLACK_KEYS) {
      const kx        = PIANO_X + (bk.afterIdx + 0.67) * wkW - bkW / 2;
      const isActive  = bk.note === activeNote;

      ctx.fillStyle   = isActive ? '#aaaaff' : KEY_BLACK;
      ctx.strokeStyle = '#0a0a0f';
      ctx.lineWidth   = 1;
      ctx.fillRect(kx, pianoY, bkW, bkH);
      ctx.strokeRect(kx, pianoY, bkW, bkH);

      if (flashAlpha > 0 && flashNote === bk.note) {
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle   = flashColor;
        ctx.fillRect(kx, pianoY, bkW, bkH);
        ctx.restore();
      }
    }
  }
}
