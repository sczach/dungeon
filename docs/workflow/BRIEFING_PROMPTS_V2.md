# Chord Wars — Briefing Prompts (Phase 2+)

> **Status:** Active — Phase 2A section is historical (executed). Phase 2B–2D prompts ready to use.
> **Vault links:** [[WORKFLOW]] | [[ROADMAP]] | `DEVELOPMENT_WORKFLOW_V2.md` | [[PROJECT_HISTORY]]
> **Phase 2A prompt:** Already executed — see `PROMPT_CLAUDE_CODE_SONNET.md` and `PHASE_2A_STRATEGY.md`

## How Claude Code Sessions Work Now

**Old workflow** (Phase 1): Two-step plan-mode / auto-accept dance, pasting condensed instructions + git rules + task. This was fragile — Claude Code would hallucinate git state, skip fixes, or generate code before reading the codebase.

**New workflow** (Phase 2+): Single prompt per session. Auto-accept mode from the start. The prompt tells the agent to READ files first, THEN make changes. CLAUDE.md lives in the repo root and provides ongoing context.

**Agent-tuning workflow** (for engines): Write a skill → have the agent run it → watch it fail → walk through failures → edit the skill → repeat until stable.

---

## Standard Claude Code Prompt Template

```
You are working on Chord Wars, a browser-based musical RTS game.
Repo: https://github.com/sczach/chordwars
Live: https://chordwars.vercel.app/
Stack: Vanilla JS, ES Modules, HTML5 Canvas, Web Audio API. No bundler, no framework.

## GIT RULES (NON-NEGOTIABLE)
- Create a branch: claude/[SHORT-DESCRIPTION]
- Make all changes on that branch
- Push the branch and open a PR against master
- NEVER push to master directly

## CONTEXT
Read CLAUDE.md in the repo root for full project state, known bugs, and architecture rules.
Read the relevant source files BEFORE writing any code.

## TASK
[DESCRIBE WHAT TO BUILD OR FIX]

## CONSTRAINTS
- Vanilla JS ES modules only
- renderer.js must remain pure (only draw, never mutate state)
- game.js owns all mutable state
- Handle iOS Safari AudioContext (call resume() on user gesture)
- Do NOT restructure architecture — targeted changes only
- Do NOT add libraries or dependencies
- Add console.log for key events so Duncan can verify in browser
```

---

## Phase 2A — Bug Crush (CURRENT)

Use `PROMPT_CLAUDE_CODE_SONNET.md` as-is. It covers all 9 priority bugs.

---

## Phase 2B — Sound Engine

```
You are working on Chord Wars.
Repo: https://github.com/sczach/chordwars
Branch: claude/sound-engine-v1

## GIT RULES
- Create branch, push, open PR against master. Never push to master.

## CONTEXT
Read CLAUDE.md and docs/skills/SOUND_ENGINE.md for full specifications.

## TASK: Build the Sound Engine foundation

Create src/audio/soundEngine.js that generates musical backing layers during gameplay:

1. BEAT GENERATOR
   - Simple kick/snare pattern using OscillatorNode + GainNode (no samples)
   - Tempo tied to game state: 90 BPM base, +5 BPM per wave
   - Scheduled via AudioContext.currentTime lookahead (100ms buffer)
   - Starts on PLAYING scene, stops on VICTORY/DEFEAT

2. BASS GENERATOR  
   - Root note of the last detected chord (or C3 default)
   - Plays on beat 1 and 3 of each bar
   - Sine wave, low gain (0.15), short decay

3. EVENT SOUNDS
   - Kill: short pitched percussion hit (noise burst + bandpass filter)
   - Spawn: rising tone sweep (100ms)
   - Mode switch: distinct click/pop
   - Damage taken: low rumble (50Hz, 200ms)

4. INTEGRATION
   - Export startSoundEngine(state), stopSoundEngine(), onGameEvent(type)
   - Call from game.js at appropriate state transitions
   - Reuse existing AudioContext from audio pipeline

## CONSTRAINTS
- Web Audio API only — no audio file loading for MVP
- Reuse existing AudioContext (never create a second one)
- CPU budget: keep scheduling efficient, no per-frame synthesis
- Must work on iOS Safari (AudioContext resume on gesture)
- renderer.js remains pure
```

---

## Phase 2C — System Map Fix + Expansion

```
You are working on Chord Wars.
Repo: https://github.com/sczach/chordwars
Branch: claude/system-map-fix

## GIT RULES
- Create branch, push, open PR against master. Never push to master.

## TASK: Fix system map progression and add region unlocking

1. DIAGNOSE: Read the system map / level selection code. Find why "Choose a Region" stays grayed out after tutorial completion.

2. FIX UNLOCK LOGIC: Tutorial completion should unlock The Crossroads region. Check:
   - Is tutorial completion state being saved correctly?
   - Is the unlock condition checking the right flag?
   - Is the button enable/disable logic wired to the unlock state?

3. ZOOM: Allow zooming out further on the system map to see all regions at once. Current max zoom-out is too close.

4. REGION DATA: Ensure each region has:
   - Name, description, difficulty rating
   - List of levels within the region
   - Unlock condition (which previous region must be completed)
   - Visual state: locked (grayed) / unlocked (highlighted) / completed (starred)

## CONSTRAINTS
- Do NOT rebuild the entire system map — fix the existing implementation
- Preserve all existing level data and tutorial flow
- Add console.log for unlock state transitions
```

---

## Phase 2D — First Minigame

```
You are working on Chord Wars.
Repo: https://github.com/sczach/chordwars
Branch: claude/minigame-arpeggio-challenge

## GIT RULES
- Create branch, push, open PR against master. Never push to master.

## TASK: Build the Arpeggio Speed Challenge minigame

Create src/minigames/arpeggioChallenge.js:

1. CONCEPT: Notes scroll down the screen (guitar-hero style). Player must hit them in time using piano keys. Accuracy and speed build a "power meter." At meter thresholds, the screen shakes and visual effects intensify.

2. GAMEPLAY:
   - 60-second round
   - Notes descend at increasing speed
   - Hit window: ±150ms = perfect, ±300ms = good, miss = combo break
   - Power meter: fills on hits, drains on misses
   - At 50% meter: mild screen shake + bass boost
   - At 80% meter: heavy shake + visual distortion + score multiplier 2x
   - At 100% meter: "OVERDRIVE" — 3x multiplier for 5 seconds

3. SCORING:
   - Perfect hit: 100 pts × multiplier
   - Good hit: 50 pts × multiplier
   - Miss: 0 pts, combo reset
   - Final score displayed on completion

4. INTEGRATION:
   - Accessible from system map as a standalone level
   - Uses existing piano input (keyboard.js dispatchNote)
   - Uses existing AudioContext for tone playback
   - Score saved to localStorage

5. RENDERING:
   - Add draw methods to renderer.js for the minigame scene
   - Scrolling note lane with timing line at bottom
   - Power meter bar on side
   - Combo counter

## CONSTRAINTS
- Must feel like a complete, polished mini-experience
- Touch-friendly (notes tappable on mobile)
- 60 FPS target
- Reuse existing audio and input infrastructure
```

---

## Skill-Tuning Prompt (for any engine)

After a skill agent produces code that doesn't work correctly:

```
The [ENGINE NAME] skill just ran and produced these failures:
[PASTE CONSOLE ERRORS OR DESCRIBE WHAT WENT WRONG]

Walk through each failure:
1. What was the expected behavior?
2. What actually happened?
3. What's the root cause?
4. What specific code change fixes it?

Then edit the skill definition in docs/skills/[ENGINE].md to prevent this class of failure in future runs. Be specific — add a new constraint or test criterion that would have caught this.

Apply the code fixes and push to branch claude/[engine]-fix-v[N].
```
