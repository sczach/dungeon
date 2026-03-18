# ChordWars Data Models

> All data files are in `src/data/`. Pure frozen data — no state mutation, no imports from game systems.

## Levels (levels.js, 150 lines)

**Exports:** `LEVELS`, `LEVELS_BY_ID`, `computeStars()`, `isLevelUnlocked()`

### Level Configs

| id | name | maxWaves | difficultyMod | spawnMod | startResources | unlockRequires | starThresholds |
|----|------|----------|---------------|----------|----------------|----------------|----------------|
| campfire | The Campfire | 7 | 0.8 | 1.25 | 250 | null | [0, 65, 85] |
| crossing | The Crossing | 10 | 1.0 | 1.0 | 200 | campfire | [0, 70, 90] |
| siege | The Siege | 10 | 1.35 | 0.8 | 150 | crossing | [0, 70, 90] |

Each level also has: `bpm`, `enemyBases[]` (position + optional HP override), `phases[]` (label + duration).

### Star Calculation

```
computeStars(accuracyPct, level):
  accuracyPct >= starThresholds[2] → 3★
  accuracyPct >= starThresholds[1] → 2★
  else → 1★ (any win)
```

## World Map (worldMap.js, 563 lines)

**Exports:** `REGIONS`, `WORLD_MAP_NODES`, `WORLD_MAP_NODES_BY_ID`, `TUTORIAL_SEQUENCE`, `isNodeUnlocked()`

### Map Space

2400×1800 logical pixels. Camera default focus: (1200, 1430).

### Regions (6)

| Region | Color | Description |
|--------|-------|-------------|
| tutorial | white | Tutorial spine |
| hub | gold | Central hub node |
| tone | blue | Left — pitch/intonation |
| rhythm | orange | Bottom-left — rhythm/timing |
| theory | purple | Right — music theory |
| musicianship | green | Top — performance skills |

### Nodes (29 total)

- **4 tutorial nodes** (T1–T4): linear progression, forced order
- **1 hub node**: unlocks when `tutorialComplete = true`
- **24 skill-region stubs**: 6 per region, entry nodes require hub, deeper nodes require entry

### Tutorial Node Configs

| ID | Special Config |
|----|---------------|
| tutorial-1 | `_enemyBaseHp: 80`, `allowedModes: ['attack']` |
| tutorial-2 | `winCondition: 'survival'` |
| tutorial-3 | `allowedModes: ['summon', 'attack']` |
| tutorial-4 | `chargeUnlocksBase: true` |

### Node Shape

```
{
  id, name, subtitle, icon, region,
  isTutorial, isHub, isEntryNode, stub,
  x, y, connections[],
  unlockRequires[],     // node IDs that need ≥1★
  levelGoal, skillFocus, mechanicBadge,
  estimatedDuration,
  allowedModes,         // string[]|null
  winCondition,         // 'base'|'survival'
  chargeUnlocksBase,    // boolean
  tutorialOverlay,      // hint text
  bpm, starThresholds, enemyBases, phases,
  _enemyBaseHp          // optional override
}
```

### Unlock Logic

```
isNodeUnlocked(node, progression):
  for each requirement in node.unlockRequires:
    if requirement === 'hub' → needs tutorialComplete
    else → needs bestStars[requirement] >= 1
  all must pass
```

## Skills (skills.js, 204 lines)

**Exports:** `SKILLS`, `SKILLS_BY_ID`

### Skill Tree (3 paths × 3 tiers)

```
Path A: steady-tempo(I) → chord-memory(II) → voice-leading(III)
Path B: clear-tone(I)   → rhythm-reading(II) → sight-reading(III)
Path C: open-position(I) → strong-fingers(II) → tempo-master(III)
```

| id | Tier | Cost | Requires | Effect |
|----|------|------|----------|--------|
| steady-tempo | I | 1★ | — | `skillTimingWindowMult *= 1.20` |
| clear-tone | I | 1★ | — | `resources += 40` |
| open-position | I | 1★ | — | `skillMaxUnitsBonus += 1` |
| chord-memory | II | 2★ | steady-tempo | `skillChordMemory=true; skillMaxUnitsBonus+=1` |
| rhythm-reading | II | 2★ | clear-tone | `skillRhythmReading=true; skillSpawnIntervalBonus+=1.0` |
| strong-fingers | II | 2★ | open-position | `skillMaxUnitsBonus += 1` |
| voice-leading | III | 3★ | chord-memory + any 2 Tier-II | `skillUnlockMage=true; skillSummonCooldownBonus+=150` |
| sight-reading | III | 3★ | rhythm-reading + any 2 Tier-II | `skillSightReading=true; skillBaseHpBonus+=20` |
| tempo-master | III | 3★ | strong-fingers + any 2 Tier-II | `skillTempoMaster=true; skillComboDoubleMilestone=true` |

Tier III gate: `requiresTierCount: {tier: 2, count: 2}` — need any 2 Tier-II skills.

## Lessons (lessons.js, 183 lines)

**Exports:** `LESSONS`, `LESSONS_BY_LEVEL_ID`, `applyLesson()`, `evaluateLesson()`

| levelId | title | cueStyle | minAccuracy | Notes |
|---------|-------|----------|-------------|-------|
| campfire | First Notes | note | 80% | C3 D3 E3 F3 G3 |
| crossing | Two Notes Together | staff | 70% | C3 E3 G3 D3 A3 F3 B3 |
| siege | Your First Chords | note | 65% | C3 E3 G3 F3 A3 C4 G3 B3 D4 + minChordPlays:4 |

- `applyLesson(state, levelId)` — writes `state.currentLesson`
- `evaluateLesson(state, lesson)` — returns `{metAccuracy, metChordPlays, overall}`

## Chords (data/chords.js, 27 lines)

**Exports:** `CHORD_DATA`, `CHORD_FALLBACK`

Guitar tab notation for 6 open chords: G, C, D, Em, Am, E. Used by `PromptManager` for guitar mode display. Each has `{name, tab, difficulty}`.

## See Also

- [[GAME_SYSTEMS]] — How these data models are consumed
- [[STATE]] — Runtime state vs. static data
- [[ARCHITECTURE]] — Module layout
