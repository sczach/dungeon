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
 * DIRECT ATTACK (no matching enemy sequence)
 *   When a note is pressed in ATTACK mode but no enemy sequence matches:
 *   - The note fires a lightning bolt at the nearest enemy unit (soaks
 *     damage) or at the enemy base if no units are present.
 *   - Damage = BASE_DIRECT_DAMAGE × accuracy (accuracy drops with each
 *     consecutive miss, floored at 10%).
 *   - state.attackMisses tracks consecutive misses; resets after each
 *     successful sequence completion.
 *
 * STUN TICKING
 *   update() ticks stunTimer each frame and clears stun when it expires.
 *   Unit.update() checks unit.stunned and skips all AI when true.
 */

/** Note pool for sequence generation (white keys, base octave). */
const NOTE_POOL    = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3']; // locked to C3 octave

/** Sequence lengths by tier (index 0 unused). */
const SEQ_LENGTHS  = [0, 2, 3, 5];

/** Stun duration in seconds (kept short so T3 doesn't monopolise attention). */
const STUN_DURATION = 2;

/** Damage dealt by a direct attack (miss bolt) before accuracy multiplier. */
const BASE_DIRECT_DAMAGE = 8;

/** Duration of the lightning bolt canvas animation in milliseconds. */
const BOLT_DURATION_MS = 200;

// ─── Lightning helpers ────────────────────────────────────────────────────────

/**
 * Generate a jagged lightning path between two points.
 * Called ONCE at bolt creation time — stored on bolt.segments so the
 * renderer reads stable geometry every frame (zero per-frame allocation).
 *
 * @param {number} x1 @param {number} y1 — source (player base)
 * @param {number} x2 @param {number} y2 — target (enemy unit or base)
 * @returns {{x:number,y:number}[]}
 */
function generateLightningSegments(x1, y1, x2, y2) {
  const STEPS  = 8;      // number of intermediate jitter points
  const JITTER = 22;     // max perpendicular displacement in px
  const dx     = x2 - x1;
  const dy     = y2 - y1;
  const len    = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector (90° CCW rotation)
  const nx = -dy / len;
  const ny =  dx / len;

  const pts = [{ x: x1, y: y1 }];
  for (let i = 1; i < STEPS; i++) {
    const t    = i / STEPS;
    const bx   = x1 + dx * t;
    const by   = y1 + dy * t;
    // Amplitude peaks at midpoint, zero at endpoints (smooth taper)
    const amp  = Math.sin(t * Math.PI) * JITTER;
    const perp = (Math.random() * 2 - 1) * amp;
    pts.push({ x: bx + nx * perp, y: by + ny * perp });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

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
        u.stunned   = false;
        u.stunTimer = 0;
        // Assign a brand-new sequence so the unit is not immediately
        // re-targeted with the same notes it just had.
        const len = SEQ_LENGTHS[u.tier] ?? 2;
        u.attackSeq = [];
        for (let n = 0; n < len; n++) {
          u.attackSeq.push(NOTE_POOL[Math.floor(Math.random() * NOTE_POOL.length)]);
        }
        u.attackSeqProgress = 0;
      }
    }
  }

  /**
   * Called on each note press — advance the best-matching enemy's sequence.
   *
   * Priority: fewest remaining notes wins (kills/hurts faster), ties broken
   * by proximity to the player base (smallest x).  This prevents a distant
   * tier-3 enemy with a 5-note sequence from monopolising all player attacks
   * while tier-1/2 enemies with shorter sequences walk through.
   *
   * If no enemy sequence matches: fires a direct lightning attack at the
   * nearest enemy unit (damage soak) or the enemy base (if lane is clear).
   *
   * @param {string} note
   * @param {object} state
   */
  onNote(note, state) {
    const units = state.units;
    let bestUnit  = null;
    let bestScore = Infinity;

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.team !== 'enemy' || u.stunned) continue;
      if (!u.attackSeq || u.attackSeqProgress >= u.attackSeq.length) continue;
      if (u.attackSeq[u.attackSeqProgress] !== note) continue;

      // Score = (remaining notes) * 10000 + x
      // Lower remaining notes → lower score → preferred.
      // Equal remaining → closer to base (smaller x) → preferred.
      const remaining = u.attackSeq.length - u.attackSeqProgress;
      const score     = remaining * 10000 + u.x;
      if (score < bestScore) {
        bestScore = score;
        bestUnit  = u;
      }
    }

    // ── Miss path: no enemy sequence matched this note ────────────────────
    if (bestUnit === null) {
      this._handleDirectAttack(note, state);
      return;
    }

    // ── Hit path: advance the matched enemy's sequence ────────────────────
    bestUnit.attackSeqProgress++;
    if (bestUnit.attackSeqProgress >= bestUnit.attackSeq.length) {
      this._applyEffect(bestUnit, state);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Direct attack — note pressed in ATTACK mode but no enemy sequence matched.
   * Finds the nearest alive enemy unit (which soaks the damage) or falls back
   * to the enemy base.  Fires a lightning bolt visual and deals
   * BASE_DIRECT_DAMAGE × accuracy to the target.
   *
   * accuracy = max(0.1, 1 - priorMisses × 0.10)
   * Consecutive misses weaken direct-attack damage by 10 % each, floored at 10 %.
   *
   * @param {string} note  — the unmatched note (unused; kept for future use)
   * @param {object} state
   */
  _handleDirectAttack(note, state) {   // eslint-disable-line no-unused-vars
    const priorMisses = state.attackMisses ?? 0;
    if (state.attackMisses !== undefined) state.attackMisses = priorMisses + 1;

    const accuracy = Math.max(0.1, 1 - priorMisses * 0.10);
    const damage   = BASE_DIRECT_DAMAGE * accuracy;

    if (!state.playerBase) return;
    const srcX = state.playerBase.x;
    const srcY = state.playerBase.y;

    // Find nearest alive enemy unit (soaks damage first)
    const units = state.units;
    let nearestUnit = null;
    let nearestDist = Infinity;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.alive || u.team !== 'enemy') continue;
      const dx = u.x - srcX;
      const dy = u.y - srcY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist) { nearestDist = d; nearestUnit = u; }
    }

    // Find nearest alive enemy base as bolt fallback target
    const allBases  = state.enemyBases ?? (state.enemyBase ? [state.enemyBase] : []);
    let nearestBase = null;
    let nearestBaseDist = Infinity;
    for (let i = 0; i < allBases.length; i++) {
      const b = allBases[i];
      if (b.isDestroyed()) continue;
      const dx = b.x - srcX;
      const dy = b.y - srcY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestBaseDist) { nearestBaseDist = d; nearestBase = b; }
    }

    if (nearestUnit !== null) {
      nearestUnit.hp -= damage;
      if (nearestUnit.hp <= 0) nearestUnit.alive = false;
      this._fireBolt(srcX, srcY, nearestUnit.x, nearestUnit.y, state);
    } else if (nearestBase) {
      nearestBase.takeDamage(damage);
      this._fireBolt(srcX, srcY, nearestBase.x, nearestBase.y, state);
    }
  }

  /**
   * Apply the tier-appropriate sequence-completion effect and fire a lightning
   * bolt visual from the player base to the completed unit's position.
   * @param {import('../entities/unit.js').Unit} unit
   * @param {object} state
   */
  _applyEffect(unit, state) {
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

    // Reset consecutive-miss counter after a successful completion
    if (state && state.attackMisses !== undefined) state.attackMisses = 0;

    // Lightning bolt visual — from player base to the target unit
    if (state && state.playerBase) {
      this._fireBolt(state.playerBase.x, state.playerBase.y, unit.x, unit.y, state);
    }
  }

  /**
   * Push a new lightning bolt into state.lightningBolts.
   * Segments are pre-computed here (once) so the renderer does zero allocation.
   * @param {number} x1 @param {number} y1 — source
   * @param {number} x2 @param {number} y2 — target
   * @param {object} state
   */
  _fireBolt(x1, y1, x2, y2, state) {
    if (!state.lightningBolts) return;
    state.lightningBolts.push({
      x1, y1, x2, y2,
      startTime: performance.now(),
      duration:  BOLT_DURATION_MS,
      segments:  generateLightningSegments(x1, y1, x2, y2),
    });
  }
}
