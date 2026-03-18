/**
 * @file src/data/worldMap.js
 * World map node definitions — tutorial spine + skill-region layout.
 *
 * MAP SPACE: 2400 × 1800 logical pixels.
 *
 * LAYOUT OVERVIEW
 * ───────────────
 *   Tutorial Spine (bottom-center, reads bottom-up):
 *     T1(1200,1680) → T2(1200,1520) → T3(1200,1360) → T4(1200,1180) → HUB(1200,960)
 *
 *   Hub: "The Crossroads" — all four region paths branch from here.
 *
 *   Region 1: TONE & TECHNIQUE  (left,       blue,   x < 1000)
 *   Region 2: RHYTHM & TIMING   (bottom-left, orange, y > 1000 and x < 1000)
 *   Region 3: MUSIC THEORY      (right,       purple, x > 1400)
 *   Region 4: MUSICIANSHIP      (top,         green,  y < 700)
 *
 * Each WorldMapNode extends the LevelConfig shape with extra fields:
 *   x, y             — position in the 2400×1800 logical map space
 *   connections      — string[] node IDs to draw lines to
 *   unlockRequires   — string[] node IDs that must have ≥1★ first
 *   levelGoal        — one-sentence player goal shown on LEVEL_START
 *   skillFocus       — one-sentence description of what the level teaches
 *   mechanicBadge    — "NEW: …" badge text, or null
 *   estimatedDuration— human string e.g. "~2 minutes"
 *   allowedModes     — string[]|null  restrict Space-key mode cycling
 *   winCondition     — 'base' | 'survival'
 *   chargeUnlocksBase— boolean
 *   tutorialOverlay  — string|null
 *   isTutorial       — boolean
 *   isHub            — boolean  (junction waypoint — not playable)
 *   isEntryNode      — boolean  (first node of a region — rendered larger)
 *   region           — 'tutorial'|'tone'|'rhythm'|'theory'|'musicianship'|'hub'
 *   stub             — boolean  locked placeholder, not yet playable
 */

import { LEVELS_BY_ID } from './levels.js';

// ─────────────────────────────────────────────────────────────────────────────
// Region metadata — exported for renderer
// ─────────────────────────────────────────────────────────────────────────────

export const REGIONS = Object.freeze({
  tutorial: {
    label:           'Tutorial',
    color:           '#e8a030',
    tint:            'rgba(232,160,48,0.08)',
    difficulty:      0,
    description:     'Learn the core mechanics of Chord Wars.',
    unlockCondition: null,
  },
  hub: {
    label:           'The Crossroads',
    color:           '#ffffff',
    tint:            'rgba(255,255,255,0.04)',
    difficulty:      null,
    description:     'A junction where all musical paths converge. Choose a region to begin.',
    unlockCondition: 'Complete all 4 tutorial levels',
  },
  tone: {
    label:           'Tone & Technique',
    color:           '#4488ff',
    tint:            'rgba(40,80,220,0.10)',
    difficulty:      1,
    description:     'Build clean, accurate note production and physical instrument skill.',
    unlockCondition: 'Complete tutorials (unlock The Crossroads)',
  },
  rhythm: {
    label:           'Rhythm & Timing',
    color:           '#ff8822',
    tint:            'rgba(220,100,20,0.10)',
    difficulty:      1,
    description:     'Develop rhythmic accuracy, timing feel, and pulse control.',
    unlockCondition: 'Complete tutorials (unlock The Crossroads)',
  },
  theory: {
    label:           'Music Theory',
    color:           '#aa44ff',
    tint:            'rgba(150,40,220,0.10)',
    difficulty:      2,
    description:     'Understand what you play — notes, scales, chords, and harmony.',
    unlockCondition: 'Complete tutorials (unlock The Crossroads)',
  },
  musicianship: {
    label:           'Musicianship',
    color:           '#44cc66',
    tint:            'rgba(40,180,80,0.10)',
    difficulty:      3,
    description:     'Express yourself musically — phrasing, dynamics, and ear training.',
    unlockCondition: 'Complete tutorials (unlock The Crossroads)',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tutorial level configs (game mechanics unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const TUTORIAL_1 = Object.freeze({
  id:                'tutorial-1',
  name:              'The First Strike',
  subtitle:          'Learn to attack',
  icon:              '⚡',
  region:            'tutorial',
  isTutorial:        true,
  isHub:             false,
  isEntryNode:       false,
  stub:              false,
  maxWaves:          1,
  difficultyMod:     0.5,
  spawnMod:          999,
  startResources:    0,
  maxEnemyCap:       0,
  allowedModes:      ['attack'],
  winCondition:      'base',
  chargeUnlocksBase: false,
  tutorialOverlay:   "You're in ATTACK mode. Play any note to fire.",
  levelGoal:         'Attack the enemy base directly',
  skillFocus:        'Learn to fire notes at the enemy base in ATTACK mode',
  mechanicBadge:     'ATTACK mode',
  estimatedDuration: '~1 minute',
  bpm:               100,
  starThresholds:    [0, 0, 0],
  unlockRequires:    [],
  enemyBases: Object.freeze([Object.freeze({ x: 0.88, y: 0.50 })]),
  phases:     Object.freeze([Object.freeze({ label: 'Strike!', duration: null })]),
  _enemyBaseHp: 80,
});

const TUTORIAL_2 = Object.freeze({
  id:                'tutorial-2',
  name:              'The Wave',
  subtitle:          'Survive the onslaught',
  icon:              '🌊',
  region:            'tutorial',
  isTutorial:        true,
  isHub:             false,
  isEntryNode:       false,
  stub:              false,
  maxWaves:          3,
  difficultyMod:     0.6,
  spawnMod:          1.0,
  startResources:    0,
  maxEnemyCap:       12,
  allowedModes:      ['attack'],
  winCondition:      'survival',
  chargeUnlocksBase: false,
  tutorialOverlay:   'Enemies are coming! Play notes to attack them.',
  levelGoal:         'Survive the monster wave',
  skillFocus:        'Target individual enemies with note sequences in ATTACK mode',
  mechanicBadge:     'Enemy units',
  estimatedDuration: '~2 minutes',
  bpm:               110,
  starThresholds:    [0, 0, 0],
  unlockRequires:    ['tutorial-1'],
  enemyBases: Object.freeze([Object.freeze({ x: 0.88, y: 0.50 })]),
  phases:     Object.freeze([Object.freeze({ label: 'Survive', duration: null })]),
});

const TUTORIAL_3 = Object.freeze({
  id:                'tutorial-3',
  name:              'Call for Backup',
  subtitle:          'Build your army',
  icon:              '🛡',
  region:            'tutorial',
  isTutorial:        true,
  isHub:             false,
  isEntryNode:       false,
  stub:              false,
  maxWaves:          5,
  difficultyMod:     0.7,
  spawnMod:          1.4,
  startResources:    200,
  maxEnemyCap:       12,
  allowedModes:      ['summon', 'attack'],
  winCondition:      'base',
  chargeUnlocksBase: false,
  tutorialOverlay:   'Press Space to switch modes. Summon units to defend.',
  levelGoal:         'Summon units to fight for you',
  skillFocus:        'Play three-note chords in SUMMON mode to deploy allied units',
  mechanicBadge:     'NEW: SUMMON mode',
  estimatedDuration: '~3 minutes',
  bpm:               115,
  starThresholds:    [0, 0, 0],
  unlockRequires:    ['tutorial-2'],
  enemyBases: Object.freeze([Object.freeze({ x: 0.88, y: 0.50 })]),
  phases: Object.freeze([
    Object.freeze({ label: 'Build Up', duration: 60  }),
    Object.freeze({ label: 'Push',     duration: null }),
  ]),
});

const TUTORIAL_4 = Object.freeze({
  id:                'tutorial-4',
  name:              'The Big Strike',
  subtitle:          'Unleash your power',
  icon:              '💥',
  region:            'tutorial',
  isTutorial:        true,
  isHub:             false,
  isEntryNode:       false,
  stub:              false,
  maxWaves:          6,
  difficultyMod:     1.2,
  spawnMod:          1.2,
  startResources:    200,
  maxEnemyCap:       12,
  allowedModes:      ['summon', 'attack', 'charge'],
  winCondition:      'base',
  chargeUnlocksBase: true,
  tutorialOverlay:   'Hold a note to charge your attack. Release to unleash it.',
  levelGoal:         'Master the charge attack',
  skillFocus:        'Hold a note to charge; release to deal massive burst damage',
  mechanicBadge:     'NEW: Charge Attack',
  estimatedDuration: '~3 minutes',
  bpm:               120,
  starThresholds:    [0, 0, 0],
  unlockRequires:    ['tutorial-3'],
  enemyBases: Object.freeze([Object.freeze({ x: 0.88, y: 0.50 })]),
  phases: Object.freeze([
    Object.freeze({ label: 'Charge Up!',    duration: 60   }),
    Object.freeze({ label: 'Break Through', duration: null }),
  ]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Hub node — junction waypoint, not a playable level
// ─────────────────────────────────────────────────────────────────────────────

const HUB_NODE = Object.freeze({
  id:                'hub',
  name:              'The Crossroads',
  subtitle:          'Choose your path',
  icon:              '✦',
  region:            'hub',
  isTutorial:        false,
  isHub:             true,
  isEntryNode:       false,
  stub:              false,
  maxWaves:          1,
  difficultyMod:     1.0,
  spawnMod:          1.0,
  startResources:    0,
  maxEnemyCap:       0,
  allowedModes:      null,
  winCondition:      'base',
  chargeUnlocksBase: false,
  tutorialOverlay:   null,
  levelGoal:         'A meeting point where all musical paths converge',
  skillFocus:        'This is the center of your musical journey — all skill regions branch from here',
  mechanicBadge:     null,
  estimatedDuration: '',
  bpm:               120,
  starThresholds:    [0, 0, 0],
  unlockRequires:    ['tutorial-4'],
  enemyBases: Object.freeze([Object.freeze({ x: 0.88, y: 0.50 })]),
  phases:     Object.freeze([Object.freeze({ label: 'Battle', duration: null })]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Story levels — first real battles after the tutorial spine
// These use the full level configs from levels.js and are placed just off the hub.
// ─────────────────────────────────────────────────────────────────────────────

const CAMPFIRE_NODE = Object.freeze({
  ...LEVELS_BY_ID['campfire'],
  // Override world-map–specific fields
  region:            'tutorial',      // sits in the tutorial colour family
  isTutorial:        false,
  isHub:             false,
  isEntryNode:       true,            // larger dot on the map
  stub:              false,
  unlockRequires:    ['tutorial-4'],  // unlocks as soon as T4 is beaten
  levelGoal:         'Put your training to the test — destroy the enemy camp',
  skillFocus:        'Apply everything from the tutorial against real opposition',
  mechanicBadge:     null,
  estimatedDuration: '~3 minutes',
  winCondition:      'base',
  chargeUnlocksBase: false,
  tutorialOverlay:   null,
  allowedModes:      null,
});

const CROSSING_NODE = Object.freeze({
  ...LEVELS_BY_ID['crossing'],
  // Override world-map–specific fields
  region:            'tutorial',
  isTutorial:        false,
  isHub:             false,
  isEntryNode:       false,
  stub:              false,
  unlockRequires:    ['campfire'],    // unlocks after beating Level 1
  levelGoal:         'Hold the bridge and defeat both enemy bases',
  skillFocus:        'Manage two-lane combat — a D note is introduced in cues',
  mechanicBadge:     'NEW: Two Bases',
  estimatedDuration: '~4 minutes',
  winCondition:      'base',
  chargeUnlocksBase: false,
  tutorialOverlay:   null,
  allowedModes:      null,
});

// ─────────────────────────────────────────────────────────────────────────────
// Stub node factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a stub node with region + skill metadata.
 * @param {string} id
 * @param {string} name
 * @param {string} icon
 * @param {string} region    — key of REGIONS
 * @param {string[]} unlockRequires
 * @param {string} levelGoal   — one-sentence player objective
 * @param {string} skillFocus  — one-sentence what this teaches
 * @param {boolean} [isEntryNode]
 */
function makeStub(id, name, icon, region, unlockRequires, levelGoal, skillFocus, isEntryNode = false) {
  return Object.freeze({
    id,
    name,
    subtitle:          'Coming soon',
    icon,
    region,
    isTutorial:        false,
    isHub:             false,
    isEntryNode,
    stub:              true,
    maxWaves:          5,
    difficultyMod:     1.0,
    spawnMod:          1.0,
    startResources:    200,
    maxEnemyCap:       12,
    allowedModes:      null,
    winCondition:      'base',
    chargeUnlocksBase: false,
    tutorialOverlay:   null,
    levelGoal,
    skillFocus,
    mechanicBadge:     null,
    estimatedDuration: '~5 minutes',
    bpm:               120,
    starThresholds:    [0, 65, 85],
    unlockRequires,
    enemyBases: Object.freeze([Object.freeze({ x: 0.88, y: 0.50 })]),
    phases:     Object.freeze([Object.freeze({ label: 'Battle', duration: null })]),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Region 1 — TONE & TECHNIQUE  (left branch, blue)
// Focus: physical instrument skill — clean, accurate note production
// Reference: Hal Leonard, Suzuki Method, Alfred's Basic
// ─────────────────────────────────────────────────────────────────────────────

const TONE_1 = makeStub(
  'tone-1', 'Open Strings', '🎸', 'tone', ['hub'],
  'Play each open string cleanly and hold it steady for its full duration',
  'Learn to produce clean, accurate individual notes without buzzing or muting',
  true   // isEntryNode
);

const TONE_2 = makeStub(
  'tone-2', 'First Position', '🖐', 'tone', ['tone-1'],
  'Move smoothly between adjacent notes using the correct finger placement',
  'Practice smooth stepwise transitions between neighboring pitches'
);

const TONE_3 = makeStub(
  'tone-3', 'The Clean Shift', '↕', 'tone', ['tone-2'],
  'Jump across larger intervals without losing intonation or tone quality',
  'Master leaping to distant notes cleanly under rhythmic pressure'
);

const TONE_4 = makeStub(
  'tone-4', 'Hammer & Pull', '🔨', 'tone', ['tone-3'],
  'Connect notes into a smooth legato line without re-attacking each one',
  'Play slurred notes by hammering on and pulling off rather than restroking'
);

const TONE_5 = makeStub(
  'tone-5', 'The Long Tone', '〰', 'tone', ['tone-4'],
  'Sustain a note for its full value while keeping tone quality steady throughout',
  'Develop tone control and breath or bow support on held notes'
);

const TONE_6 = makeStub(
  'tone-6', 'Speed Builder', '⚡', 'tone', ['tone-5'],
  'Play a technical passage at increasing tempos without losing accuracy',
  'Build the finger speed and coordination needed for faster musical passages'
);

// ─────────────────────────────────────────────────────────────────────────────
// Region 2 — RHYTHM & TIMING  (bottom-left branch, orange)
// Focus: rhythmic accuracy, timing, feel
// Reference: Essential Elements, Rhythm Guitar Complete, drum methods
// ─────────────────────────────────────────────────────────────────────────────

const RHYTHM_1 = makeStub(
  'rhythm-1', 'Quarter Notes', '♩', 'rhythm', ['hub'],
  'Stay locked to a steady quarter-note pulse through the entire song',
  'Feel and play the basic beat unit — one note per beat at a consistent tempo',
  true   // isEntryNode
);

const RHYTHM_2 = makeStub(
  'rhythm-2', 'The Downbeat', '🥁', 'rhythm', ['rhythm-1'],
  'Land beat 1 with confidence and feel the weight of the measure',
  'Understand how meter organizes time by emphasizing the first beat'
);

const RHYTHM_3 = makeStub(
  'rhythm-3', 'Half & Whole', '𝅗𝅥', 'rhythm', ['rhythm-2'],
  'Hold notes for two and four beats without rushing to the next',
  'Practice longer note durations to develop patience and rhythmic control'
);

const RHYTHM_4 = makeStub(
  'rhythm-4', 'Eighth Note Run', '♪♪', 'rhythm', ['rhythm-3'],
  'Navigate eighth-note patterns by feeling the subdivisions between beats',
  'Play twice as fast as the beat by subdividing — the key to all fast music'
);

const RHYTHM_5 = makeStub(
  'rhythm-5', 'Syncopation', '↩', 'rhythm', ['rhythm-4'],
  'Attack notes off the beat, shifting the rhythmic emphasis forward',
  'Create rhythmic tension by anticipating or delaying expected beat placements'
);

const RHYTHM_6 = makeStub(
  'rhythm-6', 'Polyrhythm Intro', '∞', 'rhythm', ['rhythm-5'],
  'Layer two rhythmic patterns simultaneously to develop independence',
  'Play two-against-three cross-rhythms to unlock advanced coordination'
);

// ─────────────────────────────────────────────────────────────────────────────
// Region 3 — MUSIC THEORY  (right branch, purple)
// Focus: understanding what you play — notes, scales, chords
// Reference: Music Theory for Guitarists, Alfred's Basic Theory, Berklee
// ─────────────────────────────────────────────────────────────────────────────

const THEORY_1 = makeStub(
  'theory-1', 'The Major Scale', '🎼', 'theory', ['hub'],
  'Play the C major scale pattern and identify every interval within it',
  'Learn the seven notes of the major scale and why they sound the way they do',
  true   // isEntryNode
);

const THEORY_2 = makeStub(
  'theory-2', 'Intervals', '↔', 'theory', ['theory-1'],
  'Recognize and play thirds, fifths, and octaves by ear and by position',
  'Understand the distance between notes as the building block of harmony'
);

const THEORY_3 = makeStub(
  'theory-3', 'The Minor Scale', '🌙', 'theory', ['theory-2'],
  'Play the natural minor scale and hear how it contrasts with major',
  'Compare major and minor scales to discover how a single note change transforms emotion'
);

const THEORY_4 = makeStub(
  'theory-4', 'Chord Construction', '🧱', 'theory', ['theory-3'],
  'Build major and minor triads from root, third, and fifth',
  'Understand why three specific notes stacked together produce a chord'
);

const THEORY_5 = makeStub(
  'theory-5', 'The Progression', '🔁', 'theory', ['theory-4'],
  'Play the I-IV-V chord progression and feel how it wants to resolve',
  'Master the most common chord sequence behind thousands of songs'
);

const THEORY_6 = makeStub(
  'theory-6', 'Modal Exploration', '🌀', 'theory', ['theory-5'],
  'Shift between Dorian and Mixolydian to explore different tonal colors',
  'Discover how starting a scale on a different note changes its emotional character'
);

// ─────────────────────────────────────────────────────────────────────────────
// Region 4 — MUSICIANSHIP  (top branch, green)
// Focus: playing music, not just notes — expression, phrasing, listening
// Reference: ABRSM musicianship grades, ear training methods
// ─────────────────────────────────────────────────────────────────────────────

const MUSIC_1 = makeStub(
  'music-1', 'Call & Response', '📣', 'musicianship', ['hub'],
  'Listen to a musical phrase and play a coherent, connected response',
  'Develop musical dialogue skills — the foundation of all improvisation',
  true   // isEntryNode
);

const MUSIC_2 = makeStub(
  'music-2', 'The Phrase', '〜', 'musicianship', ['music-1'],
  'Shape a 4-bar melody with a clear rise, peak, and fall',
  'Understand musical phrasing — how notes connect into meaningful sentences'
);

const MUSIC_3 = makeStub(
  'music-3', 'Dynamics', '📢', 'musicianship', ['music-1'],
  'Control your volume to shape the emotional character of a passage',
  'Use loud and soft playing intentionally to add expression and drama'
);

const MUSIC_4 = makeStub(
  'music-4', 'Sight Reading I', '👁', 'musicianship', ['music-2'],
  'Read simple notation in real time without prior preparation',
  'Translate written symbols into sound — the literacy skill of musicians'
);

const MUSIC_5 = makeStub(
  'music-5', 'Ear Training', '👂', 'musicianship', ['music-3'],
  'Match a heard pitch and identify intervals by ear alone',
  'Develop your inner ear — the skill that lets you play what you imagine'
);

const MUSIC_6 = makeStub(
  'music-6', 'The Performance', '🎭', 'musicianship', ['music-4', 'music-5'],
  'Combine every skill you have learned in a complete musical performance',
  'The final challenge — all regions tested in a single, full-length piece'
);

// ─────────────────────────────────────────────────────────────────────────────
// Node list with canvas positions (2400 × 1800 logical map space)
//
// Tutorial spine: bottom-center, reads bottom-up
// Hub:           center (1200, 960)
// Tone:          left branch  (~x < 1000)
// Rhythm:        bottom-left  (~x < 1000, y > 1000)
// Theory:        right branch (~x > 1400)
// Musicianship:  top branch   (~y < 700)
// ─────────────────────────────────────────────────────────────────────────────

export const WORLD_MAP_NODES = Object.freeze([

  // ── Tutorial spine (bottom-center, reads bottom-up) ────────────────────────
  Object.freeze({ ...TUTORIAL_1, x: 1200, y: 1680, connections: ['tutorial-2'] }),
  Object.freeze({ ...TUTORIAL_2, x: 1200, y: 1520, connections: ['tutorial-1', 'tutorial-3'] }),
  Object.freeze({ ...TUTORIAL_3, x: 1200, y: 1360, connections: ['tutorial-2', 'tutorial-4'] }),
  Object.freeze({ ...TUTORIAL_4, x: 1200, y: 1180, connections: ['tutorial-3', 'hub'] }),

  // ── Hub — the crossroads (map center) ──────────────────────────────────────
  Object.freeze({ ...HUB_NODE, x: 1200, y: 960,
    connections: ['tutorial-4', 'campfire', 'tone-1', 'rhythm-1', 'theory-1', 'music-1'] }),

  // ── Story levels — first real battles after tutorial ──────────────────────
  // Campfire sits just off the hub (lower-right); Crossing chains from it.
  Object.freeze({ ...CAMPFIRE_NODE, x: 1420, y: 1080, connections: ['hub', 'crossing'] }),
  Object.freeze({ ...CROSSING_NODE, x: 1640,  y:  980, connections: ['campfire'] }),

  // ── Region 1: Tone & Technique (left branch, blue) ─────────────────────────
  Object.freeze({ ...TONE_1,   x:  820, y:  880, connections: ['hub',    'tone-2'] }),
  Object.freeze({ ...TONE_2,   x:  620, y:  760, connections: ['tone-1', 'tone-3'] }),
  Object.freeze({ ...TONE_3,   x:  420, y:  680, connections: ['tone-2', 'tone-4'] }),
  Object.freeze({ ...TONE_4,   x:  580, y:  520, connections: ['tone-3', 'tone-5'] }),
  Object.freeze({ ...TONE_5,   x:  360, y:  420, connections: ['tone-4', 'tone-6'] }),
  Object.freeze({ ...TONE_6,   x:  200, y:  300, connections: ['tone-5'] }),

  // ── Region 2: Rhythm & Timing (bottom-left branch, orange) ────────────────
  Object.freeze({ ...RHYTHM_1, x:  940, y: 1160, connections: ['hub',       'rhythm-2'] }),
  Object.freeze({ ...RHYTHM_2, x:  740, y: 1320, connections: ['rhythm-1',  'rhythm-3'] }),
  Object.freeze({ ...RHYTHM_3, x:  520, y: 1440, connections: ['rhythm-2',  'rhythm-4'] }),
  Object.freeze({ ...RHYTHM_4, x:  660, y: 1620, connections: ['rhythm-3',  'rhythm-5'] }),
  Object.freeze({ ...RHYTHM_5, x:  440, y: 1720, connections: ['rhythm-4',  'rhythm-6'] }),
  Object.freeze({ ...RHYTHM_6, x:  260, y: 1620, connections: ['rhythm-5'] }),

  // ── Region 3: Music Theory (right branch, purple) ─────────────────────────
  Object.freeze({ ...THEORY_1, x: 1580, y:  880, connections: ['hub',       'theory-2'] }),
  Object.freeze({ ...THEORY_2, x: 1780, y:  760, connections: ['theory-1',  'theory-3'] }),
  Object.freeze({ ...THEORY_3, x: 2000, y:  680, connections: ['theory-2',  'theory-4'] }),
  Object.freeze({ ...THEORY_4, x: 1840, y:  520, connections: ['theory-3',  'theory-5'] }),
  Object.freeze({ ...THEORY_5, x: 2060, y:  420, connections: ['theory-4',  'theory-6'] }),
  Object.freeze({ ...THEORY_6, x: 1900, y:  300, connections: ['theory-5'] }),

  // ── Region 4: Musicianship (top branch, green) ────────────────────────────
  Object.freeze({ ...MUSIC_1,  x: 1200, y:  720, connections: ['hub',     'music-2', 'music-3'] }),
  Object.freeze({ ...MUSIC_2,  x: 1020, y:  560, connections: ['music-1', 'music-4'] }),
  Object.freeze({ ...MUSIC_3,  x: 1380, y:  560, connections: ['music-1', 'music-5'] }),
  Object.freeze({ ...MUSIC_4,  x: 1020, y:  360, connections: ['music-2', 'music-6'] }),
  Object.freeze({ ...MUSIC_5,  x: 1380, y:  360, connections: ['music-3', 'music-6'] }),
  Object.freeze({ ...MUSIC_6,  x: 1200, y:  180, connections: ['music-4', 'music-5'] }),

]);

/** O(1) lookup by node id. */
export const WORLD_MAP_NODES_BY_ID = Object.freeze(
  Object.fromEntries(WORLD_MAP_NODES.map(n => [n.id, n]))
);

/**
 * Ordered tutorial sequence (T1→T2→T3→T4).
 * @type {string[]}
 */
export const TUTORIAL_SEQUENCE = Object.freeze([
  'tutorial-1',
  'tutorial-2',
  'tutorial-3',
  'tutorial-4',
]);

/**
 * Whether a world-map node is unlocked given current progression.
 * Hub and region nodes are locked until tutorialComplete (via hub's unlockRequires: ['tutorial-4']).
 *
 * @param {object} node
 * @param {{ bestStars: Object.<string,number>, tutorialComplete?: boolean }} progression
 * @returns {boolean}
 */
export function isNodeUnlocked(node, progression) {
  if (!node.unlockRequires || node.unlockRequires.length === 0) return true;
  return node.unlockRequires.every(req => (progression.bestStars?.[req] ?? 0) >= 1);
}
