/**
 * @file src/audio/pitch.js
 * YIN fundamental-frequency estimator + A440 equal-temperament note mapper.
 *
 * Reference: de Cheveigné & Kawahara (2002), "YIN, a fundamental frequency
 * estimator for speech and music", JASA 111(4), pp. 1917-1930.
 *
 * Guitar range: E2 (82.4 Hz) – high harmonics up to ~1050 Hz are fine.
 * Buffer: 2048 samples @ 44.1 kHz → ~46 ms window.
 * Lowest period (E2, 82.4 Hz) ≈ 535 samples → ~3.8 periods in the window.
 * YIN is reliable with ≥ 2 periods, so E2 is safely within range.
 *
 * Performance: O(W × τ_max) ≈ 1024 × 535 ≈ 550k multiply-adds per frame.
 * At 60 fps that's ~33M ops/s — well within V8's JIT budget.
 *
 * ── iOS / ANDROID GOTCHAS ────────────────────────────────────────────────────
 *  • Always pass audioCtx.sampleRate (not a hardcoded 44100) because Android
 *    Chrome frequently delivers 48000 Hz regardless of the requested rate.
 *    An incorrect sample rate shifts all detected frequencies by ~9%.
 *  • If the device sample rate is not 44100 or 48000, the MIN/MAX_FREQ limits
 *    auto-adapt via the lag calculations — no code changes needed.
 */

const YIN_THRESHOLD = 0.10;   // CMND dip threshold (paper recommends 0.10–0.15)
const MIN_FREQ      = 60.0;   // Hz — below E2 to handle slight tuning slack
const MAX_FREQ      = 1050.0; // Hz — above high-E open string harmonics

// ─────────────────────────────────────────────────────────────────────────────
// YIN algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate the fundamental frequency of a monophonic audio buffer using YIN.
 *
 * @param {Float32Array} buffer      — time-domain samples in [-1, 1]
 * @param {number}       sampleRate  — e.g. audioCtx.sampleRate (44100 or 48000)
 * @returns {number|null}            — frequency in Hz, or null if no pitch found
 */
export function detectPitch(buffer, sampleRate) {
  const N    = buffer.length;
  const W    = Math.floor(N / 2);              // integration window = half buffer
  const tMin = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const tMax = Math.min(W - 1, Math.ceil(sampleRate / MIN_FREQ));

  // ── Step 1+2: Difference function + Cumulative Mean Normalised Difference ──
  //
  // d(τ) = Σ_{j=0}^{W-1} (x[j] - x[j+τ])²
  //
  // cmnd[0]   = 1 (by definition)
  // cmnd[τ>0] = τ · d(τ) / Σ_{t=1}^{τ} d(t)
  //
  // This normalisation makes the function dimensionless and brings local
  // minima close to 0 at the true period, reducing octave errors.

  const d    = new Float32Array(tMax + 1);
  const cmnd = new Float32Array(tMax + 1);
  cmnd[0] = 1;

  let runningSum = 0;

  for (let tau = 1; tau <= tMax; tau++) {
    let acc = 0;
    for (let j = 0; j < W; j++) {
      const delta = buffer[j] - buffer[j + tau];
      acc += delta * delta;
    }
    d[tau] = acc;
    runningSum += acc;
    cmnd[tau] = (tau * acc) / (runningSum || 1e-12);
  }

  // ── Step 3: Absolute threshold — first dip below YIN_THRESHOLD ─────────────
  for (let tau = tMin; tau <= tMax; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      // Walk right to the bottom of this dip
      while (tau + 1 <= tMax && cmnd[tau + 1] < cmnd[tau]) {
        tau++;
      }

      // ── Step 4: Parabolic interpolation for sub-sample precision ───────────
      const refined = parabolicInterp(cmnd, tau, tMax);
      const freq    = sampleRate / refined;

      // Sanity-check before returning
      return (freq >= MIN_FREQ && freq <= MAX_FREQ) ? freq : null;
    }
  }

  return null;   // aperiodic / silence
}

/**
 * Sub-sample refinement of the CMND minimum via parabolic interpolation.
 *
 * Given three adjacent samples, fits a parabola and returns the x-coordinate
 * of its vertex:
 *   x_min = τ + (d[τ-1] - d[τ+1]) / (2 · (d[τ-1] + d[τ+1] - 2·d[τ]))
 *
 * @param {Float32Array} cmnd
 * @param {number}       tau   — integer lag of the minimum
 * @param {number}       tMax  — upper bound for clamping
 * @returns {number}           — refined (possibly fractional) lag
 */
function parabolicInterp(cmnd, tau, tMax) {
  if (tau <= 0 || tau >= tMax) return tau;

  const y0 = cmnd[tau - 1];
  const y1 = cmnd[tau];
  const y2 = cmnd[tau + 1];

  const denom = y0 + y2 - 2 * y1;
  if (Math.abs(denom) < 1e-10) return tau;

  return tau + (y0 - y2) / (2 * denom);
}

// ─────────────────────────────────────────────────────────────────────────────
// Frequency → note name (A4 = 440 Hz, 12-TET equal temperament)
// ─────────────────────────────────────────────────────────────────────────────

const NOTE_NAMES = Object.freeze(
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
);

/**
 * Map a frequency to the nearest note name + octave string.
 *
 * Examples: 82.4 Hz → 'E2',  440 Hz → 'A4',  207.7 Hz → 'G#3'
 *
 * @param {number} freq — Hz (must be > 0)
 * @returns {string}
 */
export function freqToNoteName(freq) {
  if (freq <= 0) return '—';
  // MIDI note number: A4 = 440 Hz = MIDI 69
  const midi    = 12 * Math.log2(freq / 440) + 69;
  const rounded = Math.round(midi);
  const pc      = ((rounded % 12) + 12) % 12;   // pitch class 0–11
  const octave  = Math.floor(rounded / 12) - 1;  // MIDI octave convention
  return `${NOTE_NAMES[pc]}${octave}`;
}

/**
 * Map a frequency to a pitch-class index (0 = C, 1 = C#, …, 11 = B).
 *
 * @param {number} freq — Hz
 * @returns {number}    — integer in [0, 11]
 */
export function freqToPitchClass(freq) {
  if (freq <= 0) return 0;
  const midi = 12 * Math.log2(freq / 440) + 69;
  return ((Math.round(midi) % 12) + 12) % 12;
}
