/**
 * Chord Wars — Pitch Detection (Phase 1A)
 *
 * Implements the YIN algorithm for fundamental-frequency (F0) estimation:
 *
 *   de Cheveigné & Kawahara (2002) "YIN, a fundamental frequency estimator
 *   for speech and music." JASA 111(4):1917–1930.
 *
 * Pipeline
 * ────────
 * 1. Difference function              d(τ)
 * 2. Cumulative mean normalised diff  d′(τ)   ← kills τ=0 bias
 * 3. Absolute threshold search        τ*       ← first τ where d′(τ) < T
 * 4. Parabolic interpolation          τ̂        ← sub-sample refinement
 * 5. F0 = sampleRate / τ̂
 *
 * Exported helpers
 * ────────────────
 *  detectPitch(buffer, sampleRate)  → { frequency, confidence } | null
 *  frequencyToNote(frequency)       → { note, octave, midi, cents }
 *  frequencyToMidi(frequency)       → number  (continuous MIDI pitch)
 *
 * Confidence is 1 − d′(τ*), so 1.0 = perfectly periodic, 0.0 = aperiodic.
 * A result is returned only when confidence ≥ CONFIDENCE_THRESHOLD.
 */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Minimum YIN confidence to accept a pitch reading.
 *
 * The YIN paper recommends a threshold of 0.10–0.15.  We use 0.15 to give
 * a small safety margin that prevents chord-strum transients from triggering
 * a spurious single-note detection.
 *
 * Exported so callers can tighten/relax at runtime.
 */
export const CONFIDENCE_THRESHOLD = 0.15;

/**
 * Frequency search bounds — covers the practical guitar range plus some
 * headroom for harmonics and capo positions.
 *
 *  E2 (open low-E)  ≈  82 Hz
 *  E4 (open hi-E)   ≈ 330 Hz
 *  Up to ~5th fret  ≈ 440 Hz (A4)
 *
 * We extend down to 60 Hz to catch dropped-D tunings and up to 1 050 Hz to
 * allow the high-E string fretted above the 12th fret.
 */
const MIN_FREQ = 60;    // Hz
const MAX_FREQ = 1050;  // Hz

/** Chromatic note names in ascending pitch-class order (C=0 … B=11). */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ── YIN internals ─────────────────────────────────────────────────────────────

/**
 * Steps 1 + 2: compute the cumulative mean normalised difference function
 * into `yinBuf` (mutates in place).
 *
 * YIN equation (2):  d(τ) = Σ_{j=1}^{W} (x_j − x_{j+τ})²
 * YIN equation (8):  d′(τ) = 1                        if τ = 0
 *                           d(τ) / [(1/τ) Σ_{s=1}^{τ} d(s)]  otherwise
 *
 * @param {Float32Array} buffer  — time-domain waveform, length ≥ 2W
 * @param {Float32Array} yinBuf  — output buffer, length W (half of buffer)
 */
function cmndf(buffer, yinBuf) {
  const W = yinBuf.length;
  yinBuf[0] = 1;

  let runningSum = 0;

  for (let tau = 1; tau < W; tau++) {
    let d = 0;
    for (let j = 0; j < W; j++) {
      const delta = buffer[j] - buffer[j + tau];
      d += delta * delta;
    }
    runningSum += d;
    // Guard against divide-by-zero during the first few lags
    yinBuf[tau] = runningSum > 0 ? (d * tau) / runningSum : 0;
  }
}

/**
 * Step 3 + 4: find the first τ in [tauMin, tauMax] where d′(τ) < threshold,
 * then walk to the local minimum and apply parabolic interpolation.
 *
 * @param {Float32Array} yinBuf
 * @param {number}       tauMin    — inclusive lower bound
 * @param {number}       tauMax    — inclusive upper bound
 * @param {number}       threshold — YIN aperiodicity threshold (default 0.15)
 * @returns {{ tau: number, aperiodicity: number } | null}
 */
function findBestTau(yinBuf, tauMin, tauMax, threshold) {
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yinBuf[tau] >= threshold) continue;

    // Walk toward the true local minimum
    while (tau + 1 <= tauMax && yinBuf[tau + 1] < yinBuf[tau]) {
      tau++;
    }

    const aperiodicity = yinBuf[tau];
    return { tau: _parabolicInterp(yinBuf, tau), aperiodicity };
  }

  // No sub-threshold period found — return the global minimum as a fallback
  // (the confidence check in detectPitch will reject it if needed)
  let minVal = Infinity;
  let minTau = tauMin;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yinBuf[tau] < minVal) { minVal = yinBuf[tau]; minTau = tau; }
  }
  return { tau: _parabolicInterp(yinBuf, minTau), aperiodicity: minVal };
}

/**
 * Step 5: parabolic interpolation around `tau` for sub-sample F0 accuracy.
 *
 * @param {Float32Array} yinBuf
 * @param {number}       tau     — integer index of the candidate minimum
 * @returns {number}             — refined (fractional) lag
 */
function _parabolicInterp(yinBuf, tau) {
  const len  = yinBuf.length;
  const prev = tau > 0       ? yinBuf[tau - 1] : yinBuf[tau];
  const curr = yinBuf[tau];
  const next = tau + 1 < len ? yinBuf[tau + 1] : yinBuf[tau];

  const denom = 2 * (2 * curr - prev - next);
  if (Math.abs(denom) < 1e-9) return tau;
  return tau + (prev - next) / denom;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the fundamental frequency of a mono PCM buffer using the YIN
 * algorithm.
 *
 * The buffer should be at least 2048 samples (one AnalyserNode frame at
 * fftSize=2048).  Longer buffers improve low-frequency accuracy but increase
 * latency.
 *
 * @param {Float32Array} buffer      — time-domain samples, values in [−1, +1]
 * @param {number}       sampleRate  — e.g. 44100
 * @returns {{ frequency: number, confidence: number } | null}
 *          null when no confident pitch is detected.
 */
export function detectPitch(buffer, sampleRate) {
  if (!buffer || buffer.length < 4) return null;

  const W      = Math.floor(buffer.length / 2);
  const yinBuf = new Float32Array(W);
  cmndf(buffer, yinBuf);

  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const tauMax = Math.min(W - 1, Math.floor(sampleRate / MIN_FREQ));
  if (tauMin >= tauMax) return null;

  const result = findBestTau(yinBuf, tauMin, tauMax, CONFIDENCE_THRESHOLD);
  if (!result) return null;

  const confidence = 1 - result.aperiodicity;
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  const frequency = sampleRate / result.tau;

  // Sanity-check the result is within the declared search range
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) return null;

  return { frequency, confidence };
}

/**
 * Convert a frequency to a continuous MIDI pitch number.
 * A4 (440 Hz) = MIDI 69.
 *
 * @param {number} frequency — Hz
 * @returns {number}         — fractional MIDI note number
 */
export function frequencyToMidi(frequency) {
  return 12 * Math.log2(frequency / 440) + 69;
}

/**
 * Convert a frequency to its nearest equal-temperament note (A4 = 440 Hz).
 *
 * @param {number} frequency — Hz
 * @returns {{
 *   note:   string,   // e.g. 'A', 'C#'
 *   octave: number,   // scientific pitch notation octave (A4 = octave 4)
 *   midi:   number,   // nearest integer MIDI note number
 *   cents:  number,   // deviation from nearest semitone (−50 … +50)
 * }}
 */
export function frequencyToNote(frequency) {
  const midiExact   = frequencyToMidi(frequency);
  const midiRounded = Math.round(midiExact);
  const cents       = Math.round((midiExact - midiRounded) * 100);

  // Pitch class: 0=C … 11=B  (handle negative modulo in JS)
  const pitchClass = ((midiRounded % 12) + 12) % 12;
  const note       = NOTE_NAMES[pitchClass];

  // Scientific octave: MIDI 60 = C4  →  octave = floor(midi/12) − 1
  const octave = Math.floor(midiRounded / 12) - 1;

  return { note, octave, midi: midiRounded, cents };
}
