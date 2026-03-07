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
 * MARCHING AI  (update method)
 * ────────────────────────────
 *   • If stunned: freeze entirely (marching = false, no attack)
 *   • If enemy unit in range: set marching = false, attack if cooldown ready
 *   • If target base in range: set marching = false, attack base
 *   • Otherwise: set marching = true, advance one step toward enemy side
 *
 * ATTACK SEQUENCE  (assigned externally by AttackSequenceSystem)
 * ───────────────
 *   unit.attackSeq         — string[] note names the player must press to trigger effect
 *   unit.attackSeqProgress — index of next note to match (0 = full sequence pending)
 *   unit.stunned           — true while stun effect is active
 *   unit.stunTimer         — seconds of stun remaining
 *
 * ZERO-ALLOCATION hot path
 * ─────────────────────────
 *   update() uses only local scalars and indexed for-loops.
 *   No array methods (filter/sort/map) are called.
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
   * @param {number}           y    — logical pixel y (lane position, fixed)
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

    // ── Marching state (fix: explicitly tracked so renderer can animate) ──
    /** True only while actively advancing toward the enemy side. */
    this.marching       = true;

    // ── Attack sequence (assigned by AttackSequenceSystem on spawn) ────────
    /** @type {string[]|null} */
    this.attackSeq         = null;
    this.attackSeqProgress = 0;
    this.stunned           = false;
    this.stunTimer         = 0;
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

    // ── Stun: freeze entirely ─────────────────────────────────────────────
    if (this.stunned) {
      this.marching = false;
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

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
      // ── Enemy in range: hold position and attack ─────────────────────────
      this.marching = false;
      if (this.attackCooldown <= 0) {
        nearestEnemy.hp -= this.damage;
        if (nearestEnemy.hp <= 0) nearestEnemy.alive = false;
        this.attackCooldown = 1 / this.attackSpeed;
      }
    } else {
      // ── No unit in range — check target base ─────────────────────────────
      const bx  = targetBase.x - this.x;
      const by  = targetBase.y - this.y;
      const bd2 = bx * bx + by * by;

      if (bd2 <= r2) {
        // At base: stop and attack
        this.marching = false;
        if (this.attackCooldown <= 0) {
          targetBase.takeDamage(this.damage);
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else {
        // Clear path ahead — march
        this.marching  = true;
        this.x        += dir * this.speed * dt;
      }
    }
  }
}
