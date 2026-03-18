# ChordWars Rendering System

> `renderer.js` is pure output. It reads state and draws pixels. It never mutates game state.

## Architecture

```
game.js loop()
  ├── update(dt)         ← mutates state
  └── renderer.draw(state) ← reads state, draws canvas
        ├── _drawPlaying() ← delegates to 15+ sub-methods
        │     ├── renderHUD()      (from ui/hud.js)
        │     ├── _drawTablature()
        │     ├── _drawEnemySequences()
        │     ├── _drawBases()
        │     ├── _drawUnits()
        │     ├── _drawLightningBolts()
        │     ├── _drawChargeBar()
        │     ├── _drawCueCard()
        │     └── ... (announcements, effects, debug)
        └── _drawWorldMap() ← delegates to WorldMapRenderer
```

## renderer.js (1953 lines)

**Imports:** `SCENE` + layout constants from `constants.js`, `renderHUD` from `hud.js`, `WorldMapRenderer` from `worldMapRenderer.js`

**Exports:** `Renderer` class

### Per-Scene Draw Methods

| Method | Scene | Content |
|--------|-------|---------|
| `_drawTitle` | TITLE | Radial gradient glow + seeded PRNG starfield |
| `_drawCalibration` | CALIBRATION | Vignette + waveform from `state.audio.waveformData` |
| `_drawPlaying` | PLAYING | Full game: map, bases, units, effects, HUD, tablature |
| `_drawWorldMap` | WORLD_MAP | Delegates to WorldMapRenderer |
| `_drawLevelStart` | LEVEL_START | Stars + tutorial hint banner |
| `_drawInstrumentSelect` | INSTRUMENT_SELECT | Canvas background only (HTML overlay does content) |
| `_drawLevelSelect` | LEVEL_SELECT | Canvas background only |
| `_drawVictory` | VICTORY | Color tint overlay |
| `_drawDefeat` | DEFEAT | Color tint overlay |
| `_drawEndgame` | ENDGAME | Golden glow + starfield |

### Key PLAYING Sub-Methods

**Units:**
- `_drawEnemyBody(ctx, unit, r, t)` — T1: plain red circle. T2: orange ring + pulse. T3: speed trail + purple glow + 4 spikes
- `_drawPlayerBody(ctx, unit, r, t)` — tank (gold + cross), dps (orange + slash), ranged (teal + crosshair), mage (purple glow + AOE ring)

**Bases:**
- `_drawBase(base, x, y, w, h, ...)` — castle body with battlements, HP bar (green→yellow→red), damage flash (400ms), protected overlay for invulnerable bases, destruction animation (1200ms: white strobe + scale-dissolve)

**Combat UI:**
- `_drawTablature` — 3-slot summon bar with 5-line staff notation, pill row, combo counter, cooldown overlay, resource-blocked red flash
- `_drawEnemySequences` — per-enemy floating note pills; Y-band collision stacking; 45% opacity for non-nearest enemies; supports note/qwerty/staff display modes
- `_drawChargeBar` — 3-segment blue→cyan→white bar above mode buttons
- `_drawLightningBolts` — charge-level-colored bolts, outer glow + inner core, impact flash
- `_drawCueCard` — top-right cue card; reads `state.currentCue`

**Announcements:**
- `_drawWaveAnnouncement` — "WAVE N" overlay
- `_drawModeAnnouncement` — mode-switch overlay
- `_drawPhaseAnnouncement` — phase transition overlay

**Debug:**
- `_drawDebugOverlay` — audio pipeline diagnostic (backtick toggle): scene, ctxState, ready, rms, noiseFloor, pitchStable, detectedNote, detectedChord, confidence

### DPR Scaling

Handled in `game.js:onResize()`:
```
canvas.width = Math.round(w * dpr)
canvas.height = Math.round(h * dpr)
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
```
All draw calls use logical pixels. Renderer never needs to know about DPR.

### Color Palette (renderer internal)

| Constant | Value | Usage |
|----------|-------|-------|
| CLR.BG | `#0a0a0f` | Background |
| CLR.GRASS | `#1a2a1a` | Map grass |
| CLR.STRIP | `#1a1a2a` | Combat strip |
| CLR.ACCENT | `#e8a030` | Amber highlight |
| CLR.ACCENT2 | `#5b8fff` | Blue highlight |
| CLR.HEALTH_HIGH | `#4f4` | HP bar green |
| CLR.HEALTH_MID | `#ff4` | HP bar yellow |
| CLR.HEALTH_LOW | `#f44` | HP bar red |

## hud.js (383 lines)

**Exports:** `renderHUD()`, `getModeButtonAtPoint()`, `getKeyAtPoint()`, `initPianoTouchInput()`

- Top row: Wave counter, Resources, Score
- Bottom panel: hint text, mode buttons (SUMMON/ATTACK/CHARGE), piano keyboard
- Piano: 7 white + 5 black keys
- `PIANO_W = W < 600 ? W*0.90 : W*0.50` (responsive)
- `PIANO_H = 88px`, `MODE_BTN_H = 48px`
- Mode buttons filtered by `state.allowedModes`

## worldMapRenderer.js (760 lines)

**Exports:** `WorldMapRenderer` class, `getNodeAtPoint()`, `getPlayButtonBounds()`, `getResetViewButtonBounds()`

- Canvas-rendered spider web map (no HTML DOM)
- Map space: 2400×1800 logical pixels
- Camera: pan via drag, zoom via wheel/pinch
- `ctx.translate(cam.cameraX, cam.cameraY); ctx.scale(zoom, zoom)`
- Node visual states: locked, available-pulse, 1-3 stars, hub-diamond, selected-ring
- Tutorial-complete banner, regions-unlocked banner (5s fade)
- Seeded PRNG starfield (100 stars)

## screens.js (145 lines)

Legacy minimal settings overlay injected at TITLE scene. Persists difficulty and noteLabels to individual localStorage keys. Coexists with the full `SettingsUI` class.

## settings.js (475 lines)

Full settings panel: audio sensitivity, master volume, difficulty, chord cues, note labels, enemy cue style (note/qwerty/staff), hardcore mode. CSS injected programmatically. localStorage key: `chordwars_settings`.

## instrumentselect.js (145 lines)

3 instrument cards: Piano (available), Guitar (coming soon), Voice (coming soon). Only Piano is selectable.

## levelselect.js (307 lines)

Level cards + skill tree panel. Calls `purchaseSkill()`, `saveProgress()`, refreshes all UI on purchase.

## Performance Rules

- No DOM reads inside rAF (use canvas only for game world)
- HTML overlays via `data-scene` CSS (no JS show/hide in hot path)
- Enemy cue Y-band stacking to prevent overlap
- Performance budget: ≤ 4ms render time
- No allocations in draw hot path

## See Also

- [[STATE]] — What state the renderer reads
- [[ARCHITECTURE]] — Module ownership model
- `docs/skills/GRAPHICS_ENGINE.md` — Rendering constraints
