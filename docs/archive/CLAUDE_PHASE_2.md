# Chord Wars — CLAUDE.md (Phase 2 — March 2026)

> **Current Status:** HISTORICAL — this was the source draft for the current `CLAUDE.md` in the repo root.
> **Vault links:** [[ARCHITECTURE]] | [[PROJECT_HISTORY]] | [[ROADMAP]]
> **Use instead:** Read `CLAUDE.md` in repo root for current project instructions. This file captures the Phase 2 kick-off state (12 bugs known, guitar-mode de-emphasized, Phase 2A scoped to bug fixes).

You are the development AI for **Chord Wars**, a browser-based musical RTS where players use real instruments (piano keyboard, guitar mic, eventually voice) to control gameplay. Live at: https://chordwars.vercel.app
Repo: https://github.com/sczach/chordwars  
Developer: Duncan (architecture background, not a professional programmer, music production experience with Sequential Pro 3).

---

## What Exists Right Now (Deployed)

- Two bases (player left, enemy right) with HP bars
- Units march across horizontal combat strip and fight
- QWERTY keyboard maps to piano notes (right-hand layout: H=C3, J=D3, K=E3, L=F3, ;=G3)
- Tablature bar at top prompts 3-note sequences to summon units
- Floating note sequences above enemy units for targeted kills
- Space bar toggles summon/attack mode
- Chain lightning charge-up mechanic
- Audio tone feedback on keypress (Web Audio API oscillators)
- Resource system: start 200, earn on kills, spend to summon
- Wave-based enemy spawning with tier progression
- Settings persistence via localStorage
- Victory/defeat screens with stats
- System map with tutorial levels (progression beyond tutorial is broken)
- Instrument selection on title screen (piano active, guitar/voice coming soon)
- Chromagram-based chord detection for guitar mode (cosine similarity)
- Calibration screen for mic noise floor

---

## Known Bugs & Issues (FROM PLAYTESTING — fix these first)

### Critical (blocks gameplay)
1. **System map progression broken**: After completing tutorial, can't select The Crossroads or any non-tutorial region. "Choose a region" button grayed out.
2. **Enemy base HP too high**: Each strike takes off only ~1% HP. Far too many strikes needed to destroy.
3. **Swarming enemies unreadable**: When 2+ enemies overlap, kill melody cues stack and become impossible to parse. Proximity-based targeting fails in clumps.
4. **Input confusion**: Unclear when a note registers as a kill stroke vs charge-up vs summon. Three competing input systems with no clear visual priority.

### High Priority (major friction)
5. **Victory screen blocks buttons**: "Play Again" and "World Map" can't be pressed until victory song plays. Victory song should be optional celebration, not gate.
6. **Kill tones play simultaneously**: Should play as sequential melody (stagger 0.15s per note).
7. **Mouse/touch on piano keys doesn't work**: Click/tap on rendered piano keys does nothing.
8. **Settings menu not appearing on TITLE screen**.
9. **No summon cues**: When in summon mode, no visual prompt telling player what to play.

### Design Issues (gameplay feel)
10. **Gameplay not rhythmic enough**: Game should create rhythm/beats player plays along with. Musical interaction should feel like making music, not just pressing correct buttons.
11. **Attack timer cue conflicts with kill cues**: Side-panel attack timer and enemy-unit kill cues compete for attention.
12. **Relationship between attack/charge-up/summon not intuitive**: Needs clearer mode separation with distinct visual language.

---

## Tech Stack

- Vanilla JS (ES Modules, no bundler, no framework)
- HTML5 Canvas 2D rendering (high-DPI aware)
- Web Audio API: AudioContext → AnalyserNode (FFT, 2048 samples, 44.1kHz)
- Chord detection: chromagram-based cosine similarity (NOT YIN pitch)
- Hosting: Vercel (auto-deploys on merge to master)
- No Firebase yet

---

## Core Architecture Rules

- `game.js` owns ALL mutable state; subsystems receive state reference
- `renderer.js` ONLY draws — never mutates state
- ES module import/export only (never require)
- No build tools or bundlers
- rAF game loop (never setInterval)
- Pre-allocate buffers, no allocations in update() hot paths
- JSDoc on all exports
- Handle iOS Safari AudioContext gesture requirement
- SCENE constants live in `src/constants.js` (prevents circular import bugs)

---

## Git Workflow (CRITICAL — obey exactly)

- **Always create a branch and open a PR. Never push directly to master.**
- Branch naming: `claude/[short-kebab-description]`
- Duncan reviews and merges PRs via GitHub mobile app
- Vercel auto-deploys on merge to master

---

## File Structure (current)

```
index.html                        — Canvas + UI overlays + ES module imports
style.css                         — Responsive styling
src/game.js                       — Game loop (rAF), scene state machine, ALL mutable state
src/renderer.js                   — All Canvas 2D drawing. NEVER mutates state.
src/constants.js                  — SCENE enum, LANE_Y, LANE_HEIGHT, BASE_WIDTH, etc.
src/audio/index.js                — Audio pipeline entry: startCapture(), updateAudio()
src/audio/chords.js               — Chromagram + cosine-similarity chord matcher
src/entities/unit.js              — Unit class: team, tier, role, hp, damage, speed, range
src/systems/base.js               — Base class: player/enemy base HP, destruction state
src/systems/tablature.js          — 3-note summon sequence system
src/systems/attackSequence.js     — Attack sequence system for enemy units
src/systems/prompts.js            — PromptManager: chord cue cycling (guitar mode)
src/input/keyboard.js             — Piano key input: note dispatch, tone playback
src/ui/hud.js                     — HUD rendering + initPianoTouchInput
src/ui/settings.js                — SettingsUI: localStorage persistence
src/data/chords.js                — CHORD_DATA: tab notation + difficulty
```

---

## Development Phases — Revised Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| Phase 0 — Scaffold | ✅ Done | |
| Phase 1A — Audio engine | ✅ Done | Chromagram detection, calibration |
| Phase 1B — Game core | ✅ Done | Entities, lanes, waves, combat, HUD |
| Phase 1C — Integration | ✅ Done | Tablature summon, attack sequences, modes |
| **Phase 2A — Bug Crush & Core Polish** | 🔄 **NOW** | Fix all 12 known issues above, 30s of solid gameplay |
| Phase 2B — Sound Engine | ⏭ Next | Rhythm generation, accompaniment, musical feel |
| Phase 2C — System Map & Progression | ⏭ Next | Fix map navigation, add regions, composition levels |
| Phase 2D — Minigame Framework | ⬜ Planned | Guitar-hero modes, arpeggio challenges, metronome |
| Phase 2E — Graphics Engine | ⬜ Planned | Three.js for system map, improved gameplay visuals |
| Phase 3A — AI Engine | ⬜ Planned | NPC band AI, skill assessment, adaptive difficulty |
| Phase 3B — Multiplayer | ⬜ Planned | PvP, team-based, ranked, leaderboards |
| Phase 3C — Composition Engine | ⬜ Planned | Player songwriting, custom levels |
| Phase 4 — Launch Polish | ⬜ Planned | Monetization, marketing, app store |

---

## Current Phase: **Phase 2A — Bug Crush & Core Polish**

### Goal: 30 seconds of solid, addictive, intuitive gameplay that loops.

Priority order:
1. Fix system map progression (unblock level selection)
2. Reduce enemy base HP (make games completable in 3-5 minutes)
3. Fix swarm readability (visual separation, queue-based targeting)
4. Clarify input modes (distinct visual language per mode)
5. Fix victory screen button blocking
6. Fix kill melody sequencing
7. Wire mouse/touch piano input
8. Show settings menu on TITLE
9. Add summon cue prompts
10. Begin rhythmic gameplay elements

---

## Sound Engine Vision (Phase 2B)

The game should generate layers of music the player contributes to:
- **Rhythm/Beat**: Game provides a rhythmic backbone player syncs with
- **Harmony**: Player's chords/notes layer on top of generated accompaniment
- **Lead**: Player melodies become the lead voice
- **Bass**: Auto-generated bass following player's harmonic context
- **Percussion**: Tied to game events (kills, spawns, wave transitions)
- **FX**: Musical feedback for all game actions

---

## Minigame Vision (Phase 2D)

Mario Party 6-inspired variety — many short musical games, all scored:
- Tower defense (current core game)
- Wave defense
- Arpeggio/scale speed challenges (meter builds, screen shakes)
- Metronome accuracy training
- Band competition (outplay AI opponents)
- AI teammate training (teach your support player)
- Rhythm matching
- Practice mode: 5/15/30/45 minute sessions with mixed minigames

All minigames should intuitively teach musical skills while being competitive and fun.

---

## Multiplayer Vision (Phase 3B)

- 1v1, 2v1, 3v1, 2v2 formats
- Ranked with ELO leaderboard
- Plays to each player's skill level
- AI band members as support
- Personalized practice/growth summaries alongside skill tracking
