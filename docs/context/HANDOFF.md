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
