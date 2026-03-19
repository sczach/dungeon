# Session Wrap-Up

<!-- LOCATION: This file must live at <repo-root>/.claude/commands/wrap-up.md
     (e.g. C:\Users\wbryk\OneDrive\Desktop\Chordwars\.claude\commands\wrap-up.md)
     so that it is accessible from git worktrees checked out under .claude/worktrees/.
     Do not move it to a worktree-local path only — changes here must also be committed
     on the master branch so every future worktree inherits the file. -->

Follow these steps in order. Do not skip any step. Do not write any files until Step 3.

---

## Step 0 — Pull before anything else

Run `git pull` on the current branch before generating any output. Report the result. If there are merge conflicts, stop and inform the user — do not proceed until resolved.

---

## Step 1 — Read the current state of modified files

For each file changed this session, read it in full and confirm it matches the intended final state. Also read `docs/context/HANDOFF.md` in full so you know what entries already exist — you will prepend to this file, not overwrite it.

---

## Step 2 — Generate the handoff entry (do not write yet)

Produce a handoff entry in the format below. Show it to the user for review before writing anything to disk.

# Handoff Notes — YYYY-MM-DD

## Current phase
[Phase name and short description]

## What is working
[Bullet list of confirmed-working features as of end of this session]

## What is broken or in progress
[Bullet list of known issues, unmerged PRs, unconfirmed behaviour]

## What was done this session
[Every file modified, created, or deleted — with reason and verification status]

## Approaches that failed
[Anything attempted that did not work and why — or "None this session"]

## Open PRs
[Branch name → description → URL or "open manually at github.com/sczach/chordwars/pull/new/BRANCH"]

## Next session should
[Numbered priority list — merge order, playtesting steps, next feature]

## Source files most likely needed next session
[List of files the next agent should read at session start]

## Vault files that need updating
[DECISIONS.md / GAME_SYSTEMS.md / other docs that need new entries or corrections]

---

## Step 3 — Write files (only after user confirms the entry looks correct)

### 3a. Prepend to HANDOFF.md

Prepend the confirmed entry to `docs/context/HANDOFF.md`. Do NOT overwrite the file — it is a running log and all prior entries must be preserved below the new one. Add a horizontal rule `---` between the new entry and the previous one.

### 3b. Append to PROJECT_HISTORY.md

Append a single concise paragraph to `docs/context/PROJECT_HISTORY.md` summarising what shipped this session. One paragraph, past tense, no bullet points. Create the file if it does not exist.

---

## Step 4 — Commit and push

Stage and commit everything, then push. The commit must always include HANDOFF.md and PROJECT_HISTORY.md alongside any code changes.

Use a conventional-commit message in this format:

```
type(scope): short description

- bullet detail 1
- bullet detail 2
- bullet detail 3
```

Types: fix, feat, refactor, style, chore, docs.

Run in order:
```bash
git add -A
git commit -m "type(scope): description"
git push
```

If `git push` fails because the remote branch doesn't exist yet, run:
```bash
git push -u origin HEAD
```

Report the push result. If it fails for any other reason, stop and inform the user.

---

## Step 5 — Worktree cleanup

Run only after Step 4 push is confirmed successful (work is safe on remote).

**5a. Prune and list:**
```bash
git worktree prune
git worktree list
```
Report the output.

**5b. Remove this session's worktree if the branch is merged or the PR is closed:**
```bash
git worktree remove --force .claude/worktrees/<name>
```
Only do this if: push succeeded AND (branch is merged into master OR branch is being
abandoned). Do NOT remove if the branch has an open unmerged PR.

**5c. Check for any remaining orphans:**
```bash
ls .claude/worktrees/ 2>/dev/null || echo "(none)"
```
For each dir not in `git worktree list`: confirm clean status, then
`git worktree remove --force .claude/worktrees/<name>`.

**5d. Report final disk usage:**
```bash
du -sh .claude/worktrees/ 2>/dev/null || echo "(no worktrees directory)"
```

> **Exit condition: zero stale refs, zero orphaned directories.**
> If you cannot achieve this (locked handles, uncommitted work), report exactly what
> remains and why, so the next agent knows what to clean up.

---

## Step 6 — State the next session's first task

In one sentence: the single highest-priority action for the next Claude Code session, and which files it would primarily touch.
