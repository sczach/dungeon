/**
 * @file src/entities/unit.js
 * Unified unit class for both player and enemy combatants.
 *
 * TEAM BEHAVIOUR
 * ──────────────
 *   'player' — spawns near player base; role determines movement
 *   'enemy'  — spawns near enemy base; marches left toward player base
 *
 * PLAYER UNIT ROLES
 * ─────────────────
 *   'offensive' (Archer)
 *     Advances horizontally through lane centre toward enemy base.
 *     Drifts y toward lane centre.  Attacks enemies in range.
 *
 *   'defensive' (Knight)
 *     Spawns near player base.  Patrols ±80 px around anchor.
 *     Priority target: enemy with lowest x (closest to player base).
 *     Does NOT advance beyond anchor + 80 px.
 *
 *   'swarm' (Mage ×3)
 *     Small unit (r=10, overridden by game.js).
 *     Seeks nearest enemy in full 2D.  Falls back to enemy base.
 *
 * TIER STATS
 * ──────────
 *   Tier 1 — 30 hp,  8 dmg, 60 px/s, 50 px range, 1.0 atk/s, r=12
 *   Tier 2 — 60 hp, 15 dmg, 45 px/s, 60 px range, 0.8 atk/s, r=16
 *   Tier 3 — 120 hp, 25 dmg, 35 px/s, 70 px range, 0.6 atk/s, r=20
 *   Swarm  — stats overridden in game.js after construction
 *
 * LANE CLAMPING
 * ─────────────
 *   All units are clamped to the combat strip at the end of every update().
 *   Lane centre  = bases.player.y        (= LANE_Y × H)
 *   Lane half-H  = laneCenter × (LANE_HEIGHT / LANE_Y) × 0.5
 *   (derived from base y so we never need to pass canvas H explicitly)
 */

import { LANE_Y, LANE_HEIGHT } from '../constants.js';

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

    // Guard: invalid tier — create a dead no-op unit rather than crashing
    if (!stats) {
      console.error(`[unit] invalid tier "${tier}" (team=${team}) — skipping`);
      this.team = team; this.tier = 1; this.x = x || 0; this.y = y || 0;
      this.hp = 0; this.maxHp = 0; this.damage = 0; this.speed = 0;
      this.range = 0; this.attackSpeed = 1; this.radius = 12;
      this.attackCooldown = 0; this.alive = false; this.marching = false;
      this.attackSeq = null; this.attackSeqProgress = 0;
      this.stunned = false; this.stunTimer = 0;
      this.unitType = null;
      this.role = null;
      this.patrolAnchorX = x || 0;
      this.patrolAnchorY = y || 0;
      return;
    }

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
    this.marching       = true;

    // ── Attack sequence (assigned by AttackSequenceSystem on enemy spawn) ──
    /** @type {string[]|null} */
    this.attackSeq         = null;
    this.attackSeqProgress = 0;
    this.stunned           = false;
    this.stunTimer         = 0;

    /** Visual unit type for player units: 'archer' | 'knight' | 'mage' | null */
    this.unitType = null;

    /** Movement role: 'offensive' | 'defensive' | 'swarm' | null (enemy) */
    this.role = null;

    /**
     * Patrol / lane anchor (set by game.js at spawn time).
     * Defensive: patrol centre x; Offensive/Swarm: lane centre y.
     */
    this.patrolAnchorX = x;
    this.patrolAnchorY = y;
  }

  /**
   * Find the highest-priority combat target — the nearest enemy unit within
   * 2× attackRange.  Returns the enemy base as a fallback.
   *
   * ZERO ALLOCATION: indexed for-loop only.
   *
   * @param {Unit[]}  allUnits
   * @param {import('../systems/base.js').Base} enemyBase
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

    // ── 2. Role-specific movement ─────────────────────────────────────────
    if (this.team === 'player' && this.role === 'defensive') {
      this._updateDefensive(dt, allUnits);
    } else if (this.team === 'player' && this.role === 'swarm') {
      this._updateSwarm(dt, allUnits, targetBase);
    } else {
      // Offensive player units and all enemies: standard march + target logic
      this._updateMarcher(dt, allUnits, targetBase);

      // Offensive player units drift y toward lane centre for clean advance
      if (this.team === 'player' && this.role === 'offensive') {
        const dy = this.patrolAnchorY - this.y;
        if (Math.abs(dy) > 3) {
          this.y += Math.sign(dy) * Math.min(Math.abs(dy), this.speed * 0.4 * dt);
        }
      }
    }

    // ── 3. Lane y-clamping for all live units ─────────────────────────────
    // Lane centre = bases.player.y = LANE_Y × H
    // Half-height = laneCenter × (LANE_HEIGHT / LANE_Y) × 0.5
    if (bases.player) {
      const laneCenter = bases.player.y;
      const halfH      = laneCenter * (LANE_HEIGHT / LANE_Y) * 0.5;
      const minY = laneCenter - halfH + this.radius;
      const maxY = laneCenter + halfH - this.radius;
      if (this.y < minY) this.y = minY;
      else if (this.y > maxY) this.y = maxY;
    }
  }

  // ── Private: standard march AI ───────────────────────────────────────────

  /**
   * Default marching AI used by enemies and offensive player units.
   * Finds nearest target, steers toward it; falls back to marching at base.
   */
  _updateMarcher(dt, allUnits, targetBase) {
    const target = this.findTarget(allUnits, targetBase);
    const atkR2  = this.range * this.range;

    if (target !== targetBase) {
      // Unit target: steer in 2D, attack when in range
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const d2 = dx * dx + dy * dy;

      if (d2 <= atkR2) {
        this.marching = false;
        if (this.attackCooldown <= 0) {
          target.hp -= this.damage;
          if (target.hp <= 0) target.alive = false;
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else {
        this.marching   = true;
        const dist      = Math.sqrt(d2);
        this.x         += (dx / dist) * this.speed * dt;
        this.y         += (dy / dist) * this.speed * dt;
      }
    } else {
      // No unit in lock-on radius — approach the enemy base
      const bx  = targetBase.x - this.x;
      const by  = targetBase.y - this.y;
      const bd2 = bx * bx + by * by;

      if (bd2 <= atkR2) {
        this.marching = false;
        if (this.attackCooldown <= 0) {
          targetBase.takeDamage(this.damage);
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else {
        this.marching  = true;
        const dir      = this.team === 'player' ? 1 : -1;
        this.x        += dir * this.speed * dt;
      }
    }
  }

  // ── Private: defensive (Knight) AI ───────────────────────────────────────

  /**
   * Defensive role: guards the player base.
   * - Priority target: enemy with lowest x (closest to player base)
   * - In attack range: hold position and attack
   * - In detection range (2.5× attack range): move toward target,
   *   x clamped to [anchorX − 80, anchorX + 80] (never advances too far)
   * - Otherwise: return to patrol anchor
   */
  _updateDefensive(dt, allUnits) {
    const atkR2 = this.range * this.range;
    const detR  = this.range * 2.5;
    const detR2 = detR * detR;

    // Find the enemy closest to the player base (lowest x)
    let bestTarget = null;
    let lowestX    = Infinity;
    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
      if (!u.alive || u.team === this.team) continue;
      if (u.x < lowestX) { lowestX = u.x; bestTarget = u; }
    }

    if (bestTarget) {
      const dx = bestTarget.x - this.x;
      const dy = bestTarget.y - this.y;
      const d2 = dx * dx + dy * dy;

      if (d2 <= atkR2) {
        // In attack range: hold and attack
        this.marching = false;
        if (this.attackCooldown <= 0) {
          bestTarget.hp -= this.damage;
          if (bestTarget.hp <= 0) bestTarget.alive = false;
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else if (d2 <= detR2) {
        // In detection range: move toward target, clamped to patrol zone
        this.marching   = true;
        const dist      = Math.sqrt(d2);
        const nx        = dx / dist;
        const ny        = dy / dist;
        const newX      = this.x + nx * this.speed * dt;
        const newY      = this.y + ny * this.speed * dt;
        // Hard cap: defensive units never wander more than 80 px from anchor
        this.x = Math.max(this.patrolAnchorX - 80, Math.min(this.patrolAnchorX + 80, newX));
        this.y = newY;
      } else {
        this._returnToAnchor(dt);
      }
    } else {
      this._returnToAnchor(dt);
    }
  }

  // ── Private: swarm (Mage ×3) AI ──────────────────────────────────────────

  /**
   * Swarm role: seeks nearest enemy in unrestricted 2D; falls back to enemy base.
   */
  _updateSwarm(dt, allUnits, targetBase) {
    // Seek nearest enemy (any range — no lock-on threshold)
    let nearest   = null;
    let nearestD2 = Infinity;
    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
      if (!u.alive || u.team === this.team) continue;
      const dx = u.x - this.x;
      const dy = u.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestD2) { nearestD2 = d2; nearest = u; }
    }

    const target = nearest ?? targetBase;
    const dx     = target.x - this.x;
    const dy     = target.y - this.y;
    const d2     = dx * dx + dy * dy;
    const atkR2  = this.range * this.range;

    if (d2 <= atkR2) {
      this.marching = false;
      if (this.attackCooldown <= 0) {
        if (target === targetBase) {
          targetBase.takeDamage(this.damage);
        } else {
          target.hp -= this.damage;
          if (target.hp <= 0) target.alive = false;
        }
        this.attackCooldown = 1 / this.attackSpeed;
      }
    } else {
      this.marching   = true;
      const dist      = Math.sqrt(d2);
      this.x         += (dx / dist) * this.speed * dt;
      this.y         += (dy / dist) * this.speed * dt;
    }
  }

  // ── Private: return to patrol anchor ─────────────────────────────────────

  _returnToAnchor(dt) {
    const dx = this.patrolAnchorX - this.x;
    const dy = this.patrolAnchorY - this.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 25) {
      this.marching   = true;
      const dist      = Math.sqrt(d2);
      this.x         += (dx / dist) * this.speed * dt;
      this.y         += (dy / dist) * this.speed * dt;
    } else {
      this.marching = false;
    }
  }
}
