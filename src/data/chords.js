/**
 * @file src/data/chords.js
 * Static chord data: tab notation and difficulty for the six playable chords.
 * Used by PromptManager to populate state.currentPrompt.
 */

/**
 * Tab notation uses standard 6-string guitar ordering (low E → high e).
 * 'x' = muted string, digits = fret number.
 *
 * @type {Readonly<Record<string, {name: string, tab: string, difficulty: string}>>}
 */
export const CHORD_DATA = Object.freeze({
  G:  { name: 'G',  tab: '3 2 0 0 0 3', difficulty: 'easy' },
  C:  { name: 'C',  tab: 'x 3 2 0 1 0', difficulty: 'easy' },
  D:  { name: 'D',  tab: 'x x 0 2 3 2', difficulty: 'easy' },
  Em: { name: 'Em', tab: '0 2 2 0 0 0', difficulty: 'easy' },
  Am: { name: 'Am', tab: 'x 0 2 2 1 0', difficulty: 'easy' },
  E:  { name: 'E',  tab: '0 2 2 1 0 0', difficulty: 'easy' },
});

/** Fallback used when a chord has no entry in CHORD_DATA. */
export const CHORD_FALLBACK = Object.freeze({
  tab: '- - - - - -',
  difficulty: 'easy',
});
