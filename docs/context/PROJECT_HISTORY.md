# ChordWars Project History

> Timeline of all planning documents, session prompts, and reference files.
> Use this to understand **when** something was written and **whether it's still current**.

---

## Phase 0 — Conception (Early March 2026)

### `030726 chord wars musical rts.txt` *(root)*
**Date:** March 7, 2026 | **Status:** Archive — superseded
Early planning session. Game was guitar-only. Repo was still called `dungeon`. Captured the first design direction: melodies = summon units, rhythms = resources, chords = attacks. Identified the right-hand QWERTY layout, the tablature summon mechanic, and initial balance issues (enemy speed too high, button mashing).

**Superseded by:** [[ARCHITECTURE]], CLAUDE.md

---

## Phase 1A–1C — Foundation (Days 4–17)

### `docs/archive/phase-1/SONNET_PROJECT_INSTRUCTIONS.md` *(archive/phase-1)*
**Date:** Phase 1A era | **Status:** Archive — superseded
The original project brief template for Sonnet. Guitar-focused. Still had `[UPDATE THIS]` phase placeholder. Captured tech stack, file structure, audio pipeline, MVP scope, 3-tier progression (open/barre/jazz chords), all 6 planned maps, monetization vision.

**Superseded by:** `docs/archive/phase-1/SONNET_PROJECT_INSTRUCTIONS_1C.md` → `docs/archive/CLAUDE_PHASE_2.md` → `CLAUDE.md`

### `docs/archive/phase-1/BRIEFING_PROMPTS.md` *(archive/phase-1)*
**Date:** Phase 1A–1C | **Status:** Archive — superseded
Per-file briefing prompt templates for each Phase 0–1C task. Used the old two-step pattern (paste code → request specific change). Phase 0 scaffold, 1A audio capture, 1A FFT analyzer, 1A pitch detection, 1A chord detection. Each prompt required pasting the dependency code inline.

**Superseded by:** `docs/workflow/BRIEFING_PROMPTS_V2.md`
**Why replaced:** New single-prompt auto-accept workflow; CLAUDE.md in repo eliminates need to paste context.

### `docs/archive/phase-1/REF_AUDIO.md` *(archive/phase-1)*
**Status:** Archive — superseded
Original audio pipeline reference. Had an error: described YIN pitch detection as the primary chord detection method.

**Superseded by:** `docs/archive/REF_AUDIO_V2.md` (corrects: chord detection is chromagram/cosine-similarity, NOT YIN)

### `docs/archive/phase-1/REF_GAMECORE.md` *(archive/phase-1)*
**Status:** Archive — superseded
Original game core reference.

**Superseded by:** `docs/archive/REF_GAMECORE_V2.md` → [[GAME_SYSTEMS]], [[STATE]]

### `docs/archive/phase-1/REF_BACKEND.md` *(archive/phase-1)*
**Status:** Future — not yet relevant
Firebase backend reference for Phase 3 (auth, leaderboards, Firestore). Deferred until Phase 3B.

**Relevant when:** Phase 3B (multiplayer, leaderboards)

### `docs/archive/phase-1/SONNET_ONBOARDING_GUIDE.md` *(archive/phase-1)*
**Status:** Archive — superseded
Early guide for onboarding Sonnet to the project. Used per-file paste approach.

**Superseded by:** `docs/workflow/DEVELOPMENT_WORKFLOW_V2.md`

### `docs/archive/phase-1/SONNET_PROJECT_INSTRUCTIONS_1C.md` *(archive/phase-1)*
**Status:** Archive — superseded
Phase 1C version of project instructions. Added tablature summon, attack sequences, modes. Was the authoritative instructions file at end of Phase 1C.

**Superseded by:** `docs/archive/CLAUDE_PHASE_2.md` → current `CLAUDE.md` in repo

---

## Phase 1C → 1D Transition

### `031026 chord wars status.txt` *(root)*
**Date:** March 10, 2026 | **Status:** Archive — historical context
Session log / adversarial playtest simulation. Generated 15 simulated playthroughs identifying critical issues. Key findings: iOS Safari AudioContext lock (40% of mobile users quit), calibration false confidence, no live mic indicator, tuning tolerance missing, portrait mode layout breaks. These drove the Phase 1D bug list.

**Led to:** `docs/archive/PHASE_1D_ACTION_PLAN.md`, `docs/archive/CLAUDE_CODE_FIX_BLOCKERS.md`

### `docs/archive/PHASE_1D_ACTION_PLAN.md` *(archive)*
**Date:** Late Phase 1C | **Status:** Historical — partially superseded
Detailed Phase 1D implementation plan: end-screen stats, tutorial overlay, difficulty balance, 3-star rating, share URL, production domain, performance audit. The star formula here (HP-based) was later changed to accuracy-based in the actual implementation.

**Key decisions that changed:** Stars are now based on **note accuracy %**, not HP remaining (see `CLAUDE.md → Scoring`).
**Still relevant:** Domain setup steps (chordwars.com), performance audit checklist.
**Superseded by:** Current `CLAUDE.md` for phase status | [[GAME_SYSTEMS]] for actual scoring

### `docs/archive/VISUAL_PROCESS_FLOW_SUMMARY.md` *(archive)*
**Date:** Phase 1D planning | **Status:** Historical
Three flowchart descriptions: Development Roadmap (Phase 1C→1D→2A), File Architecture Diagram (color-coded module ownership), Developer Workflow Diagram (Duncan↔Sonnet↔GitHub↔Vercel). Also contained Phase 2A file structure preview (`src/minigames/`, `src/audio/soundEngine.js`, `src/systems/systemMap.js`).

**Note:** `src/minigames/` and `src/systems/systemMap.js` were planned but not yet built. The actual Phase 2A focused on bug fixes instead.
**See:** [[ARCHITECTURE]] for current file structure | [[ROADMAP]] for phase status

---

## Phase 2A — Bug Crush (March 2026, CURRENT/COMPLETE)

### `docs/archive/CLAUDE_CODE_FIX_BLOCKERS.md` *(archive)*
**Date:** Late Phase 1 / Phase 2A precursor | **Status:** Historical — all bugs fixed
Session brief for mobile + audio playtest blockers after Duncan's real-device testing with Sequential Pro 3. 6 bugs: start button off-screen on Android, MIDI not detecting, note display too fast, keystroke detection unreliable in attack mode, victory screen button focus wrong, no base destruction animation.

**Note:** These were real bugs from a live playtest, different from the 9 Phase 2A bugs in `CLAUDE.md`. Some overlap (victory screen, MIDI).
**See:** `docs/archive/PHASE_2A_STRATEGY.md` for the 9 Phase 2A fixes | [[GAME_SYSTEMS]] for current state

### `docs/archive/CLAUDE_PHASE_2.md` *(archive)*
**Date:** Phase 2 kick-off | **Status:** Historical — this was the source doc for current CLAUDE.md
The Phase 2 version of project instructions. Contains bug list (12 known issues), tech stack, architecture rules, git workflow, revised roadmap (Phase 0 → 4B). Captured the moment when guitar-mode was de-emphasized in favor of piano, and the 9-bug fix became Phase 2A's entire scope.

**Superseded by:** Current `CLAUDE.md` in repo root
**Key change captured:** Phase 2A scope shrank from minigames+sound+map to "fix 9 bugs, get 30s of solid gameplay"

### `docs/archive/PROMPT_CLAUDE_CODE_SONNET.md` *(archive)*
**Date:** Phase 2A | **Status:** Historical — executed
The actual Claude Code session prompt that launched the Phase 2A bug fix run. Single-message auto-accept format. Branch `claude/phase2a-bug-crush`. 9 bugs in priority order with specific files and constraints.

**Result:** All 9 bugs fixed. See `docs/archive/PHASE_2A_STRATEGY.md` for implementation reference.
**Pattern:** This is the reference for [[WORKFLOW]] — single-prompt auto-accept sessions.

### `docs/archive/PHASE_2A_STRATEGY.md` *(archive)*
**Date:** Phase 2A | **Status:** Split — top half active reference, bottom half historical draft
**Top section (CURRENT):** Phase 2A bug fix implementation reference. Root causes, exact fix applied per bug, file modified.
**Bottom section (HISTORICAL DRAFT):** Original Phase 2A vision (minigames, sound engine architecture, agent tuning). This was the Haiku planning output — later the actual Phase 2A was scoped down to just bug fixes.

**Read the top section** when investigating how Phase 2A bugs were fixed.
**See also:** [[GAME_SYSTEMS]], [[AUDIO_PIPELINE]] for current state

---

## Workflow System (Active)

### `docs/workflow/DEVELOPMENT_WORKFLOW_V2.md` *(workflow)*
**Date:** Phase 2 | **Status:** Active — reference for running sessions
How Claude Code sessions work in Phase 2+: single-prompt auto-accept, branch+PR, CLAUDE.md as source of truth. Token efficiency analysis (2,800 tokens vs old 25,700 token approach). What NOT to do. File inventory of in-repo vs planning-folder documents.

**See also:** [[WORKFLOW]], `docs/workflow/BRIEFING_PROMPTS_V2.md`

### `docs/workflow/AGENT_TUNING_WORKFLOW.md` *(workflow)*
**Date:** Phase 2 | **Status:** Active — for Phase 2B+ engine development
The agent-tuning loop for each game engine: write skill → run → watch fail → diagnose → edit skill → repeat until stable. Skill definitions for all 5 engines: Sound, Gameplay, Graphics, Composition, AI. Test criteria and convergence goals per engine. Also covers everything-claude-code integration.

**See also:** `docs/skills/` (current skill files in repo) | [[WORKFLOW]] | [[ROADMAP]] for when each engine is built

### `docs/workflow/BRIEFING_PROMPTS_V2.md` *(workflow)*
**Date:** Phase 2 | **Status:** Active — prompts for Phase 2B–2D
Single-prompt templates for each phase. Phase 2A section is historical (already executed). Phase 2B (Sound Engine), 2C (System Map Fix + Expansion), 2D (First Minigame) prompts are ready to use. Also contains the skill-tuning prompt template for after an engine agent fails.

**See also:** `docs/workflow/DEVELOPMENT_WORKFLOW_V2.md` | [[WORKFLOW]]

### `docs/workflow/PROMPT_HAIKU_PLANNING.md` *(workflow)*
**Date:** Phase 2 | **Status:** Ready to use — Phase 2B–2D planning
Haiku planning prompt: design 8 minigames, sound engine architecture, 5 agent skill definitions, priority matrix. Not yet executed (or output was incorporated into `docs/archive/PHASE_2A_STRATEGY.md`'s bottom section).

**Use when:** Starting Phase 2B planning.

### `docs/archive/PROMPT_SETUP_AGENT_INFRA.md` + `docs/archive/PROMPT_SETUP_AGENT_INFRA_INSTRUCTIONS.md` *(archive)*
**Date:** Phase 2 | **Status:** Historical — agent infra already set up
Prompts to install docs/skills/ directory, .claude/commands/, and everything-claude-code framework in the repo.

**Result:** Already done. `docs/skills/` exists. `.claude/commands/` exists.

---

## Reference Documents (Phase 2)

### `docs/archive/REF_AUDIO_V2.md` *(archive)*
**Date:** Phase 2 | **Status:** Partially superseded by [[AUDIO_PIPELINE]]
Correct audio reference. Key fix from V1: **chord detection is chromagram + cosine similarity, NOT YIN**. Contains settled parameters, calibration approach, kill melody stagger fix, planned sound engine layers.

**Mostly superseded by:** [[AUDIO_PIPELINE]]
**Unique content:** Documents the V1→V2 correction on detection method; still useful as a quick "what changed" reference.

### `docs/archive/REF_GAMECORE_V2.md` *(archive)*
**Date:** Phase 2 (pre-2A fixes) | **Status:** Historical — bugs listed are now fixed
Entity system, resource table, wave parameters, combo system, input modes, scene state machine, system map. Several entries are marked BUG — those bugs are now fixed in Phase 2A.

**Superseded by:** [[GAME_SYSTEMS]], [[STATE]], [[DATA_MODELS]]
**Useful for:** Checking what the Phase 2A pre-fix state was

### `Agent tuning skills.txt` *(root)*
**Status:** Likely raw notes — check contents before using
Not yet read in detail. Likely related to `AGENT_TUNING_WORKFLOW.md`.

---

## See Also

- [[INDEX]] — Master documentation index
- [[ROADMAP]] — Phase roadmap with current status
- [[WORKFLOW]] — How to run Claude Code sessions
- [[ARCHITECTURE]] — Current system architecture
- `CLAUDE.md` — The canonical always-on project instructions (in repo)

---

## 2026-03-17 — Audio pipeline syntax errors found and fixed; piano mic detection unblocked

### What was attempted
- Session started with report of "Uncaught SyntaxError: missing ) after argument list" at src/game.js:724
- Previous session (same day, earlier) fixed audio/index.js: removed duplicate `resumeAudioContext` export, fixed unclosed if-block in `updateAudio`, lowered noise gate to 1.2×, added piano pitch→chord bridge
- This session: ran `node --input-type=module` syntax checks on both files to locate remaining errors
- Identified two more broken duplicate handlers in game.js using paren-depth analysis

### What failed and why
- First fix attempt collided with a full `C:\AppData\Local\Temp\claude\` temp directory: the Edit tool threw ENOSPC and corrupted game.js to 1 line
- Resolved by deleting temp output files (`find ... -name "*.output" -delete`), then restoring game.js from `git checkout HEAD -- src/game.js`
- Naive paren counter (Python script) skipped strings by single-char match — backtick in template literals confused it initially; fixed with a proper in-string flag

### What was fixed
- `game.js`: Removed duplicate `$('btn-practice')?.addEventListener('click', async () => {` at line 653 — opened an unclosed async arrow function whose body swallowed all subsequent code in `wireButtons()`
- `game.js`: Removed duplicate `$('btn-calibration-done')?.addEventListener('click', ...)` at line 670 — first copy had no closing `});`, so the paren from its `addEventListener(` was never closed
- Both bugs were merge artifacts from a previous edit that wrote function body without the surrounding boilerplate of one copy
- `audio/index.js` (prior commit 8f5e6ee): duplicate `resumeAudioContext` export, unclosed if-block, noise gate 1.5→1.2, piano pitch bridge — all already present and verified

### Current status
Both JS files are now syntactically valid (node resolves only import errors, no SyntaxError). The audio pipeline changes from the earlier session are in place: noise gate at 1.2×, floor min 0.001, stable-pitch-to-chord bridge at confidence 0.85, no hard return on suspended AudioContext. Mic detection for piano should now work in the PLAYING scene. The debug overlay (backtick key) is wired and shows AudioCtx/RMS/Floor/Note/Chord/Conf/Stable. Branch `claude/pedantic-kilby` has both commits; PR open at https://github.com/sczach/chordwars/pull/new/claude/pedantic-kilby. Piano notes played into mic during PLAYING are not yet confirmed working on a real device — that is the next test.

---

## 2026-03-17 — First successful mobile playtest; balance fixes applied; Level 2 wired

### What happened
- First full mobile playtest of Level 1 (campfire) on a real device
- Playtest revealed four gameplay bugs and one layout issue

### What was wrong (playtest observations)
- **Cue timer ~2× too fast on Easy**: players missed ~50% of cues not from lack of skill
  but from lack of time. Window was ~1 s at 110 BPM — insufficient for new players.
- **Score: 0 on victory screen**: cue hits only awarded resources, never incremented
  `state.score`. Enemy kill score existed but players didn't kill units before base fell.
- **Note accuracy: 100% always**: cue expiry (timer runs out without input) did not
  increment `state.tablature.totalMisses`. `_handleVictory()` computed accuracy from
  tablature hits/misses, so all expired cues were invisible to the formula.
- **3 stars always awarded**: downstream bug from accuracy=100% feeding `computeStars()`.
- **Cue card too small on mobile**: 130×64 px card with 22px font unreadable on phones.
- **Level 2 not on world map**: campfire/crossing existed in levels.js but were not
  world map nodes — players could only reach them via the legacy level select UI.

### What was fixed (branch: claude/cranky-bhaskara)
- `cueSystem.js`: Added `CUE_WINDOW_DIFFICULTY` — Easy 2.5×, Medium 1.5×, Hard 1.0×
- `cueSystem.js`: `onNote()` adds `+10` to `state.score` on every cue hit
- `cueSystem.js`: `update()` increments `state.tablature.totalMisses` on cue expiry
- `renderer.js` `_drawCueCard()`: mobile layout (W < 500) — card 200×96, note font 44px,
  timer bar 9px, border 3px
- `levels.js`: Added `cueNotePool` — campfire: `['C3','G3']`, crossing: `['C3','D3','G3']`
- `cueSystem.js`: Uses `state.currentLevel?.cueNotePool` for cue note generation
- `worldMap.js`: Added `CAMPFIRE_NODE` (1420,1080) and `CROSSING_NODE` (1640,980);
  hub connections updated to include 'campfire'; campfire unlocks after tutorial-4,
  crossing unlocks after campfire

### What still needs testing
- Mic detection on real device (audio pipeline fix from session 1, not yet confirmed)
- Mobile playtest of balance fixes (timer, score, accuracy, stars, cue size)
- Verify crossing node appears and unlocks correctly after campfire completion

---

## 2026-03-18 — Session management slash commands installed; vault verified

### Done
- `.claude/commands/resume.md` — new slash command for session start (read-only vault briefing)
- `.claude/commands/wrap-up.md` — new slash command for session end (writes HANDOFF, appends PROJECT_HISTORY)
- `.claude/commands/debug-audio.md` — new slash command for audio diagnostics (10-item checklist)
- `e9bb0b9` committed and pushed on branch `claude/infallible-bartik`
- Vault directory confirmed accessible; all 16 context docs present and readable
- HANDOFF.md and PROJECT_HISTORY.md integrity verified (PROJECT_HISTORY append-only contract intact)
- `/resume` logic dry-run confirmed: produces correct briefing from current vault state

### Failed / reverted
- `gh` CLI not available — PR for `claude/infallible-bartik` could not be opened automatically
  Must be opened manually at: https://github.com/sczach/chordwars/pull/new/claude/infallible-bartik

### Open
- PR for `claude/infallible-bartik` needs manual creation on GitHub
- `claude/pedantic-kilby` and `claude/cranky-bhaskara` still unmerged (audio fixes + balance fixes)
- Mic detection on real device still unconfirmed
- Hub-gated stub nodes (`tone-1` through `tone-6`) still unreachable (`isNodeUnlocked()` bug)

---

## 2026-03-18 (session 2) — Phase 2B: Minigame engine, rhythm region, TD gameplay redesign

Phase 2B began in earnest with the creation of the minigame engine (MinigameEngine registry + BaseMinigame base class in src/systems/minigameEngine.js), followed by three full minigame implementations: Metronome Mastery (rhythm tapping with lookahead scheduler and scrolling highway visual), Rhythm Challenge (3-round pattern-reading minigame), and Call & Response (ear-training echo-back game). The tone region received six playable levels (tone-1 through tone-6) and the rhythm region was wired with rhythm-1/2 launching Metronome Mastery and rhythm-3/4/5 targeting Rhythm Challenge. A major tower-defense gameplay redesign replaced per-enemy floating cue pills with a unified musical staff notation system (staffQueue.js + staffRenderer.js), rebalanced waves using an explicit 10-entry WAVES table with difficulty multipliers, removed the CHARGE input mode in favor of combo-based charge, added a mobile landscape orientation lock, and introduced a telemetry system (src/systems/telemetry.js) for gameplay data collection with export/clear controls in the Settings panel. PRs #41 through #48 were merged across these changes, with the final PR covering the full TD redesign including wave rebalancing, staff notation, mode simplification, landscape lock, telemetry, and AI Engine documentation updates.

---

## 2026-03-19 — Environment maintenance: git worktree cleanup and Stop hook

No game code was modified this session. The focus was entirely on Claude Code environment hygiene: nine stale git worktree refs were pruned from the repo, four physical stale worktree directories were deleted, a reusable prune script was created at `~/.claude/scripts/prune-worktrees.sh`, and the global `~/.claude/settings.json` Stop hook was updated to run that script automatically at the end of every session. Five locked directories could not be deleted due to active process handles and will release on reboot. A standing workflow requirement was identified: worktree pruning must be embedded as an explicit named step in both /resume and /wrap-up to prevent silent disk accumulation from agent worktrees.

---

## 2026-03-19 — Session command infrastructure: worktree accessibility and hygiene

No game code was modified. Both `/resume` and `/wrap-up` were updated to be accessible from any git worktree: the files were confirmed present in the repo-root `.claude/commands/` directory (tracked by git, available to all worktree branches), and a fallback note was added to `resume.md` instructing agents to read `wrap-up.md` directly via the Read tool if the slash command fails to resolve. Worktree hygiene was baked into both commands as a mandatory named step: `resume` now opens with a prune-and-inspect step (Step 1) that runs `git worktree prune`, lists active worktrees, checks for orphaned physical directories with an uncommitted-work safety gate, and reports disk usage; `wrap-up` now closes with a cleanup step (Step 5) that repeats the prune, removes the session worktree only after a confirmed push and only if the branch is merged or abandoned, and enforces a zero-stale-refs exit condition so the next agent always inherits a clean environment.

---

## 2026-03-19 — Phase 2B: Crossing difficulty fix, Scale Runner minigame, auto-populate system

Two game features and one engine improvement shipped this session. The Crossing level difficulty was fixed by activating `spawnMod` in game.js — the field had been defined in levels.js since Phase 1 but was never applied to the spawn interval calculation, meaning both Campfire and Crossing were using raw wave table intervals with no level-specific scaling. With `spawnMod` now applied at all three interval calculation sites, Crossing's two-lane pressure is compensated by slower spawns (1.5×), slightly squishier enemies (difficultyMod 0.85), and more starting gold (250), making the level survivable on Easy. The Scale Runner minigame was built for theory-1 ("The Major Scale"): the player runs C major ascending then descending across three rounds at 60, 75, and 90 BPM, with a piano at the bottom showing the active note in white and upcoming notes in blue, and a pitch-positioned dot ladder above the piano that visually traces the arc of the scale and fills green as notes are hit. An auto-populate system was added to the minigame engine: `minigameEngine.isLive(gameTypeId)` is now the single source of truth for whether a world map node is playable; the renderer uses it to gray out coming-soon nodes; game.js uses it to guard both the level-start launch button and the world map click handler. The practical result is that adding any new minigame now requires only one step — `minigameEngine.register()` in game.js — and every world map node with that gameType automatically becomes live with no further configuration.

---

## 2026-03-19 — AI dev platform integration: ChordWars skill system bootstrapped

No game code was modified this session. The focus was on closing the gap between the everything-claude-code platform (already installed globally) and ChordWars domain knowledge: two project-specific skills were written manually from the existing engine docs and wired to load automatically every session. The `chordwars-architecture` skill encodes the state ownership contract (game.js owns all mutable state, renderer.js is pure output), the circular import Safari failure mode and its fix pattern (extract to constants.js), the no-allocation-in-rAF rule, DPR scaling conventions, scene system architecture, SafariWorklet ban, and input mode behaviour. The `chordwars-audio-pipeline` skill encodes the settled mic detection constants that must not be changed without documentation (CONFIDENCE_THRESHOLD 0.60, MARGIN 0.15, SPAWN_DEBOUNCE 0.5s, chroma range 80–4000 Hz), AudioContext lifecycle rules, the safe/unsafe Web Audio node table, oscillator cleanup requirements, the kill-melody currentTime batching trap, and the pre-allocated buffer pattern. Both skills are loaded via `@` directives added to CLAUDE.md so every future session starts with full domain knowledge without requiring manual context loading. Two previously unwired PreToolUse hooks were also added to ~/.claude/settings.json: the continuous-learning-v2 observe.sh hook (completing the tool_start event stream so /evolve has full observation data) and the strategic-compact suggest-compact.sh hook (fires on Edit/Write after ~50 tool calls to prevent context blowout on large files). A ChordWars-specific code review checklist was added to CLAUDE.md to redirect the generic code-reviewer agent away from React/Node.js patterns toward game-loop and audio-specific checks.
