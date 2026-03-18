# /inbox-process — Daily Inbox Triage

Process all unread notes in `inbox/`, route ideas into the vault, and archive.

---

## Steps

### 1. Scan inbox

Read every `.md` file in `inbox/` at the top level only (skip `README.md`, `TEMPLATE.md`, and anything inside `inbox/processed/`).

If the inbox is empty, report "Inbox is empty — nothing to process." and stop.

### 2. Categorize each note

For each note, determine its primary category by:
1. Checking for an explicit tag on line 1 (`#feature`, `#bug`, `#design`, `#audio`, `#balance`, `#note`)
2. If no tag, infer from content:
   - Describes something broken or wrong → **bug**
   - Proposes new functionality or content → **feature**
   - Asks "why do we..." or argues for a different approach → **design**
   - About mic detection, chord matching, audio, melody → **audio**
   - About damage math, wave pacing, scoring, difficulty → **balance**
   - Session log, status update, general observation → **note**
   - Doesn't fit any category → **misc** (include in summary but don't auto-route)

### 3. Route to vault

Append extracted content to the appropriate file. Use a dated section header:

```
## [Inbox] YYYY-MM-DD — <short title>
<content>
```

| Category | Route to | Section |
|----------|----------|---------|
| `#feature` | `docs/context/ROADMAP.md` | Under `## Backlog` (create if missing) |
| `#bug` | `docs/context/GAME_SYSTEMS.md` | Under `## Known Issues` (create if missing) |
| `#design` | `docs/context/DECISIONS.md` | Append as new entry |
| `#audio` | `docs/context/AUDIO_PIPELINE.md` | Under `## Open Questions` (create if missing) |
| `#balance` | `docs/skills/GAMEPLAY_ENGINE.md` | Under `## Open Questions` (create if missing) |
| `#note` | `docs/context/PROJECT_HISTORY.md` | Append under current phase section |
| `#misc` | Report in summary only — do not auto-route. Ask user where to put it. |

**Do not overwrite any existing content.** Only append.

### 4. Archive processed notes

Move each processed note (not README.md or TEMPLATE.md) to:
`inbox/processed/YYYY-MM-DD/<original-filename>`

Create the dated subfolder if it doesn't exist.

### 5. Print summary

After processing, output a summary:

```
## Inbox processed — YYYY-MM-DD

### Routed
- [filename] → #category → [destination file]
- ...

### Misc (needs manual routing)
- [filename]: <one-line description of content>

### Total: X notes processed, Y routed, Z misc
```

---

## Rules

- Read all destination files before appending — don't duplicate content that's already there
- Preserve the exact wording of the original note; summarize only if it's >200 words
- If a note contains multiple ideas in different categories, split it: route each idea separately, then archive the original
- If a note is ambiguous, route it as `#note` to PROJECT_HISTORY and flag it in the summary
- Never modify `inbox/README.md` or `inbox/TEMPLATE.md`
- Never touch anything in `src/`
