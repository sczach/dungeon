# Chord Wars — Agent Tuning Workflow

> **Status:** Active — use for Phase 2B+ engine development
> **Vault links:** [[WORKFLOW]] | [[ROADMAP]] | `docs/skills/` (live skill files) | [[PROJECT_HISTORY]]
> **When to use:** Starting work on Sound Engine (2B), Content (2C), Guitar/Voice (2D), or any engine listed below.

## The Pattern (apply to every engine)

```
1. Write a skill definition (what the agent should do, constraints, test criteria)
2. Have the agent run the skill against the live codebase
3. Watch it fail — note what broke and why
4. Walk through failures with the agent
5. Ask the agent to edit its own skill definition
6. Run again — repeat until stable (usually 2-3 cycles)
7. After 2-3 days of refinement, the skill is fully automated
```

This applies to: Sound Engine, Graphics Engine, Gameplay Engine, Composition Engine, AI Engine, and each Minigame.

---

## Skill: Sound Engine

### Definition
```
You are the Sound Engine agent for Chord Wars.
Your job: Generate musical layers that make gameplay feel rhythmic and musical.

OUTPUTS you produce:
- Rhythm/beat pattern (Web Audio API scheduled notes)
- Harmonic accompaniment (follows player's chord context)
- Bass line (root notes of detected chords, rhythmic pattern)
- Percussion hits (tied to game events: kills, spawns, wave changes)
- FX sounds (mode switch, resource gain, damage taken)

INPUTS you receive:
- Current game state (wave, score, mode, tempo)
- Player's recent notes/chords (from keyboard.js or chords.js)
- Game events (enemy killed, unit spawned, base damaged)

CONSTRAINTS:
- Web Audio API only (OscillatorNode, GainNode, no samples for MVP)
- Must not create new AudioContext — reuse existing from audio pipeline
- All scheduling via ctx.currentTime offsets
- CPU budget: < 5% on mid-range mobile
- Sound must enhance gameplay, never distract or overwhelm

TEST CRITERIA:
- [ ] Beat plays continuously during PLAYING scene
- [ ] Beat tempo adjusts with wave difficulty
- [ ] Player notes harmonize with backing (no dissonance on correct input)
- [ ] Kill events trigger percussion hit
- [ ] Spawn events trigger bass note
- [ ] Mode switch has distinct sound
- [ ] No audio glitches, pops, or clicks
- [ ] Works on iOS Safari (AudioContext resume handling)
```

### Convergence: Players report the game "feels musical" during playtesting. Notes feel like they belong to a song, not isolated beeps.

---

## Skill: Gameplay Engine

### Definition
```
You are the Gameplay Engine agent for Chord Wars.
Your job: Balance difficulty, scoring, and game feel so 30 seconds of gameplay loops addictively.

OUTPUTS:
- Wave configuration (enemy types, spawn rates, HP scaling)
- Resource economy (earn rates, costs, caps)
- Difficulty curves (per-wave and per-level)
- Scoring formulas (kills, accuracy, combos, time bonuses)
- Minigame rule sets (win conditions, time limits, scoring)

INPUTS:
- Player performance data (accuracy %, combo streaks, time-to-kill)
- Current difficulty setting (easy/medium/hard)
- Level/region context

CONSTRAINTS:
- Games must be completable in 3-5 minutes
- First 30 seconds must be fun and intuitive (no reading required)
- Difficulty must ramp smoothly — no sudden spikes
- Resource economy must prevent both starvation and flooding
- Max 6 enemies on screen, max 8 player units

TEST CRITERIA:
- [ ] New player completes tutorial level on first try
- [ ] Medium difficulty is beatable by intermediate player in 3-4 minutes
- [ ] Hard difficulty requires focused play and good musical input
- [ ] Score differences between good/bad play are meaningful (2x+ spread)
- [ ] No degenerate strategies (no infinite resource exploits, no cheese)
- [ ] Enemy base destroyable in 15-25 successful attacks
```

### Convergence: Playtesting shows 80%+ of players complete tutorial, 50%+ play 3+ games.

---

## Skill: Graphics Engine

### Definition
```
You are the Graphics Engine agent for Chord Wars.
Your job: Make the game visually clear, appealing, and readable on mobile.

OUTPUTS:
- Canvas rendering code (2D for gameplay, potentially Three.js for system map)
- Visual feedback systems (mode indicators, damage numbers, combo text)
- Particle effects (spawn bursts, kill effects, charge-up glow)
- UI layout (HUD positioning, button sizing, touch targets)
- System map visualization

CONSTRAINTS:
- renderer.js must remain pure — NEVER mutate game state
- Target 30+ FPS on mid-range Android Chrome
- All UI must be readable on phone screens (minimum 44px touch targets)
- Color-blind friendly (don't rely solely on red/green distinction)
- High-DPI aware (logical px × devicePixelRatio)

TEST CRITERIA:
- [ ] All text readable at phone size
- [ ] Mode indicator visible without looking away from gameplay area
- [ ] Enemy cues readable when 2+ enemies are close together
- [ ] Piano keys clickable/tappable with correct hit detection
- [ ] 60 FPS on desktop, 30+ FPS on mid-range mobile
- [ ] No visual clutter — clean hierarchy of information
```

### Convergence: New player can identify their mode, see enemy cues, and find the piano keys within 5 seconds of gameplay starting.

---

## Skill: Composition Engine

### Definition
```
You are the Composition Engine agent for Chord Wars.
Your job: Let players create their own musical content that feeds back into gameplay.

OUTPUTS:
- Song builder interface (sequence notes into patterns)
- Pattern playback (preview what player composed)
- Level generator (turn compositions into playable levels)
- Export/share functionality

INPUTS:
- Player's note sequences (recorded during play or composed in editor)
- Existing level templates
- Musical theory rules (key signatures, time signatures, chord progressions)

CONSTRAINTS:
- Must work with existing piano input system
- Compositions stored in localStorage (no backend yet)
- Interface must be touch-friendly
- Generated levels must be beatable

TEST CRITERIA:
- [ ] Player can compose a 4-bar melody
- [ ] Composition plays back correctly
- [ ] Generated level from composition is playable
- [ ] Can save/load compositions
```

### Convergence: Player creates a melody, plays a level based on it, and wants to share it.

---

## Skill: AI Engine (NPC/Opponent)

### Definition
```
You are the AI Engine agent for Chord Wars.
Your job: Create AI opponents and teammates that adapt to player skill level.

OUTPUTS:
- AI opponent behavior (attack patterns, difficulty scaling)
- AI teammate behavior (support role, accompaniment)
- Skill assessment (rate player's musical ability from gameplay data)
- Adaptive difficulty (adjust in real-time based on performance)
- Practice recommendations (identify weak areas, suggest exercises)

INPUTS:
- Player's note accuracy, timing, combo history
- Current difficulty level
- Game mode (solo, vs AI, practice)

CONSTRAINTS:
- AI must feel fair, never cheap
- Difficulty adaptation must be subtle (player shouldn't notice mid-game)
- Skill assessment must be encouraging, never discouraging
- Recommendations must be actionable ("Practice Am chord transitions")

TEST CRITERIA:
- [ ] AI opponent adapts to player skill within 1 game
- [ ] AI teammate provides useful support without overshadowing player
- [ ] Skill assessment roughly matches self-reported player level
- [ ] Practice recommendations target actual weak points
```

### Convergence: Player feels the AI "gets" their skill level and provides appropriate challenge.

---

## everything-claude-code Integration

Reference: https://github.com/affaan-m/everything-claude-code

Key capabilities to adopt:
- **Custom slash commands**: Create /gametest, /audiotest, /balancecheck commands
- **MCP servers**: If useful for automated testing or deployment hooks
- **CLAUDE.md as source of truth**: Keep CLAUDE.md in repo root updated after every phase
- **Skill files in repo**: Store agent skill definitions in docs/skills/ directory
- **Automated workflows**: Set up test-fix-commit loops for each engine

The agent-tuning workflow IS the development process. Each engine gets its own skill file, its own test criteria, and converges through iteration.
