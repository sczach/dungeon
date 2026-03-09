# ChordWars — Claude Code Config

## Load context
@~/ai-dev-platform/contexts/chordwars.md

## Load platform rules
@~/ai-dev-platform/rules/platform.md

## Project overview
Music theory RTS game. Vanilla JS + HTML Canvas + Web Audio API. No build step. Deployed on Vercel.

## Model preference
- Default: sonnet
- Routine ops: haiku
- Never: opus

## Agents to use
- /code-review before any PR
- /build-fix for build errors (don't troubleshoot manually)
- /plan before implementing features > 1 day of work

## Git
- Branch per feature
- Commit after each working increment
- PR description written by /doc-updater agent

## Critical constraints
- All JS must be native ES modules (no bundler)
- Keep imports acyclic — Safari/Vercel reject circular ES module bindings
- Test in Chrome AND Safari before committing (Web Audio API behavior differs)
- Canvas rendering: game.js owns all state, renderer.js is pure read-only output
- No external dependencies — keep it vanilla

## File map
```
index.html          — entry point, HTML overlay structure
style.css           — layout + data-scene attribute selectors
src/
  game.js           — state machine + rAF loop (owns ALL mutable state)
  renderer.js       — pure canvas output
  constants.js      — shared constants (SCENE, layout geometry)
  audio/            — Web Audio: analyzer, capture, chord detection, pitch
  entities/         — unit.js, enemy.js
  systems/          — base, combat, waves, path, tablature, prompts, attackSequence
  input/            — keyboard.js
  ui/               — hud.js, screens.js, settings.js
```

## Planning docs
Located in: `C:\Users\wbryk\OneDrive\Desktop\Chordwars\`
- `Chord_Wars_GDD_v1.0.docx` — Game Design Document
- `Chord_Wars_Roadmap_v1.1.docx` — Development Roadmap
- `Chord_Wars_Wireframes.jsx` — UI Wireframes
- `REF_AUDIO.md`, `REF_BACKEND.md`, `REF_GAMECORE.md` — Reference docs
