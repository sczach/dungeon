/**
 * @file src/input/keyboard.js
 * Right-hand piano keyboard input — locked to C3 octave.
 * Space bar toggles attack / summon mode.
 *
 * Normal tone : sine, gain=0.3, 0.5 s.
 * Kill melody : sine, gain=0.6, 0.5 s + DelayNode reverb (0.2 s, feedback=0.4).
 *   No ConvolverNode. No external files.
 *
 * iOS gotchas
 * ───────────
 *   ctx.resume() called on every gesture.
 *   Fallback AudioContext created lazily in practice mode (one per page).
 *   Never call oscillator.stop() without ctx.currentTime + offset.
 */
import { SCENE }           from '../constants.js';
import { getAudioContext } from '../audio/capture.js';

// ─── Key map ────────────────────────────────────────────────────────────────
const KEY_TO_NOTE = {
  // White keys
  'h': 'C3', 'j': 'D3', 'k': 'E3', 'l': 'F3',
  ';': 'G3', "'": 'A3', 'enter': 'B3',
  // Black keys
  'u': 'C#3', 'i': 'D#3', 'o': 'F#3', 'p': 'G#3', '[': 'A#3',
};

// ─── Tone constants ──────────────────────────────────────────────────────────
const PRESS_CLEAR_MS = 150;
const TONE_DURATION  = 0.5;    // seconds
const TONE_GAIN      = 0.3;
const KILL_GAIN      = 0.6;
const REVERB_DELAY   = 0.2;    // DelayNode delayTime
const REVERB_FDBK    = 0.4;    // feedback gain
const MELODY_STEP    = 0.15;   // seconds between kill-melody notes

// ─── A440 equal-temperament base frequencies (C3 octave) ────────────────────
const BASE_FREQ = {
  'C': 130.81, 'C#': 138.59, 'D': 146.83, 'D#': 155.56, 'E': 164.81,
  'F': 174.61, 'F#': 185.00, 'G': 196.00, 'G#': 207.65,
  'A': 220.00, 'A#': 233.08, 'B': 246.94,
};

/**
 * Hz for any note string "C3", "A#4", etc.
 * @param {string} note
 * @returns {number|null}
 */
function getNoteFreq(note) {
  const m = note.match(/^([A-G]#?)(\d+)$/);
  if (!m) return null;
  const base = BASE_FREQ[m[1]];
  return base != null ? base * Math.pow(2, parseInt(m[2], 10) - 3) : null;
}

let _fallbackCtx = null;
/** Get (or create) the AudioContext. Always resumes it — required on iOS. */
function getCtx() {
  let ctx = getAudioContext();
  if (!ctx) {
    if (!_fallbackCtx) {
      const A = window.AudioContext ?? window.webkitAudioContext;
      if (!A) return null;
      _fallbackCtx = new A();
    }
    ctx = _fallbackCtx;
  }
  ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Play a short normal tone.
 * @param {string} note
 */
function playTone(note) {
  const freq = getNoteFreq(note);
  if (!freq) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type            = 'sine';
  osc.frequency.value = freq;
  gain.gain.value     = TONE_GAIN;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + TONE_DURATION);
  console.log(`[tone] ${note} ${freq.toFixed(1)} Hz`);
}

/**
 * Play a sequence of notes as a kill-success melody with simple delay reverb.
 * Uses DelayNode → feedback GainNode loop (no ConvolverNode, no external files).
 * Notes are staggered by MELODY_STEP seconds.
 *
 * @param {string[]} notes — note names to replay in order
 */
export function playSuccessKill(notes) {
  if (!notes || notes.length === 0) return;
  const ctx = getCtx();
  if (!ctx) return;
  // Build shared reverb: delay → feedbackGain ↩ delay → destination
  const delay    = ctx.createDelay(1.0);
  const feedback = ctx.createGain();
  delay.delayTime.value = REVERB_DELAY;
  feedback.gain.value   = REVERB_FDBK;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.02;
  console.log(`[kill melody] staggering ${notes.length} notes @ ${MELODY_STEP}s apart: ${notes.join(' ')}`);
  notes.forEach((note, i) => {
    const freq = getNoteFreq(note);
    if (!freq) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = 'sine';
    osc.frequency.value = freq;
    gain.gain.value     = KILL_GAIN;
    osc.connect(gain);
    gain.connect(delay);           // wet (reverb)
    gain.connect(ctx.destination); // dry
    const t = t0 + i * MELODY_STEP;
    osc.start(t);
    osc.stop(t + TONE_DURATION);
    console.log(`[kill melody] note ${note} start at ${t.toFixed(3)}s`);
  });
  // Disconnect reverb tail after all notes + tail decay
  const cleanupMs = (notes.length * MELODY_STEP + TONE_DURATION + 1.5) * 1000;
  setTimeout(() => {
    try { delay.disconnect(); feedback.disconnect(); } catch (_) {}
  }, cleanupMs);
}

// ─── KeyboardInput ───────────────────────────────────────────────────────────
export class KeyboardInput {
  constructor() {
    this._state     = null;
    this._handler   = null;
    this._tablature = null;
    this._attackSeq = null;
  }

  /**
   * Attach keydown listener and bind subsystems.
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

  /** Remove listener and clear HUD highlights. */
  stop() {
    if (this._state?.input) this._state.input.pressedKeys.clear();
    if (this._handler) {
      document.removeEventListener('keydown', this._handler);
      this._handler = null;
    }
  }

  /**
   * Programmatic note dispatch — called by touch / click input.
   * Silently ignored if not in PLAYING scene.
   * @param {string} note
   */
  dispatchNote(note) {
    const state = this._state;
    if (!state || state.scene !== SCENE.PLAYING) return;
    console.log('[mouse/click] dispatched note: ' + note);
    this._handleNote(note, state);
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    const state = this._state;
    if (!state || state.scene !== SCENE.PLAYING) return;
    if (e.repeat) return;
    // Space bar → toggle attack / summon mode
    if (e.key === ' ') {
      e.preventDefault();
      const next         = state.inputMode === 'summon' ? 'attack' : 'summon';
      state.inputMode    = next;
      state.modeAnnounce = performance.now();
      // Refresh summon prompt on entry so player gets a fresh sequence
      if (next === 'summon' && this._tablature) {
        this._tablature.refresh(state);
      }
      console.log(`[mode] → ${next}`);
      return;
    }
    const note = KEY_TO_NOTE[e.key.toLowerCase()];
    if (!note) return;
    this._handleNote(note, state);
  }

  /**
   * Shared note-press logic for keyboard and touch paths.
   * Routes to tablature (summon) or attack-sequence system based on mode.
   * @param {string} note
   * @param {object} state
   */
  _handleNote(note, state) {
    // 1. Audio state
    state.audio.detectedChord = note;
    state.audio.confidence    = 0.95;
    state.audio.detectedNote  = null;
    // 2. Tone
    try { playTone(note); } catch (_) {}
    // 3. Route by mode
    if (state.inputMode === 'summon') {
      if (this._tablature) this._tablature.onNote(note, state);
    } else {
      if (this._attackSeq) this._attackSeq.onNote(note, state);
    }
    // 4. HUD highlight
    if (state.input) {
      state.input.pressedKeys.add(note);
      setTimeout(() => state.input.pressedKeys.delete(note), PRESS_CLEAR_MS);
    }
  }
}

/** Singleton — import and call start(state, tabSystem, atkSeqSystem). */
export const keyboardInput = new KeyboardInput();
