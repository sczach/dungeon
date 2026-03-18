> **Archive** — superseded by [[GAME_SYSTEMS]]. **Vault links:** [[PROJECT_HISTORY]] | [[GAME_SYSTEMS]]

# Chord Wars — Game Core Reference (Phase 1B)
Paste this into conversations about enemies, units, waves, combat, paths, or HUD.

## Entity System
**Enemy** (enemy.js): {x, y, hp, maxHp, speed, pathIndex, pathProgress, alive, type}
- Types for MVP: Grunt (100hp, speed 1), Runner (60hp, speed 2), Tank (250hp, speed 0.5)
- Path following: interpolate between waypoints using pathProgress (0→1 per segment)
- On death: award score, trigger death animation, remove from active array
- On reaching end: subtract hp from base, remove

**Unit** (unit.js): {x, y, damage, range, attackSpeed, attackCooldown, targetId, type}
- Types mapped to chords: G→Shield(tank), C→Archer(ranged), D→Swordsman(melee), Em→Mage(AoE), Am→Healer(support), E→Lancer(fast)
- Auto-target: find nearest enemy within range each frame
- Attack: when cooldown=0, deal damage to target, reset cooldown

## Wave System (waves.js)
10 waves. Each wave: {enemies: [{type, count, interval}], delay_before_next}
Suggested scaling: wave N enemy HP = base × (1 + 0.15 × N). Spawn interval decreases ~5% per wave.

## Combat (combat.js)
Range-based: unit attacks enemy if distance(unit, enemy) < unit.range.
Damage per hit = unit.damage. No projectile physics for MVP (instant hit).
Process all units each frame: check cooldown, find target, apply damage.

## Path (path.js)
The Campfire: single path defined as array of [x,y] waypoints.
Example: [[40, 460], [120, 420], [220, 440], [320, 300], [420, 280], [520, 310], [660, 60]]
Enemies follow path via linear interpolation between waypoints.

## HUD (hud.js)
Top bar: Base HP (red bar, N/100) | Wave counter (N/10) | Score (yellow) | Mic status (green dot)
Bottom area: chord prompt name + tab notation + confidence bar (handled by prompts.js integration)

## Renderer Contract
renderer.js receives full game state each frame and draws everything. It NEVER modifies state.
Methods: clear(), drawBackground(map), drawPath(path), drawEnemies(enemies[]), drawUnits(units[]), drawHUD(state), drawEffects(effects[])
