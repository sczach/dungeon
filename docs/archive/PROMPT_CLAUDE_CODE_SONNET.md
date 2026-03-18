# CLAUDE CODE PROMPT — Phase 2A: Bug Crush & Core Polish

> **Status:** HISTORICAL — this prompt was already executed. Branch `claude/phase2a-bug-crush` merged.
> **Vault links:** [[PROJECT_HISTORY]] | `PHASE_2A_STRATEGY.md` (results) | [[WORKFLOW]] (prompt pattern)
> **Use as:** Reference for the single-prompt auto-accept pattern. Template for future sessions.

Paste this as your FIRST AND ONLY message in a new Claude Code session set to AUTO ACCEPT EDITS.

---

```
You are working on Chord Wars, a browser-based musical RTS game.
Repo: https://github.com/sczach/chordwars
Live: https://chordwars.vercel.app/
Stack: Vanilla JS, ES Modules, HTML5 Canvas, Web Audio API. No bundler, no framework.

## GIT RULES (NON-NEGOTIABLE)
- Create a branch: claude/phase2a-bug-crush
- Make all changes on that branch
- Push the branch and open a PR against master
- NEVER push to master directly

## TASK: Fix the top 9 gameplay-blocking bugs in priority order.

Before writing any code, READ the existing source files to understand current implementation.
After reading, fix each issue with minimal targeted changes.

### Bug 1: System Map Progression Broken
After completing tutorial levels, player cannot select The Crossroads or any non-tutorial region. The "Choose a Region" button stays grayed out.
- Find the region/level unlock logic and fix the condition that gates progression
- Tutorial completion should unlock the next region

### Bug 2: Enemy Base HP Too High  
Each player attack only removes ~1% of enemy base HP. Games take far too long.
- Find the enemy base maxHp or damage-per-hit values
- Reduce base HP or increase damage so games complete in 3-5 minutes
- A reasonable target: 15-25 successful attacks to destroy enemy base

### Bug 3: Swarming Enemies Unreadable
When 2+ enemies overlap, their kill melody cues stack and become impossible to read.
- Add visual separation: offset overlapping enemy cue displays vertically
- Consider a queue system: only show the cue for the NEAREST enemy, gray out others
- Increase minimum spacing between enemy units on spawn

### Bug 4: Input Mode Confusion
Players can't tell when notes register as kill strokes vs charge-up vs summon.
- Add clear visual mode indicator (large, center-screen): "SUMMON MODE" / "ATTACK MODE"
- Color-code the piano HUD border by mode (e.g., blue=summon, red=attack)
- Add brief flash/pulse when mode switches on Space press
- When a note is consumed by a system, show which system used it (small floating text)

### Bug 5: Victory Screen Buttons Blocked
"Play Again" and "World Map" buttons can't be pressed until victory song finishes.
- Make buttons active immediately on victory screen load
- Victory song plays in background but does NOT block interaction
- If victory song melody is prompted, make it clearly optional ("Play the victory melody for bonus XP!" or similar)

### Bug 6: Kill Melody Plays Simultaneously
All notes in a kill melody play at the same time instead of sequentially.
- In playSuccessKill (keyboard.js): stagger each oscillator start by 0.15s
- Use: osc.start(ctx.currentTime + 0.02 + i * 0.15)
- Add console.log for each note's scheduled time to verify

### Bug 7: Mouse/Touch Piano Keys Don't Work
Clicking or tapping the rendered piano keys on screen does nothing.
- Verify initPianoTouchInput is called during game bootstrap
- Ensure canvas click/touch events map to correct key positions
- dispatchNote must route to the active mode handler (tablature or attackSequence)
- Test: add console.log('[click] note: ' + note) in the click handler

### Bug 8: Settings Menu Not Appearing
Settings overlay does not show on the TITLE screen.
- Ensure wireSettingsUI(state) is called when scene === TITLE
- Check that the CSS shows the overlay (body[data-scene="title"] selector)
- Force display:block on the settings overlay element when TITLE is active
- Add console.log('[settings] wired') for verification

### Bug 9: No Summon Cues
In summon mode, there is no visual prompt telling the player what notes to play.
- When state.inputMode === 'summon', display the current tablature sequence prominently
- Show it in the top-center of the screen with large note labels
- Use similar visual style to the kill cues but bigger and in a distinct color (blue/green)
- Sequence should be clearly readable: "Play: C3 → E3 → G3"

## APPROACH
1. First: git checkout -b claude/phase2a-bug-crush
2. Read the relevant source files (game.js, renderer.js, keyboard.js, hud.js, screens.js, tablature.js, attackSequence.js, base.js, constants.js)
3. Fix bugs in priority order (1 through 9)
4. After each fix, briefly note what you changed
5. Commit with descriptive message
6. Push branch and tell me to create the PR

## CONSTRAINTS
- Vanilla JS ES modules only
- renderer.js must remain pure (only draw, never mutate state)
- game.js owns all mutable state
- Handle iOS Safari AudioContext (call resume() on user gesture)
- Do NOT restructure the architecture — targeted fixes only
- Do NOT add new libraries or dependencies
- Add console.log debugging for bugs 6, 7, 8 so Duncan can verify in browser console
```
