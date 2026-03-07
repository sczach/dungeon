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
 *   Tier 1 — 30 hp, 8 dmg, 60 px/s, 50 px range,  1.0 atk/s, r=12
 *   Tier 2 — 60 hp, 15 dmg, 45 px/s, 60 px range, 0.8 atk/s, r=16
 *   Tier 3 — 120 hp, 25 dmg, 35 px/s, 70 px range, 0.6 atk/s, r=20
 *
 * MARCHING AI  (update method)
 * ────────────────────────────
 *   1. Find nearest enemy unit within range → attack if cooldown ready
 *   2. If no enemy in range, check target base distance → attack base
 *   3. Otherwise → march one step toward enemy side
 *
 * ZERO-ALLOCATION hot path
 * ─────────────────────────
 *   update() uses only local scalars and indexed for-loops.
 *   No array methods (filter/sort/map) are called.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tier registry — index 1-based (index 0 is a guard entry)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Array<null|{hp:number,damage:number,speed:number,range:number,attackSpeed:number,radius:number}>} */
const TIER_STATS = [
  null,   // guard — tiers are 1-indexed
  { hp:  30, damage:  8, speed: 60, range: 50, attackSpeed: 1.0, radius: 12 },
  { hp:  60, damage: 15, speed: 45, range: 60, attackSpeed: 0.8, radius: 16 },
  { hp: 120, damage: 25, speed: 35, range: 70, attackSpeed: 0.6, radius: 20 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Entity class
// ─────────────────────────────────────────────────────────────────────────────

export class Unit {
  /**
   * @param {'player'|'enemy'} team
   * @param {1|2|3}            tier
   * @param {number}           x    — logical pixel x (spawn position)
   * @param {number}           y    — logical pixel y (lane position, fixed)
   */
  constructor(team, tier, x, y) {
    const stats = TIER_STATS[tier];

    this.team  = team;
    this.tier  = tier;
    this.x     = x;
    this.y     = y;

    this.hp           = stats.hp;
    this.maxHp        = stats.hp;
    this.damage       = stats.damage;
    this.speed        = stats.speed;
    this.range        = stats.range;
    this.attackSpeed  = stats.attackSpeed;
    this.radius       = stats.radius;
    this.attackCooldown = 0;
    this.alive        = true;
  }

  /**
   * Per-frame update — march, fight enemy units, or attack the target base.
   *
   * ZERO ALLOCATION: all intermediate values are local scalars.
   * No array methods are called.
   *
   * @param {number} dt         — delta time in seconds
   * @param {Unit[]} allUnits   — state.units reference (both teams, not copied)
   * @param {{player: import('../systems/base.js').Base,
   *           enemy:  import('../systems/base.js').Base}} bases
   */
  update(dt, allUnits, bases) {
    if (!this.alive) return;

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    const dir        = this.team === 'player' ? 1 : -1;
    const targetBase = this.team === 'player' ? bases.enemy : bases.player;
    const r2         = this.range * this.range;

    // ── Find nearest enemy unit within attack range ────────────────────────
    let nearestEnemy = null;
    let nearestDist2 = r2 + 1;   // initialise just outside range

    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
      if (!u.alive || u.team === this.team) continue;
      const dx = u.x - this.x;
      const dy = u.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2 && d2 < nearestDist2) {
        nearestDist2 = d2;
        nearestEnemy = u;
      }
    }

    if (nearestEnemy !== null) {
      // ── Attack nearest enemy unit ────────────────────────────────────────
      if (this.attackCooldown <= 0) {
        nearestEnemy.hp -= this.damage;
        if (nearestEnemy.hp <= 0) nearestEnemy.alive = false;
        this.attackCooldown = 1 / this.attackSpeed;
      }
      // Hold position while combat is active
    } else {
      // ── No unit in range — check target base ─────────────────────────────
      const bx  = targetBase.x - this.x;
      const by  = targetBase.y - this.y;
      const bd2 = bx * bx + by * by;

      if (bd2 <= r2) {
        // Attack base
        if (this.attackCooldown <= 0) {
          targetBase.takeDamage(this.damage);
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else {
        // March toward enemy side
        this.x += dir * this.speed * dt;
      }
    }
  }
}
