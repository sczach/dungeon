# /audiotest — Audio Pipeline Test Pass

Verify that all audio systems (keyboard tones, kill melody, victory melody, and microphone
pitch detection) work correctly across Chrome and Safari. Audio bugs are often
browser-specific — always test both.

---

## Setup

1. Open `index.html` in Chrome. Open DevTools → Console, filter to `[`.
2. Ensure your system volume is audible (not muted).
3. For microphone tests: use a real instrument or hum into the mic; grant mic permissions
   when the browser prompts.

---

## Test 1: Piano key tones (keyboard + click)

**QWERTY test:**
1. Navigate to PLAYING (tutorial-1 or any level).
2. Press H, J, K, L, ;, ', Enter in sequence.
- [ ] Each key produces a distinct, audible tone
- [ ] Tones are short (< 0.3s) and don't overlap/sustain indefinitely
- [ ] No AudioContext error in console

**On-screen piano click test:**
1. Click each white key on the on-screen piano.
- [ ] Each click produces an audible tone
- [ ] Console shows `[click] px=... py=... note=C3` (or correct note) for each click
- [ ] `note=null` should NOT appear for clicks on valid piano keys

**Black key test:**
1. Press U, I, O, P, [ (black key shortcuts).
- [ ] Each produces a distinct, higher-pitched tone
- [ ] Click on black keys also produces tones (harder to hit — verify geometry)

---

## Test 2: Kill melody (enemy death)

1. In PLAYING mode, destroy an enemy unit.
- [ ] A short melodic phrase plays (3–5 notes, clearly sequential)
- [ ] Console shows `[kill melody] phrase: [C3, E3, G3]` (or similar notes)
- [ ] Console shows `[kill melody] note 0: C3 ... scheduled @ ctx.currentTime+0.020s`
- [ ] Console shows `[kill melody] note 1: ... scheduled @ ctx.currentTime+0.170s` (0.15s offset)
- [ ] Notes are audibly staggered — NOT a simultaneous chord
- [ ] Melody completes cleanly without clicking or cutoff

**Rapid-kill test:**
1. Kill 3 enemies in quick succession (< 1s apart).
- [ ] Each kill triggers its own melody
- [ ] Melodies overlap gracefully (no audio glitches)
- [ ] No `AudioContext closed` or `InvalidStateError` in console

---

## Test 3: Victory melody

1. Win any level.
- [ ] An ascending/descending melody plays on the VICTORY screen
- [ ] Melody is 4–8 notes long
- [ ] Melody plays once and stops (no loop)
- [ ] "Play Again" and "World Map" buttons are clickable BEFORE melody ends
- [ ] If scene changes before melody ends (e.g. clicking Play Again quickly), melody stops

---

## Test 4: Safari-specific checks

Repeat Test 1 and Test 2 in Safari (desktop):
- [ ] No `webkitAudioContext` console warning
- [ ] Tones play on first keypress (no silent first note due to suspended AudioContext)
- [ ] Kill melody plays correctly (Safari Web Audio scheduling can differ)
- [ ] No `NotAllowedError` for AudioContext auto-play

---

## Test 5: Microphone input (if mic available)

1. Navigate to CALIBRATION or PLAYING with microphone enabled.
2. Play or hum a clear C note into the microphone.
- [ ] Console shows detected note/chord within 200ms
- [ ] Confidence value ≥ 0.60 for a clean input
- [ ] No crash or freezing when mic permission is denied

---

## Pass criteria
All checkboxes above are checked. No audio-related console errors on Chrome or Safari.

## Fail criteria
Any silent key, simultaneous kill melody notes, clipped audio, or console AudioContext error.
File a bug with:
- Test number and step that failed
- Browser + OS
- Exact console error text
- Whether the issue is Chrome-only, Safari-only, or both
