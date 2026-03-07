/**
 * @file src/systems/attackSequence.js
 * Floating note sequences above enemy units — direct targeting mechanic.
 *
 * SEQUENCE RULES
 * ──────────────
 *   Tier 1 — 2-note sequence → instant kill on completion
 *   Tier 2 — 3-note sequence → 60 % max-HP damage on completion
 *   Tier 3 — 5-note sequence → 3-second stun on completion (unit freezes)
 *
 * Each enemy unit gets a sequence assigned on spawn (assignSequence).
 * The sequence is stored directly on the unit:
 *   unit.attackSeq         — string[]  (note names)
 *   unit.attackSeqProgress — number    (index of next note to match)
 *   unit.stunned           — boolean
 *   unit.stunTimer         — number    (seconds remaining)
 *
 * MATCHING
 *   onNote() finds the enemy whose next note matches the pressed note.
 *   If multiple share the same next note, the one closest to the player
 *   base (smallest x) is chosen.
 *
 * STUN TICKING
 *   update() ticks stunTimer each frame and clears stun when it expires.
 *   Unit.update() checks unit.stunned and skips all AI when true.
 */

/** Note pool for sequence generation (white keys, base octave). */
const NOTE_POOL    = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'];

/** Sequence lengths by tier (index 0 unused). */
const SEQ_LENGTHS  = [0, 2, 3, 5];

/** Stun duration in seconds. */
const STUN_DURATION = 3;

export class AttackSequenceSystem {
  /**
   * Assign a fresh random attack sequence to a newly spawned enemy unit.
   * Mutates the unit in place — must be called before the unit is added to state.units.
   * @param {import('../entities/unit.js').Unit} unit
   */
  assignSequence(unit) {
    const len              = SEQ_LENGTHS[unit.tier] ?? 2;
    unit.attackSeq         = [];
    unit.attackSeqProgress = 0;
    unit.stunned           = false;
    unit.stunTimer         = 0;
    for (let i = 0; i < len; i++) {
      unit.attackSeq.push(NOTE_POOL[Math.floor(Math.random() * NOTE_POOL.length)]);
    }
  }

  /**
   * Reset — unstun any surviving units (called on game restart).
   * state.units is empty at start, so this is largely a no-op.
   * @param {object} state
   */
  reset(state) {
    for (let i = 0; i < state.units.length; i++) {
      const u = state.units[i];
      u.stunned   = false;
      u.stunTimer = 0;
    }
  }

  /**
   * Per-frame update — tick stun timers.
   * Zero-allocation: indexed for-loop, scalar arithmetic.
   * @param {number} dt
   * @param {object} state
   */
  update(dt, state) {
    const units = state.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || !u.stunned) continue;
      u.stunTimer -= dt;
      if (u.stunTimer <= 0) {
        u.stunned           = false;
        u.stunTimer         = 0;
        u.attackSeqProgress = 0;   // reset so unit can be targeted again
      }
    }
  }

  /**
   * Called on each note press — advance the best-matching enemy's sequence.
   * If multiple enemies share the same next note, the one with the smallest x
   * (closest to the player base) is prioritised.
   * @param {string} note
   * @param {object} state
   */
  onNote(note, state) {
    const units = state.units;
    let bestUnit = null;
    let bestX    = Infinity;

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.team !== 'enemy' || u.stunned) continue;
      if (!u.attackSeq || u.attackSeqProgress >= u.attackSeq.length) continue;
      if (u.attackSeq[u.attackSeqProgress] === note && u.x < bestX) {
        bestX    = u.x;
        bestUnit = u;
      }
    }

    if (bestUnit === null) return;

    bestUnit.attackSeqProgress++;
    if (bestUnit.attackSeqProgress >= bestUnit.attackSeq.length) {
      this._applyEffect(bestUnit);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /** Apply the tier-appropriate sequence-completion effect. */
  _applyEffect(unit) {
    if (unit.tier === 1) {
      unit.hp    = 0;
      unit.alive = false;
    } else if (unit.tier === 2) {
      unit.hp = Math.max(0, unit.hp - unit.maxHp * 0.6);
      if (unit.hp <= 0) unit.alive = false;
    } else {
      unit.stunned   = true;
      unit.stunTimer = STUN_DURATION;
    }
    unit.attackSeqProgress = 0;
  }
}
