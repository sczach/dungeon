# Gameplay Engine — Skill Definition

## Role
The Gameplay Engine owns the rules that make the game winnable, balanced, and fair:
damage math, accuracy decay, wave pacing, resource economy, star scoring, and the
unlock/progression system. It also owns the tutorial sequence — the 4-level onboarding
arc that introduces each mechanic exactly once.

The Gameplay Engine is the bridge between musical skill (accuracy %) and game outcome
(stars, units, base HP). Its job is to ensure that playing music better always produces
a meaningfully better game result.

---

## Pipeline Position

```
MINIGAME_ENGINE → scoring rules, star thresholds → GAMEPLAY_ENGINE
GAMEPLAY_ENGINE → game state → GRAPHICS_ENGINE (render each frame)
GAMEPLAY_ENGINE → accuracy % → SOUND_ENGINE (mic input feeds scoring)
AI_ENGINE → balance evaluation → GAMEPLAY_ENGINE (threshold tuning)
COMPOSITION_ENGINE → note pools → GAMEPLAY_ENGINE (cueNotePool per level)
```

### Connected engines

- [[MINIGAME_ENGINE]] — Minigames define internal scoring but MUST produce a result
  compatible with the same `awardStars()` + `saveProgress()` progression path.
  Star thresholds are defined per-handler, not in levels.js.
- [[SOUND_ENGINE]] — Mic-detected notes feed into the accuracy formula. Sound Engine's
  detection quality directly determines `totalHits / totalMisses` and therefore stars.
- [[GRAPHICS_ENGINE]] — Renders the game state produced by Gameplay Engine rules
  each frame. Renderer is pure output — never mutates the state Gameplay Engine owns.
- [[COMPOSITION_ENGINE]] — Per-level `cueNotePool` constrains which notes appear
  as cues. The Composition Engine's diatonic rules define valid note pools.
- [[AI_ENGINE]] — Evaluates balance: is damage fair? Are star thresholds achievable?
  Is the economy viable? Wave pacing appropriate? Feedback loop into threshold tuning.

---

## Inputs
| Input | Source | Description |
|-------|--------|-------------|
| `state.attackMisses` | `game.js` | Accumulated misses in attack mode since last reset |
| `state.resources` | `game.js` | Current gold (0–200); spent on unit summons |
| `state.units[]` | `game.js` | All alive units (player + enemy) |
| `state.wave` | `game.js` | Current wave index (1-based) |
| `tablature.totalHits` / `.totalMisses` | `tablature.js` | Cumulative accuracy for star scoring |
| `level` object | `data/levels.js` | Per-level config: winCondition, allowedModes, waves, etc. |
| `progression` object | `progression.js` | bestStars map, tutorialComplete, purchased skills |

---

## Outputs
| Output | Description |
|--------|-------------|
| `dmgMult` | Damage multiplier applied to each note hit (0.5 base, 1.0 on cue match) |
| `accuracy` | `max(floor, 1 - attackMisses * 0.10)` — degrades with missed notes |
| `damage` | `BASE_DIRECT_DAMAGE * accuracy * dmgMult` dealt to target |
| Star rating | 1–3 stars computed by `computeStars(accuracyPct, level)` at VICTORY |
| Wave schedule | Timed enemy spawns from `WaveManager` per `level.waves[]` |
| Unlock state | `isNodeUnlocked(node, progression)` gates world map node access |

---

## Constraints
- **Music ↔ mechanics contract is sacred**: better note accuracy must always produce
  more damage, more resources, more stars. Never allow a path to victory that bypasses
  musical skill.
- **BASE_DIRECT_DAMAGE = 10** (post-2A). Do not lower below 8 — base HP is 100; minimum
  viable fight duration is ~15 hits at max accuracy.
- **Accuracy floor = 0.30** (post-2A). Never set below 0.20 — players below 30% accuracy
  should still see visible progress to avoid frustration.
- **Miss counting rule**: only count a miss when the player fires at a target that exists.
  Playing notes when no enemies are present (base direct attack) must NOT count as a miss.
- **Resource cap = 200**. Summon costs are: Archer 25, Knight 50, Mage 75.
  Economy must allow at least 2 summons in the first 30 seconds of play.
- **Wave pacing**: min 8s between waves at difficulty=easy, 5s at medium, 3s at hard.
  Never spawn a new wave while the previous wave is still alive and in lane.
- **Tutorial is linear and mandatory on first play**. `tutorialComplete` gates the
  world map. Tutorial IDs use `bestStars` keys like regular levels.
- **`'hub'` unlock special case**: the hub node is non-playable and never earns stars.
  `isNodeUnlocked` treats `unlockRequires: ['hub']` as satisfied when `tutorialComplete === true`.

---

## Test criteria
- [ ] Hitting 10 notes in a row on an enemy reduces its HP by a clearly visible amount
- [ ] Missing 5 notes in a row reduces damage but does not drop it below 30% of base
- [ ] Playing notes with no enemies in lane does NOT degrade accuracy counter
- [ ] A fresh player with 0% accuracy can still deal ~3 HP per hit (floor × BASE_DIRECT_DAMAGE)
- [ ] Completing tutorial-4 sets `tutorialComplete = true` and navigates to WORLD_MAP
- [ ] After tutorial, tone-1 / rhythm-1 / theory-1 nodes are unlocked (no stars needed)
- [ ] 3★ requires ≥85% note accuracy — verify with a test run targeting ≥90%
- [ ] Wave 2 does not spawn until wave 1 enemies are all defeated or at base

---

## Convergence definition
The Gameplay Engine is **good enough** when:
1. A player with real musical skill (80%+ note accuracy) wins comfortably in ≤ 3 minutes.
2. A player with 0% musical skill loses but sees noticeable progress (base takes damage).
3. Tutorial completion correctly unlocks the world map on every browser/device tested.
4. No accuracy exploit exists (e.g. spamming notes with no enemies to "reset" miss count).
5. Star thresholds feel earned — 2★ requires genuine improvement, 3★ requires mastery.
