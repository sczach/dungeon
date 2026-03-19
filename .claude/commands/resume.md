# Session Resume

Follow these steps in order at the start of every session. Do not modify any files during resume.

---

## Step 0 — Pull before anything else

Run `git pull` on the current branch. Report the result. If there are conflicts, stop and
inform the user before proceeding.

---

## Step 1 — Worktree hygiene

Stale worktrees accumulate silently and fill disk. Run these commands in order.

**1a. Prune stale refs (always safe — never deletes code):**
```bash
git worktree prune
```

**1b. List active worktrees:**
```bash
git worktree list
```
Report the full output.

**1c. Check for orphaned physical directories** — dirs in `.claude/worktrees/` that do not
appear in `git worktree list`:
```bash
ls .claude/worktrees/ 2>/dev/null || echo "(none)"
```

For each orphaned directory (exists on disk but not in `git worktree list`):
1. Check for uncommitted work: `git -C .claude/worktrees/<name> status`
2. If clean AND the branch is merged or abandoned:
   `git worktree remove --force .claude/worktrees/<name>`
3. If it has uncommitted changes: **do not delete** — report it to the user.

> **Never use `rm -rf` on a worktree directory.** Always use `git worktree remove` so git
> deregisters the ref cleanly. Bypassing this can corrupt the repo's worktree index.

**1d. Report disk usage:**
```bash
du -sh .claude/worktrees/ 2>/dev/null || echo "(no worktrees directory)"
```

---

## Step 2 — Read the handoff log

Read `docs/context/HANDOFF.md`. The file is a running log with the newest entry at the top.
Summarise only the top entry. Do not summarise older entries unless the user asks.

Report the following from that entry:
- Current phase
- What is confirmed working
- What is broken or in progress
- Open PRs and their merge status
- The numbered priority list for this session

---

## Step 3 — Read the project history (one paragraph only)

Read the last paragraph of `docs/context/PROJECT_HISTORY.md` and report it in one sentence.
This gives a sense of momentum without re-reading the full history.

---

## Step 4 — Confirm the starting state

State clearly:
- Which branch is currently checked out
- Whether there are any uncommitted local changes (`git status`)
- Whether any PRs from the previous handoff are still open
  (based on what the handoff says — you cannot query GitHub directly)

---

## Step 5 — Propose the first task

Based on the handoff's "Next session should" list, propose the first task. Ask the user to
confirm or redirect before writing a single line of code.

---

## Worktree note — /wrap-up availability

If this session was loaded into a git worktree (e.g. `.claude/worktrees/<name>`),
`/wrap-up` is available via `.claude/commands/wrap-up.md` in the **repo root**.

If `/wrap-up` fails to resolve as a slash command, read that file directly with the
Read tool and follow its steps manually:

```
<repo-root>/.claude/commands/wrap-up.md
```

On this machine the repo root is:
`C:\Users\wbryk\OneDrive\Desktop\Chordwars\.claude\commands\wrap-up.md`
