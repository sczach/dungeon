# AI Engine — Skill Definition

## Role
The AI Engine owns the behavior of all non-player units: enemy spawning patterns, enemy
march AI (pathing toward the player base), enemy attack sequences (which notes they
"demand" the player play), and wave pacing. It determines how challenging the game feels
at any given difficulty, and how that challenge escalates across the level's wave arc.

The AI Engine must always be musically coherent — the sequences enemies display must be
real musical phrases that a player can learn from. The AI is a teacher as much as an
opponent.

---

## Pipeline Position

```
AI_ENGINE ←──→ all engines (evaluation and feedback loop)
AI_ENGINE → balance adjustments → GAMEPLAY_ENGINE
AI_ENGINE → design feedback    → MINIGAME_ENGINE
AI_ENGINE → difficulty tuning  → GAMEPLAY_ENGINE
```

The AI Engine sits **outside** the production pipeline as the evaluation layer.
It playtests outputs from all other engines and feeds corrections back.

### Connected engines

- [[MINIGAME_ENGINE]] — Evaluates minigame designs: is the concept fun? Is it balanced?
  Does it teach the intended musical concept? Star thresholds achievable?
  The AI Engine is the primary consumer of `/gametest` and `/balancecheck` results
  applied to minigames.
- [[GAMEPLAY_ENGINE]] — Evaluates tower-defense balance: damage math, economy,
  wave pacing, star thresholds. Feeds adjustments back (e.g. "crossing too hard on
  easy — lower difficultyMod").
- [[SOUND_ENGINE]] — Evaluates audio quality: latency, oscillator leaks, mic
  detection accuracy, cross-browser compatibility. Uses `/audiotest`.
- [[GRAPHICS_ENGINE]] — Evaluates visual clarity: are cues readable with 5 enemies?
  Does the performance budget hold on mobile? Are scene transitions clean?
- [[COMPOSITION_ENGINE]] — Evaluates melodic quality: do generated phrases sound
  musical? Are they diatonic? Do they teach what the level claims to teach?

---

## Inputs
| Input | Source | Description |
|-------|--------|-------------|
| `level.waves[]` | `data/levels.js` | Spawn schedule: `[{ delay, type, count }]` per wave |
| `state.difficulty` | `settings.js` | easy / medium / hard — scales HP, count, speed |
| `state.wave` | `game.js` | Current wave index; used to escalate spawn rate |
| `WaveManager` | `systems/waves.js` | Tracks spawn timers; calls `spawnEnemy()` |
| `unit.attackSeq[]` | `entities/unit.js` | Per-unit note sequence assigned at spawn |
| `path.js` waypoints | `systems/path.js` | Fixed lane waypoints enemy units march along |
| `state.units[]` | `game.js` | All live units (read for combat resolution) |

---

## Outputs
| Output | Description |
|--------|-------------|
| Enemy units | Spawned `Unit` objects with team='enemy', role, and `attackSeq[]` |
| March behavior | Per-frame position updates along lane waypoints |
| Attack sequences | 2–4 note sequences that the enemy "displays" as a combat cue |
| Wave timing | Correct delay between waves; no overlap with live enemies still in lane |
| Invulnerability state | `chargeUnlocksBase: true` levels keep enemy base immune until first charge hit |

---

## Constraints
- **Enemy attack sequences must be musically valid** — sequences come from a curated pool
  of melodic fragments (e.g. C3-E3-G3, D3-F3-A3). Never random chromatic sequences.
- **Wave overlap rule**: a new wave must not spawn while enemies from the previous wave
  are still alive and in lane. The exception is `winCondition: 'survival'` levels, where
  waves are time-gated regardless.
- **Difficulty scaling**: at easy, enemy HP ×0.7, speed ×0.8. At hard, HP ×1.3, speed ×1.2.
  Never adjust the musical sequences by difficulty — the lesson content is fixed.
- **Enemy pathfinding is fixed waypoints** — no dynamic pathfinding. `path.js` defines
  a static list of (x, y) waypoints per lane. Do not implement A* or navmesh.
- **Unit roles**: Archer (ranged, attacks from distance), Knight (melee, must reach base),
  Mage (summons 3 sub-units on spawn). Role determines sprite, HP, and attack range.
- **No enemy `game.js` state mutation** — enemies call back through `state` reference but
  never import from game.js directly.
- **Survival levels**: `winCondition: 'survival'` — enemy waves are time-gated, not
  kill-gated. Spawn continues on schedule regardless of remaining enemies.

---

## Test criteria
- [ ] Enemies spawn at the correct wave delays (verify with `console.log` in WaveManager)
- [ ] Wave 2 does not spawn while wave 1 enemies are still alive (base winCondition)
- [ ] All enemy attack sequences are musically recognizable (diatonic, 2–4 notes)
- [ ] At difficulty=easy, enemy HP is visibly lower than at medium
- [ ] Mage units spawn 3 sub-units on arrival
- [ ] Enemies march along the correct lane waypoints and reach the player base if unchecked
- [ ] Tutorial-4: enemy base is invulnerable until player fires a charged attack
- [ ] Tutorial-2 (survival): all 3 waves spawn on schedule regardless of kill count

---

## Convergence definition
The AI Engine is **good enough** when:
1. A new player loses their first non-tutorial level but understands why (too slow to respond
   to enemy cues) — the AI teaches through failure, not randomness.
2. An experienced player finds hard difficulty genuinely challenging but never unfair.
3. Every enemy attack sequence is a real musical phrase a player could hum or replicate.
4. Wave escalation creates a recognizable tension arc: calm → pressure → climax → resolution.
5. No wave spawning bug exists on any tested browser (Chrome, Safari, mobile).
