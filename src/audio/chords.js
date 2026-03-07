/**
 * Chord Wars — Chord Detection (Phase 1A)
 *
 * Strategy: chromagram template matching
 * ──────────────────────────────────────
 * A chromagram collapses the full frequency spectrum into 12 pitch-class
 * energy bins (C, C#, …, B) regardless of octave.  This makes it naturally
 * robust to octave inversions and voicing variations — exactly what we need
 * when matching open guitar chords against a single microphone input.
 *
 * Pipeline:
 *   1. computeChroma()   — convert FFT bins (dB) → 12-element energy vector
 *   2. normaliseChroma() — unit-normalise so volume doesn't affect matching
 *   3. detectChord()     — cosine similarity against pre-normalised templates
 *
 * Supported chords (open guitar voicings):
 *   G major  — G B D
 *   C major  — C E G
 *   D major  — D F# A
 *   E minor  — E G B
 *   A minor  — A C E
 *   E major  — E G# B
 *
 * Confidence / false-positive prevention
 * ───────────────────────────────────────
 * Two gates work in tandem:
 *
 *  1. Energy gate  (MIN_CHROMA_ENERGY): if the overall chromagram magnitude
 *     is tiny the frame is essentially silence — no match is returned.
 *
 *  2. Cosine-similarity gate (CHORD_CONFIDENCE_THRESHOLD): the best template
 *     score must exceed this value (0–1) to be reported.  A score of 1.0
 *     means a perfect match; our default 0.80 is empirically a good balance
 *     between sensitivity and rejection of ambiguous frames.
 *
 * Both thresholds are exported so callers can tune them at runtime.
 */

'use strict';

// ── Thresholds ─────────────────────────────────────────────────────────────────

/**
 * Minimum cosine similarity (0–1) between the chromagram and a template
 * required to report a chord match.
 *
 * Lower  → more sensitive, more false positives.
 * Higher → fewer false positives, may miss soft or imprecise playing.
 */
export const CHORD_CONFIDENCE_THRESHOLD = 0.80;

/**
 * Minimum L2-norm of the raw (unnormalised) chromagram to bother running
 * template matching.  Guards against matching near-silence.
 *
 * The raw chroma bins are linear power values accumulated across the FFT;
 * a norm below 0.1 indicates the signal is too quiet to classify reliably.
 */
export const MIN_CHROMA_ENERGY = 0.1;

// ── Chord templates ───────────────────────────────────────────────────────────
//
// Indices:  0   1   2   3   4   5   6   7   8   9  10  11
//           C  C#   D  D#   E   F  F#   G  G#   A  A#   B
//
// Each chord is specified as a binary vector over the 12 pitch classes that
// make up its triad.  Octave / voicing information is deliberately discarded —
// the chromagram handles that collapse already.
//
// Reference (open guitar voicings):
//   G  major : root G(7), third B(11), fifth D(2)
//   C  major : root C(0), third E(4),  fifth G(7)
//   D  major : root D(2), third F#(6), fifth A(9)
//   E  minor : root E(4), minor third G(7), fifth B(11)
//   A  minor : root A(9), minor third C(0), fifth E(4)
//   E  major : root E(4), major third G#(8), fifth B(11)

const CHORD_TEMPLATES = {
  //              C   C#  D   D#  E   F   F#  G   G#  A   A#  B
  'G':  new Float32Array([0,  0,  1,  0,  0,  0,  0,  1,  0,  0,  0,  1]),
  'C':  new Float32Array([1,  0,  0,  0,  1,  0,  0,  1,  0,  0,  0,  0]),
  'D':  new Float32Array([0,  0,  1,  0,  0,  0,  1,  0,  0,  1,  0,  0]),
  'Em': new Float32Array([0,  0,  0,  0,  1,  0,  0,  1,  0,  0,  0,  1]),
  'Am': new Float32Array([1,  0,  0,  0,  1,  0,  0,  0,  0,  1,  0,  0]),
  'E':  new Float32Array([0,  0,  0,  0,  1,  0,  0,  0,  1,  0,  0,  1]),
};

// Pre-normalise templates to unit length once at module load time.
// This avoids repeated division inside the hot matching loop.
const NORMALISED_TEMPLATES = Object.fromEntries(
  Object.entries(CHORD_TEMPLATES).map(([name, tmpl]) => {
    const mag = _l2norm(tmpl);
    return [name, mag > 0 ? tmpl.map(v => v / mag) : tmpl];
  })
);

// ── Chromagram ────────────────────────────────────────────────────────────────

/**
 * Compute a 12-bin chromagram from a Float32Array of FFT magnitudes in dB
 * (as returned by AnalyserNode.getFloatFrequencyData).
 *
 * Each FFT bin's linear power is accumulated into the corresponding pitch-
 * class bucket.  Bins outside the piano range (A0 27.5 Hz … C8 4186 Hz) are
 * ignored.  Bins with value −Infinity or below −90 dB are skipped to avoid
 * polluting the chromagram with sub-floor noise.
 *
 * @param {Float32Array} freqData   — dB values; length = fftSize / 2
 * @param {number}       sampleRate — AudioContext.sampleRate (e.g. 44100)
 * @param {number}       fftSize    — full FFT window (e.g. 2048)
 * @returns {Float32Array}          — 12-element chromagram (unnormalised power)
 */
export function computeChroma(freqData, sampleRate, fftSize) {
  const chroma  = new Float32Array(12);
  const nyquist = sampleRate / 2;
  const hzPerBin = nyquist / freqData.length; // = sampleRate / fftSize

  for (let bin = 1; bin < freqData.length; bin++) {
    const dB = freqData[bin];
    // Skip silence / below-noise-floor bins
    if (!isFinite(dB) || dB < -90) continue;

    const freq = bin * hzPerBin;
    // Piano range: A0 (27.5 Hz) to C8 (4186 Hz)
    if (freq < 27.5 || freq > 4186) continue;

    // Convert dB to linear power and accumulate into the matching pitch class
    const power      = Math.pow(10, dB / 10);
    const midi       = 12 * Math.log2(freq / 440) + 69;
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pitchClass] += power;
  }

  return chroma;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect the best-matching open guitar chord from a single FFT frame.
 *
 * Returns null when:
 *  • the signal is too quiet (energy gate)
 *  • no template achieves the minimum cosine-similarity threshold
 *
 * @param {Float32Array} freqData   — from analyser.getFloatFrequencyData()
 * @param {number}       sampleRate — AudioContext.sampleRate
 * @param {number}       fftSize    — analyser.fftSize
 * @returns {{ chord: string, confidence: number } | null}
 */
export function detectChord(freqData, sampleRate, fftSize) {
  const chroma = computeChroma(freqData, sampleRate, fftSize);

  // Energy gate — skip near-silent frames
  const energy = _l2norm(chroma);
  if (energy < MIN_CHROMA_ENERGY) return null;

  // Unit-normalise the chroma vector (in-place on a copy)
  const chromaNorm = chroma.map(v => v / energy);

  // Cosine similarity against each pre-normalised template
  let bestChord = null;
  let bestScore = -Infinity;

  for (const [name, tmpl] of Object.entries(NORMALISED_TEMPLATES)) {
    let dot = 0;
    for (let i = 0; i < 12; i++) {
      dot += chromaNorm[i] * tmpl[i];
    }
    if (dot > bestScore) {
      bestScore = dot;
      bestChord = name;
    }
  }

  if (bestScore < CHORD_CONFIDENCE_THRESHOLD) return null;

  return { chord: bestChord, confidence: bestScore };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Compute the L2 (Euclidean) norm of a typed array. */
function _l2norm(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum);
}
