# /gametest — Gameplay Test Pass

Run a full gameplay test pass against the live local build to verify that core mechanics
work end-to-end. This command is a checklist-driven manual + console verification,
not an automated test suite.

---

## Setup

1. Open `index.html` directly in Chrome **and** Safari (file:// or local HTTP server).
   ```
   # Quick local server (no install needed)
   python -m http.server 8080
   # Then open http://localhost:8080
   ```
2. Open DevTools → Console panel. Filter to `[` to show only ChordWars debug logs.
3. Clear localStorage to start from a clean state:
   ```js
   localStorage.clear(); location.reload();
   ```

---

## What to check

### Scene: TITLE
- [ ] Title screen renders without errors
- [ ] Settings overlay appears automatically (difficulty selector + note labels toggle)
- [ ] Gear button (⚙) opens SettingsUI panel
- [ ] Console shows `[settings] wired` on load

### Scene: INSTRUMENT_SELECT → Tutorial
- [ ] Clicking "Piano" advances to LEVEL_START for tutorial-1
- [ ] Tutorial-1 locks to ATTACK mode only (Space key does nothing)
- [ ] Tutorial overlay text is visible

### Scene: PLAYING (Tutorial-1)
- [ ] QWERTY keys H J K L ; ' Enter produce piano tones
- [ ] Clicking on-screen piano keys produces tones AND logs `[click] px=... note=...` in console
- [ ] Attack mode: playing notes deals damage to enemy base
- [ ] Accuracy counter does NOT degrade when no enemies are present (direct base attack)
- [ ] Enemy base HP decreases by a visible amount (~10% per clean hit)
- [ ] Victory triggers when enemy base HP reaches 0

### Scene: VICTORY
- [ ] Victory melody plays automatically (check for `[kill melody]` or melody console logs)
- [ ] "Play Again" and "World Map" buttons are immediately clickable (NOT disabled)
- [ ] 1–3 stars shown based on accuracy

### Tutorial sequence T1→T4
- [ ] T1 → T2 auto-advances to LEVEL_START(T2) after victory
- [ ] T2 (survival): all 3 waves spawn; win after all waves cleared
- [ ] T3: SUMMON mode unlocked; summon bar appears at top
- [ ] T4: charge attack required; enemy base invulnerable until first charge
- [ ] After T4 victory: `tutorialComplete = true` stored in localStorage; WORLD_MAP shown

### Scene: WORLD_MAP
- [ ] World map renders all nodes and connections
- [ ] tone-1, rhythm-1, theory-1, music-1 nodes appear UNLOCKED (no stars needed)
- [ ] Clicking a node shows its name / play button
- [ ] Camera drag works (mouse drag + touch drag)

### Scene: PLAYING (regular level)
- [ ] All 3 modes available (SUMMON, ATTACK, CHARGE)
- [ ] Mode border color changes with Space key / mode button tap (blue/red/amber)
- [ ] Enemy attack sequences display as pill cues above units
- [ ] 3+ enemies in the same lane produce stacked (non-overlapping) pill rows
- [ ] Kill melody plays when a unit is destroyed (ascending notes, not a chord)
- [ ] Summon bar shows "Play: C3 → E3 → G3" style prompt in SUMMON mode

---

## Pass criteria
All checkboxes above are checked. No console errors (red) during any step.

## Fail criteria
Any checkbox fails, OR any uncaught exception appears in console.
File a bug in the `## Known Bugs` table in CLAUDE.md with:
- Which checkbox failed
- Browser + OS
- Console error text (if any)
- Steps to reproduce
