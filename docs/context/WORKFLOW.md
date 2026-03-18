# ChordWars Session Workflow

> How to run Claude Code sessions. Load this at the start of any dev session.

## Tools

| Tool | Use For |
|------|---------|
| Claude Code (Sonnet) | Coding sessions — auto-accept mode, single prompt |
| Claude.ai (Opus) | Architecture, planning, complex debugging |
| Haiku | Planning, minigame design, priority matrices (no code) |
| GitHub Mobile | PR review and merge |
| Vercel | Auto-deploys on merge to master |

---

## Standard Session (Bug Fixes / Features)

```
1. Open fresh Claude Code session — AUTO ACCEPT EDITS from the start
2. Single prompt (from BRIEFING_PROMPTS_V2.md or write your own)
3. Claude Code reads CLAUDE.md from repo automatically
4. Claude Code reads source files, makes changes
5. Claude Code creates branch, pushes, tells you to open PR
6. Review on GitHub mobile
7. Merge → Vercel auto-deploys
8. Test on phone with Sequential Pro 3
```

**Never:** Two-step plan-mode → auto-accept switch. Single prompt always.

**Never:** Multi-day sessions. Fresh session per task. Context gets stale.

**Never:** Push to master. Branch + PR always.

---

## Session Prompt Template

```
You are working on Chord Wars, a browser-based musical RTS game.
Repo: https://github.com/sczach/chordwars
Live: https://chordwars.vercel.app/
Stack: Vanilla JS, ES Modules, HTML5 Canvas, Web Audio API. No bundler, no framework.

## GIT RULES (NON-NEGOTIABLE)
- Create a branch: claude/[SHORT-DESCRIPTION]
- Make all changes on that branch
- Push the branch and open a PR against master
- NEVER push to master directly

## CONTEXT
Read CLAUDE.md in the repo root for full project state, known bugs, and architecture rules.
Read the relevant source files BEFORE writing any code.

## TASK
[DESCRIBE WHAT TO BUILD OR FIX]

## CONSTRAINTS
- Vanilla JS ES modules only
- renderer.js must remain pure (only draw, never mutate state)
- game.js owns all mutable state
- Handle iOS Safari AudioContext (call resume() on user gesture)
- Do NOT restructure architecture — targeted changes only
- Do NOT add libraries or dependencies
```

**Ready-to-use prompts:** `BRIEFING_PROMPTS_V2.md`

---

## Engine Development (Agent-Tuning Loop)

For Phase 2B+ engine work (Sound, Graphics, Gameplay, Composition, AI):

```
1. Read docs/skills/[ENGINE].md for constraints and test criteria
2. Write prompt referencing the skill file
3. Claude Code implements against skill's test criteria
4. Run /audiotest, /gametest, or /balancecheck
5. If fails: paste failures back, ask agent to diagnose + edit skill definition
6. Repeat until stable (usually 2-3 cycles)
7. After 2-3 days, the engine is automated
```

**Skill-tuning prompt:**
```
The [ENGINE NAME] skill just ran and produced these failures:
[PASTE CONSOLE ERRORS OR DESCRIBE WHAT WENT WRONG]

Walk through each failure:
1. What was the expected behavior?
2. What actually happened?
3. What's the root cause?
4. What specific code change fixes it?

Then edit the skill definition in docs/skills/[ENGINE].md to prevent this class
of failure in future runs. Apply the code fixes and push to branch claude/[engine]-fix-v[N].
```

**See:** `AGENT_TUNING_WORKFLOW.md` for full skill definitions per engine.

---

## Planning Sessions (Haiku)

Use Haiku for: minigame designs, sound engine architecture, priority matrices, roadmap decisions.

**Haiku prompt:** `PROMPT_HAIKU_PLANNING.md`

Haiku produces: designs, priorities, agent skill definitions.
Haiku does NOT produce: code.
Feed Haiku outputs back as context for Sonnet coding sessions.

---

## Token Efficiency

The old Phase 1 approach pasted 25,700 tokens per session. Current approach:

| Layer | Tokens | Where |
|-------|--------|-------|
| CLAUDE.md in repo | ~2,000 | Claude Code reads automatically |
| Skill file | ~500 | Referenced in prompt |
| Prompt | ~300 | Single message |
| **Total** | **~2,800** | **~10x reduction** |

---

## Test Commands

| Command | When to Use |
|---------|------------|
| `/gametest` | Before any PR touching gameplay |
| `/audiotest` | Before any PR touching audio |
| `/balancecheck` | After changing difficulty/scoring |
| `/code-review` | Before every PR |

---

## Git Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| AI sessions | `claude/<slug>` | `claude/sound-engine-v2` |
| Features | `feat/<name>` | `feat/guitar-mode` |
| Fixes | `fix/<name>` | `fix/midi-input` |

---

## Debug Overlay

Press backtick (`` ` ``) during PLAYING to toggle audio pipeline debug:
scene, ctxState, ready, rms, noiseFloor, pitchStable, detectedNote, detectedChord, confidence

---

## See Also

- [[ARCHITECTURE]] — What you're working on
- [[ROADMAP]] — What phase you're in
- `BRIEFING_PROMPTS_V2.md` — Ready-to-paste session prompts
- `AGENT_TUNING_WORKFLOW.md` — Engine development loop
- `DEVELOPMENT_WORKFLOW_V2.md` — Full workflow narrative
