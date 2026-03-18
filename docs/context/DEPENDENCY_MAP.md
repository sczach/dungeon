# ChordWars Dependency Map

> Import/export graph. No circular dependencies allowed (Safari/Vercel reject them).

## Dependency Graph

```
                         ┌─────────────┐
                         │   game.js   │ ← imports EVERYTHING
                         │ (entry point)│
                         └──────┬──────┘
                                │
          ┌─────────┬───────────┼───────────┬──────────┐
          ▼         ▼           ▼           ▼          ▼
    ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │renderer  │ │ audio/ │ │systems/│ │  ui/   │ │ data/  │
    │  .js     │ │index.js│ │  (all) │ │  (all) │ │  (all) │
    └────┬─────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────────┘
         │           │          │           │
         ▼           ▼          ▼           ▼
    constants.js  capture.js  (mostly    worldMap.js
    hud.js        analyzer.js  standalone) levels.js
    worldMap      pitch.js                 skills.js
    Renderer.js   chords.js
```

## Leaf Modules (no imports)

These files import nothing from the project:
- `src/audio/analyzer.js`
- `src/audio/capture.js`
- `src/audio/chords.js`
- `src/audio/pitch.js`
- `src/audio/melodyEngine.js`
- `src/entities/enemy.js` (no project imports, just uses path.js at runtime)
- `src/systems/base.js`
- `src/systems/combat.js`
- `src/systems/tablature.js`
- `src/systems/attackSequence.js`
- `src/systems/cueSystem.js`
- `src/systems/path.js`
- `src/input/midi.js`
- `src/ui/hud.js`
- `src/ui/screens.js`
- `src/ui/settings.js`
- `src/ui/instrumentselect.js`
- `src/data/chords.js`
- `src/data/levels.js`
- `src/data/skills.js`
- `src/data/lessons.js`

## Modules with Imports

### constants.js
- **Imports:** nothing
- **Imported by:** game.js, renderer.js, keyboard.js

### audio/index.js
- **Imports:** capture.js, analyzer.js, pitch.js, chords.js
- **Imported by:** game.js

### audio/soundEngine.js
- **Imports:** capture.js (`getAudioContext`)
- **Imported by:** game.js

### input/keyboard.js
- **Imports:** constants.js (`SCENE`), capture.js (`getAudioContext`)
- **Imported by:** game.js
- **Runtime refs:** TablatureSystem, AttackSequenceSystem, CueSystem (passed via `start()`)

### systems/waves.js
- **Imports:** entities/enemy.js
- **Imported by:** game.js (indirectly via WaveManager)

### systems/prompts.js
- **Imports:** data/chords.js
- **Imported by:** game.js

### systems/progression.js
- **Imports:** data/skills.js, data/levels.js
- **Imported by:** game.js, ui/levelselect.js

### ui/worldMapRenderer.js
- **Imports:** data/worldMap.js (`WORLD_MAP_NODES_BY_ID`, `REGIONS`, `isNodeUnlocked`)
- **Imported by:** renderer.js, game.js

### ui/levelselect.js
- **Imports:** data/levels.js, data/skills.js, systems/progression.js
- **Imported by:** game.js

### data/worldMap.js
- **Imports:** data/levels.js (`LEVELS_BY_ID`)
- **Imported by:** ui/worldMapRenderer.js, game.js

### renderer.js
- **Imports:** constants.js, ui/hud.js, ui/worldMapRenderer.js
- **Imported by:** game.js

### game.js (hub)
- **Imports:** renderer.js, constants.js, audio/index.js, audio/melodyEngine.js, audio/soundEngine.js, entities/unit.js, systems/* (7 files), input/keyboard.js, input/midi.js, ui/* (5 files), data/* (3 files)
- **Imported by:** nothing (entry point)
- **Re-exports:** `SCENE`

## Anti-Pattern: Circular Imports

`constants.js` exists specifically to prevent this circular dependency:
```
❌ game.js ←→ renderer.js  (would break Safari/Vercel)
✅ game.js → constants.js ← renderer.js  (acyclic)
```

**Rule:** If two files need to share a value, extract it to a third file that both import.

## See Also

- [[ARCHITECTURE]] — Why the ownership model works this way
- [[FILE_REFERENCE]] — What each file exports
