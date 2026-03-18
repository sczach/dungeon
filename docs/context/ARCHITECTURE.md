# ChordWars Architecture

> Music education RTS. Vanilla JS, HTML Canvas, Web Audio API. No build step, no dependencies.
> Live: https://chordwars.vercel.app

## Core Design Principle

> The instrument is the ONLY controller. Every game action maps to a musical action.
> Playing music well = playing the game well. There is no other way to play.

## Tech Stack

- **Language:** Vanilla JavaScript (ES modules, `import`/`export` only — no `require`, no bundler)
- **Rendering:** HTML5 Canvas (2D context, DPR-scaled)
- **Audio:** Web Audio API (mic input, pitch detection, oscillator playback)
- **UI Overlays:** HTML sections toggled via `body[data-scene]` CSS selectors
- **Persistence:** localStorage (progression, settings)
- **Hosting:** Vercel (static deploy, no server)

## Ownership Model

```
game.js ─── owns ALL mutable state
        ─── runs rAF loop (update → draw)
        ─── imports everything
        ─── scene state machine

renderer.js ─── pure read-only output
            ─── never mutates state
            ─── delegates to HUD + WorldMapRenderer

constants.js ─── SCENE enum + layout geometry
             ─── exists to break circular imports
```

**Rule:** Subsystems receive `state` by reference. They read and write fields on it.
They never hold their own copy. `game.js` is the single source of truth.

## Module Layout

```
src/
├── game.js              ← entry point, state machine, rAF loop
├── renderer.js          ← pure canvas draw
├── constants.js         ← SCENE enum, layout fractions
├── audio/               ← mic → pitch → chord pipeline + sound effects
│   ├── index.js         ← orchestrator (startCapture, updateAudio)
│   ├── analyzer.js      ← FFT, RMS, noise gate
│   ├── capture.js       ← getUserMedia, AudioContext
│   ├── chords.js        ← chromagram, cosine-similarity chord match
│   ├── pitch.js         ← YIN algorithm pitch detection
│   ├── melodyEngine.js  ← procedural melody generation + playback
│   └── soundEngine.js   ← beat/bass generator + event SFX
├── entities/
│   ├── unit.js          ← Unit class (player archetypes + enemy tiers)
│   └── enemy.js         ← Enemy class (path follower)
├── systems/
│   ├── tablature.js     ← 3-note summon bar mechanic
│   ├── attackSequence.js ← per-enemy note sequences + charged attacks
│   ├── cueSystem.js     ← timed note cues + rewards
│   ├── combat.js        ← unit update loop
│   ├── waves.js         ← wave spawning + difficulty curve
│   ├── progression.js   ← localStorage save/load, skill application
│   ├── prompts.js       ← chord prompt cycling (guitar mode prep)
│   ├── base.js          ← Base class (HP, vulnerability)
│   └── path.js          ← enemy path waypoints
├── input/
│   ├── keyboard.js      ← QWERTY key mapping, mode cycling, charge
│   └── midi.js          ← MIDI input, note folding to C3 octave
├── ui/
│   ├── hud.js           ← in-game HUD (wave, resources, piano keys)
│   ├── worldMapRenderer.js ← canvas spider-web world map
│   ├── screens.js       ← legacy settings overlay
│   ├── settings.js      ← full settings panel
│   ├── levelselect.js   ← level cards + skill tree
│   └── instrumentselect.js ← Piano/Guitar/Voice selector
└── data/
    ├── levels.js        ← 3 level configs + star thresholds
    ├── worldMap.js      ← 29 world map nodes + regions
    ├── skills.js        ← 9 skills across 3 tiers
    ├── lessons.js       ← per-level music lesson configs
    └── chords.js        ← guitar chord tab data
```

## Scene Flow

```
TITLE
  ↓ Play
INSTRUMENT_SELECT          ← choose Piano (Guitar/Voice coming soon)
  ↓ Continue
  ├─ First play (!tutorialComplete):
  │    LEVEL_START(T1) → PLAYING → LEVEL_START(T2) → … → PLAYING(T4)
  │                                                         ↓
  │                                                    WORLD_MAP
  │
  └─ Returning player (tutorialComplete):
       WORLD_MAP → LEVEL_START → CALIBRATION? → PLAYING
                                                   ↓
                                            VICTORY | DEFEAT
                                                   ↓
                                              WORLD_MAP
```

## Data Flow (per frame during PLAYING)

```
1. Mic → AnalyserNode → timeDomain + freqDomain
2. timeDomain → RMS → noiseGate
3. freqDomain → YIN pitch → noteName
4. freqDomain → chromagram → matchChord → detectedChord
5. Keyboard/Touch → dispatchNote → _handleNote
6. _handleNote → tablature.onNote (summon) OR attackSeq.onNote (attack)
7. tablature completion → pendingSpawn → spawnPlayerUnit
8. game.js update → combat, waves, progression, cue system
9. renderer.draw(state) → canvas output
```

## Key Constraints

- **No circular imports** — Safari/Vercel reject circular ES module bindings
- **No allocations in update()** — pre-allocate buffers, reuse in-place
- **renderer.js never mutates state** — read-only contract
- **No external dependencies** — everything is vanilla
- **Test Chrome AND Safari** — Web Audio API behavior differs
- **Files < 800 lines** — one file = one responsibility

## See Also

- [[STATE]] — Full state object reference
- [[DEPENDENCY_MAP]] — Import/export graph
- [[DECISIONS]] — Why things are built this way
