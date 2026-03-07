/**
 * @file src/entities/unit.js
 * Unified unit class for both player and enemy combatants.
 *
 * TEAM BEHAVIOUR
 * ──────────────
 *   'player' — spawns near player base, marches right toward enemy base
 *   'enemy'  — spawns near enemy base,  marches left  toward player base
 *
 * TIER STATS
 * ──────────
 *   Tier 1 — 30 hp,  8 dmg, 60 px/s, 50 px range, 1.0 atk/s, r=12
 *   Tier 2 — 60 hp, 15 dmg, 45 px/s, 60 px range, 0.8 atk/s, r=16
 *   Tier 3 — 120 hp, 25 dmg, 35 px/s, 70 px range, 0.6 atk/s, r=20
 *
 *   Note: enemy units have their speed halved in game.js (unit.speed *= 0.5)
 *   after construction, so the TIER_STATS values apply at full strength only
 *   to player units.
 *
 * UNIT AI  (update method)
 * ────────────────────────
 *   Priority order each tick:
 *   1. If stunned: freeze (marching = false, no attack, no move)
 *   2. findTarget() — nearest enemy unit within 2× attackRange
 *      → If found: move toward it at speed (2D angle), attack when in attackRange
 *   3. Fall back to enemy base:
 *      → If in attackRange: stop and attack base
 *      → Otherwise: march horizontally toward base (y stays fixed)
 *
 * ATTACK SEQUENCE  (assigned externally by AttackSequenceSystem)
 * ──────────────────────────────────────────────────────────────
 *   unit.attackSeq         — string[] note names the player must press
 *   unit.attackSeqProgress — index of next note to match (0 = full seq pending)
 *   unit.stunned           — true while stun effect is active
 *   unit.stunTimer         — seconds of stun remaining (ticked by AttackSequenceSystem)
 *
 * ZERO-ALLOCATION hot path
 * ─────────────────────────
 *   update() uses only local scalars and indexed for-loops.
 *   Math.sqrt is called at most once per unit per frame (when steering to a unit target)
 *   — this is acceptable for ≤ ~20 units and is not a memory allocation.
 */

/** @type {Array<null|{hp,damage,speed,range,attackSpeed,radius}>} */
const TIER_STATS = [
  null,
  { hp:  30, damage:  8, speed: 60, range: 50, attackSpeed: 1.0, radius: 12 },
  { hp:  60, damage: 15, speed: 45, range: 60, attackSpeed: 0.8, radius: 16 },
  { hp: 120, damage: 25, speed: 35, range: 70, attackSpeed: 0.6, radius: 20 },
];

export class Unit {
  /**
   * @param {'player'|'enemy'} team
   * @param {1|2|3}            tier
   * @param {number}           x    — logical pixel x (spawn position)
   * @param {number}           y    — logical pixel y (lane position)
   */
  constructor(team, tier, x, y) {
    const stats = TIER_STATS[tier];

    this.team  = team;
    this.tier  = tier;
    this.x     = x;
    this.y     = y;

    this.hp             = stats.hp;
    this.maxHp          = stats.hp;
    this.damage         = stats.damage;
    this.speed          = stats.speed;
    this.range          = stats.range;
    this.attackSpeed    = stats.attackSpeed;
    this.radius         = stats.radius;
    this.attackCooldown = 0;
    this.alive          = true;

    /** True only while actively advancing toward the enemy side. */
    this.marching = true;

    // ── Attack sequence (assigned by AttackSequenceSystem on enemy spawn) ─
    /** @type {string[]|null} */
    this.attackSeq         = null;
    this.attackSeqProgress = 0;
    this.stunned           = false;
    this.stunTimer         = 0;
  }

  /**
   * Find the highest-priority combat target — the nearest enemy unit within
   * 2× attackRange.  Returns the enemy base as a fallback when no unit qualifies.
   *
   * Using 2× range as the "lock-on" radius encourages proactive steering
   * toward nearby enemies before they're right on top of each other, which
   * reduces blob-stacking artifacts.
   *
   * ZERO ALLOCATION: indexed for-loop only.
   *
   * @param {Unit[]}  allUnits  — full state.units array (both teams)
   * @param {import('../systems/base.js').Base} enemyBase — this unit's target base
   * @returns {Unit|import('../systems/base.js').Base}
   */
  findTarget(allUnits, enemyBase) {
    const lockR2 = (this.range * 2) * (this.range * 2);
    let nearestUnit  = null;
    let nearestDist2 = lockR2 + 1;

    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
      if (!u.alive || u.team === this.team) continue;
      const dx = u.x - this.x;
      const dy = u.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= lockR2 && d2 < nearestDist2) {
        nearestDist2 = d2;
        nearestUnit  = u;
      }
    }

    return nearestUnit !== null ? nearestUnit : enemyBase;
  }

  /**
   * Per-frame simulation step.
   *
   * ZERO ALLOCATION: all intermediate values are local scalars.
   *
   * @param {number} dt         — delta time in seconds
   * @param {Unit[]} allUnits   — state.units reference (both teams, not copied)
   * @param {{player: import('../systems/base.js').Base,
   *           enemy:  import('../systems/base.js').Base}} bases
   */
  update(dt, allUnits, bases) {
    if (!this.alive) return;

    // ── 1. Stun: freeze entirely ──────────────────────────────────────────
    if (this.stunned) {
      this.marching = false;
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    const targetBase = this.team === 'player' ? bases.enemy : bases.player;
    const target     = this.findTarget(allUnits, targetBase);
    const atkR2      = this.range * this.range;

    if (target !== targetBase) {
      // ── 2a. Unit target found: steer toward it in 2D, attack when in range
      const dx   = target.x - this.x;
      const dy   = target.y - this.y;
      const d2   = dx * dx + dy * dy;

      if (d2 <= atkR2) {
        // In attack range: hold position
        this.marching = false;
        if (this.attackCooldown <= 0) {
          target.hp -= this.damage;
          if (target.hp <= 0) target.alive = false;
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else {
        // Steer toward target unit using normalised direction vector
        this.marching   = true;
        const dist      = Math.sqrt(d2);  // one sqrt per unit per frame — acceptable
        const nx        = dx / dist;
        const ny        = dy / dist;
        this.x         += nx * this.speed * dt;
        this.y         += ny * this.speed * dt;
      }
    } else {
      // ── 2b. No unit in lock-on radius — approach the enemy base ──────────
      const bx  = targetBase.x - this.x;
      const by  = targetBase.y - this.y;
      const bd2 = bx * bx + by * by;

      if (bd2 <= atkR2) {
        // At base: stop and attack
        this.marching = false;
        if (this.attackCooldown <= 0) {
          targetBase.takeDamage(this.damage);
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else {
        // Clear path — march horizontally (y stays fixed, preserving spawn variance)
        this.marching  = true;
        const dir      = this.team === 'player' ? 1 : -1;
        this.x        += dir * this.speed * dt;
      }
    }
  }
}
