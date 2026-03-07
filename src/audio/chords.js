/**
 * @file src/audio/chords.js
 * Chromagram-based template matching for 6 open guitar chords.
 *
 * Supported chords: G, C, D, Em, Am, E
 *
 * Approach
 * ─────────
 *  1. Convert the FFT magnitude spectrum to a 12-bin chromagram.
 *     Each bin accumulates linear magnitude for its pitch class across all
 *     octaves in the guitar's useful harmonic range (80 – 4000 Hz).
 *  2. L2-normalise the chromagram so cosine similarity reduces to a dot product.
 *  3. Compute cosine similarity against each pre-normalised chord template.
 *  4. Report the best match if it clears CONFIDENCE_THRESHOLD and exceeds the
 *     runner-up by MARGIN to suppress near-ties.
 *
 * False-positive suppression (applied in index.js, not here)
 * ───────────────────────────────────────────────────────────
 *  • RMS noise gate — caller must confirm signal is live before calling.
 *  • HOLD_FRAMES debounce — chord must win N consecutive frames.
 *  • CONFIDENCE_THRESHOLD — cosine similarity must exceed 0.60.
 *  • MARGIN — best score must beat runner-up by at least 0.08.
 *
 * Known limitations
 * ─────────────────
 *  • E major vs E minor: both share E(4) and B(11).  The distinguishing note
 *    is G(7) for Em versus G#(8) for E.  At guitar fundamentals (~196 Hz and
 *    ~207 Hz) the 21.5 Hz/bin FFT resolution is marginal.  However, harmonics
 *    (e.g. 3rd harmonic at ~588 / 623 Hz) are well-resolved.  In practice the
 *    chromagram accumulates enough harmonic energy to distinguish them, but
 *    results may be less reliable on cheap microphones or in noisy rooms.
 *  • Capo / alternate tunings are not modelled.
 *  • Barre chords or voicings beyond the 6 open shapes are not detected.
 */

import { FFT_SIZE } from './analyzer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Chord templates
//
// Pitch-class weights derived from actual open-string note counts:
//
//  Chord  │ String notes (low→high)             │ Pitch classes
//  ───────┼─────────────────────────────────────┼──────────────────────────
//  G      │ G2 B2 D3 G3 B3 G4    (320003)       │ G×3, B×2, D×1
//  C      │ —  C2 E2 G2 C3 E3    (x32010)       │ C×2, E×2, G×1
//  D      │ —  —  D3 A3 D4 F#4   (xx0232)       │ D×2, A×1, F#×1
//  Em     │ E2 B2 E3 G3 B3 E4    (022000)       │ E×3, B×2, G×1
//  Am     │ —  A2 E3 A3 C4 E4    (x02210)       │ A×2, E×2, C×1
//  E      │ E2 B2 E3 G#3 B3 E4   (022100)       │ E×3, B×2, G#×1
//  ───────┴─────────────────────────────────────┴──────────────────────────
//
// Pitch-class index: 0=C  1=C#  2=D  3=D#  4=E  5=F  6=F#  7=G  8=G#  9=A  10=A#  11=B
// ─────────────────────────────────────────────────────────────────────────────

const _RAW_TEMPLATES = {
  //          C    C#   D    D#   E    F    F#   G    G#   A    A#   B
  'G':  [0,   0,   1,   0,   0,   0,   0,   3,   0,   0,   0,   2],
  'C':  [2,   0,   0,   0,   2,   0,   0,   1,   0,   0,   0,   0],
  'D':  [0,   0,   2,   0,   0,   0,   1,   0,   0,   1,   0,   0],
  'Em': [0,   0,   0,   0,   3,   0,   0,   1,   0,   0,   0,   2],
  'Am': [1,   0,   0,   0,   2,   0,   0,   0,   0,   2,   0,   0],
  'E':  [0,   0,   0,   0,   3,   0,   0,   0,   1,   0,   0,   2],
};

/** @type {Readonly<Record<string, Float32Array>>} — L2-normalised templates */
const TEMPLATES = (() => {
  const out = {};
  for (const [name, raw] of Object.entries(_RAW_TEMPLATES)) {
    let norm = 0;
    for (const v of raw) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    out[name] = new Float32Array(raw.map(v => v / norm));
  }
  return Object.freeze(out);
})();

export const CHORD_LABELS = Object.freeze(Object.keys(TEMPLATES));

// Matching thresholds
const CONFIDENCE_THRESHOLD = 0.60;   // minimum cosine similarity to report a chord
const MARGIN               = 0.08;   // best score must beat runner-up by this much

// Chromagram frequency range (Hz) — captures guitar fundamentals + harmonics
const CHROMA_MIN_FREQ = 80;
const CHROMA_MAX_FREQ = 4000;

// ─────────────────────────────────────────────────────────────────────────────
// Chromagram
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a 12-bin L2-normalised chromagram from a magnitude spectrum.
 *
 * Each FFT bin whose centre frequency falls in [CHROMA_MIN_FREQ, CHROMA_MAX_FREQ]
 * contributes its linear magnitude to the matching pitch-class bin.
 *
 * @param {Float32Array} freqData    — dB values from AnalyserNode.getFloatFrequencyData()
 * @param {number}       sampleRate  — audioCtx.sampleRate
 * @returns {Float32Array}           — 12-element L2-normalised chromagram
 */
export function buildChromagram(freqData, sampleRate) {
  const chroma  = new Float32Array(12);
  const binHz   = sampleRate / (2 * freqData.length);   // Hz per bin
  const minBin  = Math.max(1, Math.floor(CHROMA_MIN_FREQ / binHz));
  const maxBin  = Math.min(freqData.length - 1, Math.ceil(CHROMA_MAX_FREQ / binHz));

  for (let bin = minBin; bin <= maxBin; bin++) {
    const dB = freqData[bin];
    if (dB <= -89) continue;     // near-floor bin — skip to reduce noise

    // Convert dB amplitude to linear (power weighting emphasises louder partials)
    const mag = Math.pow(10, dB / 20);

    // Map bin centre frequency to a MIDI note, then to pitch class
    const freq = bin * binHz;
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc   = ((Math.round(midi) % 12) + 12) % 12;

    chroma[pc] += mag;
  }

  // L2 normalise — turns dot product into cosine similarity
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-8) return chroma;   // silent frame — return zero vector
  for (let i = 0; i < 12; i++) chroma[i] /= norm;

  return chroma;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match a chromagram against all chord templates and return the best match.
 *
 * @param {Float32Array} freqData    — from readFrequencyDomain()
 * @param {number}       sampleRate
 * @returns {{ chord: string, confidence: number }|null}
 *          null when no chord clears the confidence threshold or the margin
 *          between 1st and 2nd place is too small.
 */
export function matchChord(freqData, sampleRate) {
  const chroma = buildChromagram(freqData, sampleRate);

  let best       = null;
  let bestScore  = -Infinity;
  let second     = -Infinity;

  for (const [name, tmpl] of Object.entries(TEMPLATES)) {
    // Dot product of two L2-normalised vectors = cosine similarity
    let score = 0;
    for (let i = 0; i < 12; i++) score += chroma[i] * tmpl[i];

    if (score > bestScore) {
      second    = bestScore;
      bestScore = score;
      best      = name;
    } else if (score > second) {
      second = score;
    }
  }

  if (
    best === null               ||
    bestScore < CONFIDENCE_THRESHOLD ||
    bestScore - second < MARGIN
  ) {
    return null;
  }

  return { chord: best, confidence: bestScore };
}
