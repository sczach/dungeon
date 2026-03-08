/**
 * @file src/ui/screens.js
 * Title-screen settings overlay — difficulty selector + note-label toggle.
 * Creates its own DOM elements; no HTML changes required.
 * All settings persisted to localStorage under 'cw_*' keys.
 */

const LS_DIFF   = 'cw_difficulty';
const LS_LABELS = 'cw_showNoteLabels';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Load persisted settings into state.
 * Call once immediately after createInitialState().
 * @param {object} state
 */
export function loadSettings(state) {
  state.difficulty     = localStorage.getItem(LS_DIFF) || 'medium';
  state.showNoteLabels = localStorage.getItem(LS_LABELS) === 'true';
  console.log(`[settings] loaded difficulty=${state.difficulty} labels=${state.showNoteLabels}`);
}

/**
 * Persist current settings to localStorage.
 * @param {object} state
 */
export function saveSettings(state) {
  localStorage.setItem(LS_DIFF,   state.difficulty);
  localStorage.setItem(LS_LABELS, String(state.showNoteLabels));
}

/**
 * Create and inject the settings overlay into the page.
 * The overlay is shown only when [data-scene="title"] is on <body>.
 * Calling this more than once is safe (skips if already injected).
 *
 * @param {object} state — canonical game state (mutated by settings changes)
 */
export function wireSettingsUI(state) {
  if (document.getElementById('cw-settings-overlay')) return; // idempotent

  // ── Styles ───────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #cw-settings-overlay {
      display: none;
      position: fixed; bottom: 40px; left: 50%;
      transform: translateX(-50%);
      background: rgba(10,10,15,0.92);
      border: 1px solid #3a3040;
      border-radius: 8px;
      padding: 18px 28px;
      color: #f0ead6;
      font-family: Georgia, serif;
      font-size: 13px;
      z-index: 100;
      text-align: center;
      min-width: 280px;
    }
    body[data-scene="title"] #cw-settings-overlay { display: block; }
    #cw-settings-overlay h4 {
      margin: 0 0 12px; font-size: 14px; letter-spacing: 1px; color: #e8a030;
    }
    #cw-settings-overlay .row { margin: 8px 0; }
    #cw-settings-overlay button {
      background: #1e1e2e; border: 1px solid #4a4060;
      color: #f0ead6; font-family: Georgia, serif; font-size: 12px;
      padding: 5px 14px; margin: 3px; border-radius: 4px; cursor: pointer;
    }
    #cw-settings-overlay button.active {
      background: #3a2800; border-color: #e8a030; color: #e8a030;
    }
    #cw-settings-overlay button:hover { border-color: #8a7060; }
  `;
  document.head.appendChild(style);

  // ── DOM ──────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'cw-settings-overlay';
  overlay.innerHTML = `
    <h4>⚙ SETTINGS</h4>
    <div class="row">
      <span style="margin-right:8px;color:#7a7060;">Difficulty:</span>
      <button id="cw-diff-easy">Easy</button>
      <button id="cw-diff-medium">Medium</button>
      <button id="cw-diff-hard">Hard</button>
    </div>
    <div class="row">
      <button id="cw-labels">Note Labels: OFF</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── Difficulty buttons ────────────────────────────────────────────────────
  for (const level of DIFFICULTIES) {
    document.getElementById(`cw-diff-${level}`).addEventListener('click', () => {
      state.difficulty = level;
      saveSettings(state);
      _refreshDiff(state.difficulty);
      console.log(`[settings] difficulty → ${level}`);
    });
  }

  // ── Note-label toggle ─────────────────────────────────────────────────────
  document.getElementById('cw-labels').addEventListener('click', () => {
    state.showNoteLabels = !state.showNoteLabels;
    saveSettings(state);
    _refreshLabels(state.showNoteLabels);
    console.log(`[settings] showNoteLabels → ${state.showNoteLabels}`);
  });

  // Set initial visual state
  _refreshDiff(state.difficulty);
  _refreshLabels(state.showNoteLabels);
}

function _refreshDiff(difficulty) {
  for (const level of DIFFICULTIES) {
    document.getElementById(`cw-diff-${level}`)
      ?.classList.toggle('active', level === difficulty);
  }
}

function _refreshLabels(show) {
  const btn = document.getElementById('cw-labels');
  if (!btn) return;
  btn.textContent = `Note Labels: ${show ? 'ON' : 'OFF'}`;
  btn.classList.toggle('active', show);
}
