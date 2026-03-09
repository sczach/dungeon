/**
 * @file src/entities/unit.js
 * Unified unit class for both player and enemy combatants.
 *
 * TEAM BEHAVIOUR
 * ──────────────
 *   'player' — spawns near player base; role determines movement
 *   'enemy'  — spawns near enemy base; marches left toward player base
 *
 * PLAYER UNIT ARCHETYPES (role determines movement & combat)
 * ───────────────────────────────────────────────────────────
 *   'tank'
 *     High HP, slow, low damage.  Marches to midfield (patrolAnchorX) then
 *     holds position and attacks any enemy within attack range.
 *
 *   'dps'
 *     Low HP, fast, high damage.  Always charges the enemy base / nearest
 *     enemy (same AI as old 'offensive' archer).
 *
 *   'ranged'
 *     Medium HP.  Advances until 180 px from target, then stops and fires
 *     hitscan shots (visual orb via pendingProjectile).  Retreats if an
 *     enemy closes to within 60 px.
 *
 *   'mage'
 *     Low HP, stays near player base (patrols ±30 px around patrolAnchorX).
 *     Every 3 s: AOE pulse that deals 15 dmg to all enemies within 120 px
 *     AND grants +10 % damage for 2 s to nearby friendly units.
 *
 * LEGACY PLAYER ROLES (kept for backward-compat, mapped at spawn)
 * ────────────────────────────────────────────────────────────────
 *   'offensive'  → same AI as 'dps' (march + target)
 *   'defensive'  → Knight patrol ±80 px, priority target = lowest-x enemy
 *   'swarm'      → seeks nearest enemy in full 2D, falls back to enemy base
 *
 * ENEMY AI
 *   All enemy units use the standard march-and-attack AI.
 *
 * TIER STATS (base values; archetypes override these at spawn)
 * ────────────────────────────────────────────────────────────
 *   Tier 1 — 30 hp,  8 dmg, 60 px/s, 50 px range, 1.0 atk/s, r=12
 *   Tier 2 — 60 hp, 15 dmg, 45 px/s, 60 px range, 0.8 atk/s, r=16
 *   Tier 3 — 120 hp, 25 dmg, 35 px/s, 70 px range, 0.6 atk/s, r=20
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
      this.pulseCooldown    = 0;
      this.damageMultiplier = 1.0;
      this.buffTimer        = 0;
      this.pendingProjectile = null;
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

    /** Visual unit type: 'tank'|'dps'|'ranged'|'mage'|'archer'|'knight'|null */
    this.unitType = null;

    /** Movement role: 'tank'|'dps'|'ranged'|'mage'|'offensive'|'defensive'|'swarm'|null */
    this.role = null;

    /**
     * Patrol / lane anchor (set by game.js at spawn time).
     * Tank: midfield hold x.  Mage: base-proximity x.  Others: lane centre y.
     */
    this.patrolAnchorX = x;
    this.patrolAnchorY = y;

    // ── Archetype-specific fields ────────────────────────────────────────
    /** Mage: seconds until next AOE pulse (initialised to 3 s at spawn). */
    this.pulseCooldown    = 0;
    /** Temporary damage multiplier from a mage buff (1.0 = none). */
    this.damageMultiplier = 1.0;
    /** Seconds remaining on the mage damage buff. */
    this.buffTimer        = 0;
    /** Ranged: visual projectile queued for game.js to push to state.projectiles. */
    this.pendingProjectile = null;
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

    // ── 0. Buff ticking — damage multiplier granted by mage aura ──────────
    if (this.buffTimer > 0) {
      this.buffTimer -= dt;
      if (this.buffTimer <= 0) {
        this.buffTimer        = 0;
        this.damageMultiplier = 1.0;
      }
    }

    // ── 1. Stun: freeze entirely ──────────────────────────────────────────
    if (this.stunned) {
      this.marching = false;
      return;
    }

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    const targetBase = this.team === 'player' ? bases.enemy : bases.player;

    // ── 2. Role-specific movement ─────────────────────────────────────────
    if (this.team === 'player') {
      switch (this.role) {
        case 'tank':
          this._updateTank(dt, allUnits);
          break;
        case 'ranged':
          this._updateRanged(dt, allUnits, targetBase);
          break;
        case 'mage':
          this._updateMage(dt, allUnits);
          break;
        case 'defensive':
          this._updateDefensive(dt, allUnits);
          break;
        case 'swarm':
          this._updateSwarm(dt, allUnits, targetBase);
          break;
        default:
          // 'dps', 'offensive', or any unrecognised role: standard march
          this._updateMarcher(dt, allUnits, targetBase);
          // Drift y toward lane centre (keeps the advance lane clean)
          if (this.role === 'dps' || this.role === 'offensive') {
            const dy = this.patrolAnchorY - this.y;
            if (Math.abs(dy) > 3) {
              this.y += Math.sign(dy) * Math.min(Math.abs(dy), this.speed * 0.4 * dt);
            }
          }
      }
    } else {
      // Enemy: always march
      this._updateMarcher(dt, allUnits, targetBase);
    }

    // ── 3. Lane y-clamping for all live units ─────────────────────────────
    // Disabled in multi-base levels so units can move freely between lanes.
    if (bases.player && !bases.clampDisabled) {
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
   * Default marching AI used by enemies and DPS/offensive player units.
   * Finds nearest target, steers toward it; falls back to marching at base.
   */
  _updateMarcher(dt, allUnits, targetBase) {
    const target = this.findTarget(allUnits, targetBase);
    const atkR2  = this.range * this.range;
    const dmg    = Math.round(this.damage * (this.damageMultiplier ?? 1.0));

    if (target !== targetBase) {
      // Unit target: steer in 2D, attack when in range
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const d2 = dx * dx + dy * dy;

      if (d2 <= atkR2) {
        this.marching = false;
        if (this.attackCooldown <= 0) {
          target.hp -= dmg;
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
      // No unit in lock-on radius — approach the target base in 2D.
      // For single-base levels: by ≈ 0 so movement is purely horizontal (same as before).
      // For multi-base levels with clampDisabled: units steer diagonally to off-lane bases.
      const bx   = targetBase.x - this.x;
      const by   = targetBase.y - this.y;
      const bd2  = bx * bx + by * by;

      if (bd2 <= atkR2) {
        this.marching = false;
        if (this.attackCooldown <= 0) {
          targetBase.takeDamage(this.damage);
          this.attackCooldown = 1 / this.attackSpeed;
        }
      } else {
        this.marching  = true;
        const dist     = Math.sqrt(bd2) || 1;
        this.x        += (bx / dist) * this.speed * dt;
        this.y        += (by / dist) * this.speed * dt;
      }
    }
  }

  // ── Private: tank AI ─────────────────────────────────────────────────────

  /**
   * Tank role: marches to midfield (patrolAnchorX), then holds and attacks
   * any enemy within attack range.  Never advances beyond patrolAnchorX.
   */
  _updateTank(dt, allUnits) {
    const atkR2 = this.range * this.range;
    const midX  = this.patrolAnchorX;
    const dmg   = Math.round(this.damage * (this.damageMultiplier ?? 1.0));

    // Find nearest enemy within attack range
    let nearestEnemy = null;
    let nearestDist2 = atkR2 + 1;
    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
      if (!u.alive || u.team === this.team) continue;
      const dx = u.x - this.x;
      const dy = u.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= atkR2 && d2 < nearestDist2) { nearestDist2 = d2; nearestEnemy = u; }
    }

    if (nearestEnemy) {
      this.marching = false;
      if (this.attackCooldown <= 0) {
        nearestEnemy.hp -= dmg;
        if (nearestEnemy.hp <= 0) nearestEnemy.alive = false;
        this.attackCooldown = 1 / this.attackSpeed;
      }
    } else if (this.x < midX - 4) {
      // March to midfield
      this.marching = true;
      this.x += this.speed * dt;
    } else {
      // Hold at midfield
      this.marching = false;
      if (this.x > midX) this.x = midX;
    }
  }

  // ── Private: ranged AI ───────────────────────────────────────────────────

  /**
   * Ranged role: advances until within this.range of the target, then holds
   * and fires hitscan shots (a visual-only projectile is queued in
   * this.pendingProjectile for game.js to collect).
   * If an enemy closes to within RETREAT_DIST, the unit retreats.
   */
  _updateRanged(dt, allUnits, targetBase) {
    const RETREAT_DIST = 60;
    const retR2        = RETREAT_DIST * RETREAT_DIST;
    const atkR2        = this.range * this.range;
    const dmg          = Math.round(this.damage * (this.damageMultiplier ?? 1.0));

    // Find nearest enemy unit (full scan, no lock-on limit)
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

    if (nearest && d2 <= retR2) {
      // Retreat — too close, back away
      this.marching = true;
      const dist    = Math.sqrt(d2) || 1;
      this.x       -= (dx / dist) * this.speed * dt;
      this.y       -= (dy / dist) * this.speed * dt;

    } else if (d2 <= atkR2) {
      // In firing range — hold and shoot
      this.marching = false;
      if (this.attackCooldown <= 0) {
        if (target === targetBase) {
          targetBase.takeDamage(dmg);
        } else {
          target.hp -= dmg;
          if (target.hp <= 0) target.alive = false;
          // Queue visual projectile (game.js moves it to state.projectiles)
          this.pendingProjectile = {
            x: this.x, y: this.y,
            tx: target.x, ty: target.y,
            startTime: performance.now(),
            travelTime: 250,
            team: 'player',
          };
        }
        this.attackCooldown = 1 / this.attackSpeed;
      }

    } else {
      // Advance toward target
      this.marching = true;
      const dist    = Math.sqrt(d2) || 1;
      this.x       += (dx / dist) * this.speed * dt;
      this.y       += (dy / dist) * this.speed * dt;
    }
  }

  // ── Private: mage AI ─────────────────────────────────────────────────────

  /**
   * Mage role: patrols near the player base (±30 px from patrolAnchorX).
   * Every 3 seconds triggers an AOE pulse:
   *   - 15 damage to all enemies within 120 px
   *   - +10 % damage buff for 2 s to all nearby friendly units
   */
  _updateMage(dt, allUnits) {
    const AOE_RADIUS = 120;
    const AOE_R2     = AOE_RADIUS * AOE_RADIUS;
    const AOE_DAMAGE = 15;

    // Tick pulse cooldown
    if (this.pulseCooldown > 0) this.pulseCooldown -= dt;

    // Patrol near anchor (slow return to anchor x)
    const dist = this.patrolAnchorX - this.x;
    if (Math.abs(dist) > 5) {
      this.marching = true;
      this.x += Math.sign(dist) * this.speed * dt;
    } else {
      this.marching = false;
    }

    // AOE pulse
    if (this.pulseCooldown <= 0) {
      this.pulseCooldown = 3.0;
      for (let i = 0; i < allUnits.length; i++) {
        const u = allUnits[i];
        if (!u.alive) continue;
        const ex = u.x - this.x;
        const ey = u.y - this.y;
        if (ex * ex + ey * ey > AOE_R2) continue;
        if (u.team !== this.team) {
          // Damage enemies
          u.hp -= AOE_DAMAGE;
          if (u.hp <= 0) u.alive = false;
        } else if (u !== this) {
          // Buff friendly units: +10 % damage for 2 s
          u.damageMultiplier = 1.1;
          u.buffTimer        = 2.0;
        }
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
    const dmg   = Math.round(this.damage * (this.damageMultiplier ?? 1.0));

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
          bestTarget.hp -= dmg;
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

  // ── Private: swarm (legacy Mage ×3) AI ───────────────────────────────────

  /**
   * Swarm role: seeks nearest enemy in unrestricted 2D; falls back to enemy base.
   */
  _updateSwarm(dt, allUnits, targetBase) {
    const dmg = Math.round(this.damage * (this.damageMultiplier ?? 1.0));

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
          target.hp -= dmg;
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
