# ChordWars Input System

> All input routes through `keyboard.js:_handleNote()`. Mic, keyboard, touch, and MIDI all converge there.

## Input Sources

```
QWERTY keyboard ──┐
                   ├──→ KeyboardInput._handleNote(note, state)
Touch/click piano ─┤         │
                   │         ├── tablature.onNote (summon mode)
MIDI controller ───┘         ├── attackSeq.onNote (attack mode)
                             ├── cue.onNote (always)
Microphone ─── audio pipeline ─── state.audio.detectedNote
                                  (bridge in game.js update)
```

## keyboard.js (353 lines)

**Exports:** `KeyboardInput` class, `keyboardInput` singleton, `playSuccessKill(notes)`

### Key Map (QWERTY → Note)

| Key | Note | Key | Note |
|-----|------|-----|------|
| H | C3 | U | C#3 |
| J | D3 | I | D#3 |
| K | E3 | O | F#3 |
| L | F3 | P | G#3 |
| ; | G3 | [ | A#3 |
| ' | A3 | | |
| Enter | B3 | | |

### Mode Cycling (Space Bar)

- Cycles through `state.allowedModes ?? ['summon', 'attack', 'charge']`
- Tutorial levels restrict modes via `allowedModes` array
- Refreshes tablature when entering summon mode
- Resets `attackMisses` when entering attack mode
- Fires `onGameEvent('modeSwitch')`

### Charge Mechanic

1. `keydown` in charge mode → sets `state.chargeNote`, `state.chargeStartTime`
2. `game.js update()` increments `state.chargeProgress` each frame
3. `keyup` when `chargeProgress >= 1.0` → calls `attackSeq.fireChargedAttack(level, note, state)`
4. `level = Math.min(3, Math.floor(chargeProgress))` — longer hold = stronger attack

### _handleNote(note, state) Flow

1. Sets `state.audio.detectedChord = note`, `confidence = 0.95` (keyboard acts as perfect detection)
2. Sets `state.noteDisplay = {note, time}` for visual feedback
3. Plays tone via AudioContext oscillator
4. Routes to subsystem based on `state.inputMode`:
   - `'summon'` → `tablature.onNote(note, state)`
   - `'attack'` → `attackSeq.onNote(note, state)`
5. Always calls `cue.onNote(note, state)` for cue rewards
6. Adds note to `state.input.pressedKeys` for 150ms (visual highlight)

### playSuccessKill(notes)

- Plays ascending note sequence with delay reverb
- Triangle oscillator, 0.15s between notes, 0.12s per note
- Pads to minimum 4 notes
- Called when enemy is killed by completing attack sequence

## midi.js (113 lines)

**Exports:** `MidiInput` class, `midiInput` singleton

- All MIDI notes folded to C3 octave: `CHROMATIC[midiNote % 12] + '3'`
- Any MIDI keyboard octave works identically
- Velocity < 10 = note-off (ignored)
- Only note-on messages (0x9n) processed
- Auto re-wires on device state change
- `onNote` callback connects to `keyboardInput.dispatchNote`

## hud.js Touch Input (initPianoTouchInput)

- Wires `click` and `touchstart` (passive: false) on the game canvas
- `getKeyAtPoint(px, py, W, H)` — hit-tests white and black piano keys
- `getModeButtonAtPoint(px, py, W, H)` — hit-tests SUMMON/ATTACK/CHARGE buttons
- Piano touch calls `onNote(noteName)` → routes to `keyboardInput.dispatchNote`
- Mode button touch calls `onModeToggle(modeName)` → sets `state.inputMode`

### Piano Layout

- 7 white keys (C3–B3) + 5 black keys (sharps)
- `PIANO_W = W < 600 ? W*0.90 : W*0.50` (wider on mobile)
- `PIANO_H = 88px`
- Mode buttons: `MODE_BTN_H = 48px`, positioned above piano

## Mic → Game Bridge (game.js update)

During PLAYING, `game.js` bridges mic detection to the game:
1. `updateAudio(state, dt)` runs the audio pipeline
2. If `state.audio.detectedNote` is set and `pitchStable`:
   - Routes to tablature or attack sequence (same as keyboard)
   - This is the "instrument as controller" path

## See Also

- [[AUDIO_PIPELINE]] — How mic audio becomes detected notes
- [[GAME_SYSTEMS]] — Tablature and attack sequence subsystems
- [[STATE]] — `state.input.*`, `state.inputMode`, `state.chargeProgress`
