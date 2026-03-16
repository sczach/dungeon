/**
 * @file src/systems/base.js
 * Player and enemy base entities.
 *
 * A Base is the win/lose objective for both sides.  Units attack it when no
 * enemy units remain within range.  The renderer draws it as a castle shape
 * with a health bar; its (x, y) is the centre of the structure.
 */

export class Base {
  /**
   * @param {'player'|'enemy'} team
   * @param {number} x — logical pixel x of base centre (updated on canvas resize)
   * @param {number} y — logical pixel y of base centre
   */
  constructor(team, x, y) {
    this.team       = team;
    this.x          = x;
    this.y          = y;
    this.hp         = 100;
    this.maxHp      = 100;
    /** Set to false during early phases so the enemy base cannot be damaged. */
    this.vulnerable = true;
  }

  /**
   * @param {number} amount — positive damage amount
   * Silently ignored when this.vulnerable is false (enemy base during intro/development phases).
   */
  takeDamage(amount) {
    if (!this.vulnerable) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.team === 'enemy') {
      console.log(`[base damage] enemy base took ${Math.round(amount)} damage, now at ${this.hp}/${this.maxHp} hp`);
    }
  }

  /** @returns {boolean} */
  isDestroyed() {
    return this.hp <= 0;
  }
}
