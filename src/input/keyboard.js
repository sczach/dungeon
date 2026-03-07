/**
 * @file src/input/keyboard.js
 * Right-hand one-handed piano keyboard input layer.
 *
 * On each note keypress:
 *   1. Write note to state.audio (detectedChord / confidence / detectedNote)
 *   2. Play a short sine-wave tone through the AudioContext
 *   3. Call tablatureSystem.onNote(note, state) — summon logic
 *   4. Call attackSequenceSystem.onNote(note, state) — enemy targeting
 *   5. Add note to state.input.pressedKeys (auto-cleared after 150 ms) — HUD highlight
 *
 * KEY MAP (right-hand layout, default octave C3–B3)
 * ──────────────────────────────────────────────────
 *   White keys  │  H=C3  J=D3  K=E3  L=F3  ;=G3  '=A3  Enter=B3
 *   Black keys  │  U=C#3  I=D#3  O=F#3  P=G#3  [=A#3
 *   Octave down │  ,  (minimum C2 / offset −2)
 *   Octave up   │  .  (maximum B4 / offset +2)
 *
 * iOS / MOBILE GOTCHAS
 * ────────────────────
 *   • AudioContext must be resumed inside a user-gesture handler — this module
 *     calls ctx.resume() on every keydown so it works even after suspension.
 *   • We reuse the existing context from capture.js when available; only fall
 *     back to a fresh context if the mic was never started (practice mode).
 *   • The fallback context is stored in _fallbackCtx so at most one extra
 *     context is ever created.
 *   • Do NOT call oscillator.stop() without a future timestamp — use
 *     ctx.currentTime + duration to avoid iOS silence bugs.
 */

import { SCENE }            from '../constants.js';
import { getAudioContext }  from '../audio/capture.js';

// ─────────────────────────────────────────────────────────────────────────────
// Key → base note mapping  (values are e.key.toLowerCase() strings)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Right-hand piano layout.
 * Keys map to their base-octave note names; octave offset is applied at runtime.
 */
const KEY_TO_NOTE = {
  // White keys
  'h':     'C3',
  'j':     'D3',
  'k':     'E3',
  'l':     'F3',
  ';':     'G3',
  "'":     'A3',
  'enter': 'B3',
  // Black keys
  'u':     'C#3',
  'i':     'D#3',
  'o':     'F#3',
  'p':     'G#3',
  '[':     'A#3',
};

const OCTAVE_DOWN_KEY = ',';
const OCTAVE_UP_KEY   = '.';

/** Auto-clear pressed key from state.input.pressedKeys after this many ms. */
const PRESS_CLEAR_MS = 150;

// ─────────────────────────────────────────────────────────────────────────────
// Tone synthesis — A440 equal temperament
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base frequencies (Hz) for each pitch class in octave 3.
 * For any other octave n: freq = BASE_FREQ[pitchClass] × 2^(n − 3).
 * @type {Record<string,number>}
 */
const BASE_FREQ = {
  'C':  130.81, 'C#': 138.59,
  'D':  146.83, 'D#': 155.56,
  'E':  164.81,
  'F':  174.61, 'F#': 185.00,
  'G':  196.00, 'G#': 207.65,
  'A':  220.00, 'A#': 233.08,
  'B':  246.94,
};

/** Tone duration in seconds. Short enough to not blur sequences. */
const TONE_DURATION = 0.4;
/** Output amplitude (0–1). Kept moderate to avoid clipping when fast-pressing. */
const TONE_GAIN     = 0.3;

/**
 * Compute the frequency in Hz for any note string like "C3", "A#4", "D2".
 * Returns null if the note is malformed.
 * @param {string} note
 * @returns {number|null}
 */
function getNoteFreq(note) {
  const m = note.match(/^([A-G]#?)(\d+)$/);
  if (!m) return null;
  const base = BASE_FREQ[m[1]];
  if (base == null) return null;
  return base * Math.pow(2, parseInt(m[2], 10) - 3);
}

/** One shared fallback AudioContext for practice mode (mic never started). */
let _fallbackCtx = null;

/**
 * Play a short sine-wave tone at the frequency of `note`.
 * Reuses the existing capture AudioContext when available.
 *
 * iOS note: ctx.resume() is called unconditionally — it is a no-op when the
 * context is already 'running' and fixes silent playback after screen lock.
 *
 * @param {string} note — e.g. "C#4"
 */
function playTone(note) {
  const freq = getNoteFreq(note);
  if (freq == null) return;

  // Prefer the shared mic context; fall back to a minimal one-shot context.
  let ctx = getAudioContext();
  if (!ctx) {
    if (!_fallbackCtx) {
      const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioCtx) return;
      _fallbackCtx = new AudioCtx();
    }
    ctx = _fallbackCtx;
  }

  // Unconditional resume — critical for iOS Safari after suspension.
  ctx.resume().catch(() => {});

  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type           = 'sine';
  osc.frequency.value = freq;
  gain.gain.value    = TONE_GAIN;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + TONE_DURATION);
  // OscillatorNode is automatically garbage-collected after stop() fires.
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shift the octave number embedded in a note string.
 * e.g. shiftOctave('C3', 1) → 'C4'
 * @param {string} note
 * @param {number} offset — integer semitones of octave (−2 to +2)
 * @returns {string}
 */
function shiftOctave(note, offset) {
  if (offset === 0) return note;
  const m = note.match(/^([A-G]#?)(\d+)$/);
  if (!m) return note;
  return m[1] + (parseInt(m[2], 10) + offset);
}

// ─────────────────────────────────────────────────────────────────────────────
// KeyboardInput
// ─────────────────────────────────────────────────────────────────────────────

export class KeyboardInput {
  constructor() {
    this._state    = null;
    this._handler  = null;
    this._tablature  = null;
    this._attackSeq  = null;
    this._octave   = 0;
  }

  /**
   * Attach the keydown listener and bind subsystems.
   * @param {object} state
   * @param {import('../systems/tablature.js').TablatureSystem}           tablatureSystem
   * @param {import('../systems/attackSequence.js').AttackSequenceSystem} attackSeqSystem
   */
  start(state, tablatureSystem, attackSeqSystem) {
    this.stop();
    this._state     = state;
    this._tablature = tablatureSystem;
    this._attackSeq = attackSeqSystem;
    this._handler   = (e) => this._onKeyDown(e);
    document.addEventListener('keydown', this._handler);
  }

  /**
   * Remove the keydown listener and clear pressed-key display state.
   * Safe to call even if start() was never called.
   */
  stop() {
    if (this._state && this._state.input) {
      this._state.input.pressedKeys.clear();
    }
    if (this._handler) {
      document.removeEventListener('keydown', this._handler);
      this._handler = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    if (!this._state || this._state.scene !== SCENE.PLAYING) return;
    if (e.repeat) return;

    const key = e.key.toLowerCase();

    // ── Octave shift — adjust register, no game action ───────────────────
    if (key === OCTAVE_DOWN_KEY) {
      this._octave = Math.max(-2, this._octave - 1);
      if (this._state.input) this._state.input.octave = this._octave;
      return;
    }
    if (key === OCTAVE_UP_KEY) {
      this._octave = Math.min(2, this._octave + 1);
      if (this._state.input) this._state.input.octave = this._octave;
      return;
    }

    const baseNote = KEY_TO_NOTE[key];
    if (!baseNote) return;

    const note  = shiftOctave(baseNote, this._octave);
    const state = this._state;

    // ── 1. Update audio state ─────────────────────────────────────────────
    state.audio.detectedChord = note;
    state.audio.confidence    = 0.95;
    state.audio.detectedNote  = null;

    // ── 2. Tone feedback — short sine burst ───────────────────────────────
    //    Non-blocking; errors are swallowed so a failed context never crashes.
    try { playTone(note); } catch (_) { /* swallow — never crash on audio */ }

    // ── 3. Tablature system — summon logic ────────────────────────────────
    if (this._tablature) this._tablature.onNote(note, state);

    // ── 4. Attack sequence system — enemy targeting ───────────────────────
    if (this._attackSeq) this._attackSeq.onNote(note, state);

    // ── 5. HUD key highlight (note string, auto-cleared after 150 ms) ─────
    if (state.input) {
      state.input.pressedKeys.add(note);
      // Event-driven allocation — not in the animation hot path.
      setTimeout(() => state.input.pressedKeys.delete(note), PRESS_CLEAR_MS);
    }
  }
}

/** Singleton — import this and call start(state, tabSystem, atkSeqSystem). */
export const keyboardInput = new KeyboardInput();
