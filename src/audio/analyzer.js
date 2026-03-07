/**
 * Chord Wars — FFT Analyser (Phase 1A)
 *
 * Wraps the Web Audio AnalyserNode and exposes three thin helpers:
 *
 *   getTimeDomain()  → Float32Array of raw waveform samples  (2048 values)
 *   getFrequency()   → Float32Array of FFT bin magnitudes in dB (1024 values)
 *   rms(buf?)        → root-mean-square amplitude of the current frame
 *   isSilent(buf?)   → true when RMS is below the noise-gate threshold
 *
 * Noise gate
 * ──────────
 * Before any pitch / chord work the caller should test isSilent(timeDomain).
 * If it returns true the frame is silent and processing should be skipped.
 * The default threshold (~−40 dBFS) is conservative enough to block hiss and
 * breath noise without cutting off soft guitar playing.
 */

'use strict';

// ── AnalyserNode configuration ────────────────────────────────────────────────

/** Power-of-two FFT window.  2048 gives ~21.5 Hz/bin at 44.1 kHz. */
const FFT_SIZE = 2048;

/**
 * Temporal smoothing (0 = none, 1 = max).
 * 0.8 gives stable frequency-domain data without smearing fast transients.
 */
const SMOOTHING = 0.8;

/**
 * dB range for the frequency-domain output.
 * Values outside [MIN_DB, MAX_DB] are clamped, which suppresses sub-floor
 * noise and keeps chord/pitch detection from chasing garbage.
 */
const MIN_DB = -90;
const MAX_DB = -10;

// ── Noise gate ────────────────────────────────────────────────────────────────

/**
 * RMS amplitude below which a frame is treated as silence (linear 0–1 scale).
 *
 * Derivation: RMS 0.01 ≈ −40 dBFS.  Guitar strings at normal playing level
 * exceed −30 dBFS easily; background room noise in a quiet room is ≤−50 dBFS.
 * This leaves a comfortable 10 dB headroom on both sides.
 *
 * Exported so callers (and tests) can override if needed.
 */
export const NOISE_GATE_THRESHOLD = 0.01;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create an AnalyserNode, connect it to `source`, and return the helper API.
 *
 * The analyser is intentionally NOT connected to audioContext.destination so
 * the mic signal is never fed back through the speakers.
 *
 * @param {AudioContext}              audioContext
 * @param {AudioNode}                 source  — usually a MediaStreamSourceNode
 * @returns {{
 *   analyser:      AnalyserNode,
 *   getTimeDomain: () => Float32Array,
 *   getFrequency:  () => Float32Array,
 *   rms:           (buf?: Float32Array) => number,
 *   isSilent:      (buf?: Float32Array) => boolean,
 * }}
 */
export function createAnalyzer(audioContext, source) {
  const analyser                  = audioContext.createAnalyser();
  analyser.fftSize                = FFT_SIZE;
  analyser.smoothingTimeConstant  = SMOOTHING;
  analyser.minDecibels            = MIN_DB;
  analyser.maxDecibels            = MAX_DB;

  // Wire: source → analyser (dead end — no connection to destination)
  source.connect(analyser);

  // Pre-allocate typed buffers once; reuse every frame to avoid GC pressure.
  const timeDomainBuffer = new Float32Array(analyser.fftSize);
  const frequencyBuffer  = new Float32Array(analyser.frequencyBinCount); // fftSize/2

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Copy the current time-domain (waveform) data into the shared buffer and
   * return it.  Values are in the range [−1, +1].
   */
  function getTimeDomain() {
    analyser.getFloatTimeDomainData(timeDomainBuffer);
    return timeDomainBuffer;
  }

  /**
   * Copy the current frequency-domain data (in dB) into the shared buffer and
   * return it.  There are fftSize/2 = 1024 bins; bin k represents the
   * frequency k × (sampleRate / fftSize) Hz.
   */
  function getFrequency() {
    analyser.getFloatFrequencyData(frequencyBuffer);
    return frequencyBuffer;
  }

  /**
   * Compute the RMS amplitude of a time-domain buffer.
   * If no buffer is provided the last-read shared buffer is used.
   *
   * @param {Float32Array} [buf]
   * @returns {number}  0–1
   */
  function rms(buf = timeDomainBuffer) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum += buf[i] * buf[i];
    }
    return Math.sqrt(sum / buf.length);
  }

  /**
   * Returns true when the signal is below the noise-gate threshold.
   * Call getTimeDomain() first to ensure the buffer is fresh.
   *
   * @param {Float32Array} [buf]
   * @returns {boolean}
   */
  function isSilent(buf = timeDomainBuffer) {
    return rms(buf) < NOISE_GATE_THRESHOLD;
  }

  return { analyser, getTimeDomain, getFrequency, rms, isSilent };
}
