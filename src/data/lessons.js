/**
 * @file src/data/lessons.js
 * Level-as-lesson content system for ChordWars.
 *
 * DESIGN PRINCIPLE: ChordWars is not a game with music in it.
 * It is a music lesson that happens to have a game in it.
 * Every level teaches exactly ONE musical concept. This file defines that concept,
 * the notes/chords involved, and the success metrics used at VICTORY.
 *
 * Lessons are keyed by level ID (matching src/data/levels.js IDs).
 * game.js calls applyLesson() at startGame() time to attach the lesson to state.
 *
 * ─── Level lessons ────────────────────────────────────────────────────────────
 *   Level 1 — The Campfire — "First Notes"
 *     Concept:  Single notes in time (quarter-note pulse, C major pentatonic)
 *     Notes:    C, D, E, F, G (first five of C major — no accidentals)
 *     Cue style: 'note' — shows the note name large and clear
 *     Success:  > 80 % of cued notes hit within the timing window
 *
 *   Level 2 — The Crossing — "Two Notes Together"
 *     Concept:  Harmonic intervals — 3rds and 5ths from C major
 *     Notes:    C–E (major 3rd), C–G (perfect 5th), D–A, E–B
 *     Cue style: 'staff' — shows note name pairs on a mini staff
 *     Success:  > 70 % interval accuracy
 *
 *   Level 3 — The Siege — "Your First Chords"
 *     Concept:  Major triads — I–IV–V progression (C, F, G major)
 *     Chords:   C major (C–E–G), F major (F–A–C), G major (G–B–D)
 *     Cue style: 'note' — shows chord name (chord diagram support TBD)
 *     Success:  > 65 % accuracy AND each of C, F, G played ≥ 4 times
 */

/**
 * @typedef {Object} LessonConfig
 * @property {string}   levelId         — must match a LevelConfig.id
 * @property {string}   title           — short concept name (shown in victory summary)
 * @property {string}   concept         — one-sentence teaching goal
 * @property {string[]} allowedNotes    — note names active in cues for this level
 *                                        (empty array = all notes allowed)
 * @property {string}   cueStyle        — preferred cue display: 'note'|'staff'|'chord'
 *                                        stored on state.currentLesson for cue system to read
 * @property {LessonMetrics} successMetrics
 */

/**
 * @typedef {Object} LessonMetrics
 * @property {number} minAccuracy     — minimum note accuracy % to earn a "Lesson Complete" badge
 * @property {number} [minChordPlays] — (Level 3 only) each required chord played ≥ this many times
 */

/** @type {ReadonlyArray<Readonly<LessonConfig>>} */
export const LESSONS = Object.freeze([

  // ── Level 1: The Campfire — "First Notes" ────────────────────────────────
  Object.freeze({
    levelId: 'campfire',
    title:   'First Notes',
    concept: 'Playing single notes in time — the foundation of all music.',

    // C major pentatonic (first 5): no tricky half-steps, purely white keys
    allowedNotes: Object.freeze(['C3', 'D3', 'E3', 'F3', 'G3']),

    cueStyle: 'note',   // large note name — easy to read for beginners

    successMetrics: Object.freeze({
      minAccuracy: 80,   // >80 % of cued notes hit within the timing window
    }),
  }),

  // ── Level 2: The Crossing — "Two Notes Together" ──────────────────────────
  Object.freeze({
    levelId: 'crossing',
    title:   'Two Notes Together',
    concept: 'Harmonic intervals — 3rds and 5ths create the harmony that gives music depth.',

    // Notes that form the 3rds and 5ths taught in this level (C major intervals)
    allowedNotes: Object.freeze(['C3', 'E3', 'G3', 'D3', 'A3', 'F3', 'B3']),

    cueStyle: 'staff',   // staff notation helps players see interval spacing

    successMetrics: Object.freeze({
      minAccuracy: 70,   // >70 % of cued note pairs played correctly
    }),
  }),

  // ── Level 3: The Siege — "Your First Chords" ──────────────────────────────
  Object.freeze({
    levelId: 'siege',
    title:   'Your First Chords',
    concept: 'The I–IV–V progression: the backbone of Western music for over 500 years.',

    // Tones of C major (I), F major (IV), G major (V)
    allowedNotes: Object.freeze([
      'C3', 'E3', 'G3',   // C major triad
      'F3', 'A3', 'C4',   // F major triad
      'G3', 'B3', 'D4',   // G major triad
    ]),

    cueStyle: 'note',   // shows chord name; full chord diagram support planned

    successMetrics: Object.freeze({
      minAccuracy:    65,   // >65 % accuracy across all cued chords
      minChordPlays:  4,    // C major, F major, and G major each played ≥ 4 times
    }),
  }),

]);

/** O(1) lookup by level id. */
export const LESSONS_BY_LEVEL_ID = Object.freeze(
  Object.fromEntries(LESSONS.map(l => [l.levelId, l]))
);

// ─────────────────────────────────────────────────────────────────────────────
// Runtime integration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach the level's lesson to game state at startGame() time.
 * Stores the lesson reference on state.currentLesson so the cue system,
 * victory screen, and renderer can read lesson-specific behaviour.
 *
 * NOTE: This intentionally does NOT overwrite state.cueDisplayStyle.
 * Cue-display consumers should read `state.currentLesson?.cueStyle`
 * and fall back to `state.cueDisplayStyle` if no lesson is active.
 *
 * @param {object} state   — canonical game state (mutated)
 * @param {string} levelId — level ID to look up
 */
export function applyLesson(state, levelId) {
  const lesson = LESSONS_BY_LEVEL_ID[levelId] ?? null;
  state.currentLesson = lesson;

  if (lesson) {
    console.log(`[lesson] "${lesson.title}" — ${lesson.concept}`);
  } else {
    console.log(`[lesson] no lesson config for level "${levelId}"`);
  }
}

/**
 * Evaluate whether the player met this lesson's success metrics.
 * Called on VICTORY to produce a lesson-completion summary.
 *
 * @param {object}       state  — game state at VICTORY time
 * @param {LessonConfig} lesson
 * @returns {{ metAccuracy: boolean, metChordPlays: boolean, overall: boolean }}
 */
export function evaluateLesson(state, lesson) {
  if (!lesson) return { metAccuracy: true, metChordPlays: true, overall: true };

  const acc         = state.noteAccuracy ?? 100;
  const metAccuracy = acc >= (lesson.successMetrics.minAccuracy ?? 0);

  const minPlays      = lesson.successMetrics.minChordPlays ?? 0;
  const metChordPlays = minPlays === 0 || _checkChordPlays(state, minPlays);

  return {
    metAccuracy,
    metChordPlays,
    overall: metAccuracy && metChordPlays,
  };
}

/**
 * Check that C, F, and G major were each played at least `min` times.
 * Uses state.chordPlayCounts (if present) — a map of chord root → play count
 * that the cue system is expected to populate.
 *
 * @param {object} state
 * @param {number} min
 * @returns {boolean}
 */
function _checkChordPlays(state, min) {
  const counts = state.chordPlayCounts;
  if (!counts) return false;   // cue system hasn't populated counts — be strict

  for (const root of ['C', 'F', 'G']) {
    if ((counts[root] ?? 0) < min) return false;
  }
  return true;
}
