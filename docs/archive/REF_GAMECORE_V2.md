# Chord Wars — Game Core Reference (Phase 2)

> **Status:** Historical — bugs listed here are now fixed in Phase 2A. Unit types have been refactored.
> **Vault links:** [[GAME_SYSTEMS]] | [[STATE]] | [[DATA_MODELS]] | [[PROJECT_HISTORY]]
> **Use instead:** [[GAME_SYSTEMS]] for current entity system, combat, and waves.
> **Still useful:** Documents the pre-Phase-2A state; useful for understanding what changed.

## Entity System (current implementation)

### Units (src/entities/unit.js)
```
{team, tier, role, hp, damage, speed, range, attackSpeed, x, y, attackCooldown, targetId, alive}
```

**Roles (from tablature summon):**
| Role | UnitType | Behaviour |
|------|----------|-----------|
| offensive | archer | Spawns at base edge, marches toward enemy base |
| defensive | knight | Spawns close to player base, guards |
| swarm | mage | Spawns 3 units per summon (offsets −22/0/+22 px), small/fast/fragile |

**Mage swarm overrides:** radius: 10, hp: 15, damage: 5, speed: 85, attackSpeed: 1.5, range: 45

**Chord → Unit (guitar mode):**
G→Shield, C→Archer, D→Swordsman, Em→Mage, Am→Healer, E→Lancer

**Tiers:**
| Tier | Radius | Summon Cost |
|------|--------|-------------|
| 1 | 12px | 50 |
| 2 | 16px | 75 |
| 3 | 20px | 100 |

### Targeting
- Units auto-target nearest enemy within 2× attack range
- If no enemy in range, march toward enemy base
- Player units prioritize enemy units over base when enemies present
- Spawn y-variance: ±20px within lane

### Enemy spawning
- Global 0.5× speed multiplier on all enemy units
- Max 6 enemies on screen simultaneously
- Max 8 player units on screen

## Resource System

| Event | Change |
|-------|--------|
| Game start | +200 |
| Kill T1 | +20 |
| Kill T2 | +30 |
| Kill T3 | +50 |
| Combo milestone (5/10/20 kills) | +25 bonus |

Resource cap: 200 normal / 999 combo bonus only
Summon cooldown: 500ms after any successful summon

## Wave & Difficulty

- Wave advances every 30s (max wave 10)
- Enemy spawn interval: starts 8s (easy: 12s, hard: 5s)
- Interval reduces −0.5s every 60s, floor 2s
- **BUG**: Enemy base HP too high (each strike ~1% damage). Target: 15-25 hits to destroy.

**Tier probabilities:**
- First 120s: 95% T1, 5% T2
- Wave 1–3: 80% T1, 20% T2
- Wave 4–7: 50% T1, 40% T2, 10% T3
- Wave 8–10: 20% T1, 50% T2, 30% T3

## Combo Systems (two parallel)

**Kill combo** (game.js): consecutive kills → milestones at 5/10/20 → resource bonuses. Decay: 4s no input → reset.

**Chord family combo** (prompts.js, guitar mode): Minor family (Em, Am) vs Major family (G, C, D, E). Same family → combo++.

## Input Modes

Toggled by Space bar or touch button:
| Mode | Purpose |
|------|---------|
| summon | 3-note tablature sequence → spawn unit (resource-gated) |
| attack | Attack sequence input (targeted kills + chain lightning charge) |

**BUG**: No visual summon cue when in summon mode. Player doesn't know what to play.
**BUG**: Input confusion — unclear which system consumes each note.

## Scene State Machine

`TITLE → CALIBRATION → PLAYING → VICTORY | DEFEAT → TITLE`

- TITLE: instrument select, settings gear, start/practice buttons
- CALIBRATION: mic capture, noise floor measurement, waveform
- PLAYING: full game loop
- VICTORY: stats + replay/menu (**BUG**: buttons blocked until victory song finishes)
- DEFEAT: stats + retry/practice buttons

## System Map

- Tutorial levels: functional, completable
- Post-tutorial regions (The Crossroads, etc.): **BUG** — can't select, "Choose a Region" grayed out
- Zoom: **BUG** — can't zoom out far enough to see all levels
- Future: Three.js visualization (Phase 2E)

## Settings (localStorage)

| Field | Default | Type |
|-------|---------|------|
| difficulty | 'medium' | 'easy'\|'medium'\|'hard' |
| showNoteLabels | false | boolean |
| audioThreshold | 50 | 0–100 |
| masterVolume | 80 | 0–100 |
| showChordCues | true | boolean |
| cueDisplayStyle | 'note' | 'note'\|'qwerty'\|'staff' |
| instrument | 'piano' | 'piano'\|'guitar'\|'voice' |

**BUG**: Settings menu not appearing on TITLE screen.

## Renderer Contract

renderer.js receives full game state each frame and draws everything. It NEVER modifies state.
All draw calls use logical pixels (context pre-scaled by devicePixelRatio).
