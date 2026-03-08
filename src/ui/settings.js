/**
 * @file src/ui/settings.js
 * SettingsUI — full settings panel for the TITLE screen.
 *
 * Manages: audio sensitivity, master volume, difficulty, chord cues toggle.
 * Persists all settings to localStorage under 'chordwars_settings'.
 * Replaces the minimal wireSettingsUI() from screens.js.
 */

// ─── localStorage key ────────────────────────────────────────────────────────
const LS_KEY = 'chordwars_settings';

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULTS = Object.freeze({
  audioThreshold: 50,    // 0–100 → maps to state.audioThreshold
  masterVolume:   80,    // 0–100 → maps to state.masterVolume
  difficulty:     'medium',
  showChordCues:  true,
  showNoteLabels: true,
});

// ─── CSS (injected once) ─────────────────────────────────────────────────────
const PANEL_CSS = `
  #btn-settings {
    background: transparent;
    border: 1px solid #7a7060;
    color: #f0ead6;
    font-family: Georgia, serif;
    font-size: 13px;
    padding: 6px 16px;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.04em;
    margin-top: 8px;
  }
  #btn-settings:hover { border-color: #e8a030; color: #e8a030; }
  #cw-settings-panel {
    display: none;
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(10,10,18,0.96);
    border: 1px solid #3a3050;
    border-radius: 10px;
    padding: 24px 32px;
    color: #f0ead6;
    font-family: Georgia, serif;
    font-size: 13px;
    z-index: 200;
    min-width: 320px;
    max-width: 440px;
    box-shadow: 0 0 40px rgba(0,0,0,0.7);
  }
  #cw-settings-panel h3 {
    margin: 0 0 18px;
    font-size: 16px;
    color: #e8a030;
    letter-spacing: 1px;
    text-align: center;
  }
  #cw-settings-panel .cw-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
  }
  #cw-settings-panel .cw-label {
    color: #a09880;
    min-width: 140px;
    font-size: 12px;
  }
  #cw-settings-panel input[type=range] {
    flex: 1;
    accent-color: #e8a030;
    cursor: pointer;
  }
  #cw-settings-panel .cw-val {
    min-width: 28px;
    text-align: right;
    color: #f0ead6;
    font-size: 12px;
  }
  .cw-diff-btn {
    background: #1e1e2e;
    border: 1px solid #4a4060;
    color: #f0ead6;
    font-family: Georgia, serif;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .cw-diff-btn.active {
    background: #3a2800;
    border-color: #e8a030;
    color: #e8a030;
  }
  .cw-diff-btn:hover { border-color: #8a7060; }
  #cw-chord-cues-btn,
  #cw-note-labels-btn {
    background: #1e1e2e;
    border: 1px solid #4a4060;
    color: #f0ead6;
    font-family: Georgia, serif;
    font-size: 12px;
    padding: 4px 18px;
    border-radius: 4px;
    cursor: pointer;
  }
  #cw-chord-cues-btn.active,
  #cw-note-labels-btn.active {
    background: #1a3a1a;
    border-color: #44ff88;
    color: #44ff88;
  }
  #cw-start-game-btn {
    background: #1a3a1a;
    border: 1px solid #44ff88;
    color: #44ff88;
    font-family: Georgia, serif;
    font-size: 14px;
    padding: 8px 28px;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 1px;
  }
  #cw-start-game-btn:hover { background: #1e4a1e; }
  .cw-sep {
    border: none;
    border-top: 1px solid #2a2a3a;
    margin: 14px 0;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// SettingsUI
// ─────────────────────────────────────────────────────────────────────────────

export class SettingsUI {
  constructor() {
    /** @type {HTMLElement|null} */
    this._panel = null;
    this._panelVisible = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load persisted settings from localStorage and apply to state.
   * Falls back to DEFAULTS if nothing is stored or JSON is corrupt.
   * @param {object} state
   */
  loadSettings(state) {
    console.log('[settings] loading from localStorage');
    let saved = {};
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (_) { /* ignore corrupt data */ }

    const merged = { ...DEFAULTS, ...saved };
    state.audioThreshold = Number(merged.audioThreshold) || DEFAULTS.audioThreshold;
    state.masterVolume   = Number(merged.masterVolume)   || DEFAULTS.masterVolume;
    state.difficulty     = merged.difficulty     || DEFAULTS.difficulty;
    state.showChordCues  = merged.showChordCues  ?? DEFAULTS.showChordCues;
    state.showNoteLabels = merged.showNoteLabels ?? DEFAULTS.showNoteLabels;
    console.log('[settings] defaults applied: sensitivity=' + state.audioThreshold);
  }

  /**
   * Persist current state settings to localStorage.
   * @param {object} state
   */
  saveSettings(state) {
    const toSave = {
      audioThreshold: state.audioThreshold,
      masterVolume:   state.masterVolume,
      difficulty:     state.difficulty,
      showChordCues:  state.showChordCues,
      showNoteLabels: state.showNoteLabels,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(toSave));
    console.log('[settings] saved to localStorage');
  }

  /**
   * Create and inject the settings panel DOM (idempotent).
   * The panel is hidden by default; CSS shows it when data-scene="title".
   * @param {object} state
   * @param {Function} onStart  — called when player clicks ▶ Start Game
   */
  render(state, onStart) {
    if (this._panel) return; // already rendered

    // Inject shared CSS once
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    // Build panel DOM
    const panel = document.createElement('div');
    panel.id = 'cw-settings-panel';
    panel.innerHTML = `
      <h3>⚙️ Settings</h3>

      <div class="cw-row">
        <span class="cw-label">Audio Sensitivity</span>
        <input type="range" id="cw-sensitivity" min="0" max="100" value="${state.audioThreshold}">
        <span class="cw-val" id="cw-sensitivity-val">${state.audioThreshold}</span>
      </div>

      <div class="cw-row">
        <span class="cw-label">Master Volume</span>
        <input type="range" id="cw-volume" min="0" max="100" value="${state.masterVolume}">
        <span class="cw-val" id="cw-volume-val">${state.masterVolume}</span>
      </div>

      <hr class="cw-sep">

      <div class="cw-row">
        <span class="cw-label">Difficulty</span>
        <button class="cw-diff-btn" data-diff="easy">Beginner</button>
        <button class="cw-diff-btn" data-diff="medium">Intermediate</button>
        <button class="cw-diff-btn" data-diff="hard">Advanced</button>
      </div>

      <div class="cw-row">
        <span class="cw-label">Show Chord Cues</span>
        <button id="cw-chord-cues-btn">${state.showChordCues ? 'ON' : 'OFF'}</button>
      </div>

      <div class="cw-row">
        <span class="cw-label">Piano Key Labels</span>
        <button id="cw-note-labels-btn">${state.showNoteLabels ? 'ON' : 'OFF'}</button>
      </div>

      <hr class="cw-sep">

      <div class="cw-row" style="justify-content:center;">
        <button id="cw-start-game-btn">▶ Start Game</button>
      </div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    // Reflect initial difficulty active state
    this._refreshDiff(panel, state.difficulty);
    // Reflect initial chord cues state
    this._refreshChordCues(panel, state.showChordCues);
    // Reflect initial note labels state
    this._refreshNoteLabels(panel, state.showNoteLabels);

    // ── Event listeners ──────────────────────────────────────────────────────

    // Audio sensitivity slider
    panel.querySelector('#cw-sensitivity').addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      state.audioThreshold = v;
      panel.querySelector('#cw-sensitivity-val').textContent = v;
      console.log('[settings] user changed sensitivity to ' + v);
      this.saveSettings(state);
    });

    // Master volume slider
    panel.querySelector('#cw-volume').addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      state.masterVolume = v;
      panel.querySelector('#cw-volume-val').textContent = v;
      this.saveSettings(state);
    });

    // Difficulty buttons
    panel.querySelectorAll('.cw-diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.difficulty = btn.dataset.diff;
        this._refreshDiff(panel, state.difficulty);
        this.saveSettings(state);
      });
    });

    // Show chord cues toggle
    panel.querySelector('#cw-chord-cues-btn').addEventListener('click', () => {
      state.showChordCues = !state.showChordCues;
      this._refreshChordCues(panel, state.showChordCues);
      this.saveSettings(state);
    });

    // Piano key labels toggle
    panel.querySelector('#cw-note-labels-btn').addEventListener('click', () => {
      state.showNoteLabels = !state.showNoteLabels;
      this._refreshNoteLabels(panel, state.showNoteLabels);
      this.saveSettings(state);
    });

    // Start Game
    panel.querySelector('#cw-start-game-btn').addEventListener('click', () => {
      if (typeof onStart === 'function') onStart();
    });

    // Gear button toggles the panel
    const gearBtn = document.getElementById('btn-settings');
    if (gearBtn) {
      gearBtn.addEventListener('click', () => this._togglePanel());
    }

    // Click-outside-to-close
    document.addEventListener('mousedown', (e) => {
      if (!this._panel || !this._panelVisible) return;
      if (!this._panel.contains(e.target) && e.target.id !== 'btn-settings') {
        this._togglePanel(false);
      }
    });

    console.log('[settings] panel rendered on TITLE scene');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Show or hide the settings panel. Pass explicit boolean to force state. */
  _togglePanel(forceVisible) {
    if (!this._panel) return;
    this._panelVisible = (forceVisible !== undefined) ? forceVisible : !this._panelVisible;
    this._panel.style.display = this._panelVisible ? 'block' : 'none';
  }

  _refreshDiff(panel, difficulty) {
    panel.querySelectorAll('.cw-diff-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.diff === difficulty);
    });
  }

  _refreshChordCues(panel, showChordCues) {
    const btn = panel.querySelector('#cw-chord-cues-btn');
    if (!btn) return;
    btn.textContent = showChordCues ? 'ON' : 'OFF';
    btn.classList.toggle('active', showChordCues);
  }

  _refreshNoteLabels(panel, showNoteLabels) {
    const btn = panel.querySelector('#cw-note-labels-btn');
    if (!btn) return;
    btn.textContent = showNoteLabels ? 'ON' : 'OFF';
    btn.classList.toggle('active', showNoteLabels);
  }
}
