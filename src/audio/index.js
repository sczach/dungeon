/**
 * @file src/audio/index.js
 * Audio subsystem orchestrator — the only file game.js needs to import.
 *
 * Public API
 * ──────────
 *   startCapture(state)      — call from a user-gesture handler; requests mic,
 *                              opens AudioContext, sets state.audio.ready.
 *   updateAudio(state, dt)   — call every frame during PLAYING scene.
 *   updateCalibration(state) — call every frame during CALIBRATION scene.
 *   stopCapture()            — tear down mic + AudioContext (e.g. on page hide).
 *
 * Internal per-frame pipeline (updateAudio)
 * ──────────────────────────────────────────
 *   read time domain → noise gate → YIN pitch → chromagram → chord match
 *   → debounce (HOLD_FRAMES) → write state.audio.*
 *
 * False-positive suppression layers
 * ───────────────────────────────────
 *   1. Noise gate  — RMS must exceed noiseFloor × 1.5 (with 4-frame hold).
 *   2. Threshold   — cosine similarity ≥ 0.60.
 *   3. Margin      — winner must beat runner-up by ≥ 0.15.
 *   4. Debounce    — chord must win HOLD_FRAMES consecutive frames before
 *                    being written to state.
 *   5. Fade-out    — confidence decays at 0.04/frame when signal drops,
 *                    clearing detectedChord only after reaching zero.
 */

import { initCapture, unlockAudioContext, stopCapture as _stopCapture } from './capture.js';
import {
  createAnalyzer,
  readTimeDomain,
  readFrequencyDomain,
  isAboveNoiseGate,
  updateNoiseFloorEMA,
} from './analyzer.js';
import { detectPitch, freqToNoteName }  from './pitch.js';
import { matchChord }                   from './chords.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level state (singleton — one AudioContext per page)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {AudioContext|null}  */
let _audioCtx   = null;

/** @type {AnalyserNode|null} */
let _analyser   = null;

/** Actual sample rate delivered by the browser (may differ from requested). */
let _sampleRate = 44100;

// Noise gate hold counter — persisted across frames
const _gateState = { count: 0 };

// Chord debounce — candidate must hold for HOLD_FRAMES before being reported
const _chordState = { candidate: null, frames: 0 };

// Calibration — count frames with a live analyser
let _calibFrames  = 0;
let _captureFailed = false;   // set when startCapture() throws (e.g. permission denied)
const CALIB_SETTLE_FRAMES = 90;   // ~1.5 s at 60 fps before "Ready" unlocks

// How many consecutive frames the winning chord must appear before we commit
const HOLD_FRAMES = 4;

// Confidence fade rate per frame when signal drops below gate
const FADE_RATE = 0.04;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request microphone access and open an AudioContext.
 * Must be called inside a user-gesture handler (button click / touchend).
 *
 * On success: sets state.audio.ready = true and wires the iOS unlock listener.
 * On failure: logs the error; state.audio.ready remains false.
 *
 * @param {object} state — canonical game state
 * @returns {Promise<void>}
 */
export async function startCapture(state) {
  try {
    const { audioCtx, stream } = await initCapture();
    _audioCtx  = audioCtx;
    _sampleRate = audioCtx.sampleRate;

    const sourceNode = audioCtx.createMediaStreamSource(stream);
    _analyser = createAnalyzer(audioCtx, sourceNode);

    // Wire iOS gesture unlock so the context survives screen-lock / phone calls
    unlockAudioContext(audioCtx);

    state.audio.ready = true;
    _calibFrames      = 0;

    console.info(
      `[audio] Capture started — sampleRate: ${_sampleRate} Hz, ` +
      `state: ${audioCtx.state}`
    );
  } catch (err) {
    console.error('[audio] startCapture failed:', err);
    _captureFailed = true;
    // state.audio.ready stays false; updateCalibration will unblock the button
  }
}

/**
 * Tear down microphone and AudioContext.
 * Safe to call when capture was never started.
 */
export function stopCapture() {
  _audioCtx      = null;
  _analyser      = null;
  _captureFailed = false;
  _calibFrames   = 0;
  _gateState.count        = 0;
  _chordState.candidate   = null;
  _chordState.frames      = 0;
  _stopCapture();
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-frame update — CALIBRATION scene
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update noise-floor estimate and calibration UI.
 * Call once per frame while state.scene === 'CALIBRATION'.
 *
 * Writes: state.audio.noiseFloor, state.audio.waveformData
 * Side-effects: updates calibration bar DOM element; enables "Ready" button
 *               after CALIB_SETTLE_FRAMES frames of mic data.
 *
 * @param {object} state — canonical game state
 */
export function updateCalibration(state) {
  // ── Capture failed (e.g. permission denied) — unblock the button so the
  // user isn't stuck.  The game will run without chord detection.
  if (_captureFailed) {
    const btn    = /** @type {HTMLButtonElement|null} */ (
      document.getElementById('btn-calibration-done')
    );
    const status = document.getElementById('calibration-status');
    if (btn && btn.disabled) {
      if (status) status.textContent = 'Mic unavailable — chord detection disabled.';
      btn.disabled = false;
    }
    return;
  }

  if (!_analyser || _audioCtx?.state !== 'running') return;

  const { timeDomain, rms } = readTimeDomain(_analyser);

  // Snapshot waveform for canvas visualiser
  state.audio.waveformData = timeDomain;

  // Refine noise-floor estimate with EMA
  state.audio.noiseFloor = updateNoiseFloorEMA(rms, state.audio.noiseFloor);

  // Update calibration bar (width = current RMS relative to a rough ceiling)
  const bar = /** @type {HTMLElement|null} */ (document.getElementById('calibration-bar'));
  if (bar) {
    const pct = Math.min(rms / 0.3, 1) * 100;
    bar.style.width = `${pct.toFixed(1)}%`;
  }

  _calibFrames++;

  if (_calibFrames === CALIB_SETTLE_FRAMES) {
    const status = document.getElementById('calibration-status');
    const btn    = /** @type {HTMLButtonElement|null} */ (
      document.getElementById('btn-calibration-done')
    );
    if (status) status.textContent = 'Noise floor set — ready when you are!';
    if (btn)    btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-frame update — PLAYING scene
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full audio pipeline and update state.audio.*.
 * Call once per frame while state.scene === 'PLAYING'.
 *
 * Writes:
 *   state.audio.waveformData   — Float32Array for waveform visualiser
 *   state.audio.detectedNote   — string|null  e.g. 'E2'
 *   state.audio.detectedChord  — string|null  e.g. 'Em'
 *   state.audio.confidence     — number 0–1
 *
 * @param {object} state — canonical game state
 * @param {number} dt    — delta-time in seconds (unused here; reserved for
 *                         future time-weighted smoothing)
 */
export function updateAudio(state, dt) {   // eslint-disable-line no-unused-vars
  if (!_analyser || !state.audio.ready) return;
  if (_audioCtx?.state !== 'running')   return;

  // ── 1. Time domain snapshot ───────────────────────────────────────────────
  const { timeDomain, rms } = readTimeDomain(_analyser);
  state.audio.waveformData  = timeDomain;

  // ── 2. Noise gate ─────────────────────────────────────────────────────────
  const live = isAboveNoiseGate(rms, state.audio.noiseFloor, _gateState);

  if (!live) {
    // Signal below noise floor — decay confidence and clear stale detections
    state.audio.confidence = Math.max(0, state.audio.confidence - FADE_RATE);
    if (state.audio.confidence === 0) {
      state.audio.detectedNote  = null;
      state.audio.detectedChord = null;
    }
    _chordState.candidate = null;
    _chordState.frames    = 0;
    return;
  }

  // ── 3. Pitch detection (YIN) ──────────────────────────────────────────────
  const freq = detectPitch(timeDomain, _sampleRate);
  state.audio.detectedNote = freq !== null ? freqToNoteName(freq) : null;

  // ── 4. Chord matching (chromagram) ────────────────────────────────────────
  const freqData = readFrequencyDomain(_analyser);
  const match    = matchChord(freqData, _sampleRate);

  if (match) {
    if (match.chord === _chordState.candidate) {
      _chordState.frames++;
    } else {
      // New candidate — reset hold counter
      _chordState.candidate = match.chord;
      _chordState.frames    = 1;
    }

    // ── 5. Debounce — commit only after HOLD_FRAMES consistent detections ───
    if (_chordState.frames >= HOLD_FRAMES) {
      if (state.audio.detectedChord !== match.chord) {
        console.debug(
          `[audio] chord: ${match.chord}  conf: ${match.confidence.toFixed(3)}`
        );
      }
      state.audio.detectedChord = match.chord;
      state.audio.confidence    = match.confidence;
    }
  } else {
    // No confident match this frame — decay but keep last chord visible briefly
    _chordState.candidate     = null;
    _chordState.frames        = 0;
    state.audio.confidence    = Math.max(0, state.audio.confidence - FADE_RATE);
    if (state.audio.confidence === 0) {
      state.audio.detectedChord = null;
    }
  }
}
