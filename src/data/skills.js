/**
 * @file src/data/skills.js
 * Musical progression skill tree — Tier I / II / III milestone upgrades.
 *
 * DESIGN PRINCIPLE: Every skill reinforces a real musical concept.
 * The upgrade a player buys should FEEL like practising that skill on their instrument.
 * Gameplay effects are concrete and immediate so the metaphor lands.
 *
 * ─── Prerequisite chains (three independent paths) ────────────────────────────
 *   steady-tempo  →  chord-memory   →  voice-leading
 *   clear-tone    →  rhythm-reading →  sight-reading
 *   open-position →  strong-fingers →  tempo-master
 *
 * ─── Tier gate ────────────────────────────────────────────────────────────────
 *   Tier III skills require ANY 2 Tier-II skills to be purchased before they
 *   unlock, in addition to their single direct prerequisite.
 *   This is expressed via the `requiresTierCount` field and enforced in
 *   src/systems/progression.js purchaseSkill().
 *
 * ─── State fields written by skill effects ────────────────────────────────────
 *   skillTimingWindowMult    — float ≥ 1.0  (cue system timing window multiplier)
 *   skillMaxUnitsBonus       — integer       (added to player unit cap)
 *   skillChordMemory         — boolean       (cue system shows chord shape)
 *   skillRhythmReading       — boolean       (cue system shows rhythm notation)
 *   skillUnlockMage          — boolean       (mage summoning highlight)
 *   skillSummonCooldownBonus — ms            (subtracted from summon cooldown)
 *   skillSightReading        — boolean       (upcoming phrase preview)
 *   skillSpawnIntervalBonus  — seconds       (added to enemy spawn interval)
 *   skillComboDoubleMilestone — boolean      (combo milestone bonuses × 2)
 *   skillTempoMaster         — boolean       (flag read by cue system)
 *   skillBaseHpBonus         — integer       (added to player base max HP)
 */

/**
 * @typedef {Object} SkillNode
 * @property {string}      id
 * @property {string}      name
 * @property {string}      description
 * @property {string}      icon
 * @property {number}      tier                — 1 | 2 | 3
 * @property {number}      cost                — stars required to purchase
 * @property {string|null} requires            — prerequisite skill id, or null
 * @property {{ tier: number, count: number }|null} requiresTierCount
 *   Additional gate: must have purchased `count` skills from `tier` first.
 *   null = no tier-count gate.
 * @property {function}    effect              — (state) => void; applied once per startGame()
 */

/** @type {ReadonlyArray<Readonly<SkillNode>>} */
export const SKILLS = Object.freeze([

  // ── Tier I — Foundation ────────────────────────────────────────────────────
  // The three things every musician learns first: steady time, clear tone, and
  // relaxed hand position. Each unlocks a concrete gameplay advantage.

  Object.freeze({
    id:          'steady-tempo',
    name:        'Steady Tempo',
    description: 'A consistent pulse is the foundation of all music. Cue timing window +20% — you have more time to land each note.',
    icon:        '🥁',
    tier:        1,
    cost:        1,
    requires:    null,
    requiresTierCount: null,
    effect(state) {
      // skillTimingWindowMult is read by CueSystem to widen its hit window
      state.skillTimingWindowMult = Math.max(state.skillTimingWindowMult ?? 1.0, 1.0) * 1.20;
    },
  }),

  Object.freeze({
    id:          'clear-tone',
    name:        'Clear Tone',
    description: 'Every great player produces a tone that cuts through. +40 starting resources — clean playing opens tactical options from the first bar.',
    icon:        '🎵',
    tier:        1,
    cost:        1,
    requires:    null,
    requiresTierCount: null,
    effect(state) {
      // Concrete resource bonus — metaphor: clear playing earns more from the crowd
      state.resources = (state.resources ?? 0) + 40;
    },
  }),

  Object.freeze({
    id:          'open-position',
    name:        'Open Position',
    description: 'Open position is where every player begins — relaxed, ready, full range of motion. Max player units +1.',
    icon:        '🤲',
    tier:        1,
    cost:        1,
    requires:    null,
    requiresTierCount: null,
    effect(state) {
      state.skillMaxUnitsBonus = (state.skillMaxUnitsBonus ?? 0) + 1;
    },
  }),

  // ── Tier II — Technique ────────────────────────────────────────────────────
  // Technique is how you execute what you know. Each skill rewards a specific
  // dimension of musical skill with a matching gameplay enhancement.

  Object.freeze({
    id:          'chord-memory',
    name:        'Chord Memory',
    description: 'Knowing chord shapes by feel — not by thought — is what separates fluency from struggle. Chord shapes shown in cue cards + max units +1.',
    icon:        '🎼',
    tier:        2,
    cost:        2,
    requires:    'steady-tempo',
    requiresTierCount: null,
    effect(state) {
      state.skillChordMemory    = true;
      state.skillMaxUnitsBonus  = (state.skillMaxUnitsBonus ?? 0) + 1;
    },
  }),

  Object.freeze({
    id:          'rhythm-reading',
    name:        'Rhythm Reading',
    description: 'Reading rhythm on a page and feeling it in your body are the same skill. Rhythm notation shown in cue cards + enemy spawn interval +1 s.',
    icon:        '♩',
    tier:        2,
    cost:        2,
    requires:    'clear-tone',
    requiresTierCount: null,
    effect(state) {
      state.skillRhythmReading      = true;
      state.skillSpawnIntervalBonus = (state.skillSpawnIntervalBonus ?? 0) + 1.0;
    },
  }),

  Object.freeze({
    id:          'strong-fingers',
    name:        'Strong Fingers',
    description: 'Strength and independence in every finger multiplies your expressive range. DPS unit cap +1 (max player units +1).',
    icon:        '💪',
    tier:        2,
    cost:        2,
    requires:    'open-position',
    requiresTierCount: null,
    effect(state) {
      state.skillMaxUnitsBonus = (state.skillMaxUnitsBonus ?? 0) + 1;
    },
  }),

  // ── Tier III — Mastery ─────────────────────────────────────────────────────
  // Mastery is understanding WHY music works — and making it work for you.
  // Each Tier-III skill requires 2 Tier-II purchases (any two paths) + its
  // direct Tier-II prerequisite, so players must invest broadly before
  // reaching the top.

  Object.freeze({
    id:          'voice-leading',
    name:        'Voice Leading',
    description: 'Moving voices smoothly from chord to chord is the secret of great harmony. Unlocks Mage summoning highlight + summon cooldown −150 ms.',
    icon:        '🌟',
    tier:        3,
    cost:        3,
    requires:    'chord-memory',
    requiresTierCount: { tier: 2, count: 2 },
    effect(state) {
      state.skillUnlockMage         = true;
      state.skillSummonCooldownBonus = (state.skillSummonCooldownBonus ?? 0) + 150;
    },
  }),

  Object.freeze({
    id:          'sight-reading',
    name:        'Sight Reading',
    description: 'Sight-reading trains the eye to see music before the ear hears it. Upcoming tablature phrase previewed + player base +20 HP.',
    icon:        '👁️',
    tier:        3,
    cost:        3,
    requires:    'rhythm-reading',
    requiresTierCount: { tier: 2, count: 2 },
    effect(state) {
      state.skillSightReading = true;
      state.skillBaseHpBonus  = (state.skillBaseHpBonus ?? 0) + 20;
    },
  }),

  Object.freeze({
    id:          'tempo-master',
    name:        'Tempo Master',
    description: 'Owning the tempo means the music serves you, not the other way around. Combo milestone bonuses doubled.',
    icon:        '⏱️',
    tier:        3,
    cost:        3,
    requires:    'strong-fingers',
    requiresTierCount: { tier: 2, count: 2 },
    effect(state) {
      state.skillTempoMaster           = true;
      state.skillComboDoubleMilestone  = true;
    },
  }),

]);

/** Convenience map for O(1) lookup by id. */
export const SKILLS_BY_ID = Object.freeze(
  Object.fromEntries(SKILLS.map(s => [s.id, s]))
);
