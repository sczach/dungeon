/**
 * @file src/systems/progression.js
 * Persistent player progression — saved to localStorage between sessions.
 *
 * Responsibilities:
 *   • Load / save the progress record (bestStars, purchased skills)
 *   • Award stars for a completed level (keeps best run only)
 *   • Purchase skills (validates cost, records purchase)
 *   • Apply all purchased skills to state at startGame() time
 *   • Expose total star count for the skill tree UI
 *
 * No DOM access, no canvas — pure data layer.
 * All mutations return a new progress object; callers must save() the result.
 */

import { SKILLS_BY_ID, SKILLS } from '../data/skills.js';
import { LEVELS }                from '../data/levels.js';

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'chordwars-progress';

/**
 * @typedef {Object} ProgressRecord
 * @property {Object.<string, number>} bestStars       — levelId → best star count (0–3)
 * @property {string[]}                purchased        — ordered list of purchased skill ids
 * @property {boolean}                 tutorialComplete — true after tutorial-4 victory
 */

/**
 * Load progress from localStorage.
 * Returns a fresh default record if nothing is saved or the data is malformed.
 *
 * @returns {ProgressRecord}
 */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return _defaultProgress();
    const parsed = JSON.parse(raw);
    // Basic shape validation — defend against schema changes
    if (typeof parsed !== 'object' || !parsed.bestStars || !Array.isArray(parsed.purchased)) {
      return _defaultProgress();
    }
    return {
      bestStars:        Object.assign(_emptyBestStars(), parsed.bestStars),
      purchased:        parsed.purchased.filter(id => id in SKILLS_BY_ID),
      tutorialComplete: parsed.tutorialComplete === true,
    };
  } catch (_) {
    return _defaultProgress();
  }
}

/**
 * Persist progress to localStorage.
 * @param {ProgressRecord} prog
 */
export function saveProgress(prog) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prog));
  } catch (_) {
    // Storage quota exceeded or private mode — silently ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record the star result for a completed level.
 * Only updates if the new result is better than the stored best.
 * Returns the (possibly mutated) progress record.
 *
 * @param {string}         levelId
 * @param {0|1|2|3}        stars
 * @param {ProgressRecord} prog
 * @returns {ProgressRecord}
 */
export function awardStars(levelId, stars, prog) {
  const current = prog.bestStars[levelId] ?? 0;
  if (stars > current) {
    prog.bestStars[levelId] = stars;
  }
  return prog;
}

/**
 * Sum of best star counts across all levels.
 * This is the spendable star currency for the skill tree.
 * Stars already spent on skills are subtracted.
 *
 * @param {ProgressRecord} prog
 * @returns {number}
 */
export function totalStars(prog) {
  const earned = Object.values(prog.bestStars).reduce((s, n) => s + n, 0);
  const spent  = prog.purchased.reduce((s, id) => s + (SKILLS_BY_ID[id]?.cost ?? 0), 0);
  return Math.max(0, earned - spent);
}

/**
 * Total stars earned across all levels (gross, before spending).
 * @param {ProgressRecord} prog
 * @returns {number}
 */
export function totalStarsEarned(prog) {
  return Object.values(prog.bestStars).reduce((s, n) => s + n, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill purchase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to purchase a skill.
 * Returns { ok: true } on success or { ok: false, reason: string } on failure.
 * Mutates prog on success — caller must call saveProgress() afterwards.
 *
 * @param {string}         skillId
 * @param {ProgressRecord} prog
 * @returns {{ ok: boolean, reason?: string }}
 */
export function purchaseSkill(skillId, prog) {
  const skill = SKILLS_BY_ID[skillId];
  if (!skill) return { ok: false, reason: 'Unknown skill' };

  if (prog.purchased.includes(skillId)) {
    return { ok: false, reason: 'Already purchased' };
  }

  // Single-skill prerequisite check
  if (skill.requires && !prog.purchased.includes(skill.requires)) {
    const req = SKILLS_BY_ID[skill.requires];
    return { ok: false, reason: `Requires "${req?.name ?? skill.requires}" first` };
  }

  // Tier-count prerequisite check (e.g. "must own 2 Tier-II skills")
  if (skill.requiresTierCount) {
    const { tier, count } = skill.requiresTierCount;
    const ownedInTier = SKILLS
      .filter(s => s.tier === tier)
      .filter(s => prog.purchased.includes(s.id))
      .length;
    if (ownedInTier < count) {
      return { ok: false, reason: `Requires ${count} Tier ${tier} skill${count > 1 ? 's' : ''} (have ${ownedInTier})` };
    }
  }

  const available = totalStars(prog);
  if (available < skill.cost) {
    return { ok: false, reason: `Need ${skill.cost} stars (have ${available})` };
  }

  prog.purchased.push(skillId);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply all purchased skill effects to the game state.
 * Must be called AFTER playerBase/enemyBase are constructed in startGame().
 *
 * Skill effect functions write skill-specific fields onto state (e.g.
 * state.skillBaseHpBonus, state.skillUnitHpMult) which game.js reads
 * immediately after this call to adjust live objects.
 *
 * @param {object}         state — canonical game state (mutated in-place)
 * @param {ProgressRecord} prog
 */
export function applySkills(state, prog) {
  // Reset all skill-applied fields so replays start clean
  state.skillSummonCooldownBonus  = 0;
  state.skillBaseHpBonus          = 0;
  state.skillMaxUnitsBonus        = 0;
  state.skillUnitHpMult           = 1.0;
  state.skillUnitDamageMult       = 1.0;
  state.skillComboDoubleMilestone = false;
  state.skillSpawnIntervalBonus   = 0;
  // Tier I–III musical progression fields
  state.skillTimingWindowMult     = 1.0;
  state.skillChordMemory          = false;
  state.skillRhythmReading        = false;
  state.skillUnlockMage           = false;
  state.skillSightReading         = false;
  state.skillTempoMaster          = false;

  for (const id of prog.purchased) {
    const skill = SKILLS_BY_ID[id];
    if (skill) skill.effect(state);
  }

  // Apply base HP bonus to the live Base objects
  if (state.skillBaseHpBonus > 0 && state.playerBase) {
    state.playerBase.hp    += state.skillBaseHpBonus;
    state.playerBase.maxHp += state.skillBaseHpBonus;
  }

  // Apply spawn interval bonus
  if (state.skillSpawnIntervalBonus > 0) {
    state.enemySpawnInterval = Math.min(
      state.enemySpawnInterval + state.skillSpawnIntervalBonus,
      20   // cap: never make it trivially slow
    );
    state.enemySpawnTimer = state.enemySpawnInterval;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill tree query helpers (used by UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the visual state of a skill node for rendering.
 *
 * @param {string}         skillId
 * @param {ProgressRecord} prog
 * @returns {'purchased'|'available'|'locked'|'unaffordable'}
 */
export function skillState(skillId, prog) {
  const skill = SKILLS_BY_ID[skillId];
  if (!skill) return 'locked';

  if (prog.purchased.includes(skillId)) return 'purchased';

  // Single-skill prerequisite
  if (skill.requires && !prog.purchased.includes(skill.requires)) return 'locked';

  // Tier-count prerequisite
  if (skill.requiresTierCount) {
    const { tier, count } = skill.requiresTierCount;
    const ownedInTier = SKILLS
      .filter(s => s.tier === tier)
      .filter(s => prog.purchased.includes(s.id))
      .length;
    if (ownedInTier < count) return 'locked';
  }

  // All prereqs met — check affordability
  return totalStars(prog) >= skill.cost ? 'available' : 'unaffordable';
}

/**
 * Group skills by tier for layout.
 * @returns {Object.<number, import('../data/skills.js').SkillNode[]>}
 */
export function skillsByTier() {
  const map = { 1: [], 2: [], 3: [] };
  for (const s of SKILLS) map[s.tier].push(s);
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function _emptyBestStars() {
  return Object.fromEntries(LEVELS.map(l => [l.id, 0]));
}

function _defaultProgress() {
  return { bestStars: _emptyBestStars(), purchased: [], tutorialComplete: false };
}
