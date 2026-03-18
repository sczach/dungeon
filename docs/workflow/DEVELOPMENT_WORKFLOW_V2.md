# Chord Wars — Development Workflow Guide (Phase 2+)

> **Status:** Active — canonical workflow narrative
> **Vault links:** [[WORKFLOW]] (condensed version) | [[ROADMAP]] | `BRIEFING_PROMPTS_V2.md` | [[PROJECT_HISTORY]]
> **Summary:** Single-prompt auto-accept sessions. CLAUDE.md in repo = source of truth. Branch + PR always.

## How Development Works Now

Duncan is a solo developer using AI coding agents as his development team. The workflow has evolved from Phase 1's "paste instructions + hope Claude follows git rules" into a structured agent-tuning system.

### Tools
- **Claude Code (Sonnet)**: Primary coding agent. Auto-accept mode. Single-prompt sessions.
- **Claude.ai (Opus)**: Architecture decisions, roadmap planning, prompt writing, complex debugging.
- **Grok**: Second opinions, planning when Claude quota is low.
- **GitHub Mobile**: PR review and merge.
- **Vercel**: Auto-deploys on merge to master.

### Source of Truth
- **Repo**: github.com/sczach/chordwars (master branch = production)
- **CLAUDE.md**: Lives in repo root. Updated after every phase. This is what Claude Code reads.
- **docs/skills/**: Agent skill definitions. Each engine has its own skill file.
- **Live build**: chordwars.vercel.app (always reflects master)

---

## Session Workflow

### For Bug Fixes / Feature Work

1. Open fresh Claude Code session (auto-accept mode)
2. Paste the prompt from BRIEFING_PROMPTS_V2.md (single message — no two-step dance)
3. Claude Code reads CLAUDE.md from repo, reads relevant source files, makes changes
4. Claude Code creates branch, pushes, tells you to open PR
5. Duncan reviews on GitHub mobile, merges
6. Vercel auto-deploys
7. Duncan tests on phone with Sequential Pro 3

### For Engine Development (Agent-Tuning)

1. Write/update skill definition in docs/skills/[ENGINE].md
2. Give Claude Code a prompt referencing the skill file
3. Claude Code implements against the skill's test criteria
4. Test the result
5. If it fails: paste failures back, ask agent to diagnose + fix skill definition
6. Repeat until stable (usually 2-3 cycles)
7. After 2-3 days, the engine is automated

### For Planning / Design

Use Haiku in the project folder, or Grok. No code generation — just designs, priority matrices, and architecture decisions. Feed outputs back as context for Claude Code sessions.

---

## Token Efficiency

The old system had a ~25,700 token tax from uploading all docs as project knowledge. The new system:

| Layer | Tokens | Where |
|-------|--------|-------|
| CLAUDE.md in repo | ~2,000 | Claude Code reads it automatically |
| Skill file | ~500 | Referenced by prompt, read from repo |
| Prompt | ~300 | Single message per session |
| **Total per session** | **~2,800** | **~10x reduction from Phase 1** |

No need to paste condensed instructions into every session — CLAUDE.md in the repo handles it.

---

## What NOT To Do

- **Don't paste full project instructions into Claude Code prompts.** CLAUDE.md is in the repo. Just reference it.
- **Don't use PLAN MODE then switch to AUTO ACCEPT.** Single prompt, auto-accept from the start.
- **Don't specify git command blocks verbatim.** Just say "create branch claude/[name], push, open PR." Claude Code handles the rest in auto-accept mode.
- **Don't have multi-day sessions.** Fresh session per task. Context gets stale.
- **Don't let Claude Code push to master.** Branch + PR always.

---

## File Inventory (Phase 2)

### In the Repo (github.com/sczach/chordwars)
| File | Purpose |
|------|---------|
| CLAUDE.md | Always-on context for Claude Code |
| docs/skills/SOUND_ENGINE.md | Sound engine skill definition |
| docs/skills/GAMEPLAY_ENGINE.md | Gameplay balance skill definition |
| docs/skills/GRAPHICS_ENGINE.md | Visual rendering skill definition |
| docs/skills/COMPOSITION_ENGINE.md | Player songwriting skill definition |
| docs/skills/AI_ENGINE.md | NPC/opponent AI skill definition |
| .claude/commands/*.md | Custom Claude Code commands |

### In This Claude Project Folder
| File | Purpose |
|------|---------|
| CLAUDE_PHASE_2.md | Updated project instructions (to become CLAUDE.md in repo) |
| BRIEFING_PROMPTS_V2.md | Copy-paste prompt templates for Claude Code sessions |
| REF_AUDIO_V2.md | Audio pipeline deep reference |
| REF_GAMECORE_V2.md | Game entities/systems deep reference |
| AGENT_TUNING_WORKFLOW.md | How to develop each engine via agent-tuning |
| PROMPT_CLAUDE_CODE_SONNET.md | Immediate next Claude Code prompt (Phase 2A bugs) |
| PROMPT_HAIKU_PLANNING.md | Haiku planning prompt (minigames, sound engine, priorities) |
| PROMPT_SETUP_AGENT_INFRA.md | Claude Code prompt to set up docs/skills/ in repo |

### Retired (from Phase 1 — still in project folder but superseded)
| File | Replaced By |
|------|-------------|
| SONNET_PROJECT_INSTRUCTIONS_1C.md | CLAUDE_PHASE_2.md |
| BRIEFING_PROMPTS.md | BRIEFING_PROMPTS_V2.md |
| REF_AUDIO.md | REF_AUDIO_V2.md |
| REF_GAMECORE.md | REF_GAMECORE_V2.md |
| SONNET_ONBOARDING_GUIDE.md | This file |
| REF_BACKEND.md | Not yet relevant (Phase 3+) |
