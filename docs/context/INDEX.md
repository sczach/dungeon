# ChordWars Documentation Index

> **Purpose:** Selective context loading for AI sessions. Load only what you need.

## Quick-Load Guide

| If you're doing... | Load these files |
|---------------------|-----------------|
| Bug fix in audio | [[AUDIO_PIPELINE]], [[STATE]] |
| Bug fix in gameplay | [[GAME_SYSTEMS]], [[STATE]] |
| UI/rendering work | [[RENDERING]], [[STATE]] |
| New level or content | [[DATA_MODELS]], [[GAME_SYSTEMS]] |
| Input handling | [[INPUT_SYSTEM]], [[STATE]] |
| Architecture decisions | [[ARCHITECTURE]], [[DECISIONS]] |
| First time on project | [[ARCHITECTURE]], [[SETUP]] |
| Full context dump | All files below |

## Documentation Files

### Core Architecture
- **[[ARCHITECTURE]]** — System overview, ownership model, scene flow, module boundaries
- **[[STATE]]** — Complete state object reference, scene state machine, state ownership rules
- **[[DEPENDENCY_MAP]]** — Import/export graph, module relationships, dependency chains

### Subsystem Deep-Dives
- **[[AUDIO_PIPELINE]]** — Mic capture, pitch detection, chord matching, sound engine, melody
- **[[INPUT_SYSTEM]]** — Keyboard mapping, MIDI, touch/click piano, mode cycling, charge mechanic
- **[[RENDERING]]** — Renderer architecture, HUD, world map, per-scene draw methods, visual constants
- **[[GAME_SYSTEMS]]** — Combat, waves, tablature, attack sequences, progression, cue system

### Data & Config
- **[[DATA_MODELS]]** — Levels, world map nodes, skills, lessons, chord data
- **[[SETUP]]** — Installation, local dev, deployment, browser requirements

### Reference
- **[[FILE_REFERENCE]]** — Every file: line count, exports, imports, purpose (one-line each)
- **[[DECISIONS]]** — Why things are the way they are: architectural choices and rationale

### Engine Skills (existing)
- `docs/skills/SOUND_ENGINE.md` — Audio constraints and settled parameters
- `docs/skills/GAMEPLAY_ENGINE.md` — Balance, scoring, difficulty rules
- `docs/skills/GRAPHICS_ENGINE.md` — Rendering rules and performance budget
- `docs/skills/COMPOSITION_ENGINE.md` — Melody generation constraints
- `docs/skills/AI_ENGINE.md` — Enemy behavior and wave design rules

## How to Use This

**For AI agents:** Reference `docs/context/INDEX.md` at session start. Load only the files listed for your task type. Each file is self-contained with cross-references.

**For humans:** Open in Obsidian or any markdown viewer. Links use `[[wikilink]]` format for Obsidian compatibility.

**Updating:** When code changes, update the relevant context file. Run `/update-docs` to trigger doc refresh.
