> **Archive** — already executed; companion to `PROMPT_SETUP_AGENT_INFRA.md`. **Vault links:** [[PROJECT_HISTORY]] | [[WORKFLOW]]

# Setup Instructions for PROMPT_SETUP_AGENT_INFRA.md

When you run the Claude Code session to set up persistent context infrastructure, here's exactly what to do with the Phase 1D and Phase 2A documents:

---

## 1. Create `CLAUDE.md` (Root-Level Reference)

**File:** `./CLAUDE.md`  
**Source:** Rename `SONNET_PROJECT_INSTRUCTIONS_1C.md` to `CLAUDE.md`  
**Update:**
- Change `Current Phase:` from "Phase 1C" to **"Phase 1D"**
- Add new section at the end:

```markdown
---

## Phase 1D Immediate Tasks (Days 18–25)

See `docs/PHASE_1D_ACTION_PLAN.md` for detailed implementation steps.

**Priority order:**
1. End-screen stats (Days 18–19)
2. Tutorial overlay (Days 19–21)
3. Difficulty balance (Days 21–23)
4. 3-star rating (Days 23–24)
5. Shareable URL (Days 24–25, optional)
6. Production domain (Day 25)
7. Performance audit (Days 25–26)

**All Phase 1D tasks must:**
- Branch + PR (never master)
- Target 30+ FPS on Android Chrome
- Mobile responsive
- Include error handling + JSDoc

---

## Phase 2A Overview (Weeks 4–6)

See `docs/PHASE_2A_STRATEGY.md` for 8 minigame designs, sound engine architecture, and 5-agent specialization framework.

**Five parallel workstreams:**
1. Sound Engine (rhythm + harmony + FX + melodic layers)
2. MIDI support (Web MIDI API, keyboard input, velocity mapping)
3. 8 minigames (Metronome, Chord Memory, Scale Shredder, etc.)
4. Graphics (falling-block UI, pitch visualizer, transitions)
5. System Map (progression, unlocks, cosmetics)

**Agent-tuning workflow:**
- Each of 5 agents owns one workstream
- Reports convergence metrics (latency, FPS, balance, coherence, NPC quality)
- Shares single codebase, integrates at end of week

```

---

## 2. Create `docs/PHASE_1D_ACTION_PLAN.md`

**File:** `./docs/PHASE_1D_ACTION_PLAN.md`  
**Source:** Use the `PHASE_1D_ACTION_PLAN.md` file created above  
**No edits needed** — This is your task-by-task reference. Leave it exactly as is.

---

## 3. Create `docs/PHASE_2A_STRATEGY.md`

**File:** `./docs/PHASE_2A_STRATEGY.md`  
**Source:** Use the `PHASE_2A_STRATEGY.md` file created above  
**No edits needed** — This is your Phase 2A design reference. Keep it as backup.

---

## 4. Create `.claude/commands/` Directory Structure

**Purpose:** Quick-access command prompts that Claude Code can reference by name.

### Create: `.claude/commands/task-briefing.md`

```markdown
# Task Briefing Template (Phase 1D)

Copy this template and fill in the bracketed fields when starting a new task in Claude Code.

```
Working on: [FILE_NAME] (e.g., src/ui/screens.js)
Phase: 1D
Task: [NUMBER] [TITLE] (e.g., 1: End-Screen Stats)
This file does: [ONE SENTENCE RESPONSIBILITY]
Depends on: [LIST OF FILES THIS IMPORTS OR READS FROM]

CURRENT STATE NEEDED:
[Paste relevant game state fields from game.js, e.g.:
  - state.score
  - state.wave
  - state.killCount
  - state.stats.bestCombo
]

ACCEPTANCE CRITERIA:
- [ ] [Criteria 1]
- [ ] [Criteria 2]
- [ ] [Criteria 3]
- [ ] Mobile responsive tested
- [ ] No allocations in game loop
- [ ] JSDoc on all exports

CONSTRAINTS:
- No changes to core game loop or audio pipeline
- High-DPI canvas aware (multiply by devicePixelRatio)
- Error handling for edge cases (e.g., division by zero in stats)
- Target 30+ FPS on Android Chrome

HERE IS THE DEPENDENCY CODE:
[Paste current src/game.js state structure]
[Paste current src/renderer.js rendering pattern]
[Paste current file being modified]

WHAT I NEED:
[Detailed description of what to build]
```
```

### Create: `.claude/commands/phase2a-agent-briefing.md`

```markdown
# Phase 2A Agent Specialization Prompt

Use this when starting a Phase 2A agent workstream in Claude Code.

```
Agent specialization: [AGENT NAME]
Phase: 2A
Weeks: [WEEK NUMBER] (e.g., Week 4)

AGENT ROLE:
[Copy from PHASE_2A_STRATEGY.md, Agent [N] section]

CONVERGENCE CRITERIA (done when achieved):
[Copy convergence criteria from strategy doc, e.g.:
  - Latency <50ms
  - No audio artifacts
  - <5% CPU usage on mid-range Android
]

INTEGRATION POINTS:
- Commits to feature branch (merges to master only when convergence achieved)
- Reports metrics to Duncan via commit messages
- Shares codebase with 4 other agents (avoid conflicts)
- Target: integrated by end of week

HERE IS CURRENT STATE:
[Paste game.js state structure]
[Paste any existing related code]

YOUR TASKS THIS WEEK:
[List specific files to create/modify]
[Include any design decisions already locked in]

REFERENCE DOCS:
See docs/PHASE_2A_STRATEGY.md for full minigame designs, sound engine architecture, and agent descriptions.
```
```

### Create: `.claude/commands/bug-report.md`

```markdown
# Bug Report Template

Use this when testing reveals an issue to report to Claude Code.

```
Bug found in: [FILE_NAME]
Phase: [PHASE]
Task: [TASK NUMBER or N/A]

ERROR MESSAGE:
[Paste exact error from browser console]

WHAT I DID TO REPRODUCE:
[Step-by-step: "1. Play piano key C → 2. Wait for summon → 3. Got X instead of Y"]

EXPECTED BEHAVIOR:
[What should have happened]

ACTUAL BEHAVIOR:
[What actually happened]

CODE INVOLVED:
[Paste relevant code snippet, 10-20 lines]

CONTEXT:
[Is this happening on mobile? On old Chrome? At a specific wave?]
```
```

---

## 5. Create `docs/VISUAL_PROCESS_FLOW_SUMMARY.md`

**File:** `./docs/VISUAL_PROCESS_FLOW_SUMMARY.md`  
**Source:** Use the file created above  
**Purpose:** Quick reference for how Phase 1D and Phase 2A workflows integrate with the codebase

---

## Directory Structure After Setup

```
chord-wars/
├── CLAUDE.md                          (← Updated project instructions)
├── index.html
├── style.css
├── src/
│   ├── game.js
│   ├── renderer.js
│   ├── constants.js
│   ├── audio/
│   │   ├── index.js
│   │   ├── chords.js
│   │   └── midi.js
│   ├── entities/
│   ├── systems/
│   ├── ui/
│   │   ├── screens.js
│   │   ├── tutorial.js          (← Phase 1D new)
│   │   └── settings.js
│   ├── input/
│   └── data/
├── docs/
│   ├── PHASE_1D_ACTION_PLAN.md   (← Persistent reference)
│   ├── PHASE_2A_STRATEGY.md       (← Persistent reference)
│   └── VISUAL_PROCESS_FLOW_SUMMARY.md
├── .claude/
│   └── commands/
│       ├── task-briefing.md       (← Use for Phase 1D tasks)
│       ├── phase2a-agent-briefing.md (← Use for Phase 2A agents)
│       ├── bug-report.md          (← Use for debugging)
│       └── README.md (optional: explains each command)
├── README.md
└── package.json (if applicable)
```

---

## How Claude Code Will Use This

### Phase 1D Workflow (Next 8 Days)

1. You open Claude Code session
2. Claude Code reads `CLAUDE.md` automatically (always in context)
3. You say: **"Task 1: End-screen stats. Use .claude/commands/task-briefing.md template"**
4. Claude Code:
   - Loads the template from `.claude/commands/task-briefing.md`
   - Reads `PHASE_1D_ACTION_PLAN.md` for detailed specs
   - Reads current `src/ui/screens.js`, `src/game.js`, `src/renderer.js`
   - Generates code with full context, no pasting needed
5. You test, file a bug if needed using `.claude/commands/bug-report.md` template
6. Claude Code fixes in same session, pushes to branch, you merge

**Result:** Zero context loss between sessions. Full Phase 1D history persists.

### Phase 2A Workflow (Weeks 4–6)

1. Phase 1D ships, you update `CLAUDE.md` to `Current Phase: Phase 2A`
2. You schedule 5 Claude Code sessions, one per agent specialization
3. Each session loads `.claude/commands/phase2a-agent-briefing.md` + `PHASE_2A_STRATEGY.md`
4. Agent works autonomously for a week:
   - Implements its workstream (Sound, MIDI, Minigames, Graphics, AI)
   - Reports metrics in commit messages
   - Commits to feature branch (no master)
5. You integrate all 5 branches at end of week
6. All docs stay in repo for future reference (e.g., "How do minigames work?" → refer to `PHASE_2A_STRATEGY.md`)

---

## Critical: What NOT to Do

❌ **Don't paste the action plans into CLAUDE.md directly**
- They're reference docs, not always-on context
- CLAUDE.md should stay ~2,000 tokens (quick read)
- Detailed specs live in `docs/` directory

❌ **Don't create new Claude Code sessions for every task**
- Reuse the same session per task for faster iteration
- Only start a new session when moving to a different task (e.g., Task 2)

❌ **Don't push directly to master**
- Always branch (e.g., `task-1-stats`, `task-2-tutorial`)
- Merge only when Duncan tests and approves

---

## Commands to Add to PROMPT_SETUP_AGENT_INFRA.md

In your Claude Code setup session, include these inline instructions:

```
Create the following directory structure with files:

1. docs/PHASE_1D_ACTION_PLAN.md — [PASTE FULL CONTENT]
2. docs/PHASE_2A_STRATEGY.md — [PASTE FULL CONTENT]
3. docs/VISUAL_PROCESS_FLOW_SUMMARY.md — [PASTE FULL CONTENT]
4. .claude/commands/task-briefing.md — [PASTE TEMPLATE ABOVE]
5. .claude/commands/phase2a-agent-briefing.md — [PASTE TEMPLATE ABOVE]
6. .claude/commands/bug-report.md — [PASTE TEMPLATE ABOVE]

Update CLAUDE.md:
- Rename from SONNET_PROJECT_INSTRUCTIONS_1C.md
- Change "Current Phase:" to "Phase 1D"
- Add sections for Phase 1D Immediate Tasks + Phase 2A Overview (see above)
- Commit and push
```

---

## Quick Reference: When You Need Something

| Scenario | File to Read |
|----------|--------------|
| "What's Task 1 in detail?" | `docs/PHASE_1D_ACTION_PLAN.md` |
| "What are the 8 minigames?" | `docs/PHASE_2A_STRATEGY.md` |
| "How do all these fit together?" | `docs/VISUAL_PROCESS_FLOW_SUMMARY.md` |
| "I'm starting a Phase 1D task" | `.claude/commands/task-briefing.md` |
| "I'm starting a Phase 2A agent workstream" | `.claude/commands/phase2a-agent-briefing.md` |
| "I found a bug, need to report it" | `.claude/commands/bug-report.md` |
| "What are the project fundamentals?" | `CLAUDE.md` (always loaded) |

---

## After PROMPT_SETUP_AGENT_INFRA.md Completes

✅ All Phase 1D and Phase 2A docs are persisted in repo  
✅ Claude Code has zero-paste access to all specs  
✅ Templates in `.claude/commands/` guide future sessions  
✅ CLAUDE.md is always-on context for every Claude Code session  
✅ You can run Task 1 immediately: just open Claude Code and say "Start Task 1: End-Screen Stats"

---

**That's it.** After setup, future Claude Code sessions will have all the context they need without you pasting anything. The workflows and task details are baked into the repo.
