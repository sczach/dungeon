/**
 * @file src/data/worldMap.js
 * World map node definitions — tutorial cluster + branch nodes.
 *
 * Each WorldMapNode extends the LevelConfig shape with extra fields:
 *   x, y             — position in a 900×650 logical map canvas
 *   connections      — string[] node IDs to draw web lines to
 *   unlockRequires   — string[] node IDs that must have ≥1★ first
 *   levelGoal        — one-sentence goal shown on LEVEL_START screen
 *   mechanicBadge    — "NEW: …" badge text, or null if no new mechanic
 *   estimatedDuration— human string e.g. "~2 minutes"
 *   allowedModes     — string[]|null  restrict Space-key mode cycling
 *   winCondition     — 'base' | 'survival'  (default 'base')
 *   chargeUnlocksBase— boolean  base invulnerable until first charge fires (T4)
 *   tutorialOverlay  — string|null  persistent hint shown during gameplay
 *   isTutorial       — boolean
 *   stub             — boolean  locked placeholder, not yet playable
 *
 * Map layout (900×650 logical space, camera-panned during play):
 *
 *        A2(180,100)─────A3(80,210)
 *       /
 *  T4(400,150)──B1(520,90)──B2(660,160)──B3(790,100)
 *      │                         │              │
 *   T3(400,270)            J1(line)        J2(line)
 *      │                         │              │
 *   T2(420,380)─────────C1(550,340)──C2(680,400)──C3(800,340)
 *      │
 *   T1(450,480)
 *
 * Tutorial cluster: T1 (bottom-center) → T2 → T3 → T4
 * Branch A (Frontier, easy): A1(260,60) → A2 → A3
 * Branch B (Badlands, medium): B1 → B2 → B3
 * Branch C (Siege Road, hard): C1 → C2 → C3
 */

import { LEVELS_BY_ID } from './levels.js';

// ─────────────────────────────────────────────────────────────────────────────
// Tutorial level configs
// ─────────────────────────────────────────────────────────────────────────────

const TUTORIAL_1 = Object.freeze({
  id:                'tutorial-1',
  name:              'The First Strike',
  subtitle:          'Learn to attack',
  icon:              '⚡',
  maxWaves:          1,
  difficultyMod:     0.5,
  spawnMod:          999,         // effectively disables spawning
  startResources:    0,           // resources unused in T1
  maxEnemyCap:       0,           // no enemy units — base only
  isTutorial:        true,
  stub:              false,
  allowedModes:      ['attack'],  // ATTACK only — no summon, no charge
  winCondition:      'base',
  chargeUnlocksBase: false,
  tutorialOverlay:   "You're in ATTACK mode. Play any note to fire.",
  levelGoal:         'Attack the enemy base directly',
  mechanicBadge:     'ATTACK mode',
  estimatedDuration: '~1 minute',
  bpm:               100,
  starThresholds:    [0, 0, 0],   // tutorial: stars not tracked
  unlockRequires:    [],
  enemyBases: Object.freeze([
    Object.freeze({ x: 0.88, y: 0.50 }),
  ]),
  phases: Object.freeze([
    Object.freeze({ label: 'Strike!', duration: null }),
  ]),
  // Override base HP so it's beatable in ~30s of single attacks
  _enemyBaseHp: 80,
});

const TUTORIAL_2 = Object.freeze({
  id:                'tutorial-2',
  name:              'The Wave',
  subtitle:          'Survive the onslaught',
  icon:              '🌊',
  maxWaves:          3,
  difficultyMod:     0.6,
  spawnMod:          1.8,
  startResources:    0,
  maxEnemyCap:       4,
  isTutorial:        true,
  stub:              false,
  allowedModes:      ['attack'],
  winCondition:      'survival',  // win by surviving all waves
  chargeUnlocksBase: false,
  tutorialOverlay:   'Enemies are coming! Play notes to attack them.',
  levelGoal:         'Survive the monster wave',
  mechanicBadge:     'Enemy units',
  estimatedDuration: '~2 minutes',
  bpm:               110,
  starThresholds:    [0, 0, 0],
  unlockRequires:    ['tutorial-1'],
  enemyBases: Object.freeze([
    Object.freeze({ x: 0.88, y: 0.50 }),
  ]),
  phases: Object.freeze([
    Object.freeze({ label: 'Survive', duration: null }),
  ]),
  // Enemy base starts invulnerable in survival mode (handled by game.js)
});

const TUTORIAL_3 = Object.freeze({
  id:                'tutorial-3',
  name:              'Call for Backup',
  subtitle:          'Build your army',
  icon:              '🛡',
  maxWaves:          5,
  difficultyMod:     0.7,
  spawnMod:          1.4,
  startResources:    200,
  maxEnemyCap:       5,
  isTutorial:        true,
  stub:              false,
  allowedModes:      ['summon', 'attack'],
  winCondition:      'base',
  chargeUnlocksBase: false,
  tutorialOverlay:   'Press Space to switch modes. Summon units to defend.',
  levelGoal:         'Summon units to fight for you',
  mechanicBadge:     'NEW: SUMMON mode',
  estimatedDuration: '~3 minutes',
  bpm:               115,
  starThresholds:    [0, 0, 0],
  unlockRequires:    ['tutorial-2'],
  enemyBases: Object.freeze([
    Object.freeze({ x: 0.88, y: 0.50 }),
  ]),
  phases: Object.freeze([
    Object.freeze({ label: 'Build Up',   duration: 60  }),
    Object.freeze({ label: 'Push',       duration: null }),
  ]),
});

const TUTORIAL_4 = Object.freeze({
  id:                'tutorial-4',
  name:              'The Big Strike',
  subtitle:          'Unleash your power',
  icon:              '💥',
  maxWaves:          6,
  difficultyMod:     1.2,   // heavy units
  spawnMod:          1.2,
  startResources:    200,
  maxEnemyCap:       6,
  isTutorial:        true,
  stub:              false,
  allowedModes:      ['summon', 'attack', 'charge'],
  winCondition:      'base',
  chargeUnlocksBase: true,  // base invulnerable until first charge fires
  tutorialOverlay:   'Hold a note to charge your attack. Release to unleash it.',
  levelGoal:         'Master the charge attack',
  mechanicBadge:     'NEW: Charge Attack',
  estimatedDuration: '~3 minutes',
  bpm:               120,
  starThresholds:    [0, 0, 0],
  unlockRequires:    ['tutorial-3'],
  enemyBases: Object.freeze([
    Object.freeze({ x: 0.88, y: 0.50 }),
  ]),
  phases: Object.freeze([
    Object.freeze({ label: 'Charge Up!',  duration: 60  }),
    Object.freeze({ label: 'Break Through', duration: null }),
  ]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Branch node helpers — stub and real configs
// ─────────────────────────────────────────────────────────────────────────────

/** Create a locked placeholder node for an unimplemented level. */
function makeStub(id, name, icon, unlockRequires) {
  return Object.freeze({
    id,
    name,
    subtitle:          'Coming soon',
    icon,
    maxWaves:          5,
    difficultyMod:     1.0,
    spawnMod:          1.0,
    startResources:    200,
    maxEnemyCap:       6,
    isTutorial:        false,
    stub:              true,
    allowedModes:      null,
    winCondition:      'base',
    chargeUnlocksBase: false,
    tutorialOverlay:   null,
    levelGoal:         'Coming soon',
    mechanicBadge:     null,
    estimatedDuration: '~5 minutes',
    bpm:               120,
    starThresholds:    [0, 65, 85],
    unlockRequires,
    enemyBases:        Object.freeze([Object.freeze({ x: 0.88, y: 0.50 })]),
    phases:            Object.freeze([Object.freeze({ label: 'Battle', duration: null })]),
  });
}

/** Wrap an existing LevelConfig with world-map-node extras. */
function enrichLevel(levelId, extra) {
  const base = LEVELS_BY_ID[levelId];
  return Object.freeze({
    ...base,
    isTutorial:        false,
    stub:              false,
    allowedModes:      null,
    winCondition:      'base',
    chargeUnlocksBase: false,
    tutorialOverlay:   null,
    levelGoal:         base.subtitle,
    mechanicBadge:     null,
    estimatedDuration: '~5 minutes',
    ...extra,
    unlockRequires: extra.unlockRequires ?? [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch A — The Frontier (easy)
// ─────────────────────────────────────────────────────────────────────────────

const NODE_A1 = enrichLevel('campfire', {
  levelGoal:         'Survive the campfire battle',
  estimatedDuration: '~5 minutes',
  unlockRequires:    ['tutorial-4'],
});

const NODE_A2 = makeStub('frontier-a2', 'The Hollow',    '🌲', ['campfire']);
const NODE_A3 = makeStub('frontier-a3', 'The Waterfall', '💧', ['frontier-a2']);

// ─────────────────────────────────────────────────────────────────────────────
// Branch B — The Badlands (medium)
// ─────────────────────────────────────────────────────────────────────────────

const NODE_B1 = enrichLevel('crossing', {
  levelGoal:         'Hold the bridge against two enemy bases',
  estimatedDuration: '~7 minutes',
  unlockRequires:    ['tutorial-4'],
});

const NODE_B2 = makeStub('badlands-b2', 'The Gulch',   '🏜', ['crossing']);
const NODE_B3 = makeStub('badlands-b3', 'The Outpost', '🔥', ['badlands-b2']);

// ─────────────────────────────────────────────────────────────────────────────
// Branch C — The Siege Road (hard)
// ─────────────────────────────────────────────────────────────────────────────

const NODE_C1 = enrichLevel('siege', {
  levelGoal:         'Last stand — three enemy bases attacking at once',
  estimatedDuration: '~8 minutes',
  unlockRequires:    ['tutorial-4'],
});

const NODE_C2 = makeStub('siege-c2', 'The Rampart',   '🏰', ['siege']);
const NODE_C3 = makeStub('siege-c3', 'The Final Gate', '⚔️', ['siege-c2']);

// ─────────────────────────────────────────────────────────────────────────────
// Full node list with canvas positions (900×650 logical space)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @type {Array<Readonly<{x:number, y:number, connections:string[]} & typeof TUTORIAL_1>>}
 */
export const WORLD_MAP_NODES = Object.freeze([

  // ── Tutorial cluster (bottom-center, reads bottom-up) ──────────────────
  Object.freeze({ ...TUTORIAL_1, x: 450, y: 510, connections: ['tutorial-2'] }),
  Object.freeze({ ...TUTORIAL_2, x: 440, y: 410, connections: ['tutorial-1', 'tutorial-3'] }),
  Object.freeze({ ...TUTORIAL_3, x: 420, y: 310, connections: ['tutorial-2', 'tutorial-4'] }),
  Object.freeze({ ...TUTORIAL_4, x: 400, y: 200, connections: ['tutorial-3', 'campfire', 'crossing', 'siege'] }),

  // ── Branch A — The Frontier (upper-left) ──────────────────────────────
  Object.freeze({ ...NODE_A1, x: 250,  y: 90,  connections: ['tutorial-4', 'frontier-a2'] }),
  Object.freeze({ ...NODE_A2, x: 130,  y: 170, connections: ['campfire',   'frontier-a3'] }),
  Object.freeze({ ...NODE_A3, x: 55,   y: 290, connections: ['frontier-a2'] }),

  // ── Branch B — The Badlands (upper-right) ─────────────────────────────
  Object.freeze({ ...NODE_B1, x: 570,  y: 90,  connections: ['tutorial-4', 'badlands-b2'] }),
  Object.freeze({ ...NODE_B2, x: 700,  y: 170, connections: ['crossing',   'badlands-b3', 'frontier-a2'] }),
  Object.freeze({ ...NODE_B3, x: 810,  y: 90,  connections: ['badlands-b2', 'siege-c2'] }),

  // ── Branch C — The Siege Road (right) ─────────────────────────────────
  Object.freeze({ ...NODE_C1, x: 570,  y: 340, connections: ['tutorial-4', 'siege-c2'] }),
  Object.freeze({ ...NODE_C2, x: 700,  y: 420, connections: ['siege',      'siege-c3', 'badlands-b3'] }),
  Object.freeze({ ...NODE_C3, x: 810,  y: 340, connections: ['siege-c2'] }),

]);

/** O(1) lookup by node id. */
export const WORLD_MAP_NODES_BY_ID = Object.freeze(
  Object.fromEntries(WORLD_MAP_NODES.map(n => [n.id, n]))
);

/**
 * Ordered tutorial sequence — auto-advance after each victory.
 * @type {string[]}
 */
export const TUTORIAL_SEQUENCE = Object.freeze([
  'tutorial-1',
  'tutorial-2',
  'tutorial-3',
  'tutorial-4',
]);

/**
 * Whether a world map node is unlocked given the player's progression.
 *
 * @param {typeof TUTORIAL_1} node
 * @param {{ bestStars: Object.<string,number>, tutorialComplete?: boolean }} progression
 * @returns {boolean}
 */
export function isNodeUnlocked(node, progression) {
  if (!node.unlockRequires || node.unlockRequires.length === 0) return true;
  return node.unlockRequires.every(req => (progression.bestStars[req] ?? 0) >= 1);
}
