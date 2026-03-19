/**
 * @file src/systems/telemetry.js
 * Records gameplay events for balancing and analytics.
 *
 * Events are buffered in-memory during a session and flushed to localStorage
 * on level end. Up to 50 sessions are retained; oldest are evicted.
 *
 * Pure data collection — never mutates game state.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'chordwars_telemetry';
const MAX_SESSIONS = 50;

// ─── Event types ────────────────────────────────────────────────────────────

/** @typedef {'hit'|'miss'|'kill'|'summon'|'spawn'|'mode_switch'|'charge_activate'|'wave_start'|'level_end'} EventType */

// ─── TelemetrySystem ────────────────────────────────────────────────────────

export class TelemetrySystem {
  constructor() {
    /** @type {Array<{t: number, type: EventType, data: object}>} */
    this._events = [];
    this._sessionStart = 0;
    this._levelId = '';
    this._difficulty = 'medium';
  }

  /**
   * Start recording a new session.
   * @param {string} levelId
   * @param {string} difficulty
   */
  startSession(levelId, difficulty) {
    this._events = [];
    this._sessionStart = performance.now();
    this._levelId = levelId;
    this._difficulty = difficulty;
  }

  /**
   * Record a gameplay event.
   * @param {EventType} type
   * @param {object} [data={}]
   */
  record(type, data = {}) {
    this._events.push({
      t: Math.round(performance.now() - this._sessionStart),
      type,
      data,
    });
  }

  /**
   * End the session, compute summary stats, and flush to localStorage.
   * @param {object} outcome — {won: boolean, stars: number, accuracy: number}
   * @returns {object} the session summary
   */
  endSession(outcome) {
    const summary = this._computeSummary(outcome);
    this._flush(summary);
    return summary;
  }

  // ── Summary computation ─────────────────────────────────────────────────

  /**
   * @param {object} outcome
   * @returns {object}
   */
  _computeSummary(outcome) {
    const hits = this._events.filter(e => e.type === 'hit').length;
    const misses = this._events.filter(e => e.type === 'miss').length;
    const kills = this._events.filter(e => e.type === 'kill').length;
    const summons = this._events.filter(e => e.type === 'summon').length;
    const waves = this._events.filter(e => e.type === 'wave_start').length;
    const charges = this._events.filter(e => e.type === 'charge_activate').length;
    const durationMs = this._events.length > 0
      ? this._events[this._events.length - 1].t
      : 0;

    // Combo analysis: find longest consecutive hit streak
    let maxCombo = 0;
    let currentCombo = 0;
    for (const e of this._events) {
      if (e.type === 'hit') {
        currentCombo++;
        if (currentCombo > maxCombo) maxCombo = currentCombo;
      } else if (e.type === 'miss') {
        currentCombo = 0;
      }
    }

    return {
      levelId: this._levelId,
      difficulty: this._difficulty,
      timestamp: new Date().toISOString(),
      durationMs,
      hits,
      misses,
      accuracy: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0,
      kills,
      summons,
      waves,
      charges,
      maxCombo,
      won: outcome.won,
      stars: outcome.stars,
      eventCount: this._events.length,
    };
  }

  // ── localStorage persistence ────────────────────────────────────────────

  /**
   * Flush the current session to localStorage.
   * @param {object} summary
   */
  _flush(summary) {
    try {
      const stored = this._loadAll();
      stored.push({
        summary,
        events: this._events,
      });
      // Evict oldest sessions if over cap
      while (stored.length > MAX_SESSIONS) {
        stored.shift();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      console.warn('[telemetry] flush failed:', e.message);
    }
  }

  /**
   * Load all stored sessions from localStorage.
   * @returns {Array<{summary: object, events: Array}>}
   */
  _loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────

  /**
   * Export all stored telemetry as a downloadable JSON file.
   * Creates a blob URL and triggers a download.
   */
  exportJSON() {
    const data = this._loadAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chordwars-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get summaries of all stored sessions (without full event logs).
   * @returns {Array<object>}
   */
  getSummaries() {
    return this._loadAll().map(s => s.summary);
  }

  /**
   * Clear all stored telemetry data.
   */
  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── Singleton export ────────────────────────────────────────────────────────

export const telemetrySystem = new TelemetrySystem();
