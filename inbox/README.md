# Inbox — Idea Capture

> Drop any note here. Run `/inbox-process` at end of day to route everything into the vault.

---

## How to use on mobile

1. Open this vault in Obsidian mobile
2. Tap **New note** → save it anywhere in this `inbox/` folder
3. Write freely — stream of consciousness, voice-to-text, quick bullet, whatever
4. Don't worry about structure or formatting. Just capture.

At the end of the day, run `/inbox-process` in Claude Code and it will:
- Read every note in this folder
- Categorize each idea (feature, bug, design decision, question, etc.)
- Route content to the right docs (`ROADMAP`, `DECISIONS`, `PROJECT_HISTORY`, etc.)
- Archive processed notes to `inbox/processed/YYYY-MM-DD/`
- Give you a summary of what moved where

---

## Tagging (optional — speeds up processing)

Add a tag on the first line to give the processor a hint:

| Tag | Routes to |
|-----|-----------|
| `#feature` | `docs/context/ROADMAP.md` — backlog |
| `#bug` | `CLAUDE.md` — known bugs table |
| `#design` | `docs/context/DECISIONS.md` |
| `#audio` | `docs/context/AUDIO_PIPELINE.md` |
| `#balance` | `docs/skills/GAMEPLAY_ENGINE.md` |
| `#note` | `docs/context/PROJECT_HISTORY.md` |

Tags are optional. The processor will infer category from content if no tag is present.

---

## Files in this folder

- `README.md` — this file (don't delete)
- `TEMPLATE.md` — optional starting structure for longer notes
- `processed/` — archived notes after processing (don't edit manually)
