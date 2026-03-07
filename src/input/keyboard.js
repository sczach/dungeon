/**
 * @file src/input/keyboard.js
 * Keyboard simulation layer for playtesting without a guitar/mic.
 *
 * Number keys 1–6 inject chord detections directly into state.audio,
 * exactly as if the audio engine had matched them at high confidence.
 * Detections auto-clear after STRUM_DURATION ms (simulates strum decay),
 * unless a new key is pressed first.
 *
 * Key map
 * ───────
 *   1 → G     4 → Em
 *   2 → C     5 → Am
 *   3 → D     6 → E
 *
 * Only active during PLAYING scene.
 * Import the singleton `keyboardInput` and call start(state)/stop().
 */

import { SCENE } from '../constants.js';

const KEY_TO_CHORD = {
  '1': 'G', '2': 'C', '3': 'D',
  '4': 'Em', '5': 'Am', '6': 'E',
};

const STRUM_DURATION = 300; // ms — how long the detection stays "hot"

export class KeyboardInput {
  constructor() {
    this._state      = null;
    this._handler    = null;
    this._clearTimer = null;
  }

  /**
   * Attach the keydown listener and bind to game state.
   * Must be called after the state object is fully initialised.
   * Calling start() again while already running re-binds to the new state.
   * @param {object} state — canonical game state (will be mutated on keypresses)
   */
  start(state) {
    this.stop();             // remove any previous listener first
    this._state   = state;
    this._handler = (e) => this._onKey(e);
    document.addEventListener('keydown', this._handler);
  }

  /**
   * Remove the keydown listener and cancel any pending clear timer.
   * Safe to call even if start() has not been called.
   */
  stop() {
    if (this._handler) {
      document.removeEventListener('keydown', this._handler);
      this._handler = null;
    }
    if (this._clearTimer !== null) {
      clearTimeout(this._clearTimer);
      this._clearTimer = null;
    }
  }

  /** @private */
  _onKey(e) {
    if (!this._state || this._state.scene !== SCENE.PLAYING) return;

    const chord = KEY_TO_CHORD[e.key];
    if (!chord) return;

    const state = this._state;
    state.audio.detectedChord = chord;
    state.audio.confidence    = 0.95;
    state.audio.detectedNote  = null;

    // Cancel the previous auto-clear so back-to-back keypresses don't
    // interfere with each other's timers.
    if (this._clearTimer !== null) {
      clearTimeout(this._clearTimer);
    }

    this._clearTimer = setTimeout(() => {
      // Only clear if nothing else has already overwritten the chord.
      if (state.audio.detectedChord === chord) {
        state.audio.detectedChord = null;
        state.audio.confidence    = 0;
      }
      this._clearTimer = null;
    }, STRUM_DURATION);
  }
}

/** Singleton — import this and call start/stop rather than instantiating. */
export const keyboardInput = new KeyboardInput();
