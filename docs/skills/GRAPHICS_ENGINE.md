# Graphics Engine — Skill Definition

## Role
The Graphics Engine owns everything the player sees: the canvas-rendered battle map,
unit and base sprites, the HUD panel (piano keyboard, mode buttons, wave counter),
enemy attack sequence cue pills, tablature summon bar, combo flashes, damage numbers,
the world map spider-web, and all HTML overlay screens (title, victory, defeat, etc.).

`renderer.js` is the heart of this engine. It must remain **pure output** — it reads
state and draws pixels; it never mutates state. Any state changes triggered by visual
events (e.g. mode button tap) go through `game.js` callbacks.

---

## Inputs
| Input | Source | Description |
|-------|--------|-------------|
| `state` (read-only) | `game.js` | Full game state snapshot for the current frame |
| `W`, `H` | canvas | Logical canvas dimensions (CSS pixels, not device pixels) |
| `ctx` | canvas | 2D rendering context (DPR-scaled in game.js before passing) |
| `state.inputMode` | `game.js` | Current mode — drives border color, mode button highlight |
| `state.units[]` | `game.js` | Unit positions, HP, team, alive flag |
| `state.tablature` | `tablature.js` | Queue, activeIndex, combo for summon bar render |
| `state.worldMap` | `game.js` | Camera position, selected node, drag state |
| `progression` | `progression.js` | Best stars per level — drives node lock icons on world map |

---

## Outputs
| Output | Description |
|--------|-------------|
| Battle map | Grass lane, base towers, unit sprites, health bars |
| HUD panel | Piano keyboard, mode toggle buttons, wave/score/resource counters |
| Mode border | 3px top border on HUD panel: blue=summon, red=attack, amber=charge |
| Enemy cue pills | Per-enemy attack sequence shown above unit, stacked by Y-band |
| Summon bar | 3-slot tablature bar at top of screen (summon mode only) |
| Summon cue text | Large "Play: C3 → E3 → G3" text below tablature bar |
| Damage numbers | Floating "+12" numbers rising from hit targets |
| World map | Spider-web canvas with nodes, connections, camera pan support |
| HTML overlays | `data-scene` attribute drives CSS visibility of title/victory/defeat screens |

---

## Constraints
- **`renderer.js` must never mutate state.** If you find a mutation, it is a bug — extract it
  to a system or game.js callback.
- **DPR scaling is handled in `game.js`** before passing `ctx` to the renderer. Never
  call `devicePixelRatio` inside renderer.js.
- **No DOM reads inside the render loop.** `offsetWidth` / `getBoundingClientRect` calls
  must happen outside rAF, cached on resize.
- **Canvas only for game world.** HTML overlays (title, victory, defeat screens) use
  `data-scene` CSS selectors — never draw these on canvas.
- **World map is canvas-only** — no HTML DOM nodes for map content. Only the play button
  and reset-view button are hit-tested (via exported geometry helpers).
- **Y-band enemy cue stacking**: units in the same 40px Y-band must have their pill rows
  offset vertically. Non-nearest enemies render at 45% opacity.
- **Summon bar is only visible in summon mode.** Hidden in attack/charge modes.
- **Performance budget**: the render function must complete in ≤ 4ms on a mid-range laptop
  (2018 MacBook Pro equivalent). No canvas state leaks — always pair `ctx.save()`/`ctx.restore()`.
- **No `canvas.toDataURL()` or `getImageData()`** in the hot path — these trigger GPU readbacks.

---

## Test criteria
- [ ] Mode border color matches current mode (blue/red/amber) with no delay
- [ ] Summon bar appears at top when in summon mode, disappears in attack/charge mode
- [ ] "Play: C3 → E3 → G3" cue is visible and readable mid-fight on a busy background
- [ ] 5 enemies in the same Y-band produce 5 non-overlapping pill rows
- [ ] Non-nearest enemy pills are visibly dimmed (≈half opacity)
- [ ] World map renders all nodes, connections, and star badges correctly after tutorial
- [ ] VICTORY screen buttons are immediately clickable (not covered by canvas)
- [ ] HUD piano keys highlight on press and return to normal on release
- [ ] No canvas state leak: `ctx.globalAlpha` is always 1.0 after each draw call completes

---

## Convergence definition
The Graphics Engine is **good enough** when:
1. Any player can identify their current input mode without looking at the mode badge
   (the border color alone is sufficient at a glance).
2. Enemy cues are readable even when 5 enemies are on screen simultaneously.
3. The summon sequence ("Play: C3 → E3 → G3") is legible mid-fight at 1080p.
4. The world map renders and pans smoothly at 60fps on a 5-year-old phone.
5. No visual artifact or ghost state persists across scene transitions.
