# /wrap-up — Session End Command

You are ending a Chord Wars development session.

Your job is to accurately document what happened and leave the vault
in a state that makes the next session's /resume maximally useful.

## CRITICAL RULES

- PROJECT_HISTORY.md is APPEND ONLY. Never overwrite it. Ever.
- HANDOFF.md is always overwritten — it reflects only current state.
- Do not invent or assume — only document what you can verify from
  git history, file contents, and this conversation.
- If you are unsure whether something was fixed, write "unconfirmed".
- After writing vault files, stop. Do not start new tasks.

## Step 1 — Gather facts before writing anything

Run these commands and read their full output:

  git log --oneline -10
  git diff --stat HEAD 2>/dev/null || git diff --stat
  git stash list
  git status --short

Try: `gh pr list --state all --limit 5`
If gh fails, skip it — note "gh unavailable" in vault.

Also ask yourself: what did we discuss and build in this conversation?
Use conversation history as primary source. Git history as secondary.

## Step 2 — Write HANDOFF.md (overwrite)

Path: C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/HANDOFF.md

```
# Handoff Notes — [today's date YYYY-MM-DD]

## Current phase
[e.g. Phase 2A bug crush]

## What is working
[bullet list — only confirmed working, not assumed]

## What is broken or in progress
[bullet list — be honest, include "unconfirmed" where uncertain]

## What was done this session
[bullet list with file names — inferred from git + conversation]

## Approaches that failed
[bullet list — this is critical institutional memory, do not skip]

## Open PRs
[branch name → what it contains → URL if known]
[if gh unavailable: "check GitHub manually"]

## Next session should
1. [most important unresolved task]
2. [second task]
3. [third task]
[ordered by priority, not by what you feel like doing]

## Source files most likely needed next session
[list — be specific, include subsystem files not just game.js]

## Vault files that need updating
[list any vault docs that are now stale or missing]
```

## Step 3 — Append to PROJECT_HISTORY.md

Path: C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/PROJECT_HISTORY.md

READ THE FILE FIRST to find the last entry date.
Then APPEND — do not modify anything above your new entry.

```
## [YYYY-MM-DD] — [one honest line summary of the session]

### Done
[bullets — file names, what changed]

### Failed / reverted
[bullets — what was tried and didn't work, why if known]

### Open
[bullets — what remains unresolved]

### Playtest notes
[only if playtesting happened — observations, metrics, feel]
```

## Step 4 — Conditional updates

Only update these files if relevant work happened this session:

**AUDIO_PIPELINE.md** — update if any audio code changed:
Path: C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/AUDIO_PIPELINE.md
Update the "Known issues" and "Key settled values" sections only.
Do not rewrite sections that did not change.

**DECISIONS.md** — append if an architectural decision was made:
Path: C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/DECISIONS.md
Format:
```
## [YYYY-MM-DD] — [decision title]
**Decision:** [what]
**Reason:** [why]
**Rejected:** [what was not chosen and why]
```

**GAME_SYSTEMS.md** — update if game system values changed:
Path: C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/GAME_SYSTEMS.md
Only update sections whose values actually changed this session.

## Step 5 — Output confirmation

Print:

---
## ✅ Wrap-up complete — [date]

**Files updated:**
- HANDOFF.md ✓
- PROJECT_HISTORY.md ✓ (appended)
- [any others updated]

**Files skipped:** [and why]

**To start next session:** run /resume

**Merge reminder:** [list any PRs that should be merged before next session]
---

Then stop completely. Do not propose follow-up tasks.
