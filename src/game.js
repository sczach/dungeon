/**
 * Chord Wars — Game (Phase 0 scaffold)
 *
 * Central game loop + state machine.  Audio engine results flow in via the
 * onChord() callback registered by initAudio() in Phase 1A.
 *
 * @typedef {{ phase: string, map: object|null, towers: any[], enemies: any[],
 *             bullets: any[], wave: number, hp: number }} GameState
 */

import { Renderer } from './renderer.js';
import { initAudio, stopAudio } from './audio/capture.js';
import { createAnalyzer }       from './audio/analyzer.js';
import { detectPitch, frequencyToNote } from './audio/pitch.js';
import { detectChord }          from './audio/chords.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const canvas     = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const btnStart   = document.getElementById('btn-start');
const btnMic     = document.getElementById('btn-mic');
const hudChord   = document.getElementById('hud-chord');
const hudWave    = document.getElementById('hud-wave');
const hudHp      = document.getElementById('hud-hp');
const statusText = document.getElementById('status-text');
const micLevel   = /** @type {HTMLMeterElement} */ (document.getElementById('mic-level'));

// ── Game state ────────────────────────────────────────────────────────────────

/** @type {GameState} */
const state = {
  phase:   'idle',
  map:     null,
  towers:  [],
  enemies: [],
  bullets: [],
  wave:    1,
  hp:      20,
};

const renderer = new Renderer(canvas);

// ── Audio pipeline (initialised on demand) ────────────────────────────────────

let audioPipeline = null;   // { audioContext, stream, source }
let analyzer      = null;   // return value of createAnalyzer()
let rafId         = null;   // requestAnimationFrame handle for audio polling

/** How often (ms) we poll the analyser for chord / pitch data. */
const AUDIO_POLL_INTERVAL = 80; // ≈12 Hz — well under 150 ms latency target
let lastPollTime = 0;

// ── Game loop ─────────────────────────────────────────────────────────────────

let lastFrameTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1); // seconds, capped
  lastFrameTime = timestamp;

  update(dt, timestamp);
  renderer.draw(state);

  requestAnimationFrame(gameLoop);
}

function update(dt, timestamp) {
  if (state.phase !== 'playing') return;

  // Audio poll — separated from render cadence to hit the latency target
  // without doing FFT work every single frame.
  if (analyzer && timestamp - lastPollTime >= AUDIO_POLL_INTERVAL) {
    lastPollTime = timestamp;
    pollAudio();
  }

  // Enemy movement (placeholder)
  for (const enemy of state.enemies) {
    enemy.pathProgress = (enemy.pathProgress ?? 0) + dt * enemy.speed;
  }
}

// ── Audio polling ─────────────────────────────────────────────────────────────

function pollAudio() {
  const timeDomain = analyzer.getTimeDomain();

  // Noise gate — bail early on silence
  if (analyzer.isSilent(timeDomain)) {
    micLevel.value = 0;
    setChordDisplay(null);
    return;
  }

  const rmsValue = analyzer.rms(timeDomain);
  micLevel.value = Math.min(rmsValue * 10, 1); // scale 0-1 for <meter>

  const freqData = analyzer.getFrequency();
  const chord    = detectChord(freqData, audioPipeline.audioContext.sampleRate, analyzer.analyser.fftSize);

  if (chord) {
    setChordDisplay(chord.chord, chord.confidence);
    handleChord(chord.chord);
  } else {
    // Fall back to mono pitch detection for single-note feedback
    const pitch = detectPitch(timeDomain, audioPipeline.audioContext.sampleRate);
    if (pitch) {
      const { note, octave } = frequencyToNote(pitch.frequency);
      setChordDisplay(`${note}${octave}`, pitch.confidence, /*isNote=*/true);
    } else {
      setChordDisplay(null);
    }
  }
}

// ── Chord → game action ───────────────────────────────────────────────────────

/**
 * Map detected chords to in-game tower placements / abilities.
 * Extend this in Phase 1B+ with actual tower logic.
 *
 * @param {string} chord
 */
function handleChord(chord) {
  // Placeholder — log for now; Phase 1B will wire in tower placement.
  console.debug('[ChordWars] chord detected:', chord);
}

// ── UI helpers ────────────────────────────────────────────────────────────────

let chordResetTimer = null;

function setChordDisplay(chord, confidence = 0, isNote = false) {
  clearTimeout(chordResetTimer);
  if (!chord) {
    hudChord.textContent = '— play a chord —';
    hudChord.classList.remove('active');
    return;
  }
  const confPct = Math.round(confidence * 100);
  hudChord.textContent = isNote
    ? `♩ ${chord}`
    : `${chord} (${confPct}%)`;
  hudChord.classList.add('active');
  // Auto-clear after 800 ms of silence
  chordResetTimer = setTimeout(() => setChordDisplay(null), 800);
}

function setStatus(msg) {
  statusText.textContent = msg;
}

function updateHud() {
  hudWave.textContent = `Wave ${state.wave}`;
  hudHp.textContent   = `HP: ${state.hp}`;
}

// ── Button handlers ───────────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  state.phase = 'playing';
  btnMic.disabled = false;
  setStatus('Game running — enable mic to play chords');
  updateHud();
  requestAnimationFrame(ts => { lastFrameTime = ts; gameLoop(ts); });
  btnStart.disabled = true;
});

btnMic.addEventListener('click', async () => {
  if (audioPipeline) {
    // Toggle off
    stopAudio(audioPipeline);
    audioPipeline = null;
    analyzer      = null;
    btnMic.textContent = 'Enable Mic';
    setStatus('Mic disabled');
    micLevel.value = 0;
    return;
  }

  try {
    btnMic.disabled = true;
    setStatus('Requesting mic access…');
    audioPipeline = await initAudio();
    analyzer      = createAnalyzer(audioPipeline.audioContext, audioPipeline.source);
    btnMic.textContent = 'Disable Mic';
    btnMic.disabled    = false;
    setStatus('Mic active — play G, C, D, Em, Am, or E');
  } catch (err) {
    console.error('[ChordWars] mic init failed:', err);
    setStatus(`Mic error: ${err.message}`);
    btnMic.disabled = false;
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

// Draw the idle screen immediately so the canvas isn't blank.
renderer.draw(state);
