# ChordWars File Reference

> Every source file: line count, exports, purpose. One-line summaries for quick lookup.

## Root Files

| File | Lines | Purpose |
|------|-------|---------|
| index.html | 179 | Single-page app shell, all `<section>` screens, error boundary |
| style.css | 773 | Layout, `body[data-scene]` visibility rules, responsive breakpoints |
| CLAUDE.md | — | Project instructions for AI sessions |
| README.md | — | Project readme |

## src/ Core

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| game.js | 1724 | `SCENE` (re-export) | rAF loop, state machine, ALL mutable state, scene transitions |
| renderer.js | 1953 | `Renderer` | Pure canvas draw, per-scene render methods, visual effects |
| constants.js | 62 | `SCENE`, layout constants | Scene enum + canvas fraction constants, breaks circular import |

## src/audio/

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| index.js | 343 | `startCapture`, `updateAudio`, `updateCalibration`, `stopCapture`, `resumeAudioContext` | Audio pipeline orchestrator |
| analyzer.js | 169 | `FFT_SIZE`, `createAnalyzer`, `readTimeDomain`, `readFrequencyDomain`, `computeRMS`, `isAboveNoiseGate`, `updateNoiseFloorEMA` | FFT analysis, RMS, noise gate |
| capture.js | 133 | `initCapture`, `unlockAudioContext`, `stopCapture`, `getAudioContext` | getUserMedia, AudioContext lifecycle |
| chords.js | 176 | `CHORD_LABELS`, `buildChromagram`, `matchChord` | Chromagram + cosine-similarity chord matching |
| pitch.js | 154 | `detectPitch`, `freqToNoteName`, `freqToPitchClass` | YIN pitch detection (60–1050 Hz) |
| melodyEngine.js | 401 | `generateMelody`, `playMelody`, `stopMelody`, `NOTE_FREQ` | Procedural melody generation + Web Audio playback |
| soundEngine.js | 562 | `startSoundEngine`, `stopSoundEngine`, `syncSoundEngine`, `onGameEvent` | Beat/bass generator + event SFX |

## src/entities/

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| unit.js | 572 | `Unit` | Player units (4 archetypes) + enemy units (3 tiers), AI behavior |
| enemy.js | 88 | `Enemy` | Path-following enemy, lifecycle flags |

## src/systems/

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| tablature.js | 255 | `TablatureSystem` | 3-note summon bar, combo tracking, scoring |
| attackSequence.js | 474 | `AttackSequenceSystem` | Per-enemy note sequences, direct attack, charged attack |
| cueSystem.js | 141 | `CueSystem` | Timed note cues, resource rewards |
| combat.js | 29 | `updateCombat` | Unit update loop + dead unit splice |
| waves.js | 147 | `WAVES`, `WaveManager` | 10-wave difficulty curve, enemy spawning |
| progression.js | 270 | `loadProgress`, `saveProgress`, `awardStars`, `totalStars`, `totalStarsEarned`, `purchaseSkill`, `applySkills`, `skillState`, `skillsByTier` | localStorage persistence, star/skill management |
| prompts.js | 184 | `PromptManager` | Chord prompt cycling (guitar mode prep) |
| base.js | 42 | `Base` | HP container with vulnerability toggle |
| path.js | 118 | `CAMPFIRE_PATH`, `getPathLength`, `getPositionOnPath` | Enemy path waypoints, arc-length parameterization |

## src/input/

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| keyboard.js | 353 | `KeyboardInput`, `keyboardInput`, `playSuccessKill` | QWERTY mapping, mode cycling, charge mechanic, note routing |
| midi.js | 113 | `MidiInput`, `midiInput` | MIDI note folding to C3 octave |

## src/ui/

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| hud.js | 383 | `renderHUD`, `getModeButtonAtPoint`, `getKeyAtPoint`, `initPianoTouchInput` | In-game HUD: wave, resources, mode buttons, piano keys |
| worldMapRenderer.js | 760 | `WorldMapRenderer`, `getNodeAtPoint`, `getPlayButtonBounds`, `getResetViewButtonBounds` | Canvas spider-web world map, camera, node visuals |
| screens.js | 145 | `loadSettings`, `saveSettings`, `wireSettingsUI`, `DIFFICULTIES` | Legacy settings overlay at TITLE |
| settings.js | 475 | `SettingsUI` | Full settings panel (audio, display, difficulty) |
| levelselect.js | 307 | `LevelSelectUI` | Level cards + skill tree purchase UI |
| instrumentselect.js | 145 | `InstrumentSelectUI` | Piano/Guitar/Voice selector |

## src/data/

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| levels.js | 150 | `LEVELS`, `LEVELS_BY_ID`, `computeStars`, `isLevelUnlocked` | 3 level configs + star thresholds |
| worldMap.js | 563 | `REGIONS`, `WORLD_MAP_NODES`, `WORLD_MAP_NODES_BY_ID`, `TUTORIAL_SEQUENCE`, `isNodeUnlocked` | 29 world map nodes, 6 regions, unlock logic |
| skills.js | 204 | `SKILLS`, `SKILLS_BY_ID` | 9 skills across 3 tiers, effect functions |
| lessons.js | 183 | `LESSONS`, `LESSONS_BY_LEVEL_ID`, `applyLesson`, `evaluateLesson` | Per-level music lesson configs |
| chords.js | 27 | `CHORD_DATA`, `CHORD_FALLBACK` | Guitar chord tab data |

## docs/

| File | Purpose |
|------|---------|
| docs/context/INDEX.md | Master documentation index |
| docs/context/ARCHITECTURE.md | System architecture overview |
| docs/context/STATE.md | State machine + state object reference |
| docs/context/AUDIO_PIPELINE.md | Audio system documentation |
| docs/context/INPUT_SYSTEM.md | Input system documentation |
| docs/context/RENDERING.md | Rendering system documentation |
| docs/context/GAME_SYSTEMS.md | Game systems documentation |
| docs/context/DATA_MODELS.md | Data model documentation |
| docs/context/SETUP.md | Setup and development guide |
| docs/context/FILE_REFERENCE.md | This file |
| docs/context/DEPENDENCY_MAP.md | Import/export graph |
| docs/context/DECISIONS.md | Architectural decisions and rationale |
| docs/skills/SOUND_ENGINE.md | Audio constraints |
| docs/skills/GAMEPLAY_ENGINE.md | Balance rules |
| docs/skills/GRAPHICS_ENGINE.md | Rendering rules |
| docs/skills/COMPOSITION_ENGINE.md | Melody constraints |
| docs/skills/AI_ENGINE.md | Enemy AI rules |

## .claude/

| File | Purpose |
|------|---------|
| .claude/commands/gametest.md | `/gametest` gameplay test checklist |
| .claude/commands/audiotest.md | `/audiotest` audio pipeline test |
| .claude/commands/balancecheck.md | `/balancecheck` balance evaluation |

## Total Line Count

~11,500 lines of JavaScript across 27 source files.
