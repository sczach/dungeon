# Audio Pipeline — Chord Wars

> Architecture is SETTLED. Do not change the pipeline structure.

## Status

Partially working. The pipeline code is syntactically correct as of 2026-03-17. Piano mic
detection has not yet been confirmed working on a real device after the 2026-03-17 fixes.
Desktop keyboard/touch input works correctly.

## Flow

```
Mic → getUserMedia → AudioContext → AnalyserNode
                                        │
                    ┌───────────────────┤
                    ▼                   ▼
              timeDomain           freqDomain
                    │                   │
                    ▼                   ├──────────────┐
                  RMS                   ▼              ▼
                    │             YIN pitch      chromagram
                    ▼                   │              │
              noiseGate                 ▼              ▼
              (floor×1.2)       freqToNoteName    matchChord
                    │                   │              │
                    ▼                   ▼              ▼
              gate pass?        detectedNote    detectedChord
                    │           pitchStable     + confidence
                    └───────────────────┘
                              ▼
                    state.audio.* fields
                              ▼
                    game.js mic-bridge (lines ~1121-1134)
                              ▼
                    keyboardInput.dispatchNote(note)
                              ▼
                    tablature / cueSystem / attackSequence
```

## Key Settled Values

| Parameter | Value | Notes |
|-----------|-------|-------|
| FFT_SIZE | 2048 | analyzer.js |
| SMOOTHING | 0.80 | analyzer.js |
| MIN_DECIBELS | -90 dB | analyzer.js |
| MAX_DECIBELS | -10 dB | analyzer.js |
| Noise gate multiplier | **1.2** | was 1.5 — lowered 2026-03-17 for piano |
| Effective floor min | **0.001** | `Math.max(noiseFloor, 0.001)` — prevents zero-calibration lockout |
| CONFIDENCE_THRESHOLD | 0.60 | chords.js — chord match must exceed this |
| MARGIN | 0.15 | chords.js — winner must beat runner-up by this |
| HOLD_FRAMES | 4 | index.js — chord debounce |
| FADE_RATE | 0.04/frame | index.js — confidence decay per frame |
| STABLE_FRAMES | 6 | index.js — ~100 ms at 60 fps before pitchStable=true |
| YIN_THRESHOLD | 0.10 | pitch.js |
| MIN_FREQ | 60 Hz | pitch.js |
| MAX_FREQ | 1050 Hz | pitch.js |
| CHROMA_MIN_FREQ | 80 Hz | chords.js |
| CHROMA_MAX_FREQ | 4000 Hz | chords.js |
| SPAWN_DEBOUNCE | 0.5 s | prompts.js |

## Piano Mode Bridge

Chord matching (chromagram cosine similarity) is designed for multi-harmonic chord
templates. Single piano notes never score above 0.60 against any chord template.

**Fix (2026-03-17):** In `updateAudio()`, after pitchStable is set:

```javascript
if (state.audio.detectedNote && state.audio.pitchStable) {
  state.audio.detectedChord = state.audio.detectedNote;
  state.audio.confidence    = 0.85;
}
```

This populates `detectedChord` with the note name so the debug overlay shows activity.
The `game.js` mic-bridge reads `detectedNote` + `pitchStable` directly (not `detectedChord`),
so the actual note dispatch to game systems was already correct.

## Module-Level Variables (MUST be retained — GC kills pipeline if local)

| Variable | Type | Purpose |
|----------|------|---------|
| `_audioCtx` | AudioContext | Keeps context alive |
| `_analyser` | AnalyserNode | Keeps analyser alive |
| `_sourceNode` | MediaStreamSourceNode | **CRITICAL** — must be module-level; local var is GC'd, silently disconnects mic |

## AudioContext Resume Strategy

On mobile, AudioContext is frequently suspended between user gestures. Strategy:

1. `startCapture()` — called inside user gesture (button click), creates context
2. `unlockAudioContext(ctx)` — wires one-shot touchend/click to resume
3. `wireButtons()` — `btn-calibration-done` click calls `resumeAudioContext()` before `startGame()`
4. `updateAudio()` — attempts `_audioCtx.resume()` every frame when suspended (no early return)
5. Canvas `touchstart` listener — kicks `resumeAudioContext()` during PLAYING

**Key rule:** `updateAudio()` does NOT return early on suspended state — the analyser
retains its last buffer so reading continues even while context resumes.

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `audio/capture.js` | ~133 | getUserMedia, AudioContext create/resume/stop |
| `audio/analyzer.js` | ~169 | AnalyserNode, FFT, RMS, noise gate |
| `audio/pitch.js` | ~154 | YIN pitch detection |
| `audio/chords.js` | ~176 | Chromagram + cosine-similarity chord matching |
| `audio/index.js` | ~330 | Orchestrator: startCapture, updateAudio, updateCalibration |
| `audio/melodyEngine.js` | ~401 | Procedural melody generation + Web Audio playback |
| `audio/soundEngine.js` | ~562 | Beat/bass generator + event SFX |

## Debug Overlay

Toggle with backtick `` ` `` key during PLAYING scene. Displays in top-left:

```
AudioCtx: [running/suspended/none]
RMS:      [current amplitude]
Floor:    [noiseFloor from calibration]
Note:     [detectedNote — e.g. E3]
Chord:    [detectedChord — mirrors Note for piano]
Conf:     [confidence 0–1]
Stable:   [pitchStable true/false]
```

Use this to diagnose which layer is failing:
- `ctx: suspended` → AudioContext not resumed → fix: user gesture needed
- `rms: 0.0000` → no signal reaching analyser → check mic permission / sourceNode
- `note: —` with RMS present → pitch detection failing or noise gate blocking
- `note: E3` but no cue advance → game.js mic-bridge or tablature issue

## Known Issues

- Piano mic detection not yet confirmed working on real device (as of 2026-03-17)
- Chord matching never fires for piano (by design — single notes don't match chord templates)
- `updateCalibration()` still has `_audioCtx?.state !== 'running'` early return (intentional —
  calibration legitimately requires a running context)

## iOS/Android Gotchas

1. AudioContext MUST be created inside user gesture handler
2. `resume()` must be called on every user gesture — context suspends aggressively on mobile
3. `getUserMedia` requires HTTPS
4. Safari ≤16 has quirks with AudioContext lifecycle
5. Some Android devices deliver 48000 Hz even when 44100 was requested — use `audioCtx.sampleRate`

## See Also

- [[INPUT_SYSTEM]] — How keyboard/touch notes feed into state alongside mic
- [[STATE]] — `state.audio.*` field reference
- `docs/skills/SOUND_ENGINE.md` — Constraints and settled decisions
