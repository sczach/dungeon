# /resume — Session Start Command

You are starting a Chord Wars development session.

This command is READ ONLY. Do not write code, create files, or make
any changes to the repo during this command. Only read and report.

## Step 1 — Read vault files

Attempt to read each file. If missing, write "[NOT FOUND]" and continue.
Never fail the whole command because one file is missing.

Files to read (try forward slashes if backslashes fail):
- C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/HANDOFF.md
- C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/DECISIONS.md
- C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/GAME_SYSTEMS.md
- C:/Users/wbryk/OneDrive/Desktop/Chordwars/docs/context/AUDIO_PIPELINE.md

Do NOT read PROJECT_HISTORY.md or ARCHITECTURE.md during resume —
they are too long and waste tokens. Only read them if explicitly asked.

## Step 2 — Read git state

Run these commands. If any fail, skip and continue:

  git log --oneline -8
  git status --short
  git stash list

Try `gh pr list --state open` only if gh is available.
If it fails with "command not found", skip it entirely.

## Step 3 — Output session briefing

Output ONLY this structure. Be concise — this briefing should be
readable in under 60 seconds. No padding, no repetition.

---
## 🎮 Chord Wars — Session Briefing

**Date of last session:** [from HANDOFF.md header, or "unknown"]
**Current phase:** [from HANDOFF.md]

### ✅ Working
[3-5 bullets max — most important working systems only]

### 🔴 Broken / In Progress
[every known issue — do not omit anything]

### 📋 Recommended task this session
[exact text from "Next session should" in HANDOFF.md]
[if HANDOFF.md not found: "No handoff found — check PROJECT_HISTORY.md
or describe what you were working on"]

### 📁 Files likely needed
[list src files relevant to recommended task]

### 🌿 Git state
[uncommitted changes if any]
[last 5 commits one-line]
[open PRs if gh available]

### ⚠️ Vault gaps
[list any vault files that were NOT FOUND]
[suggest running /wrap-up if HANDOFF.md is missing or stale]
---

After outputting the briefing, stop.
Wait for the developer to give the first task.
Do not propose tasks, do not start coding.
