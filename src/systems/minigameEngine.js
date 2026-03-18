/**
 * @file src/systems/minigameEngine.js
 * Minigame registry and lifecycle manager.
 *
 * Lifecycle:
 *   1. World map node has gameType → engine looks up handler in registry
 *   2. Instantiates handler, passes { canvas, ctx, gameState, difficulty, onNote, done }
 *   3. Handler runs its own update/render loop via rAF
 *   4. Handler calls done({ stars, score, accuracyPct, passed }) when finished
 *   5. Engine cleans up, hands result to game.js via onComplete callback
 */

/** @typedef {{ stars: number, score: number, accuracyPct: number, passed: boolean }} MinigameResult */

/**
 * Base class for all minigames. Subclass in src/minigames/[name].js.
 * @abstract
 */
export class BaseMinigame {
  constructor({ canvas, ctx, gameState, difficulty, onNote, done }) {
    this.canvas     = canvas;
    this.ctx        = ctx;
    this.gameState  = gameState;
    this.difficulty = difficulty;
    this.onNote     = onNote;
    this.done       = done;
    this._rafId     = null;
  }

  start() {}

  destroy() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}

/** "Coming Soon" placeholder — renders a message and auto-exits after 2s. */
class ComingSoonMinigame extends BaseMinigame {
  start() {
    const { ctx, canvas } = this;
    const W = canvas.width / (window.devicePixelRatio || 1);
    const H = canvas.height / (window.devicePixelRatio || 1);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Coming Soon', W / 2, H / 2 - 20);
    ctx.font      = '18px sans-serif';
    ctx.fillStyle = '#aaaacc';
    ctx.fillText('This minigame is not yet available.', W / 2, H / 2 + 20);

    this._timeout = setTimeout(() => {
      this.done({ stars: 0, score: 0, accuracyPct: 0, passed: false });
    }, 2000);
  }

  destroy() {
    super.destroy();
    if (this._timeout != null) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }
}

/** Minigame registry and lifecycle manager. Owns at most one active minigame. */
export class MinigameEngine {
  constructor() {
    this._registry   = new Map();
    this._active     = null;
    this._onComplete = null;
    this.register('coming-soon', ComingSoonMinigame);
  }

  /** Register a minigame handler class for a gameType id. */
  register(gameTypeId, HandlerClass) {
    this._registry.set(gameTypeId, HandlerClass);
  }

  /** Check whether a gameType has a registered handler. */
  has(gameTypeId) {
    return this._registry.has(gameTypeId);
  }

  /** Launch a minigame from a world map node. */
  launch(node, { canvas, ctx, state, difficulty, onNote, onComplete }) {
    this.stop();

    const gameType = node.gameType ?? 'coming-soon';
    const Handler  = this._registry.get(gameType) ?? this._registry.get('coming-soon');
    this._onComplete = onComplete;

    const done = (result) => {
      this.stop();
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb(result);
      }
    };

    this._active = new Handler({ canvas, ctx, gameState: state, difficulty, onNote, done });
    console.log(`[minigame] launching: ${gameType} (node: ${node.id})`);
    this._active.start();
  }

  /** Tear down the active minigame (if any). */
  stop() {
    if (this._active) {
      this._active.destroy();
      this._active = null;
      console.log('[minigame] stopped');
    }
  }

  /** Whether a minigame is currently running. */
  get isActive() {
    return this._active != null;
  }
}

/** Singleton engine instance. */
export const minigameEngine = new MinigameEngine();
