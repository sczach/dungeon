# Chord Wars — Audio Reference (Phase 2)

> **Status:** Partially superseded — see [[AUDIO_PIPELINE]] for current docs/context reference.
> **Vault links:** [[AUDIO_PIPELINE]] | [[PROJECT_HISTORY]] | `docs/skills/SOUND_ENGINE.md`
> **Key correction from V1:** Chord detection is **chromagram + cosine similarity**, NOT YIN pitch detection. V1 docs were wrong on this.
> **Still unique here:** Planned Sound Engine layers (Phase 2B), MIDI pipeline notes, calibration flow.

## Current Audio Pipeline (SETTLED — working in production)

```
Mic → Web Audio API (44.1kHz) → AnalyserNode (fftSize: 2048)
  → getFloatFrequencyData()
  → buildChromagram()  — 12-bin chroma from 80–4000 Hz, L2-normalised
  → matchChord()       — cosine similarity vs 6 pre-normalised templates
  → False-positive gates:
      • RMS noise gate (noiseFloor from calibration)
      • HOLD_FRAMES: chord must win N consecutive frames
      • CONFIDENCE_THRESHOLD: 0.60 cosine similarity minimum
      • MARGIN: best score must beat runner-up by ≥ 0.15
      • SPAWN_DEBOUNCE: 0.5s per chord
```

**This is chromagram-based cosine similarity, NOT YIN pitch detection.** Earlier docs were wrong. Do not change this architecture.

### Chroma range: 80–4000 Hz
### Near-floor bins (≤ −89 dB) skipped
### Known limitation: E major vs Em marginal on cheap mics (G vs G# proximity)

## Piano Tone Playback (keyboard.js)

On keypress: OscillatorNode (sine) → GainNode (0.3) → destination
- Frequency: A440 reference, C3=130.81 Hz upward
- Duration: 400ms with gain ramp-down
- Reuses existing AudioContext from audio pipeline
- iOS: must call audioCtx.resume() before creating oscillator

## Kill Melody Playback

playSuccessKill(notes): stagger each oscillator start by 0.15s
- osc.start(ctx.currentTime + 0.02 + i * 0.15)
- Includes delay/reverb chain per note
- **BUG (Phase 2A)**: Currently plays all notes simultaneously. Fix: offset per-note scheduling.

## Sound Engine (Phase 2B — planned)

New file: src/audio/soundEngine.js

Layers to generate (all via Web Audio API, no samples):
1. **Beat**: Kick/snare via short oscillator bursts + noise. 90 BPM base, +5 per wave.
2. **Bass**: Root note of detected chord, beats 1 and 3. Sine wave, low gain.
3. **Harmony**: Sustained pad following player's chord context. Saw wave, very low gain, slight detuning.
4. **Percussion**: Game-event-driven hits (kills, spawns, wave transitions).
5. **FX**: Mode switch clicks, resource gain tones, damage rumbles.

Integration: startSoundEngine(state), stopSoundEngine(), onGameEvent(type)

### Scheduling approach
- Use AudioContext.currentTime lookahead scheduling (100ms buffer)
- Schedule next bar of beats ahead of time
- Do NOT generate audio per-frame — schedule in batches
- CPU budget: < 5% on mid-range mobile

## MIDI Pipeline (Phase 2A+ — planned)

Web MIDI API → note-on/note-off → 100% accurate, near-zero latency.
Velocity (0-127) maps to unit strength multiplier.
Not yet implemented.

## Calibration

- "Tune Up" screen: play any open chord to set noise floor
- Noise floor stored in state.audio.noiseFloor
- Practice mode skips calibration
- Calibration state preserved across restarts

## Key Constraints

- Only ONE AudioContext in the entire app (reuse from capture pipeline)
- iOS Safari: AudioContext must be created/resumed inside user gesture handler
- Partial chord matches OK: reduced confidence, still valid
- Tuning tolerance: ±30 cents from expected frequency
- Debounce: 150ms minimum between chord change events
