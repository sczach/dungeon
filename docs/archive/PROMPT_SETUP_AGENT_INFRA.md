> **Archive** — already executed; agent infra setup complete. **Vault links:** [[PROJECT_HISTORY]] | [[WORKFLOW]]

# PROMPT — Claude Code: Set Up everything-claude-code Patterns

Use this AFTER the Phase 2A bug fixes are merged. This sets up the repo structure for agent-tuned development going forward.

---

```
You are working on Chord Wars.
Repo: https://github.com/sczach/chordwars
Branch: claude/setup-agent-workflow

## TASK: Set up agent-tuning infrastructure in the repo

### 1. Update CLAUDE.md in repo root
Replace the current CLAUDE.md (or SONNET_PROJECT_INSTRUCTIONS_1C.md) with the updated version. 
The new CLAUDE.md should reflect:
- Current deployed state (what actually works)
- Known bugs list (from playtesting)
- Revised development phases (Phase 2A through 4)
- Git workflow rules (branch + PR, never push to master)
- Architecture rules (game.js owns state, renderer.js pure, etc.)

### 2. Create docs/skills/ directory with skill files
Create these files:
- docs/skills/SOUND_ENGINE.md — skill definition for sound/music generation
- docs/skills/GAMEPLAY_ENGINE.md — skill definition for balance/difficulty/scoring
- docs/skills/GRAPHICS_ENGINE.md — skill definition for rendering/UI/visual feedback
- docs/skills/COMPOSITION_ENGINE.md — skill definition for player songwriting
- docs/skills/AI_ENGINE.md — skill definition for NPC opponents and teammates

Each file should contain:
- Role description (1 paragraph)
- Inputs (what data the agent receives)
- Outputs (what the agent produces)
- Constraints (tech limitations, performance budgets)
- Test criteria (checkboxes)
- Convergence definition (when is it good enough)

### 3. Create .claude/ directory for custom commands
If the repo doesn't have it, create:
- .claude/commands/gametest.md — instructions for running a gameplay test pass
- .claude/commands/audiotest.md — instructions for testing audio pipeline
- .claude/commands/balancecheck.md — instructions for evaluating game balance

Each command file should describe:
- What to check
- How to verify (console logs, visual inspection, performance metrics)
- Pass/fail criteria

### 4. Update README.md
Add a "Development" section explaining:
- Agent-tuning workflow (write skill → run → fail → fix skill → repeat)
- How to use Claude Code with this repo
- Branch + PR workflow
- Link to CLAUDE.md for full project context

### CONSTRAINTS
- Do not modify any game source code in this PR
- Only create/update documentation and configuration files
- Push branch claude/setup-agent-workflow and tell me to create PR
```
