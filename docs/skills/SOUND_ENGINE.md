# Sound Engine — Skill Definition

## Role
The Sound Engine owns everything the player hears: piano key tones, attack sound effects,
kill melodies, wave announcements, the end-of-level melody playback, and all Web Audio API
graph construction. It is also responsible for the microphone input pipeline (pitch/chord
detection) used when a real instrument is connected.

No visual code lives here. No state mutation. Sound is triggered by game events; this
engine just makes them audible.

---

## Pipeline Position

```
MINIGAME_ENGINE → tones, clicks, demo playback ──→ SOUND_ENGINE
COMPOSITION_ENGINE → melody data (notes[], durations[]) → SOUND_ENGINE → Web Audio playback
SOUND_ENGINE → mic pitch/chord detection → GAMEPLAY_ENGINE (accuracy scoring)
SOUND_ENGINE → note events → MINIGAME_ENGINE (input for minigame handlers)
```

### Connected engines

- [[MINIGAME_ENGINE]] — Minigames request tones (key presses), metronome clicks, and
  phrase demo playback. Each handler contains its own `_playTone()` using the same
  oscillator → gain → destination pattern.
- [[COMPOSITION_ENGINE]] — Generates `{ notes[], durations[] }` melodies;
  Sound Engine plays them via `playMelody()` in `melodyEngine.js`.
- [[GAMEPLAY_ENGINE]] — Mic-detected notes feed into the accuracy formula
  (`totalHits / totalMisses`). Detection quality directly affects star scoring.
- [[GRAPHICS_ENGINE]] — Visual feedback (key highlights, flash effects) must fire
  within 1 frame of the audio event — sync is critical for musical feel.
- [[AI_ENGINE]] — Convergence testing verifies audio latency, oscillator cleanup,
  mic detection accuracy (≥80%), and cross-browser compatibility.

---

## Inputs
| Input | Source | Description |
|-------|--------|-------------|
| `note` string | `keyboard.js` / `hud.js` | A note name like `'C3'`, `'F#3'` |
| `state.inputMode` | `game.js` | Current mode (summon / attack / charge) — affects which sound plays |
| `state.attackMisses` | `game.js` | Accumulated misses — used for accuracy-based feedback tones |
| `AudioContext` | `keyboard.js` init | Shared context; must be resumed on first user gesture |
| Microphone stream | `audio/capture.js` | Raw PCM for pitch/chord detection |

---

## Outputs
| Output | Description |
|--------|-------------|
| Key press tone | Short triangle/sine oscillator, frequency from `getNoteFreq(note)` |
| Kill melody | Staggered ascending phrase via `playSuccessKill(notes)` |
| Victory melody | Full procedural melody via `playMelody(melody)` from `melodyEngine.js` |
| Detected note/chord | `detectedChord` string, passed to game.js for musical input |
| Console logs | `[kill melody]`, `[dispatch]`, `[touch init]` — debug traces |

---

## Constraints
- **Web Audio API only** — no `<audio>` elements, no external audio libraries.
- **AudioContext must be created on a user gesture** — never auto-create on page load (iOS blocks it).
- **Each oscillator must be stopped** — leaked oscillators degrade performance on mobile.
  Always call `osc.stop(t + duration + 0.05)` after scheduling.
- **No allocations in the audio hot path** — pre-compute note frequencies; don't call
  `getNoteFreq()` from inside a running ScriptProcessorNode or AudioWorklet tick.
- **Kill melody stagger**: each note must be anchored to `ctx.currentTime` at schedule time:
  `osc.start(ctx.currentTime + 0.02 + i * 0.15)`. Do NOT batch-compute `t0` once and offset
  — Web Audio batching can collapse small offsets to the same sample frame.
- **Safari compatibility**: `AudioContext` → `webkitAudioContext` fallback must be present.
  `DelayNode`, `GainNode`, and `OscillatorNode` are safe cross-browser. `AudioWorklet` is NOT.
- **Mic pipeline is settled** — do not change confidence threshold (0.60), margin (0.15),
  debounce (0.5s), or chroma range (80–4000 Hz) without documenting the reason.

---

## Test criteria
- [ ] Piano key click/QWERTY press produces an audible tone within 20ms of input
- [ ] Kill melody plays as a clear ascending arpeggio (notes sequential, not simultaneous)
- [ ] Each kill melody note separated by ~0.15s — verify with `[kill melody] note N` console logs
- [ ] Victory melody plays from first note to last without cutting off
- [ ] No tone plays after scene change (oscillators cleaned up)
- [ ] Microphone detected notes appear in console within 200ms of playing
- [ ] No AudioContext error in console on first page load (no auto-resume)
- [ ] Safari: no `webkitAudioContext` deprecation warning or silent failure

---

## Convergence definition
The Sound Engine is **good enough** when:
1. Every player action produces distinct, appropriate audio feedback within one animation frame.
2. The kill melody is recognizably melodic (not a chord or noise burst).
3. Microphone input detection accuracy ≥ 80% for clean piano notes in a quiet room.
4. No audio-related console errors on Chrome or Safari (desktop and mobile).
5. No oscillator leaks detectable after 60 seconds of active play (check AudioContext state).
