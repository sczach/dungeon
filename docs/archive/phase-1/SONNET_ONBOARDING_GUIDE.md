> **Archive** — superseded by `DEVELOPMENT_WORKFLOW_V2.md`. **Vault links:** [[PROJECT_HISTORY]] | [[WORKFLOW]]

# Chord Wars — Sonnet Onboarding Guide
## Token-Efficient Development Workflow

---

## The Problem with Naive Upload

If you upload all four original documents (GDD, Roadmap, Setup Guide, Wireframes) as project knowledge files, **every single message** pays a ~25,700 token tax — roughly $0.08 per message on Sonnet at input pricing. Over hundreds of development conversations, that adds up fast, and most of that context is irrelevant to any given coding task.

## The Solution: Layered Context Architecture

Instead of one massive always-on context, use three layers:

### Layer 1: Project Instructions (~1,400 tokens) — ALWAYS ON
**File:** `SONNET_PROJECT_INSTRUCTIONS.md`
**Where:** Paste into the Claude Project "Instructions" field
**Contains:** Everything Sonnet needs on every message — core concept, tech stack, file structure, coding conventions, MVP scope, success criteria, current phase. This is a 94% reduction from the raw documents while retaining every architectural decision.

### Layer 2: Phase-Specific References (~500-800 tokens each) — PASTE WHEN RELEVANT
**Files:**
- `REF_AUDIO.md` — Paste when working on capture.js, analyzer.js, pitch.js, chords.js
- `REF_GAMECORE.md` — Paste when working on enemies, units, waves, combat, paths, HUD
- `REF_BACKEND.md` — Paste when working on Firebase, leaderboards, payments, PvP

**Where:** Paste at the start of the conversation, after the briefing prompt
**Why:** These contain the deep technical details (specific frequencies, data structures, algorithm steps) that matter for specific subsystems but waste tokens when you're working on something unrelated.

### Layer 3: Briefing Prompt (~100-200 tokens) — EVERY CONVERSATION
**File:** `BRIEFING_PROMPTS.md`
**Where:** Copy the relevant prompt template, fill in the brackets, paste as your first message
**Contains:** What file you're working on, what phase, what it depends on, what you need. Plus the actual code of dependency files.

## Token Budget Comparison

| Approach | Tokens/message | Cost/100 messages (Sonnet) |
|----------|---------------|---------------------------|
| Upload all 4 docs as knowledge | ~25,700 | ~$7.71 input |
| Condensed instructions only | ~1,400 | ~$0.42 input |
| Instructions + 1 phase ref | ~2,200 | ~$0.66 input |
| Instructions + phase ref + briefing | ~2,500 | ~$0.75 input |

That's roughly a **10x reduction** in per-message context cost.

---

## Setup Steps (Do This Once)

### Step 1: Create the Claude Project
1. Go to claude.ai → Projects → New Project
2. Name: **"Chord Wars Dev"**
3. Model: Select **Claude Sonnet** (not Opus — Sonnet is faster, cheaper, and excellent for code generation)

### Step 2: Set Project Instructions
1. Open project settings → find the "Instructions" field
2. Copy the **entire contents** of `SONNET_PROJECT_INSTRUCTIONS.md`
3. Paste it in
4. **Important:** Update the `Current Phase:` line at the bottom as you progress

### Step 3: Upload the Full Docs as Knowledge Files (Reference Only)
Upload these to the project knowledge so Sonnet *can* reference them if you explicitly ask, but they won't be injected into every conversation:
- `Chord_Wars_GDD_v1.0.docx`
- `Chord_Wars_Roadmap_v1.1.docx`
- `Chord_Wars_Wireframes.jsx`

**Note:** Knowledge files are only loaded when relevant. The project instructions are what Sonnet sees every message. This is why the condensed instructions matter — they're the always-on cost.

### Step 4: Keep These Files Handy
Save these locally (or in a pinned note/folder) for copy-paste during conversations:
- `BRIEFING_PROMPTS.md` — your prompt templates
- `REF_AUDIO.md` — paste when doing audio work
- `REF_GAMECORE.md` — paste when doing game logic
- `REF_BACKEND.md` — paste when doing backend/multiplayer

---

## Conversation Workflow

### Starting a New Feature
1. Open a new conversation in the "Chord Wars Dev" project
2. Copy the matching prompt from `BRIEFING_PROMPTS.md`
3. Fill in the bracketed fields
4. If the feature touches audio, game core, or backend → paste the matching `REF_*.md` content below the briefing
5. Paste the actual source code of any dependency files
6. Send

### Example: Building pitch.js
```
Working on: src/audio/pitch.js
Phase: 1A
This file does: YIN algorithm for fundamental frequency detection
Depends on: src/audio/analyzer.js
Need: PitchDetector class returning {frequency, note, octave, confidence}

[paste REF_AUDIO.md content here]

[paste analyzer.js code here]
```

### Debugging
Same conversation. Paste the error + updated code. Don't start a new conversation for debugging — the existing context is valuable.

### When to Start Fresh
- New file / new feature → new conversation
- Context window is getting long (50+ messages) → new conversation
- Switching subsystems (audio → game core) → new conversation

---

## Sonnet vs. Opus: When to Escalate

Use **Sonnet** for (95% of work):
- All code generation
- Debugging
- File-by-file implementation
- Game balance calculations
- Quick questions about the codebase

Escalate to **Opus** for:
- Complex architectural decisions spanning multiple systems
- When Sonnet's code has a subtle bug it can't find after 3 attempts
- Writing marketing copy or long-form content
- Evaluating tradeoffs between major technical approaches (e.g., "should I switch to Phaser now?")
- Reviewing the full project state and suggesting what to build next

---

## Keeping Instructions Updated

At the end of each phase, update `SONNET_PROJECT_INSTRUCTIONS.md`:
- Change `Current Phase:` to the next phase
- If you made architectural changes (e.g., added a file, changed a dependency direction), update the file structure
- If you settled on specific values (e.g., "noise gate threshold is 12dB"), add them to the relevant REF file

This keeps the context accurate without growing the token budget.

---

## File Inventory

| File | Purpose | Where It Goes | Tokens |
|------|---------|---------------|--------|
| `SONNET_PROJECT_INSTRUCTIONS.md` | Always-on context | Project Instructions field | ~1,400 |
| `REF_AUDIO.md` | Audio pipeline deep reference | Paste when relevant | ~600 |
| `REF_GAMECORE.md` | Game entities/systems reference | Paste when relevant | ~550 |
| `REF_BACKEND.md` | Firebase/PvP/payments reference | Paste when relevant | ~500 |
| `BRIEFING_PROMPTS.md` | Copy-paste prompt templates | Paste as first message | ~100-200 each |
| `Chord_Wars_GDD_v1.0.docx` | Full design document | Project knowledge (backup) | ~7,000 |
| `Chord_Wars_Roadmap_v1.1.docx` | Full roadmap + marketing | Project knowledge (backup) | ~6,800 |
| `Chord_Wars_Wireframes.jsx` | Interactive screen mockups | Project knowledge (backup) | ~8,000 |
| `Chord_Wars_Setup_Guide.docx` | Day 1 checklist + setup | Personal reference (don't upload) | — |
