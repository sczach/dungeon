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
 *
 * Star thresholds are NOTE ACCURACY PERCENTAGES (0–100):
 *   starThresholds[0] = minimum accuracy for 1★ (always 0 — any win = 1★)
 *   starThresholds[1] = minimum accuracy for 2★
 *   starThresholds[2] = minimum accuracy for 3★
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
 * @property {number[]} starThresholds  — note accuracy % for [1★, 2★, 3★]
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
    starThresholds: [0, 65, 85],  // 1★: any win; 2★: ≥65% accuracy; 3★: ≥85%
  }),
  Object.freeze({
    id:             'crossing',
    name:           'The Crossing',
    subtitle:       'Hold the bridge',
    icon:           '⚔️',
    maxWaves:       10,
    difficultyMod:  1.0,
    spawnMod:       1.0,
    startResources: 200,
    maxEnemyCap:    6,
    unlockRequires: 'campfire',
    starThresholds: [0, 70, 90],  // 1★: any win; 2★: ≥70% accuracy; 3★: ≥90%
  }),
  Object.freeze({
    id:             'siege',
    name:           'The Siege',
    subtitle:       'Last stand',
    icon:           '🏰',
    maxWaves:       10,
    difficultyMod:  1.35,
    spawnMod:       0.8,
    startResources: 150,
    maxEnemyCap:    8,
    unlockRequires: 'crossing',
    starThresholds: [0, 70, 90],  // same as Crossing — accuracy standard doesn't drop
  }),
]);

/** Convenience map for O(1) lookup by id. */
export const LEVELS_BY_ID = Object.freeze(
  Object.fromEntries(LEVELS.map(l => [l.id, l]))
);

/**
 * Compute the star rating for a completed level based on note accuracy.
 *
 * Called only on VICTORY (enemy base destroyed). 1★ is always awarded for
 * winning regardless of accuracy — starThresholds[0] is reserved for this.
 *
 * @param {number}      accuracyPct — 0–100 note accuracy % for this run
 * @param {LevelConfig} level       — the level config for its starThresholds
 * @returns {1|2|3}
 */
export function computeStars(accuracyPct, level) {
  const [, t2, t3] = level.starThresholds;
  if (accuracyPct >= t3) return 3;
  if (accuracyPct >= t2) return 2;
  return 1;  // always at least 1★ for winning
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
