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
 * @typedef {{label:string, duration:number|null}} PhaseConfig
 * duration=null means "run until win condition triggers".
 *
 * @typedef {{x:number, y:number}} BaseConfig
 * Normalised (0–1) canvas fractions for an enemy base spawn position.
 * x = left edge fraction (matches ENEMY_BASE_X), y = vertical centre fraction.
 *
 * @typedef {Object} LevelConfig
 * @property {string}        id              — unique identifier, used as localStorage key
 * @property {string}        name            — display name on level select
 * @property {string}        subtitle        — one-line flavour description
 * @property {string}        icon            — emoji used on the level card
 * @property {number}        maxWaves        — how many waves before VICTORY is possible
 * @property {number}        difficultyMod   — multiplier on enemy HP and tier-3 probability
 * @property {number}        spawnMod        — multiplier on enemy spawn interval (>1 = slower = easier)
 * @property {number}        startResources  — initial resource amount (overrides game.js default 200)
 * @property {number}        maxEnemyCap     — max simultaneous enemy units on screen
 * @property {string}        unlockRequires  — id of level that must be beaten first, or null
 * @property {number[]}      starThresholds  — note accuracy % for [1★, 2★, 3★]
 * @property {BaseConfig[]}  enemyBases      — one entry per enemy base; more = harder
 * @property {PhaseConfig[]} phases          — ordered phase definitions (last phase has duration=null)
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
    spawnMod:       1.25,   // retained for data compat; interval now set by difficulty
    startResources: 250,    // extra starting gold
    maxEnemyCap:    12,
    unlockRequires: null,   // always available
    starThresholds: [0, 65, 85],  // 1★: any win; 2★: ≥65% accuracy; 3★: ≥85%
    bpm:            110,          // tempo for cue system
    // Level 1 teaches two notes only — C3 and G3 (a perfect fifth, musically intuitive)
    cueNotePool:    Object.freeze(['C3', 'G3']),
    enemyBases: Object.freeze([
      Object.freeze({ x: 0.88, y: 0.50 }),   // single base — lane centre
    ]),
    phases: Object.freeze([
      Object.freeze({ label: 'Introduction', duration: 60  }),  // 60 s — enemy base invulnerable
      Object.freeze({ label: 'Development',  duration: 90  }),  // 90 s — enemy base invulnerable
      Object.freeze({ label: 'Climax',       duration: null }), // run until win
    ]),
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
    maxEnemyCap:    12,
    unlockRequires: 'campfire',
    starThresholds: [0, 70, 90],  // 1★: any win; 2★: ≥70% accuracy; 3★: ≥90%
    bpm:            120,
    // Level 2 introduces D3 — adds a neighbour note to the C/G foundation
    cueNotePool:    Object.freeze(['C3', 'D3', 'G3']),
    enemyBases: Object.freeze([
      Object.freeze({ x: 0.88, y: 0.33 }),   // upper base
      Object.freeze({ x: 0.88, y: 0.67 }),   // lower base
    ]),
    phases: Object.freeze([
      Object.freeze({ label: 'Introduction', duration: 70  }),
      Object.freeze({ label: 'Development',  duration: 100 }),
      Object.freeze({ label: 'Assault',      duration: 80  }),  // 4th phase — both bases vulnerable
      Object.freeze({ label: 'Climax',       duration: null }),
    ]),
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
    maxEnemyCap:    12,
    unlockRequires: 'crossing',
    starThresholds: [0, 70, 90],  // same as Crossing — accuracy standard doesn't drop
    bpm:            130,          // faster tempo = harder cue timing
    enemyBases: Object.freeze([
      Object.freeze({ x: 0.88, y: 0.22 }),   // top base
      Object.freeze({ x: 0.88, y: 0.50 }),   // centre base (lane)
      Object.freeze({ x: 0.83, y: 0.78 }),   // bottom base (slightly recessed)
    ]),
    phases: Object.freeze([
      Object.freeze({ label: 'Introduction', duration: 60  }),
      Object.freeze({ label: 'Development',  duration: 90  }),
      Object.freeze({ label: 'Assault',      duration: 70  }),  // 4th phase — all three bases vulnerable
      Object.freeze({ label: 'Climax',       duration: null }),
    ]),
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
