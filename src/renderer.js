/**
 * Chord Wars — Renderer (Phase 0 scaffold)
 *
 * Owns the canvas and exposes a single draw(state) call that the game loop
 * invokes each frame.  All pixel-pushing lives here so game.js stays logic-only.
 */

const TILE   = 40;   // px per grid cell
const COLORS = {
  bg:      '#0d0d1a',
  path:    '#1e293b',
  tower:   '#7c3aed',
  enemy:   '#ef4444',
  bullet:  '#fbbf24',
  hp:      '#22c55e',
  hpLow:   '#ef4444',
};

export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W      = canvas.width;
    this.H      = canvas.height;
  }

  /**
   * Main render entry point.  Called every animation frame by the game loop.
   * @param {import('./game.js').GameState} state
   */
  draw(state) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    this._drawBackground(state.map);
    this._drawTowers(state.towers);
    this._drawBullets(state.bullets);
    this._drawEnemies(state.enemies);
    this._drawOverlay(state);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  _drawBackground(map) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.W, this.H);

    if (!map) return;
    ctx.fillStyle = COLORS.path;
    for (const [col, row] of map.path) {
      ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
    }
  }

  _drawTowers(towers = []) {
    const { ctx } = this;
    for (const t of towers) {
      ctx.fillStyle = COLORS.tower;
      ctx.beginPath();
      ctx.arc(t.x + TILE / 2, t.y + TILE / 2, TILE * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Range ring (dim)
      ctx.strokeStyle = 'rgba(124,58,237,0.2)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(t.x + TILE / 2, t.y + TILE / 2, t.range, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawBullets(bullets = []) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.bullet;
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawEnemies(enemies = []) {
    const { ctx } = this;
    for (const e of enemies) {
      // Body
      ctx.fillStyle = COLORS.enemy;
      ctx.fillRect(e.x - 10, e.y - 10, 20, 20);

      // HP bar
      const barW  = 20;
      const ratio = e.hp / e.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(e.x - 10, e.y - 16, barW, 4);
      ctx.fillStyle = ratio > 0.4 ? COLORS.hp : COLORS.hpLow;
      ctx.fillRect(e.x - 10, e.y - 16, barW * ratio, 4);
    }
  }

  _drawOverlay(state) {
    if (state.phase === 'idle') {
      this._centreText('Press Start to begin', '20px sans-serif', '#64748b');
    } else if (state.phase === 'gameover') {
      this._centreText('GAME OVER', '48px sans-serif', '#ef4444');
    } else if (state.phase === 'victory') {
      this._centreText('YOU WIN!', '48px sans-serif', '#22c55e');
    }
  }

  _centreText(text, font, color) {
    const { ctx, W, H } = this;
    ctx.font      = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
