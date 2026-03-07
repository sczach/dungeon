/**
 * @file src/input/keyboard.js
 * QWERTY piano keyboard input layer.
 *
 * Maps standard musical-typing keys to notes, evaluates multi-note chords
 * within a time window, and writes spawn/attack actions into game state.
 *
 * KEY MAP (standard musical typing layout, one octave C3–C4)
 * ──────────────────────────────────────────────────────────
 *   White keys  │  A=C3  S=D3  D=E3  F=F3  G=G3  H=A3  J=B3  K=C4
 *   Black keys  │  W=C#3  E=D#3  T=F#3  Y=G#3  U=A#3
 *   Octave down │  Z  (clamps at −2)
 *   Octave up   │  X  (clamps at +2)
 *
 * GAME ACTIONS (evaluated on debounce after last keypress)
 * ────────────────────────────────────────────────────────
 *   1 note  → state.audio.spawnTier = 1  (tier 1, costs 20)
 *   2 notes → state.audio.spawnTier = 2  (tier 2, costs 50)
 *   3 notes → state.audio.spawnTier = 3  (tier 3, costs 100)
 *
 * DIRECT ATTACK (immediate, on each keypress)
 * ────────────────────────────────────────────
 *   If any enemy unit has reached the left 40 % of the screen,
 *   the keypress also deals 15 dmg to the nearest such enemy.
 *
 * STATE FIELDS WRITTEN
 * ────────────────────
 *   state.audio.detectedChord  — most-recently-pressed note name, e.g. "C3"
 *   state.audio.confidence     — 0.95
 *   state.audio.detectedNote   — null (note-level detection not used here)
 *   state.audio.lastNotes      — string[] snapshot of rolling buffer
 *   state.audio.pressedKeys    — Set<string> keys currently held (for HUD)
 *   state.audio.spawnTier      — 1|2|3|null, consumed once by game loop
 */

import { SCENE } from '../constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Key → note mapping (base octave 0 offset, i.e., default = C3–C4 register)
// ─────────────────────────────────────────────────────────────────────────────

/** Lowercase QWERTY key → base note name (before octave shift applied). */
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

// ─────────────────────────────────────────────────────────────────────────────
// Timing constants
// ─────────────────────────────────────────────────────────────────────────────

/** Notes pressed within this window (ms) count as a chord for tier evaluation. */
const CHORD_WINDOW = 350;

/** Wait this long after the last keypress before committing a spawn action. */
const SPAWN_DEBOUNCE = 200;

/** Enemy x-position threshold for direct-attack mode (fraction of canvas W). */
const COMBAT_RANGE_FRAC = 0.40;

/** Direct-attack damage per keypress. */
const DIRECT_ATTACK_DAMAGE = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shift a note name by the given number of octaves.
 * e.g. shiftOctave('C3', 1) → 'C4',  shiftOctave('A#3', -1) → 'A#2'
 * @param {string} note   — e.g. "C#3"
 * @param {number} offset — integer octave delta
 * @returns {string}
 */
function shiftOctave(note, offset) {
  if (offset === 0) return note;
  const m = note.match(/^([A-G]#?)(\d+)$/);
  if (!m) return note;
  return m[1] + (parseInt(m[2], 10) + offset);
}

// ─────────────────────────────────────────────────────────────────────────────
// KeyboardInput class
// ─────────────────────────────────────────────────────────────────────────────

export class KeyboardInput {
  constructor() {
    this._state      = null;
    this._handler    = null;
    this._upHandler  = null;
    /** @type {Array<{note:string, t:number}>} */
    this._noteBuffer = [];
    this._spawnTimer = null;
    this._octave     = 0;   // integer octave offset, clamped ±2
  }

  /**
   * Attach listeners and bind to game state.
   * Calling start() again re-binds to the new state (stop() is called first).
   * @param {object} state — canonical game state (will be mutated on input events)
   */
  start(state) {
    this.stop();
    this._state     = state;
    this._handler   = (e) => this._onKeyDown(e);
    this._upHandler = (e) => this._onKeyUp(e);
    document.addEventListener('keydown', this._handler);
    document.addEventListener('keyup',   this._upHandler);
  }

  /**
   * Remove listeners and clear any pending timers.
   * Safe to call even if start() was never called.
   */
  stop() {
    if (this._state && this._state.audio) {
      this._state.audio.pressedKeys.clear();
    }
    if (this._handler)   document.removeEventListener('keydown', this._handler);
    if (this._upHandler) document.removeEventListener('keyup',   this._upHandler);
    this._handler   = null;
    this._upHandler = null;
    if (this._spawnTimer !== null) {
      clearTimeout(this._spawnTimer);
      this._spawnTimer = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    if (!this._state || this._state.scene !== SCENE.PLAYING) return;
    if (e.repeat) return;   // ignore key-hold auto-repeat

    const key = e.key.toLowerCase();

    // Octave shift keys — adjust register, no game action
    if (key === OCTAVE_DOWN_KEY) {
      this._octave = Math.max(-2, this._octave - 1);
      return;
    }
    if (key === OCTAVE_UP_KEY) {
      this._octave = Math.min(2, this._octave + 1);
      return;
    }

    const baseNote = KEY_TO_NOTE[key];
    if (!baseNote) return;

    const note  = shiftOctave(baseNote, this._octave);
    const state = this._state;
    const now   = performance.now();

    // ── Track pressed keys for HUD highlight ─────────────────────────────
    state.audio.pressedKeys.add(key);

    // ── Update audio state ────────────────────────────────────────────────
    state.audio.detectedChord = note;
    state.audio.confidence    = 0.95;
    state.audio.detectedNote  = null;

    // ── Rolling note buffer ───────────────────────────────────────────────
    this._noteBuffer.push({ note, t: now });
    // Prune entries that are too old to count even for the longest window
    const hardCutoff = now - (CHORD_WINDOW + SPAWN_DEBOUNCE + 50);
    while (this._noteBuffer.length > 0 && this._noteBuffer[0].t < hardCutoff) {
      this._noteBuffer.shift();
    }
    // Expose snapshot
    const len = this._noteBuffer.length;
    const snap = state.audio.lastNotes;
    snap.length = len;
    for (let i = 0; i < len; i++) snap[i] = this._noteBuffer[i].note;

    // ── Direct attack — immediate, before spawn debounce ─────────────────
    const combatX = state.canvas ? state.canvas.width * COMBAT_RANGE_FRAC : 400;
    const units   = state.units;
    if (units) {
      let nearestEnemy = null;
      let nearestDist  = Infinity;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive || u.team !== 'enemy') continue;
        if (u.x < combatX && u.x < nearestDist) {
          nearestDist  = u.x;
          nearestEnemy = u;
        }
      }
      if (nearestEnemy !== null) {
        nearestEnemy.hp -= DIRECT_ATTACK_DAMAGE;
        if (nearestEnemy.hp <= 0) nearestEnemy.alive = false;
      }
    }

    // ── Spawn debounce — evaluate tier after last keypress settles ────────
    if (this._spawnTimer !== null) clearTimeout(this._spawnTimer);
    this._spawnTimer = setTimeout(() => {
      this._evaluateSpawn(state);
      this._spawnTimer = null;
    }, SPAWN_DEBOUNCE);
  }

  /** @param {KeyboardEvent} e */
  _onKeyUp(e) {
    if (!this._state) return;
    this._state.audio.pressedKeys.delete(e.key.toLowerCase());
  }

  /**
   * Count notes pressed within CHORD_WINDOW and set state.audio.spawnTier.
   * Called by the debounce timer after the last keypress.
   * @param {object} state
   */
  _evaluateSpawn(state) {
    const now    = performance.now();
    const cutoff = now - CHORD_WINDOW - SPAWN_DEBOUNCE;   // compensate for debounce delay

    let count = 0;
    for (let i = 0; i < this._noteBuffer.length; i++) {
      if (this._noteBuffer[i].t >= cutoff) count++;
    }

    // Reset buffer for next chord — allocates here but it's event-driven, not per-frame
    this._noteBuffer = [];
    state.audio.lastNotes = [];

    state.audio.spawnTier = count >= 3 ? 3 : count >= 2 ? 2 : 1;
  }
}

/** Singleton — import this and call start(state)/stop(). */
export const keyboardInput = new KeyboardInput();
