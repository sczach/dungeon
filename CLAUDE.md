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

## Design Principles — Never Violate These

> ChordWars is not a game with music in it. It is a music lesson that happens to have a game in it.

1. **Instrument is the only controller.**
   Every game action — summoning, attacking, winning — is a direct musical action.
   There are no menus, buttons, or shortcuts that bypass playing music.

2. **Failure never stops the music.**
   Missing a note, losing HP, or dying should feel musical, not punishing.
   The game continues even if the player plays poorly. The music never stops mid-phrase.

3. **Every level teaches one musical concept.**
   Level 1 = single notes. Level 2 = intervals. Level 3 = chords.
   A player who completes all levels has learned real music theory.
   Never put two concepts in one level.

4. **Better music = better gameplay.**
   Higher note accuracy → more stars → more skills → stronger army.
   Playing musically is always mechanically optimal. There must never be a way
   to win that doesn't also involve playing well.

5. **Levels end on a musical arc, not just HP=0.**
   Victory is declared when the musical phrase resolves AND the enemy is defeated.
   The generated melody plays back at the end of each level — the level's musical arc
   is what the player carries away, not just a win condition.

---

## Scene flow
```
TITLE
  ↓ Play
INSTRUMENT_SELECT   ← choose Piano / Guitar (soon) / Voice (soon)
  ↓ Continue (first play: !tutorialComplete → auto-start tutorial)
  │
  ├─ First play (!tutorialComplete):
  │    LEVEL_START(T1) → PLAYING → LEVEL_START(T2) → … → PLAYING(T4)
  │                                                         ↓
  │                                                    WORLD_MAP  ← tutorialComplete=true
  │
  └─ Returning player (tutorialComplete):
       WORLD_MAP → LEVEL_START → CALIBRATION? → PLAYING
                                                     ↓
                                              VICTORY | DEFEAT
                                                     ↓
                                               WORLD_MAP   ← or ENDGAME if all 3★
```

### Tutorial sequence (auto-play, forced linear)
| Level | ID           | Mechanic introduced | Win condition  | Enemy units |
|-------|--------------|---------------------|----------------|-------------|
| T1    | tutorial-1   | ATTACK mode         | destroy base   | none        |
| T2    | tutorial-2   | Survive waves       | survival       | 3 waves     |
| T3    | tutorial-3   | SUMMON mode         | destroy base   | normal      |
| T4    | tutorial-4   | Charge attack       | destroy base   | heavy       |

- `level.allowedModes: string[]|null` — null = unrestricted; `['attack']` locks to ATTACK only.
  Space-key cycling and mode buttons both respect this.
- `level.chargeUnlocksBase: boolean` — T4: enemy base starts invulnerable; first `fireChargedAttack()` call makes it vulnerable.
- `level.winCondition: 'base'|'survival'` — survival = all waves reached + no live enemies.
- `progression.tutorialComplete: boolean` — persisted; controls first-play vs world-map routing.
- Tutorial IDs (`tutorial-1` through `tutorial-4`) are stored in `progression.bestStars` just like regular levels.

### World map
- Canvas-rendered spider web; **no HTML DOM content** for the map itself.
- Node data in `src/data/worldMap.js` (`WORLD_MAP_NODES`, `WORLD_MAP_NODES_BY_ID`, `TUTORIAL_SEQUENCE`).
- Renderer: `src/ui/worldMapRenderer.js` (`WorldMapRenderer.draw(ctx, state, W, H, prog)`).
- Camera pan via drag; `state.worldMap.{cameraX, cameraY, isDragging, ...}`.
- `getNodeAtPoint(wx, wy, W, H, nodes)` and `getPlayButtonBounds(W, H)` exported for game.js hit-testing.
- Node unlock: `isNodeUnlocked(node, progression)` — checks `bestStars[id] >= 1` for each `unlockRequires` entry.
- Stub nodes (`node.stub === true`) are display-only locked placeholders (not yet implemented levels).

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
- `charge`: hold note → fill bar → release → `fireChargedAttack(level, note, state)`
- Tablature determines unit type from first note (C/D→mage, E/F/G→knight, A/B→archer)
- `state.allowedModes: string[]|null` restricts which modes are available (tutorial levels)

---

## File map (current)
```
index.html                — entry + HTML overlay sections (data-scene selectors)
style.css                 — layout + scene visibility
src/
  game.js                 — rAF loop, scene state machine, ALL mutable state
  renderer.js             — pure canvas draw (reads state only)
  constants.js            — SCENE enum (WORLD_MAP, LEVEL_START added), layout consts
  audio/
    index.js              — startCapture(), updateAudio(), updateCalibration()
    chords.js             — chromagram + cosine-similarity chord matching
    analyzer.js, capture.js, pitch.js
    melodyEngine.js       — procedural melody generator (generateMelody) + Web Audio playback
  entities/
    unit.js               — Unit class (player+enemy), tier stats, role AI
    enemy.js              — Enemy class
  systems/
    base.js               — Base class (player/enemy HP)
    tablature.js          — 3-note summon bar; tracks totalHits/totalMisses for scoring
    attackSequence.js     — attack sequence; fireChargedAttack() triggers chargeUnlocksBase
    waves.js              — WaveManager, WAVES table
    combat.js             — updateCombat() frame step
    prompts.js            — PromptManager (chord cue cycling, guitar mode)
    progression.js        — localStorage persistence, star award/spend, applySkills
                            ProgressRecord: { bestStars, purchased, tutorialComplete }
    path.js               — enemy path waypoints
  input/
    keyboard.js           — piano key input; Space respects state.allowedModes
  ui/
    hud.js                — HUD render; mode buttons filtered by state.allowedModes
    worldMapRenderer.js   — canvas spider-web world map (WorldMapRenderer class)
                            exports: getNodeAtPoint(), getPlayButtonBounds()
    instrumentselect.js   — InstrumentSelectUI (Piano/Guitar/Voice cards)
    levelselect.js        — LevelSelectUI + skill tree panel (legacy; still accessible)
    settings.js           — SettingsUI (audio, difficulty, display settings)
    screens.js            — per-scene screen rendering
  data/
    chords.js             — CHORD_DATA, CHORD_FALLBACK
    levels.js             — LEVELS (Campfire/Crossing/Siege), computeStars(), isLevelUnlocked()
    worldMap.js           — WORLD_MAP_NODES, TUTORIAL_SEQUENCE, isNodeUnlocked()
                            WorldMapNode: { id, x, y, connections, unlockRequires, allowedModes,
                              winCondition, chargeUnlocksBase, tutorialOverlay, isTutorial, stub, … }
    lessons.js            — LESSONS: level-as-lesson content (concept, notes, success metrics)
    skills.js             — SKILLS: Foundation/Technique/Mastery tiers (musical progression)
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
**Phase 1F — Tutorial sequence, world map, level-start screen**
