# Job acquisition workflow

This repo aims to reduce friction for tracking and following up on applications.

## Quick start
- Log applications in `data/applications.csv`, via the CLI (`scripts/job_tracker.py`), or through the browser UI (`python scripts/web_tracker.py`).
- Capture next actions and dates so you always know what to do next.
- Add notes on referrals, portfolio links, and recruiter contact info.

## Recommended statuses
- `applied`: submitted and waiting.
- `screen`: scheduled screening call.
- `interview`: rounds in progress.
- `offer`: offer under review.
- `rejected`: closed out.
- `on_hold`: pause from company or you.

## CLI examples
- List everything: `python scripts/job_tracker.py list`
- Filter by status: `python scripts/job_tracker.py list --status interview`
- Browse/manage without the terminal: `python scripts/web_tracker.py` then open [http://localhost:5000](http://localhost:5000).
- Add a new application:
  ```bash
  python scripts/job_tracker.py add \
    --company "USACE" \
    --role "Supervisory Architect" \
    --status "applied" \
    --applied-date 2024-12-02 \
    --next-action "send project sheet on SIP builds" \
    --next-action-date 2024-12-05 \
    --contact "recruiter@example.gov" \
    --notes "Highlight AXP-relevant tasks"
  ```
- Update status and follow-up date:
  ```bash
  python scripts/job_tracker.py update \
    --company "USACE" \
    --role "Supervisory Architect" \
    --status "interview" \
    --next-action "prep portfolio call" \
    --next-action-date 2024-12-08
  ```

## Weekly rhythm
- **Monday**: add new leads, send 2–3 fresh applications.
- **Tuesday/Thursday**: follow up on `applied` or `screen` statuses.
- **Friday**: summarize progress and prep materials for next week.

## Tips for architecture/engineering roles
- Attach a one-page project sheet tailored to each employer (SIPs build, hydrology work, LiDAR analysis).
- Keep a short paragraph ready that maps your experience to AXP categories.
- Track clearances and federal hiring paths separately (e.g., USACE).

## Customizing
- The tracker is CSV-based so you can edit it manually or import into Sheets/Notion.
- Add columns if needed; keep the header row aligned with `scripts/job_tracker.py`.
