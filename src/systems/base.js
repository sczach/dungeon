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
    this.team  = team;
    this.x     = x;
    this.y     = y;
    this.hp    = 100;
    this.maxHp = 100;
  }

  /**
   * @param {number} amount — positive damage amount
   */
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  /** @returns {boolean} */
  isDestroyed() {
    return this.hp <= 0;
  }
}
