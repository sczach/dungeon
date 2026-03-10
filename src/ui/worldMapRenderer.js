/**
 * @file src/ui/worldMapRenderer.js
 * Canvas renderer for the spider-web world map scene.
 *
 * Responsibilities
 * ────────────────
 *   • Draw starfield background (reuses seeded-PRNG pattern from renderer.js)
 *   • Draw web connection lines between nodes (thin amber lines)
 *   • Draw each node circle with state-based styling:
 *       completed   → filled gold, star count below, emoji icon inside
 *       available   → pulsing amber outline (unlocked, not yet beaten)
 *       locked/stub → dim grey + 🔒 overlay
 *       selected    → white ring + pulsing glow behind
 *   • Draw node name label and star count beneath each node
 *   • Draw the PLAY button in fixed screen-space when a node is selected
 *   • Draw "Tutorial complete — the world is open." banner (one-time)
 *
 * Exported helpers used by game.js hit-testing
 * ─────────────────────────────────────────────
 *   getNodeAtPoint(wx, wy, W, H, nodes) → nodeId | null
 *   getPlayButtonBounds(W, H)           → { x, y, w, h }
 */

import { WORLD_MAP_NODES_BY_ID, isNodeUnlocked } from '../data/worldMap.js';

// ─── Node visual constants ───────────────────────────────────────────────────
const NODE_R      = 24;   // node circle radius
const LABEL_FONT  = '13px Georgia, serif';
const ICON_FONT   = '18px serif';

// ─── Colour palette ──────────────────────────────────────────────────────────
const CLR = Object.freeze({
  LINE:       'rgba(232,160,48,0.30)',
  LINE_DONE:  'rgba(232,160,48,0.55)',
  COMPLETED:  '#e8a030',
  AVAILABLE:  '#5b8fff',
  LOCKED:     '#2e2e40',
  LOCKED_STR: '#4a4a60',
  SELECTED_R: '#ffffff',
  TEXT:       '#f0ead6',
  MUTED:      '#7a7060',
  PANEL:      'rgba(10,10,20,0.82)',
  BTN:        '#e8a030',
  BTN_TEXT:   '#0a0a0f',
});

// ─── Seeded PRNG (identical to renderer.js _drawStars) ───────────────────────
function makeRand() {
  let seed = 0xdeadbeef;
  return () => {
    seed = (seed ^ (seed >>> 15)) * 0x85ebca77;
    seed = (seed ^ (seed >>> 13)) * 0xc2b2ae3d;
    seed ^= (seed >>> 16);
    return (seed >>> 0) / 0xffffffff;
  };
}

// ─── Public helpers ──────────────────────────────────────────────────────────

/**
 * Hit-test world-map nodes. Caller must subtract camera offset first.
 * @param {number} wx — pointer x in world (pre-camera) space
 * @param {number} wy — pointer y in world space
 * @param {number} _W — unused; kept for future scaling
 * @param {number} _H — unused
 * @param {Array}  nodes — WORLD_MAP_NODES array
 * @returns {string|null} node id or null
 */
export function getNodeAtPoint(wx, wy, _W, _H, nodes) {
  for (const n of nodes) {
    const dx = wx - n.x, dy = wy - n.y;
    if (dx * dx + dy * dy <= (NODE_R + 6) * (NODE_R + 6)) return n.id;
  }
  return null;
}

/**
 * Screen-space bounds of the PLAY button (fixed, bottom-centre).
 * @param {number} W @param {number} H
 * @returns {{ x:number, y:number, w:number, h:number }}
 */
export function getPlayButtonBounds(W, H) {
  const bw = Math.min(200, W * 0.45);
  const bh = 48;
  return { x: (W - bw) / 2, y: H - bh - 24, w: bw, h: bh };
}

// ─── WorldMapRenderer ────────────────────────────────────────────────────────

export class WorldMapRenderer {
  constructor() {
    this._phase = 0;
  }

  /**
   * Draw the world map scene.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state — canonical game state
   * @param {number} W  — logical width
   * @param {number} H  — logical height
   * @param {object} prog — ProgressRecord
   */
  draw(ctx, state, W, H, prog) {
    this._phase += 0.006;
    const t    = this._phase;
    const cam  = state.worldMap;

    // ── Background ────────────────────────────────────────────────────────
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    // Radial glow
    const gx = W / 2, gy = H * 0.4;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.6);
    glow.addColorStop(0,   `rgba(232,160,48,${0.05 + 0.02 * Math.sin(t)})`);
    glow.addColorStop(0.5, `rgba(91,143,255,${0.03 + 0.01 * Math.sin(t * 1.3)})`);
    glow.addColorStop(1,   'rgba(10,10,15,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Starfield
    this._drawStars(ctx, W, H, t);

    // ── Camera transform (world-space content) ────────────────────────────
    ctx.save();
    ctx.translate(cam.cameraX, cam.cameraY);

    this._drawLines(ctx, t, prog);
    this._drawNodes(ctx, t, state, prog, W, H);

    ctx.restore();

    // ── Screen-space overlays (not affected by camera) ────────────────────
    if (cam.selectedNodeId) {
      this._drawPlayButton(ctx, t, state, W, H, prog);
    }

    if (cam.showTutorialComplete) {
      this._drawTutorialBanner(ctx, t, W, H);
    }

    // Mini-legend at bottom-left
    this._drawLegend(ctx, W, H);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  _drawStars(ctx, W, H, t) {
    const rand = makeRand();
    ctx.save();
    for (let i = 0; i < 100; i++) {
      const alpha = 0.25 + 0.45 * Math.sin(t * (0.4 + rand()) + rand() * Math.PI * 2);
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, rand() * 1.4 + 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,234,214,${alpha.toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  _drawLines(ctx, _t, prog) {
    const nodes = Object.values(WORLD_MAP_NODES_BY_ID);
    const drawn = new Set();

    ctx.lineWidth = 1.5;

    for (const n of nodes) {
      if (!n.connections) continue;
      for (const targetId of n.connections) {
        const key = [n.id, targetId].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);

        const t2 = WORLD_MAP_NODES_BY_ID[targetId];
        if (!t2) continue;

        const bothDone = (prog?.bestStars?.[n.id] ?? 0) >= 1 &&
                         (prog?.bestStars?.[t2.id] ?? 0) >= 1;
        ctx.strokeStyle = bothDone ? CLR.LINE_DONE : CLR.LINE;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.stroke();
      }
    }
  }

  _drawNodes(ctx, t, state, prog, _W, _H) {
    const nodes       = Object.values(WORLD_MAP_NODES_BY_ID);
    const selectedId  = state.worldMap.selectedNodeId;

    for (const n of nodes) {
      const stars    = prog?.bestStars?.[n.id] ?? 0;
      const done     = stars >= 1;
      const unlocked = isNodeUnlocked(n, prog ?? { bestStars: {}, purchased: [] });
      const stub     = n.stub;
      const selected = selectedId === n.id;

      // Selection glow (behind the node)
      if (selected) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
        const gr    = ctx.createRadialGradient(n.x, n.y, NODE_R * 0.5, n.x, n.y, NODE_R * 2.6);
        gr.addColorStop(0,   `rgba(255,255,255,${(0.18 + 0.10 * pulse).toFixed(3)})`);
        gr.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(n.x, n.y, NODE_R * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node body
      ctx.beginPath();
      ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2);

      if (stub || !unlocked) {
        ctx.fillStyle = CLR.LOCKED;
      } else if (done) {
        ctx.fillStyle = CLR.COMPLETED;
      } else {
        // Available — pulse between dim and bright
        const pulse = 0.55 + 0.45 * Math.sin(t * 2.4 + n.x * 0.01);
        ctx.fillStyle = `rgba(91,143,255,${(pulse * 0.25).toFixed(3)})`;
      }
      ctx.fill();

      // Node border
      if (selected) {
        ctx.strokeStyle = CLR.SELECTED_R;
        ctx.lineWidth   = 3;
      } else if (stub || !unlocked) {
        ctx.strokeStyle = CLR.LOCKED_STR;
        ctx.lineWidth   = 1.5;
      } else if (done) {
        ctx.strokeStyle = '#ffd060';
        ctx.lineWidth   = 2;
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + n.x * 0.01);
        ctx.strokeStyle = `rgba(91,143,255,${(0.4 + 0.6 * pulse).toFixed(3)})`;
        ctx.lineWidth   = 2;
      }
      ctx.stroke();

      // Last-played teal ring — distinct from the white selected ring
      if (n.id === state.worldMap?.lastPlayedNodeId) {
        ctx.strokeStyle = '#44ffcc';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(n.x, n.y, NODE_R + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Icon inside node
      ctx.font         = ICON_FONT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      if (stub || !unlocked) {
        ctx.fillStyle = '#505065';
        ctx.fillText('🔒', n.x, n.y);
      } else {
        ctx.globalAlpha = done ? 1 : 0.75;
        ctx.fillText(n.icon ?? '⚔️', n.x, n.y);
        ctx.globalAlpha = 1;
      }

      // Name label below
      ctx.font         = LABEL_FONT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = (stub || !unlocked) ? CLR.MUTED : CLR.TEXT;
      ctx.fillText(n.name, n.x, n.y + NODE_R + 5);

      // Star count below name (only for completed non-tutorial nodes)
      if (done && !n.isTutorial && stars > 0) {
        ctx.font      = '11px Georgia, serif';
        ctx.fillStyle = '#e8a030';
        ctx.fillText('★'.repeat(stars), n.x, n.y + NODE_R + 20);
      }
    }
  }

  _drawPlayButton(ctx, t, state, W, H, prog) {
    const selectedId = state.worldMap.selectedNodeId;
    const node       = WORLD_MAP_NODES_BY_ID[selectedId];
    if (!node) return;

    const unlocked = isNodeUnlocked(node, prog ?? { bestStars: {}, purchased: [] });
    const pb       = getPlayButtonBounds(W, H);

    // Node info panel above button
    const panelW = Math.min(360, W * 0.82);
    const panelX = (W - panelW) / 2;
    const panelY = pb.y - 90;

    ctx.fillStyle = CLR.PANEL;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, 80, 8);
    ctx.fill();

    ctx.font         = 'bold 18px Georgia, serif';
    ctx.fillStyle    = '#e8a030';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${node.icon ?? ''} ${node.name}`, W / 2, panelY + 10);

    ctx.font      = '13px Georgia, serif';
    ctx.fillStyle = '#c8b090';
    ctx.fillText(node.levelGoal ?? '', W / 2, panelY + 34, panelW - 24);

    ctx.font      = '12px Georgia, serif';
    ctx.fillStyle = '#6a6050';
    ctx.fillText(node.estimatedDuration ?? '', W / 2, panelY + 56);

    // PLAY button
    if (!node.stub && unlocked) {
      const pulse = 0.88 + 0.12 * Math.sin(t * 3.2);
      ctx.fillStyle   = CLR.BTN;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.roundRect(pb.x, pb.y, pb.w, pb.h, 6);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.font         = 'bold 16px Georgia, serif';
      ctx.fillStyle    = CLR.BTN_TEXT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶  PLAY', pb.x + pb.w / 2, pb.y + pb.h / 2);
    } else {
      // Locked — show stub message
      ctx.fillStyle   = CLR.LOCKED;
      ctx.beginPath();
      ctx.roundRect(pb.x, pb.y, pb.w, pb.h, 6);
      ctx.fill();

      ctx.font         = '14px Georgia, serif';
      ctx.fillStyle    = CLR.MUTED;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.stub ? 'Coming soon' : '🔒 Locked', pb.x + pb.w / 2, pb.y + pb.h / 2);
    }
  }

  _drawTutorialBanner(ctx, t, W, H) {
    const alpha = Math.min(1, 0.7 + 0.3 * Math.sin(t * 1.8));
    const bw    = Math.min(460, W * 0.88);
    const bh    = 52;
    const bx    = (W - bw) / 2;
    const by    = 28;

    ctx.globalAlpha = alpha;
    ctx.fillStyle   = 'rgba(232,160,48,0.12)';
    ctx.strokeStyle = 'rgba(232,160,48,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font         = 'bold 15px Georgia, serif';
    ctx.fillStyle    = '#e8a030';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Tutorial complete — the world is open.', W / 2, by + bh / 2);
    ctx.globalAlpha = 1;
  }

  _drawLegend(ctx, W, H) {
    const items = [
      { color: '#e8a030', label: 'Completed' },
      { color: '#5b8fff', label: 'Available' },
      { color: '#2e2e40', label: 'Locked' },
    ];
    let lx = 14, ly = H - 18;
    ctx.font         = '11px Georgia, serif';
    ctx.textBaseline = 'middle';
    for (const it of items) {
      ctx.beginPath();
      ctx.arc(lx + 5, ly, 5, 0, Math.PI * 2);
      ctx.fillStyle = it.color;
      ctx.fill();
      ctx.fillStyle    = '#7a7060';
      ctx.textAlign    = 'left';
      ctx.fillText(it.label, lx + 13, ly);
      lx += ctx.measureText(it.label).width + 26;
    }
  }
}
