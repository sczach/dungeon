# Composition Engine — Skill Definition

## Role
The Composition Engine owns the musical arc of each level: procedural melody generation,
melody playback at victory, and the rules that make the generated melody feel like a
coherent phrase rather than random notes. It is also responsible for ensuring that the
notes the player plays during a level contribute meaningfully to the melody that plays
at the end — the level's "musical memory."

This engine bridges the gap between game mechanics (which notes the player hit) and
music theory (what makes a sequence of notes sound good together).

---

## Inputs
| Input | Source | Description |
|-------|--------|-------------|
| `level.id` | `data/levels.js` | Determines key center and allowed note pool for the melody |
| `tablature.hitNotes[]` | `tablature.js` | Notes the player successfully played this run |
| `state.score` | `game.js` | Final score — influences melody complexity/length |
| `AudioContext` | `keyboard.js` | Shared Web Audio context for melody playback |
| `generateMelody(options)` | `audio/melodyEngine.js` | Generates a `{notes[], durations[]}` phrase |
| `playMelody(melody)` | `audio/melodyEngine.js` | Schedules and plays the phrase; returns a Promise |
| `stopMelody()` | `audio/melodyEngine.js` | Cancels in-progress melody (e.g. on scene change) |

---

## Outputs
| Output | Description |
|--------|-------------|
| `melody` object | `{ notes: string[], durations: number[] }` — playable phrase |
| Melody playback | Audible ascending/descending phrase with musical envelope (attack/decay) |
| Victory status text | Optional status line update ("✓ Melody complete") after playback Promise resolves |

---

## Constraints
- **Melody is cosmetic, not a gate.** Buttons and navigation must never be blocked waiting
  for `playMelody()` to resolve. Fire-and-forget with `.then()` for status text only.
- **`stopMelody()` must be called on scene change** to prevent melody bleed into other scenes
  (e.g. melody continuing while DEFEAT screen shows).
- **Melody must be diatonic** — notes must belong to the current level's key signature.
  No chromatic passing tones unless explicitly designed (future feature).
- **Phrase length**: 4–8 notes. Shorter feels incomplete; longer exceeds player attention
  on a victory screen.
- **No loops** — melody plays once and stops. Looping after victory is disorienting.
- **Performance**: melody scheduling must complete synchronously before the first note fires.
  `AudioContext.currentTime` drift is acceptable but must not cause audible gaps > 20ms.
- **Volume ceiling**: melody gain must not exceed 0.4 to avoid clipping over system audio.
  Use a `GainNode` master bus with peak at 0.35.

---

## Test criteria
- [ ] Victory melody plays automatically after every win without user interaction
- [ ] Melody does not block the "Play Again" or "World Map" buttons (they are clickable immediately)
- [ ] Melody stops playing when the scene changes (no audio bleed)
- [ ] Generated melody sounds diatonic (no obviously "wrong" notes for the level's key)
- [ ] Melody is 4–8 notes in length
- [ ] Status text updates to "✓ Melody complete" after playback finishes
- [ ] No AudioContext error in console during melody playback
- [ ] Melody sounds different on repeat plays of the same level (procedural variation)

---

## Convergence definition
The Composition Engine is **good enough** when:
1. Every level ends with a recognizably musical phrase that feels like a reward, not a
   random noise burst.
2. A player who replays the same level hears a different (but still musical) melody each time.
3. The melody never interferes with navigation — buttons always respond immediately.
4. Players describe the end-of-level melody as "satisfying" or "musical" in playtesting.
5. The melody engine adds no perceptible latency to the VICTORY scene transition.
