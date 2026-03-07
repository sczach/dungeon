/**
 * @file src/audio/analyzer.js
 * AnalyserNode configuration, time/frequency domain reads, RMS, and noise gate.
 *
 * ── iOS GOTCHAS ───────────────────────────────────────────────────────────────
 *  1. Safari < 14 does not implement getFloatTimeDomainData().  We detect this
 *     and fall back to getByteTimeDomainData() + manual conversion to [-1, 1].
 *  2. iOS may deliver a sample rate of 44100 OR 48000 depending on hardware.
 *     Always use analyser.context.sampleRate rather than a hardcoded constant.
 *
 * ── ANDROID CHROME GOTCHAS ───────────────────────────────────────────────────
 *  1. Some Qualcomm-based devices deliver 48000 Hz even when 44100 was requested.
 *  2. smoothingTimeConstant behaves identically to other platforms — no issues.
 */

export const FFT_SIZE   = 2048;   // → 1024 frequency bins; ~46 ms window at 44.1 kHz
const SMOOTHING         = 0.80;   // temporal smoothing: 0 = none, 1 = max hold
const MIN_DECIBELS      = -90;
const MAX_DECIBELS      = -10;

// Noise-gate hold: number of frames the gate stays open after RMS drops below
// the threshold.  Prevents chattering on short silences between strums.
const NOISE_GATE_HOLD   = 4;      // frames (~67 ms at 60 fps)

// EMA weight for calibration noise-floor estimator.
const CALIB_ALPHA       = 0.04;

// Pre-allocated byte buffer reused across calls (avoids GC pressure).
/** @type {Uint8Array|null} */
let _byteBuffer = null;

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create and configure an AnalyserNode, wire source → analyser.
 * The analyser is intentionally NOT connected to the AudioContext destination
 * to avoid microphone → speaker feedback.
 *
 * @param {AudioContext}                 audioCtx
 * @param {MediaStreamAudioSourceNode}   sourceNode
 * @returns {AnalyserNode}
 */
export function createAnalyzer(audioCtx, sourceNode) {
  const analyser = audioCtx.createAnalyser();

  analyser.fftSize               = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING;
  analyser.minDecibels           = MIN_DECIBELS;
  analyser.maxDecibels           = MAX_DECIBELS;

  sourceNode.connect(analyser);
  // ⚠️  Do NOT connect analyser → audioCtx.destination (feedback loop risk).

  _byteBuffer = new Uint8Array(FFT_SIZE);

  return analyser;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot the current time-domain waveform and compute its RMS amplitude.
 *
 * @param {AnalyserNode} analyser
 * @returns {{ timeDomain: Float32Array, rms: number }}
 *          timeDomain: samples normalised to [-1, 1]
 *          rms:        Root Mean Square amplitude in [0, 1]
 */
export function readTimeDomain(analyser) {
  const buf = new Float32Array(analyser.fftSize);

  if (typeof analyser.getFloatTimeDomainData === 'function') {
    // Standard path — all modern browsers including iOS Safari 14.1+.
    analyser.getFloatTimeDomainData(buf);
  } else {
    // Legacy fallback: Safari < 14, older WebKit.
    analyser.getByteTimeDomainData(_byteBuffer);
    for (let i = 0; i < _byteBuffer.length; i++) {
      buf[i] = (_byteBuffer[i] - 128) / 128;   // [0,255] → [-1,1]
    }
  }

  return { timeDomain: buf, rms: computeRMS(buf) };
}

/**
 * Snapshot the current magnitude spectrum (in dB).
 *
 * @param {AnalyserNode} analyser
 * @returns {Float32Array}  length = analyser.frequencyBinCount (= fftSize/2)
 *                          values in dB, clamped to [minDecibels, maxDecibels]
 */
export function readFrequencyDomain(analyser) {
  const freqData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(freqData);
  return freqData;
}

// ─────────────────────────────────────────────────────────────────────────────
// RMS & Noise Gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Root Mean Square of a [-1, 1] sample buffer.
 *
 * @param {Float32Array} buffer
 * @returns {number}  RMS in [0, 1]
 */
export function computeRMS(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Noise gate with hysteresis and hold.
 *
 * Opens when RMS exceeds `noiseFloor * headroomFactor`.
 * Stays open for NOISE_GATE_HOLD frames after the signal drops, preventing
 * chatter on strum decay.
 *
 * @param {number}             rms         current RMS value
 * @param {number}             noiseFloor  state.audio.noiseFloor
 * @param {{ count: number }}  holdState   mutable counter — pass the same
 *                                         object every frame
 * @param {number}             [headroom]  multiplier above floor (default 1.5)
 * @returns {boolean}
 */
export function isAboveNoiseGate(rms, noiseFloor, holdState, headroom = 1.5) {
  if (rms > noiseFloor * headroom) {
    holdState.count = NOISE_GATE_HOLD;
    return true;
  }
  if (holdState.count > 0) {
    holdState.count--;
    return true;    // hold open through short silences
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Calibration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exponential moving average update for the noise-floor estimator.
 * Call once per frame during the CALIBRATION scene.
 *
 * When the player plays a chord during calibration the RMS spikes;
 * this will momentarily raise the estimated floor but that is intentional —
 * the final floor captured when the player stops playing approximates the
 * ambient noise level.  For a better result, instruct the player to stop
 * playing before clicking "Ready".
 *
 * @param {number} currentRMS
 * @param {number} prevAvg      previous estimate
 * @param {number} [alpha]      EMA weight (smaller = slower adaptation)
 * @returns {number}            updated estimate
 */
export function updateNoiseFloorEMA(currentRMS, prevAvg, alpha = CALIB_ALPHA) {
  return prevAvg + alpha * (currentRMS - prevAvg);
}
