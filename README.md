# ChordWars

A browser-based music education RTS where **your instrument is your only controller**.

Play notes to summon units, attack enemies, and destroy bases. The better you play music,
the better you play the game. There is no other way to play.

**Live:** https://chordwars.vercel.app

---

## What is this?

ChordWars is not a game with music in it. It is a music lesson that happens to have a game in it.

- **Piano keys → Game actions.** Press H-J-K-L on your keyboard (or tap the on-screen piano)
  to play C3–F3. Your notes summon units, attack enemies, and trigger special moves.
- **Better accuracy → More damage.** Hit notes cleanly and your army hits hard.
  Miss repeatedly and your attacks weaken.
- **Every level teaches one concept.** Single notes → intervals → chords → rhythm.
  Complete all levels and you've learned real music theory.

**No bundler. No framework. No build step.** Pure HTML, CSS, and vanilla JavaScript ES modules.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Rendering | HTML5 Canvas (2D context, DPR-scaled) |
| Game logic | Vanilla JS ES modules |
| Audio input | Web Audio API — AnalyserNode, OscillatorNode |
| Mic detection | Custom chromagram → chord matching |
| Deployment | Vercel (static, no server) |
| State management | Single `state` object owned by `game.js` |

---

## Development

### Quickstart

```bash
# Clone the repo
git clone https://github.com/sczach/chordwars.git
cd chordwars

# Serve locally (no install needed)
python -m http.server 8080

# Open in browser
open http://localhost:8080
```

No `npm install`. No build step. Edit and refresh.

---

### Agent-tuning workflow (with Claude Code)

ChordWars uses an agent-tuning loop to improve each engine domain independently.
Each domain has a **skill file** in `docs/skills/` that defines its role, constraints,
and pass/fail criteria.

```
Read skill file → Run test command → Observe failure → Fix code → Re-run test → Update skill
```

**Engine skill files:**
| File | Domain |
|------|--------|
| `docs/skills/SOUND_ENGINE.md` | Audio, tones, melody, Web Audio API |
| `docs/skills/GAMEPLAY_ENGINE.md` | Damage math, balance, progression, scoring |
| `docs/skills/GRAPHICS_ENGINE.md` | Canvas rendering, HUD, visual feedback |
| `docs/skills/COMPOSITION_ENGINE.md` | Victory melody generation and playback |
| `docs/skills/AI_ENGINE.md` | Enemy behavior, wave pacing, NPC patterns |

**Test commands** (Claude Code slash commands):
| Command | What it checks |
|---------|---------------|
| `/gametest` | Full gameplay pass — all scenes, mechanics, tutorial |
| `/audiotest` | Audio pipeline — tones, melodies, mic detection |
| `/balancecheck` | Damage math, economy, wave pacing, star scoring |

**How to use with Claude Code:**

1. Open this repo in Claude Code.
2. Claude reads `CLAUDE.md` for full project context.
3. To fix a bug: describe it; Claude reads the relevant skill file, runs the test command,
   implements the fix, and verifies it passes.
4. To add a feature: run `/plan` first; Claude designs the approach before touching code.

---

### Branch & PR workflow

All changes go through pull requests. **Never push directly to `master`.**

```bash
# Start a new feature or fix
git checkout -b claude/my-feature   # AI branches
git checkout -b feat/my-feature     # Human branches

# Commit early and often
git add src/systems/attackSequence.js
git commit -m "fix: accuracy floor raised from 10% to 30%"

# Push and open PR
git push -u origin claude/my-feature
# Then open PR on GitHub
```

**Commit types:** `feat:` `fix:` `chore:` `docs:` `perf:` `refactor:`

**PR body must include:**
- What changed (bullet points)
- Why it changed (root cause or design decision)
- Test plan checklist (which `/gametest` checks were verified)

---

### Architecture rules

| Rule | Rationale |
|------|-----------|
| `game.js` owns ALL mutable state | One source of truth; subsystems receive `state` by reference |
| `renderer.js` is pure output | No state mutation in render; enables safe re-renders |
| No circular imports | Safari/Vercel reject circular ES module bindings |
| No bundler | Keep deploy simple; no build step = no build failures |
| No external dependencies | Minimize surface area; the game must work forever |
| Test Chrome AND Safari | Web Audio API behavior differs significantly |

---

### File map

```
index.html        — Entry point; HTML overlay sections (data-scene selectors)
style.css         — Layout + scene visibility (CSS data-scene selectors)
src/
  game.js         — rAF loop, scene state machine, ALL mutable state
  renderer.js     — Pure canvas draw (reads state only, never mutates)
  constants.js    — SCENE enum, layout geometry
  audio/          — Mic capture, chromagram, chord matching, melody engine
  entities/       — Unit and Enemy classes
  systems/        — Combat, waves, tablature, attack sequences, progression
  input/          — Keyboard input, note dispatch
  ui/             — HUD, world map renderer, screens, settings
  data/           — Level definitions, world map nodes, chord data
docs/
  skills/         — Engine skill definitions for agent-tuning
.claude/
  commands/       — Claude Code slash commands (gametest, audiotest, balancecheck)
```

---

## Project context

For full project context, architecture decisions, known bugs, and the current phase roadmap,
see [`CLAUDE.md`](./CLAUDE.md).

For detailed engine constraints and test criteria, see the skill files in [`docs/skills/`](./docs/skills/).
