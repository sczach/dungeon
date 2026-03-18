> **Archive** — superseded by current `CLAUDE.md` in repo root. **Vault links:** [[PROJECT_HISTORY]] | [[ARCHITECTURE]]

# Chord Wars — Sonnet Project Instructions (Updated: March 2026)

You are the development AI for **Chord Wars**, a browser-based RTS / tower-defense hybrid where players use a real guitar (mic) or piano keyboard to spawn defender units. Live at: https://chordwars.vercel.app  
Repo: https://github.com/szach/chordwars  
Developer: Duncan (architecture background, not a professional programmer, music production experience with Prophet-6 and Pioneer RX3).

---

## Core Loop (Current Implementation)
Player base (left) vs Enemy base (right). Player plays guitar chords (mic) or piano keys (keyboard/touch) → units spawn and march right. Enemy base auto-spawns units on a timer → they march left. Units collide and fight. Destroy enemy base to win; lose if your base reaches 0 HP.

---

## Tech Stack
- Vanilla JS (ES Modules, no bundler, no framework)
- HTML5 Canvas 2D rendering (high-DPI aware — logical px × devicePixelRatio)
- Web Audio API: AudioContext → AnalyserNode (FFT, 2048 samples, 44.1kHz)
- Chord detection: chromagram-based template matching (cosine similarity, NOT YIN pitch)
- Hosting: Vercel. Domain: chordwars.vercel.app / chordwars.com
- No Firebase yet (Phase 2B)

---

## Actual File Structure (as of late Phase 1C)

```
index.html                        — Canvas + UI overlays + ES module imports
style.css                         — Responsive styling
src/game.js                       — Game loop (rAF), scene state machine, ALL mutable state
src/renderer.js                   — All Canvas 2D drawing. NEVER mutates state.
src/constants.js                  — SCENE enum, LANE_Y, LANE_HEIGHT, BASE_WIDTH, PLAYER_BASE_X, ENEMY_BASE_X
src/audio/index.js                — Audio pipeline entry: startCapture(), updateAudio(), updateCalibration()
src/audio/chords.js               — Chromagram builder + cosine-similarity chord matcher (G/C/D/Em/Am/E)
src/entities/unit.js              — Unit class: team, tier, role, hp, damage, speed, range, attackSpeed
src/systems/base.js               — Base class: player/enemy base HP, destruction state
src/systems/tablature.js          — 3-note summon sequence system (note queue, combo, pendingSpawn)
src/systems/attackSequence.js     — Attack sequence system for units (assigned on spawn)
src/systems/prompts.js            — PromptManager: chord cue cycling, combo tracking (guitar mode only)
src/input/keyboard.js             — Piano key input: note dispatch, keyboardInput.start/stop, playSuccessKill
src/ui/hud.js                     — HUD rendering + initPianoTouchInput (mobile touch piano)
src/ui/settings.js                — SettingsUI: load/save settings from localStorage, render settings panel
src/data/chords.js                — CHORD_DATA: tab notation + difficulty per chord; CHORD_FALLBACK
src/data/maps.js                  — Map definitions (if present; may be inlined in constants)
firebase.js                       — Not yet implemented (Phase 2B)
```

---

## Audio Pipeline (SETTLED — do not change architecture)

```
Web Audio API mic → AnalyserNode.getFloatFrequencyData()
  → buildChromagram() [chords.js]   — 12-bin chroma from 80–4000 Hz, L2-normalised
  → matchChord()      [chords.js]   — cosine similarity vs 6 pre-normalised templates
  → false-positive gates (in audio/index.js or game.js):
      • RMS noise gate (noiseFloor set during calibration)
      • HOLD_FRAMES: chord must win N consecutive frames before firing
      • CONFIDENCE_THRESHOLD: 0.60 cosine similarity minimum
      • MARGIN: best score must beat runner-up by ≥ 0.15
```

**Key settled values:**
- `CONFIDENCE_THRESHOLD = 0.60`
- `MARGIN = 0.15`
- `SPAWN_DEBOUNCE = 0.5s` per chord
- Chroma range: 80–4000 Hz
- Near-floor bins (≤ −89 dB) skipped

**Known limitation (accepted):** E major vs Em is marginal on cheap mics due to G(7) vs G#(8) proximity. The 0.15 margin guard means it only commits when the chromagram clearly favours one.

---

## Input Modes (SETTLED)

The game has two input modes, toggled by Spacebar or touch button:

| Mode | Trigger | Effect |
|------|---------|--------|
| `summon` | Default | 3-note tablature sequence → spawn unit (resource-gated) |
| `attack` | Space / touch | Attack sequence input |

**Instrument selection** (title screen): `'piano'` \| `'guitar'` \| `'voice'`  
State field: `state.instrument`

---

## Unit System (SETTLED)

### Chord → Unit Type (guitar mode)
| Chord | Unit Type |
|-------|-----------|
| G     | Shield    |
| C     | Archer    |
| D     | Swordsman |
| Em    | Mage      |
| Am    | Healer    |
| E     | Lancer    |

### Unit Roles (from keyboard/tablature summon)
| Role | UnitType | Behaviour |
|------|----------|-----------|
| `offensive` | archer / default | Spawns at base edge, marches right |
| `defensive` | knight | Spawns close to player base, guards |
| `swarm` | mage | Spawns 3 units per summon, spread vertically (offsets −22/0/+22 px), small/fast/fragile |

### Unit Tiers
| Tier | Radius | Enemy spawn probability (late game) |
|------|--------|-------------------------------------|
| 1 | 12px | High early, 20% at wave 8–10 |
| 2 | 16px | Medium; increases with wave |
| 3 | 20px | Rare early; 30% at wave 8–10 |

### Mage swarm stats (overrides)
- radius: 10, hp: 15, damage: 5, speed: 85, attackSpeed: 1.5, range: 45

### Enemy speed
Global 0.5× multiplier applied on spawn to all enemy units.

### Hard caps
- Max 6 enemy units on screen simultaneously
- Resources capped at 200 (earn) / 999 (combo bonus only)

---

## Resource System (SETTLED)

| Event | Change |
|-------|--------|
| Game start | +200 |
| Kill T1 enemy | +20 |
| Kill T2 enemy | +30 |
| Kill T3 enemy | +50 |
| Combo milestone (5/10/20 kills) | +25 bonus |
| Auto-tick | None — kills only |

| Summon | Cost |
|--------|------|
| Tier 1 (archer) | 50 |
| Tier 2 | 75 |
| Tier 3 | 100 |

Top-level summon cooldown: 500ms after any successful summon.

---

## Wave & Difficulty System (SETTLED)

- Wave advances every 30s of play time (max wave 10)
- Enemy spawn interval starts at 8s (easy: 12s, hard: 5s)
- Interval reduces −0.5s every 60s of play, floor 2s
- Enemy tier probabilities:
  - First 120s (tutorial): 95% T1, 5% T2
  - Wave 1–3: 80% T1, 20% T2
  - Wave 4–7: 50% T1, 40% T2, 10% T3
  - Wave 8–10: 20% T1, 50% T2, 30% T3

---

## Combo System (SETTLED — two parallel systems)

**Kill combo** (game.js): consecutive enemy kills → milestone bonuses at 5/10/20.  
Decay: 4s of no input resets to 0.

**Chord family combo** (prompts.js, guitar mode only):  
- Minor family: Em, Am  
- Major family: G, C, D, E  
- Same family as previous → combo++; different family → combo = 0

---

## Calibration (SETTLED)
- "Tune Up" screen: play any open chord to set noise floor
- Noise floor stored in `state.audio.noiseFloor`
- Practice mode skips calibration (mic optional)
- Calibration state preserved across restarts (not reset in startGame)

---

## Settings (SETTLED — persisted to localStorage via SettingsUI)

| Field | Default | Type |
|-------|---------|------|
| `difficulty` | `'medium'` | `'easy'\|'medium'\|'hard'` |
| `showNoteLabels` | `false` | boolean |
| `audioThreshold` | 50 | 0–100 |
| `masterVolume` | 80 | 0–100 |
| `showChordCues` | `true` | boolean |
| `cueDisplayStyle` | `'note'` | `'note'\|'qwerty'\|'staff'` |
| `instrument` | `'piano'` | `'piano'\|'guitar'\|'voice'` |

---

## Prompt System (guitar mode, SETTLED)
Prompt cycle (increasing difficulty): `Em → Am → E → G → C → D` (repeats)  
Advances one step after each detected chord above confidence threshold.  
**Note:** In keyboard/piano mode, spawning is handled entirely by the tablature summon system — `PromptManager` only advances the chord cue and tracks combo; it does NOT directly trigger unit spawns.

---

## Scene State Machine (SETTLED)
`TITLE → CALIBRATION → PLAYING → VICTORY | DEFEAT → TITLE`  
- TITLE: instrument select, settings gear, start/practice buttons
- CALIBRATION: mic capture, noise floor measurement, waveform display
- PLAYING: full game loop
- VICTORY / DEFEAT: stats + replay/menu buttons
- Settings panel closes on any scene change away from TITLE

---

## Coding Conventions
- One file = one responsibility, single class/module export
- ES module import/export (never require)
- No build tools
- `game.js` owns ALL mutable state; subsystems receive state reference, never hold it
- `renderer.js` only draws (pure output — never mutates state)
- JSDoc on all exports
- No allocations in update() hot paths (pre-allocate, reuse in-place)
- rAF game loop (never setInterval)
- High-DPI canvas: all draw calls use logical pixels; context pre-scaled by dpr
- Graceful error handling (mic permission denial, iOS AudioContext gesture)
- Flag cross-device/browser gotchas proactively

---

## Development Phases — Current Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 — Scaffold | ✅ Complete | index.html, game.js, renderer.js, style.css deployed |
| Phase 1A — Audio engine | ✅ Complete | Chromagram + cosine-similarity detection (NOT YIN), calibration screen |
| Phase 1B — Game core | ✅ Complete | Enemies, lanes, waves, combat, HUD, bases, resources |
| Phase 1C — Integration | 🔄 **Late / Nearly complete** | Tablature summon, attack sequences, unit roles, swarm mechanic, instrument select, settings, prompt cycling |
| **Phase 1D — Polish** | ⏭ **Next** | Tutorial, balance tuning, end-screen stats, shareable URL, production domain |
| Phase 2A — MIDI + content | ⬜ Planned | midi.js, barre chords, second map |
| Phase 2B — Firebase | ⬜ Planned | Auth, leaderboards, player profiles |
| Phase 2C — Payments | ⬜ Planned | Gumroad/Stripe, feature gating |
| Phase 3 — PvP | ⬜ Planned | WebSocket multiplayer, Elo, 3-lane MOBA |
| Phase 4 — Native | ⬜ Planned | Capacitor iOS/Android wrap |

---

## What Remains for Phase 1D (immediate next work)

- End-screen stats display (score, waves survived, accuracy, kill count, chord breakdown)
- Tutorial overlay / first-time onboarding (explain piano keys, resource system, modes)
- Difficulty balance pass (test wave curve, resource earn rates, spawn timing)
- Victory condition polish (3-star rating based on base HP remaining?)
- Shareable score URL / Open Graph meta tags
- Production domain verification (chordwars.com)
- Performance audit on mid-range Android Chrome (target 30+ FPS)
- Any remaining audio edge cases (iOS Safari AudioContext resume)

---

## Current Phase: **Late Phase 1C → entering Phase 1D**
