# Handoff Notes — 2026-03-19

## Current phase
Phase 2B — Minigame Engine + content expansion. Productive game development session: Crossing difficulty fixed, Scale Runner built, auto-populate system wired so future minigames light up the world map automatically on registration.

## What is working
- Crossing difficulty fixed: spawnMod now live in game.js (was dead code); Crossing spawnMod 1.5, difficultyMod 0.85, startResources 250 — two-lane pressure survivable on Easy
- Scale Runner minigame (src/minigames/scaleRunner.js): C major scale ascending + descending, 3 rounds at 60/75/90 BPM, piano + pitch-positioned dot ladder visual, metronome click, PERFECT/OK/MISS hit windows
- theory-1 ("The Major Scale") wired to 'scale-runner' — live and playable from hub
- Auto-populate system: minigameEngine.isLive() is now single source of truth; world map coming-soon nodes render gray/locked; PLAY button and launch guard both gated on isLive(); adding any new minigame = register in game.js → nodes activate
- feat/add-session-commands fully assessed and merged (gitignore commit on master)
- Local master synced — 30 commits ahead of where it was at session start
- Rhythm Challenge (rhythm-3/4/5) and Call & Response (music-1) code-reviewed: both production-ready, no blocking bugs

## What is broken or in progress
- Scale Runner unplaytested in browser — code is correct but needs live verification
- theory-2 through theory-6 remain 'coming-soon' (correctly grayed out)
- rhythm-6 and music-2/3 still 'coming-soon'
- .obsidian/*.json perpetually dirty — never commit
- gh CLI not installed on this machine — PRs must be opened manually via browser

## What was done this session
- src/data/levels.js — Crossing: difficultyMod 1.0→0.85, spawnMod 1.0→1.5, startResources 200→250; Campfire spawnMod comment corrected
- src/game.js — spawnMod applied in 3 spawn interval calculations (was dead); ScaleRunner imported + registered; launch guard + world map click guard use minigameEngine.isLive()
- src/systems/minigameEngine.js — added isLive(gameTypeId) method
- src/ui/worldMapRenderer.js — imports minigameEngine; coming-soon nodes now visually locked; PLAY button conditional on isLive()
- src/data/worldMap.js — theory-1 gameType: 'coming-soon' → 'scale-runner'; subtitle updated
- src/minigames/scaleRunner.js — new file, ~370 lines; full Scale Runner minigame

## Approaches that failed
- None this session

## Open PRs
- master branch has 2 new commits not yet in a PR:
  - 4940f43 fix: reduce Crossing difficulty and activate spawnMod for all levels
  - c7acfb1 feat: Scale Runner minigame + auto-populate world map from registry
  Open PR at: github.com/sczach/chordwars/compare/master

## Next session should
1. **Playtest Scale Runner** in browser — verify note ladder, hit windows, round transitions; tune BPM if needed
2. **Playtest Crossing** on Easy — confirm spawnMod fix feels fair
3. **Build Interval Quiz** (theory-2) — relative pitch, hear two notes, play the interval back; wire to 'interval-quiz' gameType
4. **Update GAME_SYSTEMS.md** — add auto-populate system description, Scale Runner
5. **Update DECISIONS.md** — remove stale Known Bugs entries (fixed 2026-03-17)

## Source files most likely needed next session
- src/minigames/scaleRunner.js — if tuning after playtest
- src/data/levels.js — if tuning Crossing further
- src/data/worldMap.js — wiring theory-2 to 'interval-quiz'
- src/game.js — registering interval-quiz
- src/systems/minigameEngine.js — BaseMinigame API reference
- docs/context/GAME_SYSTEMS.md — vault update

## Vault files that need updating
- GAME_SYSTEMS.md — add auto-populate system, Scale Runner, note theory-1 live
- DECISIONS.md — remove two stale Known Bugs entries (fixed 2026-03-17)

---

# Handoff Notes — 2026-03-19

## Current phase
Phase 2B — Minigame Engine + content expansion (active). No game changes this session — session command and worktree hygiene infrastructure.

## What is working
- All items from previous 2026-03-19 session remain unchanged
- `/resume` and `/wrap-up` are now accessible from any worktree (both repo-root and worktree copies updated)
- Worktree hygiene is now a mandatory named step in both `/resume` (Step 1) and `/wrap-up` (Step 5)

## What is broken or in progress
- `feat/add-session-commands` branch still needs assessment — 20+ commits ahead of local master; remote merge state unconfirmed
- `.obsidian/*.json` files perpetually modified — never commit
- Disk at or near capacity — 5 stale worktree dirs remained locked as of previous session (may have released on reboot)
- Repo-root master working tree has **uncommitted** edits to `.claude/commands/resume.md` and `wrap-up.md` (same content as this PR) — after this branch merges, discard with: `git checkout -- .claude/commands/resume.md .claude/commands/wrap-up.md`

## What was done this session
- `.claude/commands/resume.md` (worktree + repo-root) — added "Worktree note" section; added Step 1 (worktree hygiene: prune refs, list worktrees, orphan check with safety gate, disk report); renumbered old steps 1–4 → 2–5
- `.claude/commands/wrap-up.md` (worktree + repo-root) — added LOCATION header comment; added Step 5 (worktree cleanup: prune, remove session worktree if merged/abandoned, orphan check, disk report, explicit exit condition); renumbered old Step 5 → Step 6

## Approaches that failed
- None this session

## Open PRs
- `claude/charming-agnesi` → session command + worktree hygiene improvements → open at github.com/sczach/chordwars/pull/new/claude/charming-agnesi
- `feat/add-session-commands` → earlier session command improvements → check https://github.com/sczach/chordwars for current PR status

## Next session should
1. **Merge `claude/charming-agnesi`** (this PR) — then on master: `git checkout -- .claude/commands/resume.md .claude/commands/wrap-up.md` to discard the duplicate local edits
2. **Assess `feat/add-session-commands`** — `git log master..feat/add-session-commands` to confirm whether PRs #41–#48 are on remote master; merge if not
3. Playtest rhythm-3/4/5 (Rhythm Challenge) and the Call & Response minigame
4. Begin next minigame: theory-1 (note recognition — hear a note, identify it)
5. Fix Crossing difficulty (too hard on Easy) — `src/data/levels.js`

## Source files most likely needed next session
- `src/minigames/rhythmChallenge.js` — if tuning rhythm patterns
- `src/minigames/callResponse.js` — if tuning ear training
- `src/data/worldMap.js` — next region/minigame wiring
- `src/data/levels.js` — Crossing difficulty fix
- `src/game.js` — new minigame registration

## Vault files that need updating
- `DECISIONS.md` — remove two stale Known Bugs entries (fixed 2026-03-17)
- `GAME_SYSTEMS.md` — add Minigame Engine section, note rhythm region now live

---

# Handoff Notes — 2026-03-19

## Current phase
Phase 2B — Minigame Engine + content expansion (active). No game changes this session — environment maintenance only.

## What is working
- All items from 2026-03-18 session remain unchanged
- feat/add-session-commands branch is diverged from master (contains PRs #41–#48 not yet on master's remote HEAD at PR #40 — check GitHub for actual merge state)

## What is broken or in progress
- feat/add-session-commands branch needs to be assessed — it is 20+ commits ahead of local master; remote merge state may differ
- `.obsidian/*.json` files are perpetually modified (workspace state) — never commit these
- Disk at or near capacity on this machine — non-repo issue but affects snapshot reliability in Claude Code

## What was done this session
- No game files were modified
- `~/.claude/scripts/prune-worktrees.sh` — created: runs `git worktree prune` + force-removes stale `.claude/worktrees/*` entries
- `~/.claude/settings.json` — updated: Stop hook added to run prune-worktrees.sh at end of every session
- Stale git worktree refs in this repo — pruned manually (9 refs cleaned)
- 4 physical stale worktree directories — deleted (5 remained locked by process handles; will release on reboot)

## Approaches that failed
- None — maintenance tasks completed cleanly

## Open PRs
- feat/add-session-commands → /wrap-up and /resume command improvements → check https://github.com/sczach/chordwars for current PR status
- All PRs #41–#48 may already be merged on remote (merged into this branch locally; remote master may lag)

## Next session should
1. **Bake worktree pruning into /resume and /wrap-up** — the Stop hook alone is not enough; worktrees must be pruned at session START (/resume) and session END (/wrap-up) as a named workflow step, so accumulation never silently fills the disk. Update both command files to include a `git worktree prune` step and a check that no stale dirs exist in `.claude/worktrees/`.
2. Check `git log master..HEAD` vs remote — confirm whether PRs #41–#48 are on remote master or only local; merge feat/add-session-commands to master if not already
3. Playtest rhythm-3/4/5 (Rhythm Challenge) and the Call & Response minigame
4. Begin next minigame: theory-1 (note recognition — hear a note, identify it)
5. Fix Crossing difficulty (too hard on Easy) — src/data/levels.js

## Source files most likely needed next session
- `~/.claude/commands/resume.md` — add worktree prune step
- `~/.claude/commands/wrap-up.md` — add worktree prune step
- src/minigames/rhythmChallenge.js — if tuning patterns
- src/minigames/callResponse.js — if tuning ear training
- src/data/worldMap.js — next region/minigame wiring
- src/data/levels.js — crossing difficulty fix
- src/game.js — new minigame registration

## Vault files that need updating
- DECISIONS.md — remove two stale Known Bugs entries (fixed 2026-03-17)
- GAME_SYSTEMS.md — add Minigame Engine section, note rhythm region now live

---

# Handoff Notes — 2026-03-18

## Current phase
Phase 2B — Minigame Engine + Rhythm region expansion (in progress)

## What is working
- Title screen, instrument select, calibration flow, all scene transitions
- On-screen piano key fallback input (click/touch) + QWERTY keyboard input
- World map, tutorial sequence (T1–T4), level start screen
- Victory melody playback; debug overlay (backtick key)
- Level 1 (campfire) + Level 2 (crossing) completable
- Hub unlock works: tutorial-4 beaten → hub recurse → tone/rhythm/theory/music entry nodes unlock
- Tone region fully live — tone-1 through tone-6 playable (merged PR #41)
- Minigame engine — registry/lifecycle host in src/systems/minigameEngine.js (merged PR #42)
  - SCENE.MINIGAME in constants.js, SCENE.WORLD_MAP → SCENE.MINIGAME → SCENE.VICTORY/DEFEAT wiring in game.js
  - World map nodes have gameType field; tower-defense routes to existing gameplay
  - coming-soon placeholder renders and auto-exits
- Metronome Mastery minigame — src/minigames/metronomeMastery.js (merged PR #43)
  - 4 phases × 15s at 80/95/110/125 BPM; lookahead scheduler; stars on perfect %
- Scrolling highway visual — pendulum replaced with right→left beat markers (merged PR #44)
  - Proximity glow, ring pulse, green/yellow/red fade, feedback text, live stats
  - Debounce tightened 80ms → 30ms
- rhythm-1 (Quarter Notes) and rhythm-2 (The Downbeat) on world map launch Metronome Mastery

## What is broken or in progress
- feat/minigame-rhythm-challenge not yet merged — Rhythm Challenge built and pushed, PR open
  - rhythm-3/4/5 show as playable on the world map but won't work until branch is merged
- Mic detection during PLAYING not confirmed on real device — pipeline correct, untested since 2026-03-17 fix
- Crossing (Level 2) too hard on Easy — all difficulty params spike simultaneously, flagged but not fixed
- DECISIONS.md "Known Bugs" section is stale — lists resumeAudioContext duplicate and btn-practice duplicate;
  these were fixed in claude/pedantic-kilby (2026-03-17) but section wasn't updated

## What was done this session
- src/systems/minigameEngine.js — new: MinigameEngine class, BaseMinigame base class, ComingSoonMinigame
- src/constants.js — SCENE.MINIGAME added
- src/game.js — MINIGAME scene wired: launch/result/transition; RhythmChallenge import + register
- src/data/worldMap.js — gameType field added to all nodes; tower-defense nodes explicit;
  rhythm-1/2 set to metronome-mastery; rhythm-3/4/5 set to rhythm-challenge/stub:false
- src/minigames/ — directory created with README listing 8 planned minigame types
- src/minigames/metronomeMastery.js — new: full implementation (lookahead scheduler, hit detection, render)
- src/minigames/metronomeMastery.js — visual redesign: pendulum → scrolling highway (separate PR)
- src/minigames/rhythmChallenge.js — new: 3-round pattern minigame (quarter/eighth/syncopation)

Merged this session: PR #41 (tone levels), PR #42 (minigame engine), PR #43 (MetronomeMastery), PR #44 (highway UI)
Open: feat/minigame-rhythm-challenge → https://github.com/sczach/chordwars/pull/new/feat/minigame-rhythm-challenge

## Approaches that failed
- None this session — all branches committed cleanly on first attempt

## Open PRs
- feat/minigame-rhythm-challenge → Rhythm Challenge minigame (3 rounds: quarter/eighth/syncopation);
  rhythm-3/4/5 wired → must be merged before next session begins
  URL: https://github.com/sczach/chordwars/pull/new/feat/minigame-rhythm-challenge
- gh CLI unavailable in bash environment — all PRs must be opened/merged manually on GitHub

## Next session should
1. Merge feat/minigame-rhythm-challenge — then playtest rhythm-3/4/5 on world map
   - Verify Round 1 (quarter notes at 80 BPM) feels appropriately easy
   - Verify Round 2 (eighth notes) — confirm smaller circles visually distinguishable
   - Verify Round 3 (syncopation) — confirm rest diamonds on beats 2 & 4, hits on off-beats
   - Verify 3-second transition overlay appears between rounds
2. Next minigame: Note Matching (rhythm-6 / polyrhythm) or first theory minigame (theory-1)
   - Candidate: a simple note-recognition game for theory region (hear a note → identify it)
3. Fix crossing difficulty — crossing is too hard on Easy
   - Suggested: difficultyMod: 0.85, spawnMod: 1.15, startResources: 225
4. Confirm mic detection on real device — Android Brave, debug overlay, verify RMS > 0 during playing
5. Update DECISIONS.md Known Bugs section — remove the two stale bug entries (both fixed 2026-03-17)

## Source files most likely needed next session
- src/minigames/rhythmChallenge.js — if tuning patterns or visual tweaks
- src/minigames/metronomeMastery.js — if additional minigame types needed as reference
- src/systems/minigameEngine.js — if engine interface changes needed
- src/data/worldMap.js — next minigame node wiring
- src/data/levels.js — crossing difficulty fix
- src/game.js — for new minigame registration

## Vault files that need updating
- DECISIONS.md — add minigame engine architectural decision (MinigameEngine registry pattern);
  remove stale "Known Bugs" entries (both fixed months ago)
- GAME_SYSTEMS.md — add Minigame Engine section (registry, BaseMinigame interface, lifecycle,
  done() result shape); add note that rhythm region now has live minigame levels
- All other vault docs appear current

---

# Handoff Notes — 2026-03-18

## Current phase
Phase 2A bug crush (complete) — transitioning to Phase 2B content expansion

## What is working
- Title screen, instrument select, calibration flow
- Noise floor measurement during calibration (90-frame settle)
- All scene transitions (Title → Instrument Select → Calibration → Playing → Victory/Defeat)
- On-screen piano key fallback input (click/touch)
- QWERTY keyboard piano input
- World map, tutorial sequence (T1–T4), level start screen
- Victory melody playback
- Debug overlay (backtick `` ` `` key) — shows AudioCtx/RMS/Floor/Note/Chord/Conf/Stable
- Mic detection pipeline (audio fixes from 2026-03-17 session 1, confirmed syntactically correct)
- Level 1 (campfire) fully completable on mobile
- Level 2 (crossing) on world map, reachable after campfire
- Cue timer difficulty-scaled (Easy: 2.5×, Medium: 1.5×, Hard: 1.0×)
- Score reflects actual gameplay (cue hits award +10 score each)
- Note accuracy tracks misses correctly (cue expiry → miss++)
- Stars correctly computed (3★ requires ≥85% accuracy on campfire)
- Cue card 2× larger on mobile (W < 500px)
- **Session management slash commands installed**: `/resume`, `/wrap-up`, `/debug-audio`

## What is broken or in progress
- **Mic detection during PLAYING not confirmed on real device** — pipeline code is correct
  but has not been tested on Android Brave or iOS Safari since the 2026-03-17 fix
- Region stub nodes (tone-1, rhythm-1, etc.) cannot be unlocked — `isNodeUnlocked()` checks
  `bestStars['hub'] >= 1` but hub is non-playable so this never fires. Only campfire/crossing
  are playable post-tutorial nodes currently.
- **Two PRs open and unmerged** — see Active PRs below

## What was done this session (2026-03-18)
- Created `.claude/commands/resume.md` — session start command (read-only vault briefing)
- Created `.claude/commands/wrap-up.md` — session end command (writes HANDOFF, appends PROJECT_HISTORY)
- Created `.claude/commands/debug-audio.md` — 10-item audio pipeline diagnostic checklist
- Committed all three files: `e9bb0b9 chore: add session management slash commands`
- Pushed branch `claude/infallible-bartik` to remote
- Verified vault directory accessible at `C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/`
- Verified HANDOFF.md and PROJECT_HISTORY.md are intact and readable
- Dry-ran `/resume` logic manually — confirmed it produces correct output from current vault

## Approaches that failed
- `gh` CLI not available in this environment — PR could not be created automatically.
  Manual PR creation required at: https://github.com/sczach/chordwars/pull/new/claude/infallible-bartik

## Open PRs
- `claude/pedantic-kilby` → audio pipeline + game.js syntax fixes → check GitHub manually (gh unavailable)
- `claude/cranky-bhaskara` → balance fixes A/B/C/D, cue size, Level 2 wired → check GitHub manually
- `claude/infallible-bartik` → session management slash commands → PR not yet opened (gh unavailable)
  Open at: https://github.com/sczach/chordwars/pull/new/claude/infallible-bartik

## Next session should
1. **Open PR for `claude/infallible-bartik`** manually on GitHub (gh unavailable this session)
2. **Merge `claude/pedantic-kilby`** (audio fixes), then merge `claude/cranky-bhaskara` (balance/Level 2)
3. Deploy to Vercel and do a full mobile playtest on Android Brave:
   - Confirm mic detection works (debug overlay → all fields populated during PLAYING)
   - Play campfire on Easy — confirm cue window feels comfortable
   - Complete campfire — confirm score > 0 and stars reflect accuracy
   - Beat campfire — confirm crossing node unlocks on world map
4. If mic confirmed working: Phase 2A is complete → move to Phase 2B
5. Phase 2B: fix `isNodeUnlocked()` for hub-gated nodes; flesh out tone-1 through tone-6 content

## Source files most likely needed next session
- `src/audio/index.js` — mic pipeline (if testing mic detection)
- `src/data/worldMap.js` — node unlock logic (`isNodeUnlocked`)
- `src/systems/cueSystem.js` — cue timing, scoring, miss tracking
- `src/data/levels.js` — level definitions, star thresholds
- `src/game.js` — scene transitions, victory handler

## Vault files that need updating
- All vault docs appear current as of 2026-03-17 session 2
- No vault updates needed this session (no game code changed)
