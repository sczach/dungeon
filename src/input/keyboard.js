/**
 * @file src/input/keyboard.js
 * QWERTY piano keyboard input layer.
 *
 * On each note keypress:
 *   1. Write note to state.audio (detectedChord / confidence / detectedNote)
 *   2. Call tablatureSystem.onNote(note, state) — summon logic
 *   3. Call attackSequenceSystem.onNote(note, state) — enemy targeting
 *   4. Add note to state.input.pressedKeys (auto-cleared after 150 ms) — HUD highlight
 *
 * KEY MAP (standard musical-typing layout, default octave C3–C4)
 * ────────────────────────────────────────────────────────────────
 *   White keys  │  A=C3  S=D3  D=E3  F=F3  G=G3  H=A3  J=B3  K=C4
 *   Black keys  │  W=C#3  E=D#3  T=F#3  Y=G#3  U=A#3
 *   Octave down │  Z  (clamps at −2)
 *   Octave up   │  X  (clamps at +2)
 */

import { SCENE } from '../constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Key → base note mapping (octave offset applied at runtime)
// ─────────────────────────────────────────────────────────────────────────────

const KEY_TO_NOTE = {
  a: 'C3',  w: 'C#3',
  s: 'D3',  e: 'D#3',
  d: 'E3',
  f: 'F3',  t: 'F#3',
  g: 'G3',  y: 'G#3',
  h: 'A3',  u: 'A#3',
  j: 'B3',
  k: 'C4',
};

const OCTAVE_DOWN_KEY = 'z';
const OCTAVE_UP_KEY   = 'x';

/** Auto-clear pressed key from state.input.pressedKeys after this many ms. */
const PRESS_CLEAR_MS = 150;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
   * @param {import('../systems/tablature.js').TablatureSystem}      tablatureSystem
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
   * Remove listener and clear pressed-key display state.
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

    // Octave shift — adjust register, no game action
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

    // ── 2. Tablature system — summon logic ────────────────────────────────
    if (this._tablature) this._tablature.onNote(note, state);

    // ── 3. Attack sequence system — enemy targeting ───────────────────────
    if (this._attackSeq) this._attackSeq.onNote(note, state);

    // ── 4. HUD key highlight (note string, auto-cleared after 150 ms) ─────
    if (state.input) {
      state.input.pressedKeys.add(note);
      // Event-driven allocation — not in the animation hot path
      setTimeout(() => state.input.pressedKeys.delete(note), PRESS_CLEAR_MS);
    }
  }
}

/** Singleton — import this and call start(state, tabSystem, atkSeqSystem). */
export const keyboardInput = new KeyboardInput();
