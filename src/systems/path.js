/**
 * @file src/systems/path.js
 * Campfire map — a single straight horizontal path.
 *
 * All waypoints are stored as fractions of canvas size (0–1 in both axes) so
 * the path scales correctly to any screen, including mobile portrait.
 *
 * Arc-length parameterisation: getPositionOnPath(t) uses cumulative pixel
 * distances along each segment so t=0.5 is always the spatial midpoint,
 * not a naive fraction of waypoint count.
 *
 * Zero-allocation hot path: getPositionOnPath accepts an optional `out`
 * object and writes x/y into it rather than returning a new object.
 * Enemy.update() passes `this` as `out`, eliminating per-frame allocations.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Path definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Waypoints for the Campfire map in fractional canvas coordinates.
 *   x: 0 = left edge,  1 = right edge
 *   y: 0 = top,        1 = bottom
 *
 * Straight horizontal path: enemies march left → right along the vertical
 * centre of the canvas.
 *
 * @type {ReadonlyArray<Readonly<{x: number, y: number}>>}
 */
export const CAMPFIRE_PATH = Object.freeze([
  Object.freeze({ x: 0.0, y: 0.5 }),   // spawn  (left edge, vertically centred)
  Object.freeze({ x: 1.0, y: 0.5 }),   // castle (right edge, vertically centred)
]);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the total pixel length of the path at the given canvas size.
 *
 * Accounts for aspect ratio: a diagonal segment's pixel length scales
 * differently in x (by W) and y (by H), so we cannot use a single pre-computed
 * constant — W and H must be supplied each call.
 *
 * For the straight Campfire path this returns exactly W.
 *
 * @param {number} W — canvas logical width  (pixels)
 * @param {number} H — canvas logical height (pixels, used for future curved paths)
 * @returns {number} path length in logical pixels
 */
export function getPathLength(W, H) {
  let total = 0;
  for (let i = 1; i < CAMPFIRE_PATH.length; i++) {
    const dx = (CAMPFIRE_PATH[i].x - CAMPFIRE_PATH[i - 1].x) * W;
    const dy = (CAMPFIRE_PATH[i].y - CAMPFIRE_PATH[i - 1].y) * H;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/**
 * Compute the world-space position along the path using arc-length
 * parameterisation: t=0 → spawn, t=1 → castle, t=0.5 → spatial midpoint.
 *
 * ZERO ALLOCATION: when `out` is provided the result is written into it and
 * returned.  Enemy.update() passes `this` so no temporary object is created.
 *
 * @param {number}                     t    — 0–1 progress (clamped)
 * @param {number}                     W    — canvas logical width
 * @param {number}                     H    — canvas logical height
 * @param {{ x: number, y: number }}  [out] — pre-allocated output; allocated if omitted
 * @returns {{ x: number, y: number }}      — logical-pixel position (= out)
 */
export function getPositionOnPath(t, W, H, out) {
  if (out === undefined) out = { x: 0, y: 0 };

  // Clamp to valid range
  if (t <= 0) {
    out.x = CAMPFIRE_PATH[0].x * W;
    out.y = CAMPFIRE_PATH[0].y * H;
    return out;
  }
  if (t >= 1) {
    const last = CAMPFIRE_PATH[CAMPFIRE_PATH.length - 1];
    out.x = last.x * W;
    out.y = last.y * H;
    return out;
  }

  // Walk segments accumulating arc length until we reach the target distance.
  // For the straight Campfire path (1 segment) this executes exactly once.
  const totalLen = getPathLength(W, H);
  const target   = t * totalLen;
  let   acc      = 0;

  for (let i = 1; i < CAMPFIRE_PATH.length; i++) {
    const dx     = (CAMPFIRE_PATH[i].x - CAMPFIRE_PATH[i - 1].x) * W;
    const dy     = (CAMPFIRE_PATH[i].y - CAMPFIRE_PATH[i - 1].y) * H;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (acc + segLen >= target) {
      const segT = segLen > 0 ? (target - acc) / segLen : 0;
      out.x = CAMPFIRE_PATH[i - 1].x * W + dx * segT;
      out.y = CAMPFIRE_PATH[i - 1].y * H + dy * segT;
      return out;
    }
    acc += segLen;
  }

  // Floating-point edge case: snap to end
  const last = CAMPFIRE_PATH[CAMPFIRE_PATH.length - 1];
  out.x = last.x * W;
  out.y = last.y * H;
  return out;
}
