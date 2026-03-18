# ChordWars Game Systems

> All systems receive `state` by reference from game.js. They read and write fields on it.

## System Overview

| System | File | Lines | Role |
|--------|------|-------|------|
| Tablature | tablature.js | 255 | 3-note summon bar mechanic |
| Attack Sequence | attackSequence.js | 474 | Per-enemy note sequences + charged attacks |
| Cue System | cueSystem.js | 141 | Timed note cues + resource rewards |
| Combat | combat.js | 29 | Unit update loop + dead unit cleanup |
| Waves | waves.js | 147 | Wave spawning + difficulty curve |
| Progression | progression.js | 270 | Save/load, stars, skills |
| Prompts | prompts.js | 184 | Chord prompt cycling (guitar mode prep) |
| Base | base.js | 42 | Base class (HP, vulnerability) |
| Path | path.js | 118 | Enemy waypoints + arc-length parameterization |

## Tablature System (Summon Mode)

**Purpose:** Player plays 3-note sequences to summon units.

**Flow:**
1. `TablatureSystem.reset(state)` — fills queue with 3 random white notes
2. Player presses correct note → `onNote(note, state)` advances `activeIndex`
3. Wrong note → red flash, does NOT reset sequence
4. All 3 correct → `pendingSpawn = 1`, `unitType` set from first note
5. game.js reads `pendingSpawn`, calls `spawnPlayerUnit()`

**Note → Unit Type:**
| First Note | Unit Type |
|-----------|-----------|
| C3, D3 | tank |
| E3, F3 | dps |
| G3, A3 | ranged |
| B3 | mage |

**Constants:**
- `SUMMON_COOLDOWN_MS = 500`
- `MAX_PLAYER_UNITS = 8` (+ `skillMaxUnitsBonus`)
- `PROMPT_REFRESH_MS = 15000` — auto-refresh stale sequences
- Combo milestones at 5, 10, 20 → +25 resources each

**Scoring:** `totalHits` and `totalMisses` tracked per run → used by `computeStars()` at victory.

## Attack Sequence System (Attack Mode)

**Purpose:** Enemies have floating note sequences. Play them to deal damage.

### Enemy Sequences by Tier

| Tier | Notes | Effect on Completion |
|------|-------|---------------------|
| T1 | 2 | Instant kill |
| T2 | 3 | 60% maxHp damage |
| T3 | 5 | Stun for 2s (× dmgMult) |

**Priority System:** Target enemy = fewest remaining notes. Ties broken by proximity to player base. Notes always route to the best-matching enemy — player doesn't pick targets.

### Direct Base Attack

When no enemy sequence matches the note:
- `BASE_DIRECT_DAMAGE = 15` to nearest enemy base
- Accuracy degrades 10% per consecutive miss (floor 10%)
- `state.attackMisses` tracks consecutive misses

### Charged Attack (Charge Mode)

Hold a note → charge bar fills → release:
| Level | Charge Required | Effect |
|-------|----------------|--------|
| 1 | 1.0 | 20 dmg to nearest unit OR 12 dmg to base |
| 2 | 2.0 | 35 dmg to nearest + 15 pierce to base (2 bolts) |
| 3 | 3.0 | AOE: 15 dmg all units + 25 dmg all bases |

**T4 Tutorial:** `chargeUnlocksBase = true` — first charged attack makes all enemy bases vulnerable.

**Visual:** Lightning bolts with charge-level colors (yellow/blue/cyan/white), `BOLT_DURATION_MS = 200`, screen shake above `SHAKE_THRESHOLD = 20` damage.

## Cue System

**Purpose:** Timed note cues that reward correct play.

**Updated 2026-03-17:**

### Timing
- Generates cue note every 4 beats (`CUE_INTERVAL_BEATS = 4`)
- Hit window: 2 beats (`CUE_WINDOW_BEATS = 2`) **× difficulty multiplier**

### Difficulty window multipliers
```
CUE_WINDOW_DIFFICULTY = { easy: 2.5, medium: 1.5, hard: 1.0 }
```
Example at 110 BPM (campfire): Easy ≈ 2.7 s, Medium ≈ 1.6 s, Hard ≈ 1.1 s

### Per-level note pools
Levels can specify `cueNotePool: string[]` to restrict which notes appear as cues.
If absent, falls back to full pool `['C3','D3','E3','F3','G3','A3','B3']`.

| Level | cueNotePool | Teaches |
|-------|------------|---------|
| campfire | `['C3','G3']` | Perfect fifth — two notes only |
| crossing | `['C3','D3','G3']` | Adds D3 — step motion introduced |
| siege | _(full pool)_ | All 7 white notes |

### Rewards
- Cue hit: **+10 resources, +10 score** (score ensures non-zero victory screen)
- Free play (no active cue): +3 resources
- Wrong note during cue: no reward, no penalty
- `CUE_CLEAR_DELAY_MS = 700` — visual feedback before clearing
- Resource cap: 999

### Miss recording (FIX C)
When a cue expires (`active` → `missed`), `state.tablature.totalMisses` is
incremented. This feeds into the accuracy formula in `_handleVictory()`:
```
accuracyPct = totalHits / (totalHits + totalMisses) × 100
```
Before this fix, expired cues were invisible to the formula → accuracy always 100%.

## Combat System

Minimal — just iterates `state.units` backwards, calls `unit.update(dt, enemies, units)`, splices dead units. Pure function, 29 lines.

## Wave System

**10 waves**, linearly interpolated:

| Wave | Enemies | HP | Speed | Spawn Interval |
|------|---------|----|-------|---------------|
| 1 | 5 | 30 | 80 | 2.0s |
| 5 | 12 | 85 | 145 | 1.2s |
| 10 | 20 | 150 | 220 | 0.5s |

- Wave advance: 50% kill threshold triggers next wave
- `WaveManager.complete = true` after Wave 10
- game.js applies `difficultyMod` and `spawnMod` from level config
- BPM: `90 + (wave - 1) * 5` (used by sound engine)

## Unit Archetypes

### Player Units
| Type | HP | Damage | Speed | Special |
|------|-----|--------|-------|---------|
| tank | 200 | 6 | 35 | Holds midfield at 45% canvas |
| dps | 25 | 20 | 60 | Fast charge |
| ranged | 40 | 12 | 45 | 180 range, fires orbs, retreats |
| mage | 50 | 8 | 20 | 120 range, AOE pulse every 3s, +10% buff nearby |

### Enemy Tiers
| Tier | HP | Damage | Speed | Radius |
|------|-----|--------|-------|--------|
| T1 | 30 | 8 | 50 | 12 |
| T2 | 60 | 15 | 50 | 16 |
| T3 | 120 | 25 | 80 | 20 |

## Progression System

**localStorage key:** `chordwars-progress`

**ProgressRecord:**
```
{
  bestStars: { levelId: 0-3 },
  purchased: string[],       // skill IDs
  tutorialComplete: boolean
}
```

**`state.score` increments:**
- Enemy unit killed: `tier × 100` (in game.js combat loop)
- Cue hit: `+10` (in cueSystem.onNote — added 2026-03-17 so score is never 0)

**Star Scoring (at VICTORY):**
```
accuracyPct = totalHits / (totalHits + totalMisses) × 100
1★ = any win
2★ = accuracyPct >= level.starThresholds[1]
3★ = accuracyPct >= level.starThresholds[2]
```

**Star thresholds per level:**
| Level | 2★ min accuracy | 3★ min accuracy |
|-------|----------------|----------------|
| campfire | 65% | 85% |
| crossing | 70% | 90% |
| siege | 70% | 90% |

**totalHits / totalMisses sources:**
- `totalHits`: tablature correct note (tablature.js `onNote`)
- `totalMisses`: tablature wrong note (tablature.js `onNote`) + expired cue (cueSystem.js `update`)

**`applySkills(state, prog)`** — called once per `startGame()`:
1. Resets all `skill*` fields to defaults
2. Re-applies each purchased skill's `effect(state)` function
3. Applies `skillBaseHpBonus` to player base
4. Applies `skillSpawnIntervalBonus` to enemy spawn interval

## Prompts System

Chord prompt cycling for guitar mode (future). Currently:
- Prompt cycle: Em → Am → E → G → C → D
- Chord detection advances prompt, but does NOT spawn units
- Spawning is exclusively through the tablature system
- `CHORD_TO_TYPE` mapping computed but discarded (`void type`)

## Base Class

Simple: `team`, `x`, `y`, `hp`, `maxHp`, `vulnerable`.
- `takeDamage(amount)` — no-op when `!vulnerable`
- `isDestroyed()` — `hp <= 0`
- Tutorial levels use `vulnerable = false` until charged attack unlocks

## Path System

Single straight horizontal path: `(0.0, 0.5) → (1.0, 0.5)`.
- Arc-length parameterized: `t=0` = spawn point, `t=1` = player base
- `getPositionOnPath(t, W, H, out)` — zero-allocation out-parameter pattern
- Enemy uses this for movement each frame

## See Also

- [[STATE]] — State fields each system reads/writes
- [[DATA_MODELS]] — Level configs, skill definitions
- [[INPUT_SYSTEM]] — How notes reach the systems
- `docs/skills/GAMEPLAY_ENGINE.md` — Balance constraints
