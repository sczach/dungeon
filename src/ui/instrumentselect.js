/**
 * @file src/ui/instrumentselect.js
 * InstrumentSelectUI — full-screen instrument picker scene.
 *
 * Sits between TITLE and LEVEL_SELECT in the scene graph.
 * Instrument choice determines: which audio pipeline activates, what musical
 * vocabulary drives game actions, and HUD layout during PLAYING.
 *
 * Currently only Piano is active — Guitar and Voice are Coming Soon.
 * Piano uses the on-screen keyboard (touch/click) or QWERTY keys; no mic needed.
 *
 * Pattern mirrors LevelSelectUI:
 *   • render() wires DOM events and renders initial state (called once).
 *   • refresh() re-syncs the selected highlight when returning to this scene.
 */

/**
 * @typedef {Object} InstrumentDef
 * @property {string}  id
 * @property {string}  name
 * @property {string}  icon
 * @property {string}  description
 * @property {number}  difficulty      — 1–3 (filled dots)
 * @property {string}  difficultyLabel
 * @property {boolean} available
 */

/** @type {ReadonlyArray<Readonly<InstrumentDef>>} */
const INSTRUMENTS = Object.freeze([
  Object.freeze({
    id:             'piano',
    name:           'Piano',
    icon:           '🎹',
    description:    'Tap the on-screen keyboard or use QWERTY keys to play notes and summon your army. No microphone required — perfect for learning.',
    difficulty:     1,
    difficultyLabel:'Beginner',
    available:      true,
  }),
  Object.freeze({
    id:             'guitar',
    name:           'Guitar',
    icon:           '🎸',
    description:    'Strum chords into your microphone. Chord shapes determine which units you summon.',
    difficulty:     2,
    difficultyLabel:'Intermediate',
    available:      false,
  }),
  Object.freeze({
    id:             'voice',
    name:           'Voice',
    icon:           '🎤',
    description:    'Sing or hum to command your army. Pitch and rhythm drive everything.',
    difficulty:     3,
    difficultyLabel:'Advanced',
    available:      false,
  }),
]);

export class InstrumentSelectUI {
  constructor() {
    /** @type {string} — currently highlighted instrument id */
    this._selectedId = 'piano';
    /** @type {function|null} — callback: (instrumentId: string) => void */
    this._onSelect = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Wire DOM events and render initial state. Called once on page load.
   * @param {string}   initialId — instrument id to pre-select
   * @param {function} onSelect  — called with instrumentId when Continue is clicked
   */
  render(initialId, onSelect) {
    this._selectedId = initialId || 'piano';
    this._onSelect   = onSelect;
    this._buildCards();
    this._wireContinue();
  }

  /**
   * Re-sync card highlights when returning to this scene.
   * @param {string} instrumentId
   */
  refresh(instrumentId) {
    this._selectedId = instrumentId || 'piano';
    this._refreshCards();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  _buildCards() {
    const container = document.getElementById('is-instrument-cards');
    if (!container) return;
    container.innerHTML = '';

    for (const inst of INSTRUMENTS) {
      const card = document.createElement('div');
      card.className  = 'instrument-card';
      card.dataset.id = inst.id;
      if (!inst.available) card.classList.add('instrument-card--soon');
      if (inst.id === this._selectedId) card.classList.add('instrument-card--selected');

      const dots = Array.from({ length: 3 }, (_, i) =>
        `<span class="icard-dot${i < inst.difficulty ? ' icard-dot--on' : ''}"></span>`
      ).join('');

      card.innerHTML = `
        ${!inst.available ? '<span class="instrument-card__badge">Coming Soon</span>' : ''}
        <div class="icard-icon">${inst.icon}</div>
        <div class="icard-name">${inst.name}</div>
        <div class="icard-desc">${inst.description}</div>
        <div class="icard-footer">
          <span class="icard-diff-label">${inst.difficultyLabel}</span>
          <span class="icard-dots">${dots}</span>
        </div>
      `;

      if (inst.available) {
        card.addEventListener('click', () => {
          this._selectedId = inst.id;
          this._refreshCards();
        });
      }

      container.appendChild(card);
    }
  }

  _refreshCards() {
    const container = document.getElementById('is-instrument-cards');
    if (!container) return;
    container.querySelectorAll('.instrument-card').forEach(card => {
      card.classList.toggle('instrument-card--selected', card.dataset.id === this._selectedId);
    });
  }

  _wireContinue() {
    const btn = document.getElementById('btn-is-continue');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (this._onSelect) this._onSelect(this._selectedId);
    });
  }
}
