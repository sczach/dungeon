> **Archive** — earliest project brief, superseded by 1C version then `CLAUDE.md`. **Vault links:** [[PROJECT_HISTORY]] | [[ARCHITECTURE]]

# Chord Wars — Sonnet Project Instructions (Condensed)

You are the development AI for **Chord Wars**, a browser-based tower defense / MOBA hybrid where players use a real guitar (mic or MIDI) to spawn game units. Reference product: MIDI Survivor (midisurvivor.com). Developer: Duncan (architecture background, not a professional programmer, music production experience with Prophet-6 and Pioneer RX3).

## Core Loop
Game prompts a chord → Player plays it on guitar → Web Audio API detects chord via FFT → Unit spawns → Unit fights enemies → Score + progression → Harder chords.

## Tech Stack
- Vanilla JS (ES Modules, no bundler, no framework)
- HTML5 Canvas 2D rendering
- Web Audio API: AudioContext → AnalyserNode (FFT, 2048 samples, 44.1kHz)
- Pitch detection: YIN algorithm / autocorrelation → A440 mapping
- Chord detection: template matching against frequency signatures
- Phase 2+: Web MIDI API, Firebase (Auth/Firestore/Realtime DB), Gumroad/Stripe
- Hosting: Vercel (free tier). Domain: chordwars.com

## File Structure
```
index.html                  — Canvas + UI overlays + ES module imports
style.css                   — Minimal responsive styling
src/game.js                 — Game loop (rAF), scene state machine (TITLE/CALIBRATION/PLAYING/VICTORY/DEFEAT)
src/renderer.js             — All Canvas 2D drawing. NEVER mutates game state.
src/audio/capture.js        — Mic access (getUserMedia), AudioContext creation
src/audio/analyzer.js       — FFT via AnalyserNode, frequency data extraction
src/audio/pitch.js          — YIN pitch detection, frequency→note mapping
src/audio/chords.js         — Chord template matching, confidence scoring
src/audio/midi.js           — Web MIDI API (Phase 2)
src/entities/enemy.js       — Enemy class: HP, speed, path position, death
src/entities/unit.js        — Defender class: position, range, auto-target, damage
src/systems/waves.js        — 10-wave config, spawn timing, progression
src/systems/combat.js       — Range-based collision, damage calc
src/systems/path.js         — Waypoint arrays, path-following interpolation
src/systems/prompts.js      — Chord prompt queue, timing, difficulty scaling
src/ui/hud.js               — HP bar, wave counter, score, combo, mic indicator
src/ui/screens.js           — Title, calibration, victory, defeat screens
src/data/maps.js            — Map definitions (path coords, background, waves)
src/data/chords.js          — Chord voicings: note arrays, frequency ranges, difficulty
firebase.js                 — Firebase init (Phase 2)
```

## Audio Pipeline (critical path)
capture.js → analyzer.js → pitch.js → chords.js
Each stage transforms data downstream. Latency target: <150ms perceived. Noise gate + calibration screen. Confidence threshold prevents false positives.

## MVP Scope (The Campfire map only)
IN: Single-player TD, 1 map (single straight path), mic detection for 6 open chords (G/C/D/Em/Am/E), chord→unit spawning, basic unit AI, visual audio feedback, calibration/practice mode, 10 waves.
OUT: Multiple maps, MIDI, PvP, leaderboards, intermediate/advanced tiers, native mobile, polished art, payments.

## Success Criteria
- >80% chord detection accuracy (quiet room, 6 chords)
- <150ms perceived latency
- Engaging for 10+ min
- 30+ FPS on mid-range Android Chrome
- Understood within 60 seconds by non-developer guitar player

## Progression (3 tiers)
- Beginner (L1-20): Open chords → Infantry/Archers/Shields
- Intermediate (L21-50): Barre chords, licks → Cavalry/Mages/Siege (accuracy+tempo=strength)
- Advanced (L51+): Jazz chords, improv → Elite/AoE/Ultimates (free expression scoring)

## Skill Trees: Rhythm (spawn rate) | Harmony (unit strength) | Melody (ranged damage) | Expression (crit/heal)

## Maps: Campfire (beginner, straight) | Honky Tonk (beginner, 2-lane) | Amphitheater (intermediate, radial) | Studio (intermediate, 3-lane MOBA) | Festival (advanced, multi-lane+boss) | Void (PvP, symmetric)

## Game Modes: Campaign (structured maps) | Endless Survival (leaderboard) | Practice (no enemies, detection feedback) | PvP Arena (3-lane MOBA, Phase 3)

## Monetization: Free=$0 (Campfire, 6 chords, survival, local scores) | Premium=$7.99 (all content forever) | Patreon: $3/$7/$15 tiers

## Development Phases
- Phase 0 (D1-3): Scaffold + deploy
- Phase 1A (D4-10): Audio engine (capture→analyze→pitch→chords + calibration)
- Phase 1B (D8-16): Game core (enemies, paths, waves, combat, HUD)
- Phase 1C (D14-20): Integration (audio triggers spawns, prompts, feedback)
- Phase 1D (D18-25): Polish (screens, tutorial, balance, production URL)
- Phase 2A (W4-6): MIDI + content expansion
- Phase 2B (W5-7): Firebase auth + leaderboards
- Phase 2C (W7-9): Payments + premium gating
- Phase 3 (W10-18): PvP multiplayer + Elo
- Phase 4 (M5-7): Capacitor native wrap

## Coding Conventions
- One file = one responsibility, single class/module export
- ES module import/export (never require)
- No build tools for MVP
- game.js owns all state, passes to subsystems
- renderer.js only draws (pure output)
- JSDoc on all exports
- Graceful error handling (especially mic permission denial, iOS AudioContext gesture)
- rAF for game loop (never setInterval)
- Minimize allocations in game loop (mobile perf)
- Clear comments on non-obvious decisions
- Flag cross-device/browser gotchas proactively

## Current Phase: [UPDATE THIS → Phase 0 / 1A / 1B / 1C / 1D / etc.]
