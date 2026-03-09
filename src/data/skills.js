/**
 * @file src/data/skills.js
 * Skill tree node definitions — musical progression edition.
 *
 * Skills are purchased with stars (earned on victory) and apply passive
 * buffs to game state at startGame() time. They never run in the rAF loop.
 *
 * Three tiers reflecting genuine musical development:
 *   Tier I  — Rhythm    (cost 1 star, no prerequisites)
 *   Tier II — Technique (cost 2 stars, requires one Tier-I skill)
 *   Tier III— Theory    (cost 3 stars, requires one Tier-II skill)
 *
 * Prerequisite chains (three independent paths):
 *   steady-tempo → chord-fluency → minor-mastery
 *   downbeat     → articulation  → scale-runner
 *   pulse        → legato        → resolution
 *
 * Flavor text is intentionally educational — each description names the
 * musical concept it rewards so players absorb music theory while playing.
 */

/**
 * @typedef {Object} SkillNode
 * @property {string}      id
 * @property {string}      name
 * @property {string}      description
 * @property {string}      icon
 * @property {number}      tier        — 1 | 2 | 3
 * @property {number}      cost        — stars required to purchase
 * @property {string|null} requires    — prerequisite skill id, or null
 * @property {function}    effect      — (state) => void — applied once per startGame()
 */

/** @type {ReadonlyArray<Readonly<SkillNode>>} */
export const SKILLS = Object.freeze([

  // ── Tier I — Rhythm ────────────────────────────────────────────────────────
  // Rhythm is the foundation of music. These skills reward the most basic
  // musical skill: showing up and playing consistently.

  Object.freeze({
    id:          'steady-tempo',
    name:        'Steady Tempo',
    description: 'A consistent pulse is everything. +50 starting resources — steady practice pays off.',
    icon:        '🥁',
    tier:        1,
    cost:        1,
    requires:    null,
    effect(state) { state.resources += 50; },
  }),

  Object.freeze({
    id:          'downbeat',
    name:        'Downbeat',
    description: 'The first beat of every measure carries the most weight. Combo milestone bonuses doubled.',
    icon:        '♩',
    tier:        1,
    cost:        1,
    requires:    null,
    effect(state) { state.skillComboDoubleMilestone = true; },
  }),

  Object.freeze({
    id:          'pulse',
    name:        'Pulse',
    description: 'Music breathes — silence is part of the phrase. Enemy spawn interval +1.5s.',
    icon:        '〰️',
    tier:        1,
    cost:        1,
    requires:    null,
    effect(state) { state.skillSpawnIntervalBonus = (state.skillSpawnIntervalBonus || 0) + 1.5; },
  }),

  // ── Tier II — Technique ────────────────────────────────────────────────────
  // Technique is how you execute what you know. Faster fingers, cleaner
  // attack, smoother connection between notes.

  Object.freeze({
    id:          'chord-fluency',
    name:        'Chord Fluency',
    description: 'Every new chord shape you learn opens new tactical options. Max units on screen +2.',
    icon:        '🎼',
    tier:        2,
    cost:        2,
    requires:    'steady-tempo',
    effect(state) { state.skillMaxUnitsBonus = (state.skillMaxUnitsBonus || 0) + 2; },
  }),

  Object.freeze({
    id:          'articulation',
    name:        'Articulation',
    description: 'Each note intentional, each attack deliberate. Player units deal +20% damage.',
    icon:        '🎯',
    tier:        2,
    cost:        2,
    requires:    'downbeat',
    effect(state) { state.skillUnitDamageMult = (state.skillUnitDamageMult || 1.0) * 1.2; },
  }),

  Object.freeze({
    id:          'legato',
    name:        'Legato',
    description: 'Smooth, connected playing sustains the phrase — and your forces. Units spawn with +25% HP.',
    icon:        '🌊',
    tier:        2,
    cost:        2,
    requires:    'pulse',
    effect(state) { state.skillUnitHpMult = (state.skillUnitHpMult || 1.0) * 1.25; },
  }),

  // ── Tier III — Theory ──────────────────────────────────────────────────────
  // Theory is understanding WHY music works. These skills reward players who
  // have internalized rhythm and technique and can now think musically.

  Object.freeze({
    id:          'minor-mastery',
    name:        'Minor Mastery',
    description: 'Minor keys carry weight and tension — mastering them means mastering emotion. Summon cooldown −200ms.',
    icon:        '🌑',
    tier:        3,
    cost:        3,
    requires:    'chord-fluency',
    effect(state) { state.skillSummonCooldownBonus = (state.skillSummonCooldownBonus || 0) + 200; },
  }),

  Object.freeze({
    id:          'scale-runner',
    name:        'Scale Runner',
    description: 'Scales are the alphabet of music. Running them builds endurance. Player base +25 max HP.',
    icon:        '🎵',
    tier:        3,
    cost:        3,
    requires:    'articulation',
    effect(state) { state.skillBaseHpBonus = (state.skillBaseHpBonus || 0) + 25; },
  }),

  Object.freeze({
    id:          'resolution',
    name:        'Resolution',
    description: 'Returning to the root note completes the phrase. V→I resolution: +20 base HP and +15% unit HP.',
    icon:        '🏠',
    tier:        3,
    cost:        3,
    requires:    'legato',
    effect(state) {
      state.skillBaseHpBonus = (state.skillBaseHpBonus || 0) + 20;
      state.skillUnitHpMult  = (state.skillUnitHpMult  || 1.0) * 1.15;
    },
  }),

]);

/** Convenience map for O(1) lookup by id. */
export const SKILLS_BY_ID = Object.freeze(
  Object.fromEntries(SKILLS.map(s => [s.id, s]))
);
