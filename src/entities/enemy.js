/**
 * @file src/entities/enemy.js
 * Enemy entity — walks the path, can take damage, removes itself when dead
 * or when it reaches the castle.
 *
 * ZERO-ALLOCATION hot path
 * ────────────────────────
 * update() calls getPositionOnPath(…, this) which writes x/y directly into
 * the Enemy instance.  No temporary {x,y} object is created per frame.
 * getPathLength() returns a number.  All other operations are arithmetic.
 *
 * LIFECYCLE FLAGS
 * ───────────────
 *   alive         — false when dead (hp ≤ 0) OR when pathT ≥ 1.
 *                   game.js uses this to splice the enemy out of state.enemies.
 *   reachedCastle — true only when pathT ≥ 1 (alive → false via the castle).
 *                   game.js decrements state.lives when this is set.
 *                   Always false when the enemy was killed by a unit.
 */

import { getPathLength, getPositionOnPath } from '../systems/path.js';

export class Enemy {
  /**
   * @param {{ enemyHp: number, enemySpeed: number }} config — wave config slice
   */
  constructor(config) {
    this.hp     = config.enemyHp;
    this.maxHp  = config.enemyHp;
    this.speed  = config.enemySpeed;  // logical pixels / second

    this.pathT  = 0;    // 0 = spawn, 1 = reached castle
    this.x      = 0;    // logical pixel x — initialised by first update()
    this.y      = 0;    // logical pixel y — initialised by first update()

    // Visual radius scales slightly with HP so tougher enemies look bigger.
    // Wave 1 (hp=30) → r≈9,  Wave 10 (hp=150) → r≈13
    this.radius = 8 + Math.round(config.enemyHp / 30);

    this.alive         = true;
    this.reachedCastle = false;

    console.log(`[Enemy spawn] hp=${this.hp} speed=${this.speed} radius=${this.radius} pathT=${this.pathT} x=${this.x} y=${this.y}`);
  }

  /**
   * Advance the enemy along the path and refresh its screen position.
   * Call with dt=0 immediately after construction to initialise x/y without
   * moving the enemy.
   *
   * ZERO ALLOCATION: position is written directly into this.x / this.y via
   * the `out` parameter of getPositionOnPath.
   *
   * @param {number} dt      — delta time in seconds
   * @param {number} canvasW — canvas logical width
   * @param {number} canvasH — canvas logical height
   */
  update(dt, canvasW, canvasH) {
    if (!this.alive) return;

    // Advance progress: speed (px/s) ÷ pathLength (px) = fraction / second
    this.pathT += this.speed * dt / getPathLength(canvasW, canvasH);

    if (this.pathT >= 1) {
      this.pathT         = 1;
      this.reachedCastle = true;
      this.alive         = false;
      // Snap to castle position — getPositionOnPath clamps t=1 to end waypoint
    }

    // Write x/y directly into this — no object allocation
    getPositionOnPath(this.pathT, canvasW, canvasH, this);
  }

  /**
   * Apply damage to this enemy.
   * Sets alive = false (and reachedCastle stays false) when hp reaches 0.
   *
   * @param {number} amount — damage points (positive)
   */
  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp    = 0;
      this.alive = false;
    }
  }
}
