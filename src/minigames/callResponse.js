/**
 * @file src/minigames/callResponse.js
 * Call & Response — melodic memory and phrase imitation minigame.
 *
 * Musical skill: melodic memory, ear training, phrase imitation.
 * Play time: ~2 minutes.
 *
 * Gameplay
 * ────────
 *   The game "calls" a phrase by lighting up piano keys in sequence with audio.
 *   Player must echo the phrase back in the correct order.
 *   5 rounds with increasing phrase length (3→4→4→5→5 notes).
 *   Timing is NOT scored — only correct sequence matters.
 *   3 lives per round; wrong note = life lost; 0 lives = round failed.
 *
 * Scoring
 * ───────
 *   Each round: perfect (no mistakes) = 2★, any mistakes = 1★, failed = 0★
 *   Total stars → final rating: 10=3★, 7-9=2★, 3-6=1★, <3=0★
 */

import { BaseMinigame }  from '../systems/minigameEngine.js';
import { getAudioContext } from '../audio/capture.js';

// ─── Key map (same as keyboard.js) ──────────────────────────────────────────
const KEY_TO_NOTE = {
  'h': 'C3', 'j': 'D3', 'k': 'E3', 'l': 'F3',
  ';': 'G3', "'": 'A3', 'enter': 'B3',
  'u': 'C#3', 'i': 'D#3', 'o': 'F#3', 'p': 'G#3', '[': 'A#3',
};

// ─── Piano key definitions (mirrored from hud.js) ────────────────────────────
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

// ─── Note frequencies ─────────────────────────────────────────────────────────
const BASE_FREQ = {
  'C': 130.81, 'C#': 138.59, 'D': 146.83, 'D#': 155.56, 'E': 164.81,
  'F': 174.61, 'F#': 185.00, 'G': 196.00, 'G#': 207.65,
  'A': 220.00, 'A#': 233.08, 'B': 246.94,
};

function getNoteFreq(note) {
  const m = note.match(/^([A-G]#?)(\d+)$/);
  if (!m) return null;
  const base = BASE_FREQ[m[1]];
  return base != null ? base * Math.pow(2, parseInt(m[2], 10) - 3) : null;
}

// ─── Round configuration ──────────────────────────────────────────────────────
// Note pool: C major white notes (familiar, clear, beginner-friendly)
const NOTE_POOL = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3'];

// { length: phrase note count, demoMs: milliseconds between notes in demo }
const ROUND_CONFIGS = Object.freeze([
  { length: 3, demoMs: 600 },  // Round 1 — 3 notes, slow demo
  { length: 4, demoMs: 600 },  // Round 2 — 4 notes, slow demo
  { length: 4, demoMs: 600 },  // Round 3 — 4 notes, different start
  { length: 5, demoMs: 600 },  // Round 4 — 5 notes
  { length: 5, demoMs: 400 },  // Round 5 — 5 notes, faster demo
]);

const LIVES_PER_ROUND     = 3;
const RESULT_DISPLAY_MS   = 2000;  // show round result before transitioning
const INTERSTITIAL_MS     = 2500;  // "Round N" splash before next demo
const DONE_DISPLAY_MS     = 2500;  // final result before calling done()
const KEY_FLASH_MS        = 350;   // duration of correct/wrong key flash

// ─── Colours ─────────────────────────────────────────────────────────────────
const COL_BG       = '#1a1a2e';
const COL_TEXT     = '#ffffff';
const COL_DIM      = '#aaaacc';
const COL_CORRECT  = '#44ee66';
const COL_WRONG    = '#ff4444';
const COL_DEMO     = '#4488ff';
const COL_HEART    = '#ff4466';
const COL_HEART_EMPTY = '#333355';
const KEY_WHITE    = '#f0ead6';
const KEY_BLACK    = '#2e2e2e';

// ─── Phrase generation ────────────────────────────────────────────────────────

/**
 * Generate a phrase of `length` notes stepping up/down from a start index.
 * Steps are 1–3 scale degrees, direction randomised per step.
 * Consecutive repeated notes are avoided.
 */
function makePhrase(length, startIdx) {
  const phrase = [];
  let pos = Math.max(0, Math.min(NOTE_POOL.length - 1, startIdx));
  phrase.push(NOTE_POOL[pos]);
  for (let i = 1; i < length; i++) {
    const maxStep = Math.min(3, NOTE_POOL.length - 1);
    let step  = Math.floor(Math.random() * maxStep) + 1;
    let delta = Math.random() < 0.5 ? step : -step;
    let next  = pos + delta;
    // Clamp and avoid staying in place
    next = Math.max(0, Math.min(NOTE_POOL.length - 1, next));
    if (next === pos) next = pos + (delta > 0 ? -1 : 1);
    next = Math.max(0, Math.min(NOTE_POOL.length - 1, next));
    pos = next;
    phrase.push(NOTE_POOL[pos]);
  }
  return phrase;
}

// ─── Minigame class ───────────────────────────────────────────────────────────

export class CallResponse extends BaseMinigame {
  start() {
    // Generate all 5 phrases up front with varied starting positions
    this._phrases = ROUND_CONFIGS.map((_, i) => makePhrase(ROUND_CONFIGS[i].length, i * 2));

    // ── State ──────────────────────────────────────────────────────────────
    this._roundIdx      = 0;
    this._lives         = LIVES_PER_ROUND;
    this._totalStars    = 0;
    this._phase         = 'demo';  // 'demo'|'echo'|'roundResult'|'interstitial'|'done'
    this._demoNoteIdx   = -1;      // index of note currently highlighted during demo (-1 = none)
    this._demoHighlight = null;    // note string currently lit (null when between notes)
    this._echoIdx       = 0;       // how many notes player has echoed correctly
    this._roundStars    = 0;       // stars awarded for current round
    this._keyFlash      = null;    // { note, color, time } — decays over KEY_FLASH_MS
    this._timers        = [];      // setTimeout handles (cleared on destroy)
    this._finished      = false;

    // ── Input ──────────────────────────────────────────────────────────────
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
      const note = this._noteAtClientPoint(e.clientX, e.clientY);
      if (note) this._handleNote(note);
    };
    this._onTouchStart = (e) => {
      if (this._finished) return;
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      const note = this._noteAtClientPoint(t.clientX, t.clientY);
      if (note) this._handleNote(note);
    };
    this.canvas.addEventListener('click',      this._onCanvasClick);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });

    // ── rAF loop ──────────────────────────────────────────────────────────
    const loop = () => {
      if (this._finished) return;
      this._render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);

    // Kick off first demo
    this._startDemo();
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

  // ─── Phase transitions ───────────────────────────────────────────────────

  _startDemo() {
    this._phase        = 'demo';
    this._demoNoteIdx  = -1;
    this._demoHighlight = null;
    // Brief pause so "LISTEN" banner is visible before first note plays
    this._after(700, () => this._playDemoNote(0));
  }

  _playDemoNote(idx) {
    if (this._finished) return;
    const phrase = this._phrases[this._roundIdx];
    const cfg    = ROUND_CONFIGS[this._roundIdx];

    if (idx >= phrase.length) {
      // All notes played — clear highlight then transition to echo
      this._demoHighlight = null;
      this._demoNoteIdx   = phrase.length;  // "all done" sentinel
      this._after(500, () => this._startEcho());
      return;
    }

    this._demoNoteIdx   = idx;
    this._demoHighlight = phrase[idx];
    this._playTone(phrase[idx]);

    // Hold highlight for most of demoMs, then gap before next note
    const holdMs = cfg.demoMs * 0.75;
    const gapMs  = cfg.demoMs * 0.25;
    this._after(holdMs, () => {
      this._demoHighlight = null;
      this._after(gapMs, () => this._playDemoNote(idx + 1));
    });
  }

  _startEcho() {
    if (this._finished) return;
    this._phase        = 'echo';
    this._echoIdx      = 0;
    this._demoHighlight = null;
  }

  // ─── Player input ────────────────────────────────────────────────────────

  _handleNote(note) {
    if (this._phase !== 'echo' || this._finished) return;

    const phrase   = this._phrases[this._roundIdx];
    const expected = phrase[this._echoIdx];

    if (note === expected) {
      this._keyFlash = { note, color: COL_CORRECT, time: performance.now() };
      this._playTone(note);
      this._echoIdx++;

      if (this._echoIdx >= phrase.length) {
        // Round complete — stars based on how many lives remain
        const roundStars = this._lives === LIVES_PER_ROUND ? 2 : 1;
        this._endRound(roundStars);
      }
    } else {
      this._keyFlash = { note, color: COL_WRONG, time: performance.now() };
      this._lives--;
      if (this._lives <= 0) {
        this._endRound(0);
      }
    }
  }

  // ─── Round end ───────────────────────────────────────────────────────────

  _endRound(stars) {
    this._roundStars = stars;
    this._totalStars += stars;
    this._phase = 'roundResult';

    this._after(RESULT_DISPLAY_MS, () => {
      const next = this._roundIdx + 1;
      if (next >= ROUND_CONFIGS.length) {
        this._finish();
      } else {
        this._showInterstitial(next);
      }
    });
  }

  _showInterstitial(nextRoundIdx) {
    this._phase    = 'interstitial';
    this._roundIdx = nextRoundIdx;
    this._lives    = LIVES_PER_ROUND;
    this._echoIdx  = 0;
    this._roundStars = 0;
    this._after(INTERSTITIAL_MS, () => this._startDemo());
  }

  // ─── Final scoring ────────────────────────────────────────────────────────

  _finish() {
    if (this._finished) return;
    this._phase = 'done';

    const total = this._totalStars;
    const stars = total >= 10 ? 3 : total >= 7 ? 2 : total >= 3 ? 1 : 0;

    this._after(DONE_DISPLAY_MS, () => {
      this._finished = true;
      this.done({
        stars,
        score:       total * 10,
        accuracyPct: Math.round((total / (ROUND_CONFIGS.length * 2)) * 100),
        passed:      stars >= 1,
      });
    });
  }

  // ─── Audio ────────────────────────────────────────────────────────────────

  _playTone(note) {
    const freq = getNoteFreq(note);
    if (!freq) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.30, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.50);
  }

  // ─── Input helpers ────────────────────────────────────────────────────────

  _noteAtClientPoint(clientX, clientY) {
    const r   = this.canvas.getBoundingClientRect();
    const px  = clientX - r.left;
    const py  = clientY - r.top;
    const dpr = window.devicePixelRatio || 1;
    const W   = this.canvas.width / dpr;
    const H   = this.canvas.height / dpr;
    return this._getKeyAt(px, py, W, H);
  }

  _getKeyAt(px, py, W, H) {
    const { PIANO_X, PIANO_W, PIANO_H, wkW, bkW, bkH, pianoY } = this._pianoGeom(W, H);
    if (py < pianoY || py > pianoY + PIANO_H || px < PIANO_X || px > PIANO_X + PIANO_W) return null;
    // Black keys have higher z-order — check first
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

  // ─── Piano geometry ───────────────────────────────────────────────────────

  _pianoGeom(W, H) {
    // Wider than the HUD piano — this is the main attraction
    const PIANO_W = W < 600 ? W * 0.95 : W * 0.74;
    const PIANO_X = (W - PIANO_W) / 2;
    const PIANO_H = Math.min(H * 0.23, 148);
    const wkW     = PIANO_W / WHITE_KEYS.length;
    const bkW     = wkW * 0.58;
    const bkH     = PIANO_H * 0.62;
    const pianoY  = H - PIANO_H - 14;
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
    const W   = canvas.width / dpr;
    const H   = canvas.height / dpr;

    ctx.fillStyle = COL_BG;
    ctx.fillRect(0, 0, W, H);

    const { pianoY } = this._pianoGeom(W, H);
    const mainH = pianoY;  // area above the piano

    this._renderHeader(ctx, W, mainH);
    this._renderCenter(ctx, W, mainH);
    this._renderPiano(ctx, W, H);
  }

  // ─── Header: round number + lives ─────────────────────────────────────────

  _renderHeader(ctx, W, mainH) {
    const roundNum = Math.min(this._roundIdx + 1, ROUND_CONFIGS.length);
    const fontSize = Math.max(14, W * 0.036);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = COL_DIM;
    ctx.font         = `bold ${fontSize}px sans-serif`;
    ctx.fillText(`Round ${roundNum} / ${ROUND_CONFIGS.length}`, W * 0.04, mainH * 0.06);

    // Hearts — right side, largest first
    const heartFs = Math.max(18, W * 0.044);
    ctx.font      = `${heartFs}px sans-serif`;
    ctx.textAlign = 'right';
    for (let i = 0; i < LIVES_PER_ROUND; i++) {
      ctx.fillStyle = i < this._lives ? COL_HEART : COL_HEART_EMPTY;
      ctx.fillText('♥', W * 0.97 - i * (heartFs + 4), mainH * 0.06);
    }
  }

  // ─── Centre: phase label + phrase dots + sub-hint ─────────────────────────

  _renderCenter(ctx, W, mainH) {
    const cx    = W / 2;
    const now   = performance.now();

    // ── Phase label ────────────────────────────────────────────────────────
    let labelText, labelColor;
    switch (this._phase) {
      case 'demo':
        labelText  = 'LISTEN';
        labelColor = COL_DEMO;
        break;
      case 'echo':
        labelText  = 'YOUR TURN';
        labelColor = COL_CORRECT;
        break;
      case 'roundResult': {
        const s = this._roundStars;
        labelText  = s >= 2 ? 'PERFECT!' : s >= 1 ? 'WELL DONE' : 'ROUND FAILED';
        labelColor = s >= 2 ? COL_CORRECT : s >= 1 ? '#eecc44' : COL_WRONG;
        break;
      }
      case 'interstitial':
        labelText  = `Round ${this._roundIdx + 1}`;
        labelColor = COL_DIM;
        break;
      case 'done': {
        const total = this._totalStars;
        const s     = total >= 10 ? 3 : total >= 7 ? 2 : total >= 3 ? 1 : 0;
        labelText  = s >= 3 ? '★★★  EXCELLENT!' : s >= 2 ? '★★  GREAT!' : s >= 1 ? '★  COMPLETE' : 'PRACTICE MORE';
        labelColor = s >= 3 ? '#ffdd44' : s >= 2 ? COL_CORRECT : s >= 1 ? '#eecc44' : COL_DIM;
        break;
      }
      default:
        labelText = ''; labelColor = COL_TEXT;
    }

    const labelFs = Math.max(26, Math.min(52, W * 0.092));
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = labelColor;
    ctx.font         = `bold ${labelFs}px sans-serif`;
    ctx.fillText(labelText, cx, mainH * 0.30);

    // ── Phrase progress dots ───────────────────────────────────────────────
    if (this._phase !== 'interstitial' && this._phase !== 'done') {
      const safeRoundIdx = Math.min(this._roundIdx, ROUND_CONFIGS.length - 1);
      const phrase       = this._phrases[safeRoundIdx];
      const dotCount     = phrase.length;
      const dotR         = Math.max(9, Math.min(18, W * 0.026));
      const dotGap       = dotR * 2.9;
      const startX       = cx - ((dotCount - 1) * dotGap) / 2;
      const dotsY        = mainH * 0.56;

      for (let i = 0; i < dotCount; i++) {
        const dx = startX + i * dotGap;
        let fill, stroke;

        if (this._phase === 'demo') {
          if (i < this._demoNoteIdx) {
            fill = '#2a3a4a'; stroke = '#445566';  // already played
          } else if (i === this._demoNoteIdx && this._demoHighlight !== null) {
            fill = COL_DEMO;  stroke = '#88aaff';  // currently playing
          } else {
            fill = null; stroke = '#334455';       // upcoming
          }
        } else if (this._phase === 'echo') {
          if (i < this._echoIdx) {
            fill = COL_CORRECT; stroke = '#22cc44';  // echoed correctly
          } else {
            fill = null; stroke = '#445566';         // not yet
          }
        } else {
          // roundResult
          if (i < this._echoIdx) {
            fill = COL_CORRECT; stroke = '#22cc44';
          } else {
            fill = '#553333'; stroke = '#884444';
          }
        }

        ctx.beginPath();
        ctx.arc(dx, dotsY, dotR, 0, Math.PI * 2);
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fill();
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }

    // ── Sub-hint during echo ───────────────────────────────────────────────
    if (this._phase === 'echo') {
      const safeRoundIdx = Math.min(this._roundIdx, ROUND_CONFIGS.length - 1);
      const phrase       = this._phrases[safeRoundIdx];
      const hintFs       = Math.max(13, W * 0.030);
      ctx.font      = `${hintFs}px sans-serif`;
      ctx.fillStyle = COL_DIM;
      ctx.textAlign = 'center';
      ctx.fillText(`Note ${this._echoIdx + 1} of ${phrase.length}`, cx, mainH * 0.76);
    }

    // ── Interstitial: show upcoming phrase length ──────────────────────────
    if (this._phase === 'interstitial') {
      const safeRoundIdx = Math.min(this._roundIdx, ROUND_CONFIGS.length - 1);
      const len  = ROUND_CONFIGS[safeRoundIdx].length;
      const subFs = Math.max(13, W * 0.030);
      ctx.font      = `${subFs}px sans-serif`;
      ctx.fillStyle = COL_DIM;
      ctx.textAlign = 'center';
      ctx.fillText(`Get ready — ${len} notes`, cx, mainH * 0.50);
    }

    // ── Done: sub-score line ───────────────────────────────────────────────
    if (this._phase === 'done') {
      const total  = this._totalStars;
      const maxPts = ROUND_CONFIGS.length * 2;
      const subFs  = Math.max(13, W * 0.030);
      ctx.font      = `${subFs}px sans-serif`;
      ctx.fillStyle = COL_DIM;
      ctx.textAlign = 'center';
      ctx.fillText(`${total} / ${maxPts} stars  ·  ${ROUND_CONFIGS.length} rounds`, cx, mainH * 0.50);
    }
  }

  // ─── Piano ────────────────────────────────────────────────────────────────

  _renderPiano(ctx, W, H) {
    const now = performance.now();
    const { PIANO_X, PIANO_W, PIANO_H, wkW, bkW, bkH, pianoY } = this._pianoGeom(W, H);

    const flashNote  = this._keyFlash?.note;
    const flashColor = this._keyFlash?.color;
    const flashAge   = this._keyFlash ? now - this._keyFlash.time : Infinity;
    const flashAlive = flashAge < KEY_FLASH_MS;
    const flashAlpha = flashAlive ? Math.max(0, 1 - flashAge / KEY_FLASH_MS) : 0;

    const demoNote   = this._demoHighlight;

    // Which note should the player play next (subtle hint during echo)
    const echoPhrase  = this._phase === 'echo'
      ? this._phrases[Math.min(this._roundIdx, ROUND_CONFIGS.length - 1)]
      : null;
    const expectedNote = echoPhrase && this._echoIdx < echoPhrase.length
      ? echoPhrase[this._echoIdx]
      : null;

    // ── Piano panel background ─────────────────────────────────────────────
    ctx.fillStyle = 'rgba(8, 8, 18, 0.92)';
    ctx.fillRect(PIANO_X - 6, pianoY - 8, PIANO_W + 12, PIANO_H + 22);

    // ── White keys ────────────────────────────────────────────────────────
    for (const wk of WHITE_KEYS) {
      const kx     = PIANO_X + wk.idx * wkW;
      const isDemo = demoNote === wk.note;

      // Base fill
      ctx.fillStyle   = isDemo ? COL_DEMO : KEY_WHITE;
      ctx.strokeStyle = '#2a2010';
      ctx.lineWidth   = 1;
      ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
      ctx.strokeRect(kx, pianoY, wkW - 1, PIANO_H);

      // Flash overlay (correct/wrong)
      if (flashAlive && flashNote === wk.note) {
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle   = flashColor;
        ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
        ctx.restore();
      }

      // Subtle pulse on the next expected note
      if (expectedNote === wk.note) {
        const pulse = 0.14 + 0.08 * Math.sin(now / 280);
        ctx.fillStyle = `rgba(255, 220, 90, ${pulse})`;
        ctx.fillRect(kx, pianoY, wkW - 1, PIANO_H);
      }

      // Key label
      const keyFs = Math.max(11, Math.min(19, wkW * 0.42)) | 0;
      ctx.font         = `bold ${keyFs}px sans-serif`;
      ctx.fillStyle    = isDemo ? '#e8f4ff' : '#2a2020';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wk.key, kx + wkW / 2, pianoY + PIANO_H * 0.36);

      // Note name (smaller, below key label)
      ctx.font      = `${Math.max(8, keyFs - 4)}px sans-serif`;
      ctx.fillStyle = isDemo ? '#c0d8ff' : '#888878';
      ctx.fillText(wk.note, kx + wkW / 2, pianoY + PIANO_H * 0.70);
    }

    // ── Black keys ────────────────────────────────────────────────────────
    for (const bk of BLACK_KEYS) {
      const kx     = PIANO_X + (bk.afterIdx + 0.67) * wkW - bkW / 2;
      const isDemo = demoNote === bk.note;

      ctx.fillStyle   = isDemo ? COL_DEMO : KEY_BLACK;
      ctx.strokeStyle = '#0a0a0f';
      ctx.lineWidth   = 1;
      ctx.fillRect(kx, pianoY, bkW, bkH);
      ctx.strokeRect(kx, pianoY, bkW, bkH);

      if (flashAlive && flashNote === bk.note) {
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle   = flashColor;
        ctx.fillRect(kx, pianoY, bkW, bkH);
        ctx.restore();
      }

      if (expectedNote === bk.note) {
        const pulse = 0.18 + 0.10 * Math.sin(now / 280);
        ctx.fillStyle = `rgba(255, 220, 90, ${pulse})`;
        ctx.fillRect(kx, pianoY, bkW, bkH);
      }
    }
  }
}
