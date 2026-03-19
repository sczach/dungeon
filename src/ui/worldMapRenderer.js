/**
 * @file src/ui/worldMapRenderer.js
 * Canvas renderer for the skill-region world map.
 *
 * Responsibilities
 * ────────────────
 *   • Starfield + ambient background glow
 *   • Region background zones (radial gradient per region, before nodes)
 *   • Region labels (world-space, zoom-dependent visibility)
 *   • Connection lines between nodes
 *   • Node circles with full visual state system:
 *       locked/stub → gray, padlock icon, 60% opacity
 *       available   → region-colored fill, gentle pulse
 *       1★ done     → gold fill, dim single star
 *       2★ done     → gold fill, medium double star
 *       3★ done     → bright gold fill + glow halo, triple star
 *       hub         → large diamond glyph, always gold
 *       entry node  → radius NODE_ENTRY_R (larger than regular)
 *       selected    → white ring + pulsing glow
 *   • PLAY button + info panel in screen-space when a node is selected
 *   • Tutorial-complete banner (gold)
 *   • "New regions unlocked" banner (teal, fades after 4s)
 *   • "Reset view" button (top-right, shown when camera is far from default)
 *   • Zoom applied via ctx.scale()
 *
 * Exported helpers used by game.js:
 *   getNodeAtPoint(wx, wy, W, H, nodes) → nodeId | null
 *   getPlayButtonBounds(W, H)           → { x, y, w, h }
 *   getResetViewButtonBounds(W, H)      → { x, y, w, h } | null
 */

import { WORLD_MAP_NODES_BY_ID, REGIONS, isNodeUnlocked } from '../data/worldMap.js';
import { minigameEngine } from '../systems/minigameEngine.js';

// ─── Visual constants ─────────────────────────────────────────────────────────
const NODE_R       = 24;    // standard node radius
const NODE_ENTRY_R = 32;    // region entry node radius (slightly larger)
const NODE_HUB_R   = 38;    // hub node radius
const LABEL_FONT   = '13px Georgia, serif';
const ICON_FONT    = '18px serif';

// ─── Colour palette ──────────────────────────────────────────────────────────
const CLR = Object.freeze({
  LINE:       'rgba(232,160,48,0.22)',
  LINE_DONE:  'rgba(232,160,48,0.50)',
  LINE_HUB:   'rgba(255,255,255,0.18)',
  COMPLETED:  '#e8a030',
  LOCKED:     '#2e2e40',
  LOCKED_STR: '#4a4a60',
  SELECTED_R: '#ffffff',
  TEXT:       '#f0ead6',
  MUTED:      '#7a7060',
  PANEL:      'rgba(10,10,20,0.88)',
  BTN:        '#e8a030',
  BTN_TEXT:   '#0a0a0f',
  STAR_DIM:   '#a06820',    // 1★
  STAR_MED:   '#e8a030',    // 2★
  STAR_BRIGHT: '#fff080',   // 3★
});

// ─── Seeded PRNG (identical to renderer.js) ───────────────────────────────────
function makeRand() {
  let seed = 0xdeadbeef;
  return () => {
    seed = (seed ^ (seed >>> 15)) * 0x85ebca77;
    seed = (seed ^ (seed >>> 13)) * 0xc2b2ae3d;
    seed ^= (seed >>> 16);
    return (seed >>> 0) / 0xffffffff;
  };
}

// ─── Map default focus (tutorial spine centre) ────────────────────────────────
const DEFAULT_WORLD_X = 1200;
const DEFAULT_WORLD_Y = 1430;

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Hit-test world-map nodes.  Caller must convert screen → world coords first.
 * Entry nodes get their larger radius factored into hit detection.
 * @param {number} wx — world x (after zoom + camera subtraction)
 * @param {number} wy — world y
 * @param {number} _W @param {number} _H — unused
 * @param {Array}  nodes
 * @returns {string|null}
 */
export function getNodeAtPoint(wx, wy, _W, _H, nodes) {
  for (const n of nodes) {
    const r  = n.isHub ? NODE_HUB_R : n.isEntryNode ? NODE_ENTRY_R : NODE_R;
    const dx = wx - n.x, dy = wy - n.y;
    if (dx * dx + dy * dy <= (r + 6) * (r + 6)) return n.id;
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

/**
 * Screen-space bounds of the Reset View button (top-right).
 * Returns null when the camera is close enough to the default position
 * that no reset is needed.
 * @param {number} W @param {number} H
 * @param {object} [cam] — worldMap state (optional; when omitted, always visible)
 * @returns {{ x:number, y:number, w:number, h:number } | null}
 */
export function getResetViewButtonBounds(W, H, cam) {
  if (cam) {
    const zoom   = cam.zoom ?? 1.0;
    const defaultX = W / 2 - DEFAULT_WORLD_X * zoom;
    const defaultY = H / 2 - DEFAULT_WORLD_Y * zoom;
    const distSq   = (cam.cameraX - defaultX) ** 2 + (cam.cameraY - defaultY) ** 2;
    const zoomDiff  = Math.abs(zoom - 1.0);
    if (distSq < 200 * 200 && zoomDiff < 0.05) return null;  // close to default
  }
  const bw = 110, bh = 30;
  return { x: W - bw - 12, y: 12, w: bw, h: bh };
}

// ─── WorldMapRenderer ─────────────────────────────────────────────────────────

export class WorldMapRenderer {
  constructor() {
    this._phase = 0;
  }

  /**
   * Draw the world map scene.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state
   * @param {number} W
   * @param {number} H
   * @param {object} prog — ProgressRecord
   */
  draw(ctx, state, W, H, prog) {
    this._phase += 0.006;
    const t    = this._phase;
    const cam  = state.worldMap;
    const zoom = cam.zoom ?? 1.0;

    // ── Background ────────────────────────────────────────────────────────
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, W, H);

    const gx = W / 2, gy = H * 0.4;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.65);
    glow.addColorStop(0,   `rgba(232,160,48,${(0.04 + 0.02 * Math.sin(t)).toFixed(3)})`);
    glow.addColorStop(0.5, `rgba(91,143,255,${(0.02 + 0.01 * Math.sin(t * 1.3)).toFixed(3)})`);
    glow.addColorStop(1,   'rgba(10,10,15,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    this._drawStars(ctx, W, H, t);

    // ── Camera + zoom transform (world-space content) ─────────────────────
    ctx.save();
    ctx.translate(cam.cameraX, cam.cameraY);
    ctx.scale(zoom, zoom);

    this._drawRegionZones(ctx, t, W, H, zoom);
    this._drawRegionLabels(ctx, t, zoom);
    this._drawLines(ctx, t, prog);
    this._drawNodes(ctx, t, state, prog);

    ctx.restore();

    // ── Screen-space overlays ─────────────────────────────────────────────
    if (cam.selectedNodeId) {
      this._drawPlayButton(ctx, t, state, W, H, prog);
    }
    if (cam.showTutorialComplete) {
      this._drawTutorialBanner(ctx, t, W, H);
    }
    if (cam.regionsUnlockedBanner) {
      this._drawRegionsUnlockedBanner(ctx, t, cam, W, H, state);
    }
    this._drawResetViewButton(ctx, t, cam, W, H);
    this._drawLegend(ctx, W, H);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _drawStars(ctx, W, H, t) {
    const rand = makeRand();
    ctx.save();
    for (let i = 0; i < 100; i++) {
      const alpha = 0.2 + 0.4 * Math.sin(t * (0.4 + rand()) + rand() * Math.PI * 2);
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, rand() * 1.4 + 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,234,214,${alpha.toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draw subtle radial gradient zone behind each region's nodes.
   * Drawn in world space (inside the zoom transform).
   */
  _drawRegionZones(ctx, t, W, H, zoom) {
    // Region zone centres and radii (world coords)
    const zones = [
      { region: 'tone',         cx:  500, cy:  590, r: 460 },
      { region: 'rhythm',       cx:  600, cy: 1530, r: 440 },
      { region: 'theory',       cx: 1900, cy:  590, r: 460 },
      { region: 'musicianship', cx: 1200, cy:  430, r: 380 },
    ];

    for (const z of zones) {
      const info = REGIONS[z.region];
      if (!info) continue;
      const pulse = 0.9 + 0.1 * Math.sin(t * 0.7 + z.cx * 0.001);
      const gr    = ctx.createRadialGradient(z.cx, z.cy, 0, z.cx, z.cy, z.r * pulse);

      // Parse region hex color into rgba
      const hex = info.color;
      const r   = parseInt(hex.slice(1, 3), 16);
      const g   = parseInt(hex.slice(3, 5), 16);
      const b   = parseInt(hex.slice(5, 7), 16);

      gr.addColorStop(0,   `rgba(${r},${g},${b},0.14)`);
      gr.addColorStop(0.6, `rgba(${r},${g},${b},0.06)`);
      gr.addColorStop(1,   `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(z.cx, z.cy, z.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Draw region name labels near each entry node.
   * Visible at default zoom; hidden at high zoom (>1.2) or shown faint at low zoom.
   * Drawn in world space (inside zoom transform).
   */
  _drawRegionLabels(ctx, t, zoom) {
    // Label positions (above the entry node)
    const labels = [
      { region: 'tone',         x:  820, y:  822 },
      { region: 'rhythm',       x:  940, y: 1102 },
      { region: 'theory',       x: 1580, y:  822 },
      { region: 'musicianship', x: 1200, y:  664 },
    ];

    // Fade label based on zoom: visible at 0.6–1.0, hidden above 1.3
    const alpha = Math.max(0, Math.min(1, 1 - (zoom - 1.0) / 0.3));
    if (alpha < 0.02) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    for (const lbl of labels) {
      const info = REGIONS[lbl.region];
      if (!info) continue;
      ctx.font         = 'bold 15px Georgia, serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle    = info.color;
      ctx.fillText(info.label, lbl.x, lbl.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawLines(ctx, _t, prog) {
    const nodes = Object.values(WORLD_MAP_NODES_BY_ID);
    const drawn = new Set();

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
        const isHubLine = n.isHub || t2.isHub;

        ctx.strokeStyle = isHubLine ? CLR.LINE_HUB : bothDone ? CLR.LINE_DONE : CLR.LINE;
        ctx.lineWidth   = isHubLine ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.stroke();
      }
    }
  }

  _drawNodes(ctx, t, state, prog) {
    const nodes      = Object.values(WORLD_MAP_NODES_BY_ID);
    const selectedId = state.worldMap.selectedNodeId;

    // Draw entry nodes last so they appear on top of regular nodes
    const sorted = [...nodes].sort((a, b) => {
      const aw = a.isHub ? 2 : a.isEntryNode ? 1 : 0;
      const bw = b.isHub ? 2 : b.isEntryNode ? 1 : 0;
      return aw - bw;
    });

    for (const n of sorted) {
      const stars    = prog?.bestStars?.[n.id] ?? 0;
      const done     = stars >= 1;
      const unlocked = isNodeUnlocked(n, prog ?? { bestStars: {} });
      const live     = minigameEngine.isLive(n.gameType);   // registered handler exists
      const stub     = n.stub || !live;                     // coming-soon nodes treated as stub visually
      const isHub    = n.isHub;
      const selected = selectedId === n.id;
      const r        = isHub ? NODE_HUB_R : n.isEntryNode ? NODE_ENTRY_R : NODE_R;

      // Region color (for available nodes + entry visual)
      const regionInfo = REGIONS[n.region ?? 'tutorial'];
      const regionHex  = regionInfo?.color ?? '#e8a030';
      const regionR    = parseInt(regionHex.slice(1, 3), 16);
      const regionG    = parseInt(regionHex.slice(3, 5), 16);
      const regionB    = parseInt(regionHex.slice(5, 7), 16);

      // ── Selection glow (behind node) ─────────────────────────────────
      if (selected) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
        const gr    = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, r * 2.8);
        gr.addColorStop(0, `rgba(255,255,255,${(0.16 + 0.10 * pulse).toFixed(3)})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 3★ glow halo (behind node) ────────────────────────────────────
      if (done && stars >= 3) {
        const gr = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, r * 2.2);
        gr.addColorStop(0,   'rgba(255,240,100,0.30)');
        gr.addColorStop(0.6, 'rgba(232,160,48,0.10)');
        gr.addColorStop(1,   'rgba(232,160,48,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Hub node — diamond glyph ──────────────────────────────────────
      if (isHub) {
        this._drawHubNode(ctx, n, t, unlocked, selected, r);
        // Last-played teal ring
        if (n.id === state.worldMap?.lastPlayedNodeId) {
          ctx.strokeStyle = '#44ffcc';
          ctx.lineWidth   = 3;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2);
          ctx.stroke();
        }
        this._drawNodeLabel(ctx, n, stub, unlocked);
        continue;
      }

      // ── Node body ─────────────────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

      if (stub || !unlocked) {
        ctx.fillStyle   = CLR.LOCKED;
        ctx.globalAlpha = 0.6;
      } else if (done) {
        ctx.fillStyle   = stars >= 3 ? '#ffea60' : CLR.COMPLETED;
        ctx.globalAlpha = 1;
      } else {
        // Available — gentle pulse in region color
        const pulse     = 0.55 + 0.35 * Math.sin(t * 2.4 + n.x * 0.01);
        ctx.fillStyle   = `rgba(${regionR},${regionG},${regionB},${(pulse * 0.22).toFixed(3)})`;
        ctx.globalAlpha = 1;
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      // ── Node border ───────────────────────────────────────────────────
      if (selected) {
        ctx.strokeStyle = CLR.SELECTED_R;
        ctx.lineWidth   = 3;
      } else if (stub || !unlocked) {
        ctx.strokeStyle = CLR.LOCKED_STR;
        ctx.lineWidth   = 1.5;
      } else if (done) {
        const starColor = stars >= 3 ? CLR.STAR_BRIGHT : stars >= 2 ? CLR.STAR_MED : CLR.STAR_DIM;
        ctx.strokeStyle = starColor;
        ctx.lineWidth   = stars >= 3 ? 3 : 2;
      } else {
        const pulse     = 0.5 + 0.5 * Math.sin(t * 2.4 + n.x * 0.01);
        ctx.strokeStyle = `rgba(${regionR},${regionG},${regionB},${(0.4 + 0.6 * pulse).toFixed(3)})`;
        ctx.lineWidth   = n.isEntryNode ? 2.5 : 2;
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // ── Last-played teal ring ─────────────────────────────────────────
      if (n.id === state.worldMap?.lastPlayedNodeId) {
        ctx.strokeStyle = '#44ffcc';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Icon inside node ──────────────────────────────────────────────
      ctx.font         = ICON_FONT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      if (stub || !unlocked) {
        ctx.fillStyle   = '#505065';
        ctx.globalAlpha = 0.6;
        ctx.fillText('🔒', n.x, n.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = done ? 1.0 : 0.80;
        ctx.fillText(n.icon ?? '⚔️', n.x, n.y);
        ctx.globalAlpha = 1;
      }

      // ── Labels ────────────────────────────────────────────────────────
      this._drawNodeLabel(ctx, n, stub, unlocked);

      // ── Stars ─────────────────────────────────────────────────────────
      if (done && !n.isTutorial && stars > 0) {
        const starColor = stars >= 3 ? CLR.STAR_BRIGHT : stars >= 2 ? CLR.STAR_MED : CLR.STAR_DIM;
        ctx.font      = stars >= 3 ? 'bold 12px Georgia, serif' : '11px Georgia, serif';
        ctx.fillStyle = starColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('★'.repeat(stars), n.x, n.y + r + 20);
      }
    }
  }

  /** Draw the hub node as a large diamond with gold glow. */
  _drawHubNode(ctx, n, t, unlocked, selected, r) {
    if (!unlocked) {
      // Locked hub — gray diamond
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = CLR.LOCKED_STR;
      ctx.fillStyle   = CLR.LOCKED;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.moveTo(n.x,     n.y - r);
      ctx.lineTo(n.x + r, n.y);
      ctx.lineTo(n.x,     n.y + r);
      ctx.lineTo(n.x - r, n.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font         = ICON_FONT;
      ctx.fillStyle    = '#505065';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', n.x, n.y);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    // Gold glow behind hub
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);
    const gr    = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
    gr.addColorStop(0,   `rgba(232,160,48,${(0.25 + 0.12 * pulse).toFixed(3)})`);
    gr.addColorStop(0.5, `rgba(232,160,48,${(0.08 + 0.04 * pulse).toFixed(3)})`);
    gr.addColorStop(1,   'rgba(232,160,48,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
    ctx.fill();

    // Diamond body
    ctx.save();
    ctx.strokeStyle = selected ? CLR.SELECTED_R : '#ffd060';
    ctx.fillStyle   = '#3a2800';
    ctx.lineWidth   = selected ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(n.x,     n.y - r);
    ctx.lineTo(n.x + r, n.y);
    ctx.lineTo(n.x,     n.y + r);
    ctx.lineTo(n.x - r, n.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hub icon
    ctx.font         = 'bold 20px Georgia, serif';
    ctx.fillStyle    = '#ffd060';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.icon ?? '✦', n.x, n.y + 1);
    ctx.restore();
  }

  /** Draw name label below the node (and sub-label for region entry nodes). */
  _drawNodeLabel(ctx, n, stub, unlocked) {
    const r = n.isHub ? NODE_HUB_R : n.isEntryNode ? NODE_ENTRY_R : NODE_R;
    ctx.font         = n.isHub ? 'bold 13px Georgia, serif' : LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = (stub || !unlocked) ? CLR.MUTED
                     : n.isHub             ? '#ffd060'
                     : n.isEntryNode       ? (REGIONS[n.region]?.color ?? CLR.TEXT)
                     : CLR.TEXT;
    ctx.fillText(n.name, n.x, n.y + r + 5);
  }

  _drawPlayButton(ctx, t, state, W, H, prog) {
    const selectedId = state.worldMap.selectedNodeId;
    const node       = WORLD_MAP_NODES_BY_ID[selectedId];
    if (!node) return;

    const unlocked = isNodeUnlocked(node, prog ?? { bestStars: {} });
    const pb       = getPlayButtonBounds(W, H);

    // Info panel above the button
    const panelW = Math.min(380, W * 0.88);
    const panelX = (W - panelW) / 2;
    const panelY = pb.y - 108;
    const panelH = node.skillFocus ? 96 : 80;

    ctx.fillStyle = CLR.PANEL;
    ctx.beginPath();
    ctx.roundRect?.(panelX, panelY, panelW, panelH, 8) ??
      ctx.rect(panelX, panelY, panelW, panelH);
    ctx.fill();

    const regionInfo = REGIONS[node.region ?? 'tutorial'];
    const nameColor  = node.isHub ? '#ffd060' : regionInfo?.color ?? '#e8a030';

    ctx.font         = 'bold 17px Georgia, serif';
    ctx.fillStyle    = nameColor;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${node.icon ?? ''} ${node.name}`, W / 2, panelY + 10, panelW - 24);

    ctx.font      = '12px Georgia, serif';
    ctx.fillStyle = '#c8b090';
    ctx.fillText(node.levelGoal ?? '', W / 2, panelY + 34, panelW - 24);

    // Show region description for hub and region entry nodes; skill focus for regular nodes
    if (node.isHub || node.isEntryNode) {
      const desc = regionInfo?.description ?? node.skillFocus ?? '';
      ctx.font      = '11px Georgia, serif';
      ctx.fillStyle = '#7a7060';
      ctx.fillText(desc, W / 2, panelY + 54, panelW - 24);
      // Difficulty stars for region entry nodes
      if (node.isEntryNode && typeof regionInfo?.difficulty === 'number') {
        const diff     = regionInfo.difficulty;
        const maxDiff  = 3;
        const diffStr  = '★'.repeat(diff) + '☆'.repeat(maxDiff - diff);
        ctx.font      = '11px Georgia, serif';
        ctx.fillStyle = diff > 0 ? (regionInfo?.color ?? '#e8a030') : '#5a5040';
        ctx.fillText(`Difficulty: ${diffStr}`, W / 2, panelY + 68, panelW - 24);
      }
    } else if (node.skillFocus) {
      ctx.font      = '11px Georgia, serif';
      ctx.fillStyle = '#7a7060';
      ctx.fillText(node.skillFocus, W / 2, panelY + 54, panelW - 24);
    }

    ctx.font      = '11px Georgia, serif';
    ctx.fillStyle = '#5a5040';
    ctx.fillText(node.estimatedDuration ?? '', W / 2, panelY + panelH - 12);

    // PLAY / status button
    if (node.isHub) {
      // Hub — non-playable junction; pulse gold border when tutorial is complete
      const tutComplete = prog?.tutorialComplete === true;
      const pulse       = tutComplete ? (0.7 + 0.3 * Math.sin(t * 2.0)) : 1;
      ctx.fillStyle = 'rgba(30,20,5,0.7)';
      ctx.beginPath();
      ctx.roundRect?.(pb.x, pb.y, pb.w, pb.h, 6) ?? ctx.rect(pb.x, pb.y, pb.w, pb.h);
      ctx.fill();
      if (tutComplete) {
        // Gold border to signal regions are open
        ctx.strokeStyle = `rgba(232,160,48,${(0.5 + 0.5 * pulse).toFixed(3)})`;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.roundRect?.(pb.x, pb.y, pb.w, pb.h, 6) ?? ctx.rect(pb.x, pb.y, pb.w, pb.h);
        ctx.stroke();
      }
      ctx.font         = '13px Georgia, serif';
      ctx.fillStyle    = tutComplete ? `rgba(232,160,48,${(0.7 + 0.3 * pulse).toFixed(3)})` : '#7a7060';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('← Choose a region →', pb.x + pb.w / 2, pb.y + pb.h / 2);
    } else if (!node.stub && unlocked && minigameEngine.isLive(node.gameType)) {
      // Live + unlocked — full PLAY button
      const pulse = 0.88 + 0.12 * Math.sin(t * 3.2);
      ctx.fillStyle   = CLR.BTN;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.roundRect?.(pb.x, pb.y, pb.w, pb.h, 6) ?? ctx.rect(pb.x, pb.y, pb.w, pb.h);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font         = 'bold 16px Georgia, serif';
      ctx.fillStyle    = CLR.BTN_TEXT;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶  PLAY', pb.x + pb.w / 2, pb.y + pb.h / 2);
    } else if (unlocked && !minigameEngine.isLive(node.gameType)) {
      // Unlocked but no registered handler — coming soon
      ctx.fillStyle = 'rgba(20,15,5,0.80)';
      ctx.beginPath();
      ctx.roundRect?.(pb.x, pb.y, pb.w, pb.h, 6) ?? ctx.rect(pb.x, pb.y, pb.w, pb.h);
      ctx.fill();
      ctx.strokeStyle = `${regionInfo?.color ?? '#888'}66`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.roundRect?.(pb.x, pb.y, pb.w, pb.h, 6) ?? ctx.rect(pb.x, pb.y, pb.w, pb.h);
      ctx.stroke();
      ctx.font         = '13px Georgia, serif';
      ctx.fillStyle    = regionInfo?.color ?? CLR.MUTED;
      ctx.globalAlpha  = 0.75;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Coming soon ✧', pb.x + pb.w / 2, pb.y + pb.h / 2);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = CLR.LOCKED;
      ctx.beginPath();
      ctx.roundRect?.(pb.x, pb.y, pb.w, pb.h, 6) ?? ctx.rect(pb.x, pb.y, pb.w, pb.h);
      ctx.fill();
      ctx.font         = '13px Georgia, serif';
      ctx.fillStyle    = CLR.MUTED;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒 Locked', pb.x + pb.w / 2, pb.y + pb.h / 2);
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
    ctx.roundRect?.(bx, by, bw, bh, 8) ?? ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.font         = 'bold 15px Georgia, serif';
    ctx.fillStyle    = '#e8a030';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Tutorial complete — the world is open.', W / 2, by + bh / 2);
    ctx.globalAlpha = 1;
  }

  /**
   * "New regions unlocked. Choose your path." — teal banner shown after T4 unlock.
   * Fades in over 0.5s, holds 2.5s, fades out over 1s. Total: 4s.
   * Also pulses the four entry nodes simultaneously while visible.
   */
  _drawRegionsUnlockedBanner(ctx, t, cam, W, H, state) {
    const elapsed = (performance.now() - cam.regionsUnlockedBanner.startTime) / 1000;
    const TOTAL   = 5.0;  // seconds
    if (elapsed >= TOTAL) {
      cam.regionsUnlockedBanner = null;
      return;
    }

    // Alpha: fade in 0.5s, hold, fade out last 1s
    let alpha;
    if (elapsed < 0.5) {
      alpha = elapsed / 0.5;
    } else if (elapsed > TOTAL - 1.0) {
      alpha = (TOTAL - elapsed) / 1.0;
    } else {
      alpha = 1.0;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    const bw = Math.min(500, W * 0.90);
    const bh = 60;
    const bx = (W - bw) / 2;
    const by = H / 2 - bh / 2;  // vertical center

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = 'rgba(20,80,60,0.92)';
    ctx.strokeStyle = 'rgba(68,255,200,0.80)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect?.(bx, by, bw, bh, 10) ?? ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.font         = 'bold 17px Georgia, serif';
    ctx.fillStyle    = '#44ffcc';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('New regions unlocked. Choose your path.', W / 2, by + bh / 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Reset view button — top-right corner, shown when camera is far from default.
   */
  _drawResetViewButton(ctx, t, cam, W, H) {
    const bounds = getResetViewButtonBounds(W, H, cam);
    if (!bounds) return;

    const pulse = 0.85 + 0.15 * Math.sin(t * 2.5);
    ctx.save();
    ctx.globalAlpha = 0.7 * pulse;
    ctx.fillStyle   = 'rgba(30,25,15,0.90)';
    ctx.strokeStyle = '#7a6040';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.roundRect?.(bounds.x, bounds.y, bounds.w, bounds.h, 5) ??
      ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.fill();
    ctx.stroke();
    ctx.font         = '12px Georgia, serif';
    ctx.fillStyle    = '#c8a060';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⌂ Reset View', bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawLegend(ctx, W, H) {
    const items = [
      { color: CLR.COMPLETED,    label: 'Completed' },
      { color: '#5b8fff',        label: 'Available'  },
      { color: '#44ffcc',        label: 'Last played' },
      { color: CLR.LOCKED_STR,   label: 'Locked'     },
    ];
    let lx = 14;
    const ly = H - 18;
    ctx.font         = '11px Georgia, serif';
    ctx.textBaseline = 'middle';
    for (const it of items) {
      ctx.beginPath();
      ctx.arc(lx + 5, ly, 5, 0, Math.PI * 2);
      ctx.fillStyle = it.color;
      ctx.fill();
      ctx.fillStyle = '#7a7060';
      ctx.textAlign = 'left';
      ctx.fillText(it.label, lx + 13, ly);
      lx += ctx.measureText(it.label).width + 26;
    }
  }
}
