/**
 * @file src/audio/melodyEngine.js
 * Procedural melody generator and Web Audio playback for ChordWars.
 *
 * Generates an 8-bar melody (two 4-bar phrases: A and B) using beginner-friendly
 * keys and music theory rules. Used for the end-of-level victory screen playback.
 *
 * Music theory rules enforced:
 *   • Key: C major, G major, or D major (beginner-friendly, no heavy accidentals)
 *   • Length: 8 bars in 4/4 time — 16 beats per phrase, 32 beats total
 *   • Contour: arch (rise then fall) or wave (rise-fall-rise-fall), chosen randomly
 *   • Never stay on the same pitch for more than 2 consecutive notes
 *   • 70 % stepwise intervals (adjacent scale degrees)
 *   • 30 % leaps (2–4 scale degrees; a 4-degree leap = max a perfect 5th)
 *   • Level 1: only quarter notes (1 beat) and half notes (2 beats)
 *     Level 2+: also eighth notes (0.5 beats)
 *   • Each 4-bar phrase ends on a chord tone (tonic, 3rd, or 5th)
 *   • Phrase B reuses the rhythm of Phrase A but generates different pitches
 *     with an inverted contour shape (arch ↔ wave), giving motific variety
 *
 * @typedef {{ note: string, duration: number, beat: number }} MelodyNote
 *   note     — note name, e.g. 'C4' or 'F#4'
 *   duration — duration in beats (0.5 = eighth, 1 = quarter, 2 = half)
 *   beat     — start beat position within the full melody (0-indexed)
 *
 * @typedef {{ notes: MelodyNote[], keyName: string, bpm: number }} MelodyResult
 */

// ─── Key definitions ──────────────────────────────────────────────────────────

/**
 * Each key has:
 *   scale      — ordered note names ascending, spanning ~2 octaves
 *   chordTones — notes of the I chord (tonic, 3rd, 5th in all octaves present)
 *   name       — human-readable key name
 */
const KEY_DEFS = Object.freeze({
  C: Object.freeze({
    name:       'C major',
    scale:      Object.freeze(['C3','D3','E3','F3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5']),
    chordTones: Object.freeze(new Set(['C3','E3','G3','C4','E4','G4','C5'])),
  }),
  G: Object.freeze({
    name:       'G major',
    scale:      Object.freeze(['G3','A3','B3','C4','D4','E4','F#4','G4','A4','B4','C5','D5']),
    chordTones: Object.freeze(new Set(['G3','B3','D4','G4','B4','D5'])),
  }),
  D: Object.freeze({
    name:       'D major',
    scale:      Object.freeze(['D3','E3','F#3','G3','A3','B3','C#4','D4','E4','F#4','G4','A4','B4','C#5','D5']),
    chordTones: Object.freeze(new Set(['D3','F#3','A3','D4','F#4','A4','D5'])),
  }),
});

const KEY_NAMES = Object.freeze(Object.keys(KEY_DEFS));

// ─── Frequency table ──────────────────────────────────────────────────────────

/** Frequency (Hz) for every note that appears in any key definition. */
const NOTE_FREQ = Object.freeze({
  'C3':  130.81, 'D3':  146.83, 'E3':  164.81, 'F3':  174.61,
  'F#3': 185.00, 'G3':  196.00, 'A3':  220.00, 'B3':  246.94,
  'C#4': 277.18, 'C4':  261.63, 'D4':  293.66, 'E4':  329.63,
  'F4':  349.23, 'F#4': 369.99, 'G4':  392.00, 'A4':  440.00,
  'B4':  493.88, 'C#5': 554.37, 'C5':  523.25, 'D5':  587.33,
  'E5':  659.25,
});

// ─── Rhythm builder ───────────────────────────────────────────────────────────

/**
 * Build a random rhythm filling exactly `beatsPerPhrase` beats.
 * Eighth notes are only included when `allowEighths` is true (Level 2+).
 *
 * The last duration is always ≥ 1 beat so phrases end with a clear pulse.
 *
 * @param {boolean} allowEighths
 * @param {number}  [beatsPerPhrase=16]  — 4 bars × 4 beats
 * @returns {number[]}
 */
function buildRhythm(allowEighths, beatsPerPhrase = 16) {
  const durations = [];
  let remaining   = beatsPerPhrase;

  while (remaining > 0.001) {
    // Reserve room for a final quarter note
    const reserve = remaining <= 1 ? 0 : 1;

    const r = Math.random();
    let dur;

    if (remaining - reserve >= 2 && r < 0.25) {
      dur = 2;                      // half note  (25 %)
    } else if (allowEighths && remaining - reserve >= 0.5 && r < 0.55) {
      dur = 0.5;                    // eighth note (30 % when eighths allowed)
    } else {
      dur = 1;                      // quarter note (default)
    }

    // Clamp so we never overshoot
    if (dur > remaining) dur = remaining;

    durations.push(dur);
    remaining = Math.round((remaining - dur) * 100) / 100;
  }

  // Ensure phrase ends with quarter or longer (musical closure)
  const last = durations[durations.length - 1];
  if (last < 1 && durations.length >= 2) {
    // Absorb the final eighth into the previous note
    durations[durations.length - 2] += last;
    durations.pop();
  }

  return durations;
}

// ─── Contour builder ──────────────────────────────────────────────────────────

/**
 * Generate a per-note direction bias array for one phrase.
 * +1 = prefer going up, −1 = prefer going down.
 *
 * @param {'arch'|'wave'} shape
 * @param {number}        noteCount — how many notes in the phrase
 * @returns {number[]}
 */
function buildContour(shape, noteCount) {
  const bias = new Array(noteCount);
  for (let i = 0; i < noteCount; i++) {
    const t = i / (noteCount - 1 || 1);   // 0 → 1 across phrase
    if (shape === 'arch') {
      bias[i] = t < 0.5 ? 1 : -1;
    } else {
      // wave: two rise-fall cycles
      bias[i] = Math.sin(t * Math.PI * 2) >= 0 ? 1 : -1;
    }
  }
  return bias;
}

// ─── Pitch builder ────────────────────────────────────────────────────────────

/**
 * Find the scale index of the chord tone nearest to `curIdx`.
 * Searches outward from curIdx so the phrase ending is as smooth as possible.
 *
 * @param {string[]} scale
 * @param {Set<string>} chordTones
 * @param {number} curIdx
 * @returns {number}
 */
function nearestChordToneIdx(scale, chordTones, curIdx) {
  for (let offset = 0; offset < scale.length; offset++) {
    const up   = curIdx + offset;
    const down = curIdx - offset;
    if (up   < scale.length && chordTones.has(scale[up]))   return up;
    if (down >= 0            && chordTones.has(scale[down])) return down;
  }
  return curIdx;   // fallback (shouldn't happen if chordTones ⊂ scale)
}

/**
 * Build the pitch sequence for one phrase.
 *
 * @param {string[]}   scale       — ordered note names in this key
 * @param {Set<string>} chordTones — valid phrase-ending notes
 * @param {number[]}   rhythm      — beat durations for this phrase
 * @param {number[]}   contour     — bias array (+1 up / −1 down)
 * @param {number}     startIdx    — starting scale index
 * @returns {string[]}             — note names, parallel to rhythm
 */
function buildPitches(scale, chordTones, rhythm, contour, startIdx) {
  const maxIdx  = scale.length - 1;
  const notes   = [];
  let   cur     = Math.max(0, Math.min(maxIdx, startIdx));
  let   prev1   = '';   // note two positions back (for consecutive-same check)
  let   prev2   = '';

  for (let i = 0; i < rhythm.length; i++) {
    const isLast = (i === rhythm.length - 1);

    let chosen;

    if (isLast) {
      // Phrase must end on a chord tone
      cur    = nearestChordToneIdx(scale, chordTones, cur);
      chosen = scale[cur];
    } else {
      const bias    = contour[i] ?? 0;
      const useStep = Math.random() < 0.70;

      let delta;
      if (useStep) {
        delta = bias !== 0 ? bias : (Math.random() < 0.5 ? 1 : -1);
      } else {
        const leapSize = 2 + Math.floor(Math.random() * 3);   // 2, 3, or 4
        const dir      = bias !== 0 ? bias : (Math.random() < 0.5 ? 1 : -1);
        delta = dir * leapSize;
      }

      let nextIdx = Math.max(0, Math.min(maxIdx, cur + delta));

      // Prevent 3+ identical consecutive pitches
      if (scale[nextIdx] === prev1 && scale[nextIdx] === prev2) {
        // Force a different direction
        const altDir = bias <= 0 ? 1 : -1;
        nextIdx = Math.max(0, Math.min(maxIdx, cur + altDir));
        // If still the same (boundary), go the other way
        if (scale[nextIdx] === prev1) {
          nextIdx = Math.max(0, Math.min(maxIdx, cur - altDir));
        }
      }

      cur    = nextIdx;
      chosen = scale[cur];
    }

    prev2 = prev1;
    prev1 = chosen;
    notes.push(chosen);
  }

  return notes;
}

// ─── Public: melody generation ────────────────────────────────────────────────

/**
 * Generate an 8-bar melody and return it as a flat array of MelodyNote objects.
 *
 * @param {object}  [options]
 * @param {number}  [options.levelNumber=1]   — 1 = quarter/half only; 2+ adds eighths
 * @param {string}  [options.key]             — 'C'|'G'|'D'; random if omitted/invalid
 * @param {number}  [options.bpm=100]         — beats per minute (for playMelody)
 * @returns {MelodyResult}
 */
export function generateMelody({ levelNumber = 1, key, bpm = 100 } = {}) {
  // Resolve key
  const keyId  = (key && KEY_DEFS[key]) ? key
    : KEY_NAMES[Math.floor(Math.random() * KEY_NAMES.length)];
  const keyDef = KEY_DEFS[keyId];

  const allowEighths  = levelNumber >= 2;
  const contourShapeA = Math.random() < 0.5 ? 'arch' : 'wave';
  const contourShapeB = contourShapeA === 'arch' ? 'wave' : 'arch';

  // Phrase A
  const rhythmA  = buildRhythm(allowEighths);
  const biasA    = buildContour(contourShapeA, rhythmA.length);
  // Start in the lower-middle of the scale with slight random offset
  const midIdx   = Math.floor(keyDef.scale.length * 0.35);
  const startA   = Math.max(0, Math.min(keyDef.scale.length - 1, midIdx + Math.floor(Math.random() * 3)));
  const pitchesA = buildPitches(keyDef.scale, keyDef.chordTones, rhythmA, biasA, startA);

  // Phrase B — same rhythm, different pitches, inverted contour
  const biasB    = buildContour(contourShapeB, rhythmA.length);
  const startB   = Math.max(0, Math.min(keyDef.scale.length - 1,
    startA + Math.floor(Math.random() * 5) - 2));
  const pitchesB = buildPitches(keyDef.scale, keyDef.chordTones, rhythmA, biasB, startB);

  // Assemble into MelodyNote[] with absolute beat positions
  /** @type {MelodyNote[]} */
  const notes = [];
  let beat = 0;

  for (let i = 0; i < rhythmA.length; i++) {
    notes.push({ note: pitchesA[i], duration: rhythmA[i], beat });
    beat = Math.round((beat + rhythmA[i]) * 100) / 100;
  }
  for (let i = 0; i < rhythmA.length; i++) {
    notes.push({ note: pitchesB[i], duration: rhythmA[i], beat });
    beat = Math.round((beat + rhythmA[i]) * 100) / 100;
  }

  return { notes, keyName: keyDef.name, bpm };
}

// ─── Public: playback ─────────────────────────────────────────────────────────

/** Lazily-created AudioContext shared across all melody playback calls. */
let _ctx = null;

/** Refs to active oscillator nodes — cancelled by stopMelody(). */
let _activeNodes = [];

/**
 * Convert a note name (e.g. 'C4', 'F#4') to frequency in Hz.
 * Falls back to middle C (261.63 Hz) for unknown notes.
 *
 * @param {string} note
 * @returns {number}
 */
function noteToHz(note) {
  return NOTE_FREQ[note] ?? 261.63;
}

/**
 * Play a generated melody through the Web Audio API.
 *
 * Each note is synthesised with a triangle oscillator and a piano-like
 * ADSR envelope (fast attack, exponential decay, gentle release).
 * Calling play() while a melody is active automatically stops the previous.
 *
 * @param {MelodyResult} melody
 * @param {number}       [gain=0.35]  — master output gain (0–1)
 * @returns {Promise<void>}           — resolves when the last note finishes
 */
export function playMelody(melody, gain = 0.35) {
  stopMelody();

  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
  } catch (_) {
    return Promise.resolve();   // Web Audio not supported
  }

  const ctx         = _ctx;
  const secPerBeat  = 60 / Math.max(1, melody.bpm);
  const now         = ctx.currentTime + 0.05;   // tiny scheduling buffer

  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);

  let lastEnd = now;

  for (const n of melody.notes) {
    const freq  = noteToHz(n.note);
    const tOn   = now + n.beat * secPerBeat;
    const tOff  = tOn + n.duration * secPerBeat * 0.80;   // 20 % articulation gap

    const osc  = ctx.createOscillator();
    const env  = ctx.createGain();

    osc.type            = 'triangle';
    osc.frequency.value = freq;

    // Piano-ish envelope: 20 ms attack → exponential decay to sustain → short release
    const tAtk = tOn  + 0.020;
    const tDec = tOn  + Math.min(n.duration * secPerBeat * 0.30, 0.15);

    env.gain.setValueAtTime(0,    tOn);
    env.gain.linearRampToValueAtTime(0.85, tAtk);
    env.gain.exponentialRampToValueAtTime(0.30, tDec);
    env.gain.setValueAtTime(0.30, tOff - 0.025);
    env.gain.linearRampToValueAtTime(0,    tOff);

    osc.connect(env);
    env.connect(master);

    osc.start(tOn);
    osc.stop(tOff + 0.05);

    _activeNodes.push(osc);
    if (tOff > lastEnd) lastEnd = tOff;
  }

  const delayMs = Math.max(0, (lastEnd - ctx.currentTime + 0.25) * 1000);

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      _activeNodes = _activeNodes.filter(n => {
        try { n.stop(); } catch (_) {}
        return false;
      });
      resolve();
    }, delayMs);

    // Store timer ref so stopMelody() can cancel it
    _pendingTimer = timer;
  });
}

/** Handle for the pending playback-complete timer. */
let _pendingTimer = null;

/**
 * Immediately stop any currently playing melody.
 * Safe to call even when nothing is playing.
 */
export function stopMelody() {
  if (_pendingTimer !== null) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
  for (const node of _activeNodes) {
    try { node.stop(); } catch (_) {}
  }
  _activeNodes = [];
}

/**
 * Expose the frequency table for external use (e.g. piano-roll visualiser).
 * @type {Readonly<Object.<string, number>>}
 */
export { NOTE_FREQ };
