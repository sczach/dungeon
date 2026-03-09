/**
 * @file src/data/skills.js
 * Skill tree node definitions for ChordWars persistent progression.
 *
 * Skills are purchased with stars (earned on victory) and apply passive
 * buffs to the game state at startGame() time. They never run in the rAF loop.
 *
 * Tree structure:
 *   Tier 1 (cost 1 star) — no prerequisites
 *   Tier 2 (cost 2 stars) — requires one Tier-1 skill
 *   Tier 3 (cost 3 stars) — requires one Tier-2 skill
 *
 * Effect functions receive the canonical state object after createInitialState()
 * runs, so they can safely mutate any numeric field.
 */

/**
 * @typedef {Object} SkillNode
 * @property {string}   id          — unique identifier
 * @property {string}   name        — display name
 * @property {string}   description — one-line tooltip
 * @property {string}   icon        — emoji icon for the card
 * @property {number}   tier        — 1 | 2 | 3
 * @property {number}   cost        — stars required to purchase
 * @property {string|null} requires — id of prerequisite skill, or null
 * @property {function} effect      — (state) => void — applied once per startGame()
 */

/** @type {ReadonlyArray<Readonly<SkillNode>>} */
export const SKILLS = Object.freeze([

  // ── Tier 1 ─────────────────────────────────────────────────────────────────

  Object.freeze({
    id:          'extra-gold',
    name:        'War Chest',
    description: '+50 starting resources',
    icon:        '💰',
    tier:        1,
    cost:        1,
    requires:    null,
    effect(state) { state.resources += 50; },
  }),

  Object.freeze({
    id:          'quick-hands',
    name:        'Quick Hands',
    description: 'Summon cooldown −100ms',
    icon:        '⚡',
    tier:        1,
    cost:        1,
    requires:    null,
    // summonCooldownEnd starts at 0 (no cooldown); we store the reduction
    // as a state flag; game.js reads it when setting SUMMON_COOLDOWN_MS.
    // Implemented by reducing the tablature SUMMON_COOLDOWN_MS baseline via
    // a state field that TablatureSystem reads on its first note hit.
    effect(state) { state.skillSummonCooldownBonus = (state.skillSummonCooldownBonus || 0) + 100; },
  }),

  Object.freeze({
    id:          'iron-will',
    name:        'Iron Will',
    description: 'Player base starts with +20 max HP',
    icon:        '🛡️',
    tier:        1,
    cost:        1,
    requires:    null,
    // Applied after playerBase is constructed — game.js calls applySkills()
    // after base construction, then updates the base's maxHp and hp.
    effect(state) { state.skillBaseHpBonus = (state.skillBaseHpBonus || 0) + 20; },
  }),

  // ── Tier 2 ─────────────────────────────────────────────────────────────────

  Object.freeze({
    id:          'battalion',
    name:        'Battalion',
    description: 'Max player units on screen +2',
    icon:        '⚔️',
    tier:        2,
    cost:        2,
    requires:    'extra-gold',
    effect(state) { state.skillMaxUnitsBonus = (state.skillMaxUnitsBonus || 0) + 2; },
  }),

  Object.freeze({
    id:          'veterans',
    name:        'Veterans',
    description: 'Player units spawn with +20% HP',
    icon:        '💪',
    tier:        2,
    cost:        2,
    requires:    'quick-hands',
    effect(state) { state.skillUnitHpMult = (state.skillUnitHpMult || 1.0) * 1.2; },
  }),

  Object.freeze({
    id:          'arsenal',
    name:        'Arsenal',
    description: 'Player units deal +15% damage',
    icon:        '🗡️',
    tier:        2,
    cost:        2,
    requires:    'iron-will',
    effect(state) { state.skillUnitDamageMult = (state.skillUnitDamageMult || 1.0) * 1.15; },
  }),

  // ── Tier 3 ─────────────────────────────────────────────────────────────────

  Object.freeze({
    id:          'fortress',
    name:        'Fortress',
    description: 'Player base starts with +30 additional max HP',
    icon:        '🏰',
    tier:        3,
    cost:        3,
    requires:    'battalion',
    effect(state) { state.skillBaseHpBonus = (state.skillBaseHpBonus || 0) + 30; },
  }),

  Object.freeze({
    id:          'commander',
    name:        'Commander',
    description: 'Combo milestone resource bonuses doubled',
    icon:        '👑',
    tier:        3,
    cost:        3,
    requires:    'veterans',
    effect(state) { state.skillComboDoubleMilestone = true; },
  }),

  Object.freeze({
    id:          'tempo',
    name:        'Tempo',
    description: 'Enemy spawn interval +1s (more breathing room)',
    icon:        '🎵',
    tier:        3,
    cost:        3,
    requires:    'arsenal',
    effect(state) { state.skillSpawnIntervalBonus = (state.skillSpawnIntervalBonus || 0) + 1.0; },
  }),
]);

/** Convenience map for O(1) lookup by id. */
export const SKILLS_BY_ID = Object.freeze(
  Object.fromEntries(SKILLS.map(s => [s.id, s]))
);
