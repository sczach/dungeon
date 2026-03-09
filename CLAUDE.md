# ChordWars — Claude Code Config

## Load context
@~/ai-dev-platform/contexts/chordwars.md

## Load platform rules
@~/ai-dev-platform/rules/platform.md

---

## Project overview
Music education RTS game. Player uses their **instrument as the only controller** — every
game action maps to a musical action. Playing music well = playing the game well.
Live at: https://chordwars.vercel.app — Vanilla JS, HTML Canvas, Web Audio API, Vercel, no build step.

**Current focus: Piano.** Guitar and Voice are planned but not yet active.
The on-screen piano keyboard (tap/click) and QWERTY keys are both valid piano inputs.
Keep the on-screen keyboard — it's critical for onboarding and testing.

---

## Core design principle — never violate
> The instrument is the ONLY controller. Every game action must map to a musical action.
> Summoning a unit = playing a note sequence. Attacking = hitting a rhythm.
> The better you play music, the better you play the game. There is no other way to play.

---

## Scene flow
```
TITLE
  ↓ Play
INSTRUMENT_SELECT   ← choose Piano / Guitar (soon) / Voice (soon)
  ↓ Continue
LEVEL_SELECT        ← back button returns to INSTRUMENT_SELECT
  ↓ Play level
CALIBRATION         ← guitar/voice only; piano starts immediately
  ↓ Ready
PLAYING
  ↓
VICTORY | DEFEAT
  ↓ Level Select
LEVEL_SELECT        ← or ENDGAME if all levels are 3★
```

---

## Model selection
| Task | Model | Why |
|------|-------|-----|
| File search, exploration | Haiku | Fast, cheap |
| Simple edits, 1-2 files | Haiku | Clear instructions |
| Multi-file features | Sonnet | Best balance |
| Architecture, new systems | Sonnet | Understands context |
| Complex bugs spanning systems | Opus | Needs full system in mind |
| Security / audio edge cases | Opus | Can't miss details |
| Writing docs, comments | Haiku | Structure is simple |

**Default: Sonnet.** Upgrade to Opus when: first attempt failed, spans 5+ files, or architectural decision.

---

## Workflow rules
- Run `/plan` before implementing any feature that touches 3+ files
- Run `/code-review` before every PR
- Use `build-error-resolver` agent for any runtime errors — don't troubleshoot manually
- Use `refactor-cleaner` agent for dead code, never inline
- Run `/checkpoint` before starting a new major feature
- Run `/learn` at the end of every productive session

---

## Git discipline
- One branch per feature: `feat/<name>`, `fix/<name>`, `chore/<name>`
- Commit after each working increment (never leave broken state)
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- PR descriptions written by the `doc-updater` agent

---

## Scoring — musical performance, not just winning
Stars awarded at VICTORY based on **note accuracy %** (hits / total attempts):
- 1★ — any win (enemy base destroyed)
- 2★ — won with ≥65–70% note accuracy (varies by level)
- 3★ — won with ≥85–90% note accuracy

`computeStars(accuracyPct, level)` in `src/data/levels.js`.
`tablature.totalHits` and `tablature.totalMisses` tracked per run.

---

## Critical coding constraints
- **No bundler** — all JS must be native ES modules (`import`/`export` only, no `require`)
- **No circular imports** — Safari/Vercel reject circular ES module bindings; extract to constants.js
- **No allocations in update()** — pre-allocate buffers, reuse in-place; avoid GC pressure in rAF loop
- **game.js owns ALL mutable state** — subsystems receive `state` reference, never hold it
- **renderer.js is pure output** — never mutates state; only reads
- **No external dependencies** — keep it vanilla
- Test Chrome AND Safari before committing (Web Audio API behavior differs)
- Keep files in the hundreds of lines, not thousands — one file = one responsibility

---

## Audio pipeline — SETTLED, do not change architecture
```
Mic → AnalyserNode → buildChromagram() → matchChord() → gates → detectedChord
```
- CONFIDENCE_THRESHOLD = 0.60, MARGIN = 0.15, SPAWN_DEBOUNCE = 0.5s
- Chroma range 80–4000 Hz, near-floor bins (≤ −89 dB) skipped

## Input modes — SETTLED
- `summon` (default): 3-note tablature → pendingSpawn → game.js resource gate
- `attack`: attack sequence input
- Tablature determines unit type from first note (C/D→mage, E/F/G→knight, A/B→archer)

---

## File map (current)
```
index.html                — entry + HTML overlay sections (data-scene selectors)
style.css                 — layout + scene visibility
src/
  game.js                 — rAF loop, scene state machine, ALL mutable state
  renderer.js             — pure canvas draw (reads state only)
  constants.js            — SCENE enum (incl. INSTRUMENT_SELECT, ENDGAME), layout consts
  audio/
    index.js              — startCapture(), updateAudio(), updateCalibration()
    chords.js             — chromagram + cosine-similarity chord matching
    analyzer.js, capture.js, pitch.js
  entities/
    unit.js               — Unit class (player+enemy), tier stats, role AI
    enemy.js              — Enemy class
  systems/
    base.js               — Base class (player/enemy HP)
    tablature.js          — 3-note summon bar; tracks totalHits/totalMisses for scoring
    attackSequence.js     — attack sequence assignment + update
    waves.js              — WaveManager, WAVES table
    combat.js             — updateCombat() frame step
    prompts.js            — PromptManager (chord cue cycling, guitar mode)
    progression.js        — localStorage persistence, star award/spend, applySkills
    path.js               — enemy path waypoints
  input/
    keyboard.js           — piano key input, note dispatch, playSuccessKill
  ui/
    hud.js                — HUD render + initPianoTouchInput (on-screen piano keyboard)
    instrumentselect.js   — InstrumentSelectUI (Piano/Guitar/Voice cards)
    levelselect.js        — LevelSelectUI + skill tree panel
    settings.js           — SettingsUI (audio, difficulty, display settings)
    screens.js            — per-scene screen rendering
  data/
    chords.js             — CHORD_DATA, CHORD_FALLBACK
    levels.js             — LEVELS, computeStars() (accuracy-based), isLevelUnlocked()
    skills.js             — SKILLS: Rhythm/Technique/Theory tiers (musical progression)
```

---

## Planning docs (separate location)
`C:\Users\wbryk\OneDrive\Desktop\Chordwars\`
- `SONNET_PROJECT_INSTRUCTIONS 1C.md` — full settled specs (CANONICAL)
- `Chord_Wars_GDD_v1.0.docx` — Game Design Document
- `Chord_Wars_Roadmap_v1.1.docx` — Development Roadmap
- `Chord_Wars_Wireframes.jsx` — UI Wireframes
- `REF_AUDIO.md`, `REF_BACKEND.md`, `REF_GAMECORE.md` — Reference docs

## Current phase
**Phase 1D — Instrument select, musical scoring, musical skill tree**
