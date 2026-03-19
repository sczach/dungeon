# Session Resume

Follow these steps in order at the start of every session. This step is read-only — do not modify any files during resume.

---

## Step 0 — Pull before anything else

Run `git pull` on the current branch. Report the result. If there are conflicts, stop and inform the user before proceeding.

---

## Step 1 — Read the handoff log

Read `docs/context/HANDOFF.md`. The file is a running log with the newest entry at the top. Summarise only the top entry. Do not summarise older entries unless the user asks.

Report the following from that entry:
- Current phase
- What is confirmed working
- What is broken or in progress
- Open PRs and their merge status
- The numbered priority list for this session

---

## Step 2 — Read the project history (one paragraph only)

Read the last paragraph of `docs/context/PROJECT_HISTORY.md` and report it in one sentence. This gives a sense of momentum without re-reading the full history.

---

## Step 3 — Confirm the starting state

State clearly:
- Which branch is currently checked out
- Whether there are any uncommitted local changes (`git status`)
- Whether any PRs from the previous handoff are still open
  (based on what the handoff says — you cannot query GitHub directly)

---

## Step 4 — Propose the first task

Based on the handoff's "Next session should" list, propose the first task. Ask the user to confirm or redirect before writing a single line of code.
