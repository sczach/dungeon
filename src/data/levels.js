/**
 * @file src/data/levels.js
 * Level configuration table for ChordWars.
 *
 * Each level object is a self-contained config that startGame() consumes.
 * Difficulty is expressed as multipliers on top of the base game constants
 * so settled systems (waves.js, unit.js, combat.js) need no changes.
 *
 * Unlock logic: computed at runtime from progression.bestStars — not stored
 * directly so it can never go stale against save data.
 */

/**
 * @typedef {Object} LevelConfig
 * @property {string}   id              — unique identifier, used as localStorage key
 * @property {string}   name            — display name on level select
 * @property {string}   subtitle        — one-line flavour description
 * @property {string}   icon            — emoji used on the level card
 * @property {number}   maxWaves        — how many waves before VICTORY is possible
 * @property {number}   difficultyMod   — multiplier on enemy HP and tier-3 probability
 * @property {number}   spawnMod        — multiplier on enemy spawn interval (>1 = slower = easier)
 * @property {number}   startResources  — initial resource amount (overrides game.js default 200)
 * @property {number}   maxEnemyCap     — max simultaneous enemy units on screen
 * @property {string}   unlockRequires  — id of level that must be beaten first, or null
 * @property {number[]} starThresholds  — base HP % remaining for [1-star, 2-star, 3-star]
 */

/** @type {ReadonlyArray<Readonly<LevelConfig>>} */
export const LEVELS = Object.freeze([
  Object.freeze({
    id:             'campfire',
    name:           'The Campfire',
    subtitle:       'Learn the basics',
    icon:           '🔥',
    maxWaves:       7,
    difficultyMod:  0.8,    // enemy HP ×0.8 — softer introduction
    spawnMod:       1.25,   // spawn interval ×1.25 — more breathing room
    startResources: 250,    // extra starting gold
    maxEnemyCap:    5,
    unlockRequires: null,   // always available
    starThresholds: [1, 51, 76],  // ≥1% = 1★, ≥51% = 2★, ≥76% = 3★
  }),
  Object.freeze({
    id:             'crossing',
    name:           'The Crossing',
    subtitle:       'Hold the bridge',
    icon:           '⚔️',
    maxWaves:       10,
    difficultyMod:  1.0,    // standard enemy strength
    spawnMod:       1.0,    // standard spawn timing
    startResources: 200,
    maxEnemyCap:    6,
    unlockRequires: 'campfire',
    starThresholds: [1, 61, 86],
  }),
  Object.freeze({
    id:             'siege',
    name:           'The Siege',
    subtitle:       'Last stand',
    icon:           '🏰',
    maxWaves:       10,
    difficultyMod:  1.35,   // tankier enemies, more tier-3 at end
    spawnMod:       0.8,    // faster enemy spawns
    startResources: 150,    // fewer starting resources — pressure from turn 1
    maxEnemyCap:    8,
    unlockRequires: 'crossing',
    starThresholds: [1, 41, 71],
  }),
]);

/** Convenience map for O(1) lookup by id. */
export const LEVELS_BY_ID = Object.freeze(
  Object.fromEntries(LEVELS.map(l => [l.id, l]))
);

/**
 * Determine how many stars were earned based on remaining base HP percentage.
 *
 * @param {number} baseHp     — current player base HP (0–maxHp)
 * @param {number} baseMaxHp  — max player base HP
 * @param {LevelConfig} level — the level config for its starThresholds
 * @returns {0|1|2|3}
 */
export function computeStars(baseHp, baseMaxHp, level) {
  const pct = baseMaxHp > 0 ? (baseHp / baseMaxHp) * 100 : 0;
  const [t1, t2, t3] = level.starThresholds;
  if (pct >= t3) return 3;
  if (pct >= t2) return 2;
  if (pct >= t1) return 1;
  return 0;
}

/**
 * Determine whether a level is unlocked given the current progress record.
 *
 * @param {LevelConfig} level
 * @param {{ bestStars: Object.<string, number> }} progression
 * @returns {boolean}
 */
export function isLevelUnlocked(level, progression) {
  if (!level.unlockRequires) return true;
  return (progression.bestStars[level.unlockRequires] ?? 0) >= 1;
}
