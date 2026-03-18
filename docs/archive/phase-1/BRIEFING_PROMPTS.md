> **Archive** — superseded by `BRIEFING_PROMPTS_V2.md`. **Vault links:** [[PROJECT_HISTORY]] | [[WORKFLOW]]

# Chord Wars — Briefing Prompts for Sonnet

## Standard Briefing (paste at start of each conversation)
```
Working on: [FILE_NAME]
Phase: [0 / 1A / 1B / 1C / 1D / 2A / 2B / 2C / 3]
This file does: [one sentence]
Depends on: [list files]
Need: [what to build / fix / change]

[PASTE DEPENDENCY CODE BELOW]
```

## Quick-Start Prompts by Phase

### Phase 0 — Scaffold
```
Working on: index.html + src/game.js + src/renderer.js + style.css
Phase: 0
Need: Full project scaffold. index.html with fullscreen Canvas + overlay div + ES module imports. game.js with rAF loop + scene state machine (TITLE/CALIBRATION/PLAYING/VICTORY/DEFEAT) + delta time. renderer.js with Renderer class (clear, draw per scene). style.css for fullscreen no-scrollbar layout. All ready to deploy to Vercel.
```

### Phase 1A — Audio Capture
```
Working on: src/audio/capture.js
Phase: 1A
This file does: Access mic via Web Audio API, create AudioContext + AnalyserNode
Depends on: nothing (pipeline entry point)
Need: Capture class with start()/stop(), getUserMedia, AudioContext at 44100Hz, AnalyserNode fftSize=2048. Handle permission denial gracefully. Handle iOS Safari user-gesture AudioContext requirement. Export AnalyserNode ref for analyzer.js.
```

### Phase 1A — FFT Analyzer
```
Working on: src/audio/analyzer.js
Phase: 1A
This file does: Read FFT data from AnalyserNode, provide frequency + time-domain buffers
Depends on: src/audio/capture.js
Need: Analyzer class that takes an AnalyserNode ref, provides getTimeDomainData() and getFrequencyData() methods returning Float32Arrays. Pre-allocate buffers (avoid GC in game loop). Include method to compute RMS volume for noise gate.

[PASTE capture.js CODE]
```

### Phase 1A — Pitch Detection
```
Working on: src/audio/pitch.js
Phase: 1A
This file does: YIN algorithm for fundamental frequency detection, maps to musical notes
Depends on: src/audio/analyzer.js
Need: PitchDetector class. Takes Float32Array time-domain data. Returns {frequency, note, octave, confidence} or null. A440 reference. Optimized for ~20 calls/sec. Clear comments explaining YIN steps (difference function, cumulative mean, absolute threshold, parabolic interpolation).

[PASTE analyzer.js CODE]
```

### Phase 1A — Chord Detection
```
Working on: src/audio/chords.js + src/data/chords.js
Phase: 1A
This file does: Match detected notes against chord templates, return chord name + confidence
Depends on: src/audio/pitch.js, src/data/chords.js
Need: ChordDetector class with ~200ms rolling note buffer. Template matching for G/C/D/Em/Am/E. Return {chord, confidence, notes[]}. Configurable threshold (default 0.6). 150ms debounce. Also generate src/data/chords.js with chord definitions (note names + frequency ranges for standard tuning).

[PASTE pitch.js CODE]
```

### Phase 1B — Enemy System
```
Working on: src/entities/enemy.js
Phase: 1B
This file does: Enemy class with HP, path following, death state
Depends on: src/systems/path.js
Need: Enemy class: constructor(type, path), update(dt) for path interpolation, takeDamage(amount), isDead(). Types: Grunt (100hp/speed1), Runner (60hp/speed2), Tank (250hp/speed0.5). Path following via waypoint interpolation. Export class.

[PASTE path.js CODE IF AVAILABLE, or note it doesn't exist yet]
```

### Phase 1B — Defender Units
```
Working on: src/entities/unit.js
Phase: 1B
This file does: Defender unit with auto-targeting and attack
Depends on: src/entities/enemy.js
Need: Unit class: constructor(type, x, y), update(dt, enemies[]) for target selection + attack cooldown. Types mapped to chords: G→Shield, C→Archer, D→Swordsman, Em→Mage, Am→Healer, E→Lancer. Each has different range/damage/attackSpeed stats. Auto-target nearest enemy in range.

[PASTE enemy.js CODE]
```

### Phase 1C — Integration
```
Working on: src/systems/prompts.js + game.js integration
Phase: 1C
This file does: Chord prompt queue that tells player what to play, triggers unit spawn on detection
Depends on: src/audio/chords.js, src/entities/unit.js, src/game.js
Need: PromptSystem class that queues chord prompts based on wave needs. When chords.js fires a detected chord matching the prompt, spawn the corresponding unit at a placement position. Visual feedback: chord burst effect. Combo tracking for consecutive correct chords.

[PASTE chords.js, unit.js, game.js CODE]
```

### Phase 1D — Screens & Polish
```
Working on: src/ui/screens.js
Phase: 1D
This file does: All non-gameplay screens (title, calibration, victory, defeat)
Depends on: src/renderer.js, src/game.js
Need: Screen rendering functions for each state. Title: logo + "Play" button. Calibration: waveform display, detected chord, 6-chord grid, noise indicator, "Ready" button. Victory: stars, stats (score/accuracy/enemies/combo/time), next/retry buttons. Defeat: tip about weakest chord, stats, retry/practice buttons. All drawn on Canvas.

[PASTE renderer.js, game.js CODE]
```
