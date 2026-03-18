# Claude Code: Fix Critical Playtest Blockers
**Session:** Mobile & Audio Input Fixes
**Priority:** CRITICAL — blocks Phase 2A sound engine work

> **Current Status:** HISTORICAL — these bugs were from a real-device playtest (Sequential Pro 3, Android). Some overlap with Phase 2A bugs, all now fixed.
> **Vault links:** [[PROJECT_HISTORY]] | `PHASE_2A_STRATEGY.md` | [[INPUT_SYSTEM]]
> **Context:** Duncan playtested on mobile with Sequential Pro 3 — this was the first real-world test session.
**Based on:** Duncan's playtest results from PLAYTEST_CHECKLIST.md

---

## What's Broken (From Playtest)

1. **Mobile layout:** Start button off-screen on Android phone (portrait/landscape)
2. **MIDI input:** Sequential Pro 3 tones not registering in game
3. **Note display:** Shows up and disappears too fast, not "guitar hero" style (persistent, centered)
4. **Level 2 (Attack mode):** Keystroke detection unreliable (button mashing needed)
5. **Victory screen navigation:** "Play again" is highlighted, should be "Next" → world map
6. **Enemy base destruction:** No visual feedback when base is destroyed (animation missing)

---

## Constraints & Requirements

- **Mobile first:** All fixes must work on Android phone (portrait + landscape)
- **Canvas-aware:** Fixes must account for `devicePixelRatio` (high-DPI displays)
- **No breaking changes:** Keep existing game loop, audio pipeline, state management
- **Testing:** Each fix must be verified on device before merge
- **Branch + PR:** Never push to master; create `fix/mobile-layout`, `fix/midi-input`, etc.

---

## Files to Check/Modify

| File | Issue | Action |
|------|-------|--------|
| `index.html` | Start button off-screen | Check viewport meta, CSS sizing |
| `src/renderer.js` | Note display too fast | Extend duration, center on canvas |
| `src/ui/screens.js` | Victory screen flow | Swap button focus: "Next" primary, "Play again" secondary |
| `src/audio/index.js` | MIDI tones not detected | Debug: is Web MIDI API connecting? Is input being read? |
| `src/input/keyboard.js` | Keystrokes unreliable in attack mode | Check: debounce, event listener attachment, state sync |
| `src/systems/base.js` or `src/renderer.js` | No base destruction animation | Add visual feedback (flash, shake, dissolve effect) |

---

## Priority: Highest First

### **PRIORITY 1: Mobile Layout (Start Button)**

**Symptom:** Duncan can't tap start button on Android phone — it's off-screen

**Debug steps:**
1. Check `index.html` meta viewport tag: `<meta name="viewport" content="width=device-width, initial-scale=1">`
2. Check `style.css`: is canvas 100vw/100vh? Are overlay divs constrained?
3. Check `src/ui/screens.js` (title screen): button positioning, padding, font size
4. **Hypothesis:** Canvas sized to full viewport, but overlay buttons sized for desktop

**Fix approach:**
- Ensure buttons use `width: 100%` or max-width constraints
- Add `max-width: 95vw` to buttons so they never overflow on mobile
- Test on portrait AND landscape (viewport changes)
- Measure button tap target: must be ≥44px tall (mobile touch standard)

**Verify on:** Android phone, both orientations

---

### **PRIORITY 2: MIDI Input Not Working**

**Symptom:** Sequential Pro 3 connected, but game doesn't detect tones

**Debug steps:**
1. Open browser console on desktop (where MIDI is connected)
2. Check: Does Web MIDI API request permission? (should see browser prompt)
3. Check: Are MIDI inputs enumerated? (log `navigator.requestMIDIAccess()` result)
4. Check: `src/input/midi.js` — is it being called from game loop?
5. **Hypothesis:** MIDI initialization missing or not called on startup

**Fix approach:**
- Add MIDI init to title screen or calibration screen (user gesture required for Web MIDI)
- Log all MIDI events to console (note-on, note-off)
- Map MIDI note numbers to game notes (e.g., MIDI 60 = C4)
- Test with Sequential Pro 3 in two modes: (a) real MIDI out, (b) keyboard mode

**Verify on:** Desktop with Sequential Pro 3 connected

---

### **PRIORITY 3: Note Display (Guitar Hero Style)**

**Symptom:** Note display appears and vanishes instantly; not persistent enough to read

**Current behavior:** Note appears briefly when detected, disappears  
**Desired behavior:** Note stays center-screen for 0.5–1.0 second, large and readable

**Fix approach:**
- Find where note display is rendered (likely `src/renderer.js` or `src/ui/hud.js`)
- Extend display duration: `displayTime = 1.0s` (not 0.3s)
- Increase font size: `font-size: 72px` or larger (goal: read from 1 meter away)
- Center on canvas: `x = canvas.width / 2`, `y = canvas.height * 0.3` (upper third)
- Add fade-out animation: keep text visible for 0.8s, fade out over 0.2s (don't snap away)

**Verify on:** Phone + Sequential Pro 3, or desktop with test audio

---

### **PRIORITY 4: Keystroke Detection in Attack Mode (Level 2)**

**Symptom:** Duncan has to "button mash" to register keystrokes; lightning bolts don't fire reliably

**Debug steps:**
1. Check `src/input/keyboard.js`: Are key-down events firing on every press?
2. Check: Is there a debounce that's too aggressive? (e.g., 500ms prevents rapid-fire)
3. Check: Does attack mode use a different input handler than summon mode?
4. **Hypothesis:** Attack mode has input debounce blocking rapid keypresses

**Fix approach:**
- If debounce exists in attack mode, reduce it: `100ms` instead of `500ms`
- Or: use `keydown` event (fires repeatedly while held) instead of `keyup`
- Verify: each keystroke increments attack counter immediately
- Log keystroke timing to console to measure actual latency

**Verify on:** Desktop with QWERTY, typing fast

---

### **PRIORITY 5: Victory Screen Navigation (Button Focus)**

**Symptom:** Victory screen shows "Play again" as highlighted button; should be "Next"

**Fix approach:**
- In `src/ui/screens.js` (victory screen), find button definitions
- Swap order OR swap primary/secondary styling:
  - "Next" button: `primary={true}` (bright, highlighted)
  - "Play again" button: secondary style
- Verify button click handlers:
  - "Next" → advance to next level/world map
  - "Play again" → restart same level

**Verify on:** Desktop or phone after winning

---

### **PRIORITY 6: Enemy Base Destruction Animation**

**Symptom:** Base health reaches 0, but no visual feedback (no explosion, no animation)

**Current:** Base disappears or freezes  
**Desired:** Flash, shake, particle effect, or dissolve

**Fix approach:**
- Find where base is destroyed (likely `src/systems/base.js` or `src/renderer.js`)
- Add animation trigger: `base.destroying = true` (flag)
- In renderer, check flag and draw destruction effect:
  - Flash: draw white rect with fading opacity 3–4 times per second
  - Shake: offset canvas drawing by 5–10px randomly for 0.5s
  - Or: dissolve: scale base down + fade out over 0.5s
- Play sound effect on destruction (use FX layer from audio pipeline)

**Verify on:** Complete a level and watch base destruction

---

## Testing Checklist (Per Fix)

For each fix, before creating PR:

- [ ] Fix implemented and compiles
- [ ] Tested on desktop (Chrome DevTools mobile emulation)
- [ ] Tested on real Android phone (landscape + portrait)
- [ ] Verified: no FPS drops
- [ ] Verified: no console errors
- [ ] Verified: fix doesn't break other functionality
- [ ] Created PR with clear description
- [ ] Duncan tested on device, gave approval

---

## Session Structure

**Recommend breaking into 2 sessions:**

### **Session A (90 min): Mobile Layout + MIDI Input**
- Priority 1: Mobile layout (start button)
- Priority 2: MIDI input detection
- Quick: Log diagnostic output for Duncan to verify

### **Session B (60 min): Display + Input + Animation**
- Priority 3: Note display (guitar hero style)
- Priority 4: Keystroke detection in attack mode
- Priority 5: Victory button focus
- Priority 6: Base destruction animation

---

## What Duncan Needs to Do

1. **Before next session:**
   - Connect Sequential Pro 3 to computer
   - Have Android phone ready for testing
   - Open browser DevTools console (to read diagnostic logs)

2. **After Session A (Mobile Layout + MIDI):**
   - Test start button on Android phone (both orientations)
   - Test MIDI input: play notes on synth, watch console for "MIDI note received"
   - Report back: "Works" or "Still broken because..."

3. **After Session B:**
   - Test note display: play MIDI, verify note stays on screen 0.8–1.0s
   - Test attack mode keystroke: rapid keystrokes, verify lightning bolts fire
   - Test victory screen: beat level, check "Next" button is highlighted
   - Test base destruction: watch for animation on win

---

## Prompt for Claude Code

```
Session: Fix Critical Playtest Blockers

Duncan ran a mobile playtest and found 6 critical issues:
1. Start button off-screen on Android phone
2. MIDI input (Sequential Pro 3) not detected
3. Note display too fast (should be like Guitar Hero — persistent, centered)
4. Keystroke detection unreliable in attack mode (level 2)
5. Victory screen: "Play again" highlighted, should be "Next"
6. Enemy base destruction: no animation feedback

CONSTRAINTS:
- Mobile first (Android phone, landscape + portrait)
- High-DPI canvas aware (devicePixelRatio)
- No breaking changes to game loop or audio
- Test on device before merging
- Branch + PR workflow

PRIORITY ORDER:
1. Mobile layout (start button visible on phone)
2. MIDI input (Web MIDI API working)
3. Note display (large, centered, 0.8–1.0s duration)
4. Keystroke detection (attack mode, reduce debounce)
5. Victory button focus ("Next" primary, "Play again" secondary)
6. Base destruction animation (flash, shake, or dissolve)

FILES TO MODIFY:
- index.html (viewport meta, CSS)
- src/renderer.js (note display, base destruction animation)
- src/ui/screens.js (victory button order)
- src/input/keyboard.js or src/input/midi.js (MIDI/keystroke detection)
- src/systems/base.js (destruction logic)

TESTING:
- Desktop Chrome DevTools mobile emulation
- Real Android phone (portrait + landscape)
- Sequential Pro 3 connected
- Verify no FPS drops, no console errors

START WITH PRIORITY 1 (mobile layout). After confirming Duncan can see the start button on his phone, move to PRIORITY 2 (MIDI input).

Debug by logging to console. Duncan will read the logs and report back.
```

---

## Quick Wins (After Main Fixes)

- [ ] Add console log when MIDI input is detected: "MIDI note: C4"
- [ ] Add console log when keystroke fires in attack mode: "Attack! note-on: E4"
- [ ] Add console log for note display: "Showing note C for 1.0s"
- [ ] Color-code buttons on victory screen (Next = bright gold, Play again = muted)

---

## Expected Outcome

**After both sessions:**
- ✅ Duncan can start game on mobile
- ✅ MIDI input detected and working
- ✅ Note display persists (readable, Guitar Hero style)
- ✅ Keystroke detection reliable in attack mode
- ✅ Victory screen flow fixed (Next → World map)
- ✅ Base destruction looks satisfying
- ✅ Ready to start Phase 2A sound engine work

**Blockers removed.** Phase 2A can proceed.
