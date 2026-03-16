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

/** Damage dealt by a direct attack (miss bolt) before accuracy multiplier.
 *  Increased from 8 → 15 so keyboard direct hits do ~7.5 HP (no cue) or 15 HP (cue)
 *  against a 100 HP base — was ~4 HP per hit (too slow, felt like <1% per strike). */
const BASE_DIRECT_DAMAGE = 15;

/** Base duration of the lightning bolt canvas animation in milliseconds. */
const BOLT_DURATION_MS = 200;

/** Shake threshold: hits above this damage trigger screen shake. */
const SHAKE_THRESHOLD = 20;

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
    const now = performance.now();

    // 1. Global attack cooldown — prevents rapid-fire mashing
    if (now < (state.attackCooldownEnd ?? 0)) return;

    // 2. Cue gate — wrong note when a cue is active → red flash, no attack
    const cue      = state.currentCue;
    const cueActive = cue && cue.status === 'active' && now <= cue.deadline;
    if (cueActive && note !== cue.note) {
      state.wrongNoteFlash = { time: now };
      return;
    }

    // 3. Damage multiplier: full on cue match, 50% on free play (no active cue)
    const dmgMult = cueActive ? 1.0 : 0.5;
    state.attackCooldownEnd = now + 400;

    // 4. Find the best matching enemy sequence (existing priority logic)
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
      this._handleDirectAttack(note, state, dmgMult);
      return;
    }

    // ── Hit path: advance the matched enemy's sequence ────────────────────
    bestUnit.attackSeqProgress++;
    if (bestUnit.attackSeqProgress >= bestUnit.attackSeq.length) {
      this._applyEffect(bestUnit, state, dmgMult);
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
  _handleDirectAttack(note, state, dmgMult = 1.0) {   // eslint-disable-line no-unused-vars
    const priorMisses = state.attackMisses ?? 0;
    if (state.attackMisses !== undefined) state.attackMisses = priorMisses + 1;

    const accuracy = Math.max(0.1, 1 - priorMisses * 0.10);
    const damage   = BASE_DIRECT_DAMAGE * accuracy * dmgMult;

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
      this._pushDmgNum(nearestUnit.x, nearestUnit.y, Math.round(damage), '#ffcc44', state);
      if (damage >= SHAKE_THRESHOLD) this._triggerShake(4, state);
    } else if (nearestBase) {
      nearestBase.takeDamage(damage);
      this._fireBolt(srcX, srcY, nearestBase.x, nearestBase.y, state);
      this._pushDmgNum(nearestBase.x, nearestBase.y, Math.round(damage), '#ff6644', state);
      if (damage >= SHAKE_THRESHOLD) this._triggerShake(6, state);
    }
  }

  /**
   * Apply the tier-appropriate sequence-completion effect and fire a lightning
   * bolt visual from the player base to the completed unit's position.
   * @param {import('../entities/unit.js').Unit} unit
   * @param {object} state
   */
  _applyEffect(unit, state, dmgMult = 1.0) {
    if (unit.tier === 1) {
      if (dmgMult >= 1.0) {
        // Full cue hit — instant kill
        unit.hp    = 0;
        unit.alive = false;
        this._pushDmgNum(unit.x, unit.y, unit.maxHp, '#ff8800', state);
      } else {
        // Free-play (50%) — significant damage but not instant kill
        const dealt = Math.round(unit.maxHp * dmgMult);
        unit.hp = Math.max(0, unit.hp - dealt);
        if (unit.hp <= 0) unit.alive = false;
        this._pushDmgNum(unit.x, unit.y, dealt, '#ffaa44', state);
      }
    } else if (unit.tier === 2) {
      const dealt = Math.round(unit.maxHp * 0.6 * dmgMult);
      unit.hp = Math.max(0, unit.hp - dealt);
      if (unit.hp <= 0) unit.alive = false;
      this._pushDmgNum(unit.x, unit.y, dealt, '#ffcc44', state);
      if (dealt >= SHAKE_THRESHOLD) this._triggerShake(4, state);
    } else {
      // T3 stun — always applies; duration halved on free play
      unit.stunned   = true;
      unit.stunTimer = STUN_DURATION * dmgMult;
      this._pushDmgNum(unit.x, unit.y, 0, '#cc88ff', state, 'STUN');
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
   * @param {number} [chargeLevel] — 0=normal, 1/2/3=charged (affects duration + visual)
   */
  _fireBolt(x1, y1, x2, y2, state, chargeLevel = 0) {
    if (!state.lightningBolts) return;
    state.lightningBolts.push({
      x1, y1, x2, y2,
      startTime:   performance.now(),
      duration:    BOLT_DURATION_MS * (1 + chargeLevel * 0.5),
      segments:    generateLightningSegments(x1, y1, x2, y2),
      chargeLevel: chargeLevel || 0,
    });
  }

  /**
   * Push a floating damage number into state.damageNumbers.
   * @param {number} x @param {number} y — world position
   * @param {number} value — numeric damage, or 0 for label-only
   * @param {string} color — CSS colour string
   * @param {object} state
   * @param {string} [label] — optional override label (e.g. 'STUN')
   */
  _pushDmgNum(x, y, value, color, state, label = null) {
    if (!state.damageNumbers) return;
    state.damageNumbers.push({ x, y, value, color, label, startTime: performance.now() });
  }

  /**
   * Trigger canvas screen shake.
   * @param {number} intensity — shake amplitude in logical pixels
   * @param {object} state
   */
  _triggerShake(intensity, state) {
    if (state.shakeTime === undefined) return;
    state.shakeTime      = performance.now();
    state.shakeIntensity = intensity;
  }

  /**
   * Fire a charged attack at the appropriate power level.
   * Called by keyboard.js when the player releases a held note in CHARGE mode.
   *
   * Level 1 (0.8–1.6 s hold): 20 dmg to nearest unit, or 12 to base
   * Level 2 (1.6–2.4 s hold): 35 dmg to nearest unit + pierce 15 to base (2 bolts)
   * Level 3 (≥2.4 s hold):    AOE — 15 dmg ALL enemy units + 25 dmg to all bases
   *
   * @param {1|2|3}  chargeLevel
   * @param {string} _note   — held note (unused; reserved for future pitch-based effects)
   * @param {object} state
   */
  fireChargedAttack(chargeLevel, _note, state) {
    if (!state.playerBase) return;

    // T4 mechanic: first charge unlocks the enemy base (Protected shield drops)
    if (state.chargeUnlocksBase) {
      for (let i = 0; i < (state.enemyBases?.length ?? 0); i++) {
        if (!state.enemyBases[i].isDestroyed()) state.enemyBases[i].vulnerable = true;
      }
      state.chargeUnlocksBase = false;
    }

    const srcX    = state.playerBase.x;
    const srcY    = state.playerBase.y;
    const units   = state.units;
    const allBases = state.enemyBases ?? (state.enemyBase ? [state.enemyBase] : []);

    // Helper: find nearest alive enemy unit
    const findNearestUnit = () => {
      let nearest = null, nearestDist = Infinity;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive || u.team !== 'enemy') continue;
        const d = Math.hypot(u.x - srcX, u.y - srcY);
        if (d < nearestDist) { nearestDist = d; nearest = u; }
      }
      return nearest;
    };

    // Helper: find nearest alive enemy base
    const findNearestBase = () => {
      let nearest = null, nearestDist = Infinity;
      for (const b of allBases) {
        if (b.isDestroyed()) continue;
        const d = Math.hypot(b.x - srcX, b.y - srcY);
        if (d < nearestDist) { nearestDist = d; nearest = b; }
      }
      return nearest;
    };

    if (chargeLevel === 1) {
      // Single heavy bolt
      const unit = findNearestUnit();
      if (unit) {
        unit.hp -= 20;
        if (unit.hp <= 0) unit.alive = false;
        this._pushDmgNum(unit.x, unit.y, 20, '#44aaff', state);
        this._fireBolt(srcX, srcY, unit.x, unit.y, state, 1);
        this._triggerShake(3, state);
      } else {
        const base = findNearestBase();
        if (base) {
          base.takeDamage(12);
          this._pushDmgNum(base.x, base.y, 12, '#4488ff', state);
          this._fireBolt(srcX, srcY, base.x, base.y, state, 1);
          this._triggerShake(5, state);
        }
      }

    } else if (chargeLevel === 2) {
      // Forked bolt: heavy hit to nearest unit AND pierce to base
      const unit = findNearestUnit();
      if (unit) {
        unit.hp -= 35;
        if (unit.hp <= 0) unit.alive = false;
        this._pushDmgNum(unit.x, unit.y, 35, '#44ccff', state);
        this._fireBolt(srcX, srcY, unit.x, unit.y, state, 2);
        this._triggerShake(5, state);
      }
      // Pierce: also strike the base regardless of unit presence
      const base = findNearestBase();
      if (base) {
        base.takeDamage(15);
        this._pushDmgNum(base.x, base.y + 20, 15, '#4488ff', state);
        this._fireBolt(srcX, srcY, base.x, base.y, state, 2);
      }

    } else {
      // Level 3 AOE: lightning storm — all enemies + all bases
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.alive || u.team !== 'enemy') continue;
        u.hp -= 15;
        if (u.hp <= 0) u.alive = false;
        this._pushDmgNum(u.x, u.y, 15, '#ffffff', state);
        this._fireBolt(srcX, srcY, u.x, u.y, state, 3);
      }
      for (const b of allBases) {
        if (b.isDestroyed()) continue;
        b.takeDamage(25);
        this._pushDmgNum(b.x, b.y, 25, '#aaddff', state);
        this._fireBolt(srcX, srcY, b.x, b.y, state, 3);
      }
      this._triggerShake(10, state);
    }
  }
}
