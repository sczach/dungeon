/**
 * @file src/ui/levelselect.js
 * LevelSelectUI — wires the level select and skill tree HTML panels.
 *
 * Follows the same pattern as SettingsUI:
 *   • render() is called once to wire DOM events and do the first paint.
 *   • refresh() is called any time progression data changes (star award, purchase).
 *   • No DOM nodes are created per-frame. Only text and class attributes are
 *     mutated inside update calls.
 */

import { LEVELS, isLevelUnlocked }              from '../data/levels.js';
import { SKILLS }                                from '../data/skills.js';
import {
  totalStars,
  purchaseSkill,
  saveProgress,
  skillState,
  skillsByTier,
} from '../systems/progression.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a star-display string: filled + empty stars.
 * @param {number} count — 0–3 earned stars
 * @param {number} total — max stars (default 3)
 * @returns {string} HTML string
 */
function starHTML(count, total = 3) {
  let html = '';
  for (let i = 0; i < total; i++) {
    html += i < count
      ? '<span class="star">★</span>'
      : '<span class="star-empty">★</span>';
  }
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// LevelSelectUI
// ─────────────────────────────────────────────────────────────────────────────

export class LevelSelectUI {
  constructor() {
    /** @type {string|null} — id of the currently highlighted level card */
    this._selectedLevelId = null;

    /** @type {function|null} — callback: (levelConfig) => void */
    this._onSelectLevel = null;

    /** @type {function|null} — callback: () => void (called after purchase so game can save) */
    this._onProgressChanged = null;

    /** @type {object|null} — reference to current progression record */
    this._prog = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Wire all DOM events and render initial state.
   * Must be called once after the DOM is ready.
   *
   * @param {object}   prog             — initial progression record (mutated by purchaseSkill)
   * @param {function} onSelectLevel    — called with (levelConfig) when Play is clicked
   * @param {function} onProgressChanged — called after any star spend so game.js can save
   */
  render(prog, onSelectLevel, onProgressChanged) {
    this._prog              = prog;
    this._onSelectLevel     = onSelectLevel;
    this._onProgressChanged = onProgressChanged;

    this._buildLevelCards();
    this._buildSkillTree();
    this._wireStaticButtons();
    this._refreshStarCount();
  }

  /**
   * Refresh all dynamic content after progression changes (star award, purchase).
   * @param {object} prog — updated progression record
   */
  refresh(prog) {
    this._prog = prog;
    this._refreshStarCount();
    this._refreshLevelCards();
    this._refreshSkillTree();
  }

  // ── Level cards ────────────────────────────────────────────────────────────

  _buildLevelCards() {
    const container = document.getElementById('ls-level-cards');
    if (!container) return;
    container.innerHTML = '';

    for (const level of LEVELS) {
      const card = document.createElement('div');
      card.className  = 'level-card';
      card.dataset.id = level.id;

      const unlocked = isLevelUnlocked(level, this._prog);
      if (!unlocked) card.classList.add('level-card--locked');
      if (level.id === this._selectedLevelId) card.classList.add('level-card--selected');

      const best = this._prog.bestStars[level.id] ?? 0;

      card.innerHTML = `
        <div class="level-card__icon">${level.icon}</div>
        <div class="level-card__name">${level.name}</div>
        <div class="level-card__subtitle">${level.subtitle}</div>
        <div class="level-card__stars">${unlocked ? starHTML(best) : '<span class="level-card__lock">🔒</span>'}</div>
        ${unlocked ? `<button class="level-card__play-btn" data-play="${level.id}">Play</button>` : ''}
      `;

      // Card-level click for selection highlight
      card.addEventListener('click', () => {
        if (!isLevelUnlocked(level, this._prog)) return;
        this._selectLevel(level.id);
      });

      // Play button
      const playBtn = card.querySelector(`[data-play="${level.id}"]`);
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onSelectLevel) this._onSelectLevel(level);
        });
      }

      container.appendChild(card);
    }

    // Auto-select first unlocked level
    if (!this._selectedLevelId) {
      const firstUnlocked = LEVELS.find(l => isLevelUnlocked(l, this._prog));
      if (firstUnlocked) this._selectLevel(firstUnlocked.id);
    }
  }

  _refreshLevelCards() {
    const container = document.getElementById('ls-level-cards');
    if (!container) return;

    for (const level of LEVELS) {
      const card = container.querySelector(`[data-id="${level.id}"]`);
      if (!card) continue;

      const unlocked = isLevelUnlocked(level, this._prog);
      card.classList.toggle('level-card--locked', !unlocked);
      card.classList.toggle('level-card--selected', level.id === this._selectedLevelId);

      const starsEl = card.querySelector('.level-card__stars');
      if (starsEl) {
        const best = this._prog.bestStars[level.id] ?? 0;
        starsEl.innerHTML = unlocked
          ? starHTML(best)
          : '<span class="level-card__lock">🔒</span>';
      }

      // Add play button if it was just unlocked
      if (unlocked && !card.querySelector('.level-card__play-btn')) {
        const btn = document.createElement('button');
        btn.className = 'level-card__play-btn';
        btn.dataset.play = level.id;
        btn.textContent = 'Play';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._onSelectLevel) this._onSelectLevel(level);
        });
        card.appendChild(btn);
      }
    }
  }

  _selectLevel(levelId) {
    this._selectedLevelId = levelId;
    const cards = document.querySelectorAll('.level-card');
    cards.forEach(c => {
      c.classList.toggle('level-card--selected', c.dataset.id === levelId);
    });
  }

  // ── Skill tree ─────────────────────────────────────────────────────────────

  _buildSkillTree() {
    const container = document.getElementById('skill-tree');
    if (!container) return;
    container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'skill-tree';

    const tierLabels = { 1: 'Tier I', 2: 'Tier II', 3: 'Tier III' };
    const tiers = skillsByTier();

    for (let t = 1; t <= 3; t++) {
      const tierDiv = document.createElement('div');

      const label = document.createElement('p');
      label.className = 'skill-tier__label';
      label.textContent = tierLabels[t];
      tierDiv.appendChild(label);

      const row = document.createElement('div');
      row.className = 'skill-tier';

      for (const skill of tiers[t]) {
        const node = this._buildSkillNode(skill);
        row.appendChild(node);
      }

      tierDiv.appendChild(row);
      wrap.appendChild(tierDiv);
    }

    container.appendChild(wrap);
  }

  _buildSkillNode(skill) {
    const node = document.createElement('div');
    node.className  = 'skill-node';
    node.dataset.id = skill.id;

    const state = skillState(skill.id, this._prog);
    node.classList.add(`skill-node--${state}`);

    node.innerHTML = `
      <div class="skill-node__icon">${skill.icon}</div>
      <div class="skill-node__name">${skill.name}</div>
      <div class="skill-node__desc">${skill.description}</div>
      <div class="skill-node__cost">${state === 'purchased' ? '✓ Owned' : `★ ${skill.cost}`}</div>
    `;

    if (state === 'available') {
      node.addEventListener('click', () => this._handlePurchase(skill.id));
    }

    return node;
  }

  _refreshSkillTree() {
    const container = document.getElementById('skill-tree');
    if (!container) return;

    for (const skill of SKILLS) {
      const node = container.querySelector(`[data-id="${skill.id}"]`);
      if (!node) continue;

      const state = skillState(skill.id, this._prog);
      // Remove all state classes, re-apply current
      node.classList.remove(
        'skill-node--purchased', 'skill-node--available',
        'skill-node--unaffordable', 'skill-node--locked'
      );
      node.classList.add(`skill-node--${state}`);

      const costEl = node.querySelector('.skill-node__cost');
      if (costEl) costEl.textContent = state === 'purchased' ? '✓ Owned' : `★ ${skill.cost}`;

      // Re-wire click only when available (remove old listener by cloning node)
      if (state === 'available') {
        const fresh = node.cloneNode(true);
        fresh.addEventListener('click', () => this._handlePurchase(skill.id));
        node.replaceWith(fresh);
      }
    }
  }

  _handlePurchase(skillId) {
    if (!this._prog) return;
    const result = purchaseSkill(skillId, this._prog);
    if (!result.ok) {
      console.warn(`[skill] purchase failed: ${result.reason}`);
      return;
    }
    saveProgress(this._prog);
    if (this._onProgressChanged) this._onProgressChanged(this._prog);
    this._refreshStarCount();
    this._refreshSkillTree();
    this._refreshLevelCards();
  }

  // ── Star count display ─────────────────────────────────────────────────────

  _refreshStarCount() {
    const el = document.getElementById('ls-stars');
    if (el) el.textContent = String(totalStars(this._prog));
  }

  // ── Static button wiring ───────────────────────────────────────────────────

  _wireStaticButtons() {
    document.getElementById('btn-upgrades')?.addEventListener('click', () => {
      const panel = document.getElementById('skill-panel');
      if (panel) panel.hidden = false;
    });

    document.getElementById('btn-skill-close')?.addEventListener('click', () => {
      const panel = document.getElementById('skill-panel');
      if (panel) panel.hidden = true;
    });
  }
}
