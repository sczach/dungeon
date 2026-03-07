/**
 * @file src/entities/unit.js
 * Defender unit — placed by the player via chord detection.
 *
 * UNIT TYPES & STATS
 * ──────────────────
 *   Shield:    15 dmg, 80 px range,  1.0 atk/s  — sturdy frontline
 *   Archer:    12 dmg, 180 px range, 1.5 atk/s  — long-range single target
 *   Swordsman: 20 dmg, 70 px range,  1.2 atk/s  — heavy melee
 *   Mage:      25 dmg, 140 px range, 0.7 atk/s  — AoE (all enemies in range)
 *   Healer:    0 dmg,  120 px range, 1.0 atk/s  — restores 5 hp to lowest-hp ally
 *   Lancer:    18 dmg, 90 px range,  2.0 atk/s  — fast single target
 *
 * ZERO-ALLOCATION hot path
 * ────────────────────────
 * update() uses only local scalar variables and indexed for-loops.
 * No object literals, no array slices, no sort() calls.
 * The `enemies` and `units` parameters are references — not copied.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type registry
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Readonly<Record<string, {damage:number, range:number, attackSpeed:number}>>} */
const UNIT_STATS = Object.freeze({
  Shield:    { damage: 15, range:  80, attackSpeed: 1.0 },
  Archer:    { damage: 12, range: 180, attackSpeed: 1.5 },
  Swordsman: { damage: 20, range:  70, attackSpeed: 1.2 },
  Mage:      { damage: 25, range: 140, attackSpeed: 0.7 },
  Healer:    { damage:  0, range: 120, attackSpeed: 1.0 },
  Lancer:    { damage: 18, range:  90, attackSpeed: 2.0 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity class
// ─────────────────────────────────────────────────────────────────────────────

export class Unit {
  /**
   * @param {number} x    — logical pixel x (placement position)
   * @param {number} y    — logical pixel y (placement position)
   * @param {string} type — one of the keys in UNIT_STATS
   */
  constructor(x, y, type) {
    const stats = UNIT_STATS[type];

    this.x           = x;
    this.y           = y;
    this.type        = type;

    this.damage      = stats.damage;
    this.range       = stats.range;
    this.attackSpeed = stats.attackSpeed;

    /** Seconds until the unit may attack again. 0 = ready immediately. */
    this.attackCooldown = 0;

    this.maxHp  = 100;
    this.hp     = 100;
    this.radius = 12;   // visual radius; matches existing renderer fallback
    this.alive  = true;
  }

  /**
   * Per-frame update — cool down the attack timer and fire when ready.
   *
   * Dispatch by type:
   *   Mage   → deal damage to ALL enemies within range (AoE)
   *   Healer → restore 5 hp to the in-range ally with the lowest current hp
   *   others → deal damage to the single nearest enemy within range
   *
   * ZERO ALLOCATION: all intermediate values are local scalars.
   * No array methods (filter/sort/map) are called.
   *
   * @param {number}   dt      — delta time in seconds
   * @param {Array}    enemies — state.enemies reference (not copied)
   * @param {Array}   [units]  — state.units reference; required for Healer
   */
  update(dt, enemies, units = []) {
    if (!this.alive) return;

    // Decrement cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
      if (this.attackCooldown > 0) return;   // still cooling down
    }

    // ── Mage: AoE — damage every enemy within range ─────────────────────────
    if (this.type === 'Mage') {
      const r2  = this.range * this.range;
      let   hit = false;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (!e.alive) continue;
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        if (dx * dx + dy * dy <= r2) {
          e.takeDamage(this.damage);
          hit = true;
        }
      }
      if (hit) {
        this.attackCooldown = 1 / this.attackSpeed;
      }
      return;
    }

    // ── Healer: restore hp to lowest-hp ally in range ───────────────────────
    if (this.type === 'Healer') {
      const r2       = this.range * this.range;
      let   target   = null;
      let   lowestHp = Infinity;
      for (let j = 0; j < units.length; j++) {
        const u = units[j];
        if (u === this || !u.alive) continue;
        if (u.hp >= u.maxHp) continue;            // full hp — no point healing
        const dx = u.x - this.x;
        const dy = u.y - this.y;
        if (dx * dx + dy * dy <= r2 && u.hp < lowestHp) {
          lowestHp = u.hp;
          target   = u;
        }
      }
      if (target !== null) {
        target.hp = Math.min(target.hp + 5, target.maxHp);
        this.attackCooldown = 1 / this.attackSpeed;
      }
      return;
    }

    // ── All other types: single nearest enemy within range ───────────────────
    const r2           = this.range * this.range;
    let   nearestEnemy = null;
    let   nearestDist2 = Infinity;
    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      if (!e.alive) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestDist2) {
        nearestDist2  = d2;
        nearestEnemy  = e;
      }
    }
    if (nearestEnemy !== null && nearestDist2 <= r2) {
      nearestEnemy.takeDamage(this.damage);
      this.attackCooldown = 1 / this.attackSpeed;
    }
  }
}
