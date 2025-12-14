#!/usr/bin/env python3
"""
Minimal Flask web UI for the CSV-backed job application tracker.
- Lists current applications with an optional status filter.
- Adds new applications.
- Updates an existing application by company + role (status, next action, etc.).

Run:
  python scripts/web_tracker.py
Then open http://localhost:5000 in your browser.
"""
from __future__ import annotations

from datetime import date
from typing import List

from flask import Flask, redirect, render_template_string, request, url_for

from scripts.job_tracker import DATA_PATH, FIELDNAMES, load_rows, save_rows

app = Flask(__name__)


def _sorted_statuses(rows: List[dict]) -> List[str]:
    return sorted({r.get("status", "") for r in rows if r.get("status")})


def _template() -> str:
    # Inline template keeps this script self-contained and easy to run.
    return """
    <!doctype html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Job Tracker</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 2rem auto; max-width: 1100px; }
            table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
            th, td { border: 1px solid #ccc; padding: 0.5rem; vertical-align: top; }
            th { background: #f5f5f5; text-align: left; }
            form { margin: 1rem 0; padding: 1rem; border: 1px solid #ddd; }
            label { display: block; margin-bottom: 0.25rem; font-weight: bold; }
            input[type="text"], input[type="date"], select, textarea { width: 100%; padding: 0.4rem; margin-bottom: 0.75rem; }
            .row { display: flex; gap: 1rem; }
            .col { flex: 1; }
            .message { background: #eef6ff; border: 1px solid #c8ddff; padding: 0.75rem; margin: 0.5rem 0; }
        </style>
    </head>
    <body>
        <h1>Job Tracker</h1>
        {% if message %}<div class="message">{{ message }}</div>{% endif %}

        <form method="get" action="{{ url_for('index') }}">
            <label for="status">Filter by status</label>
            <div class="row">
                <div class="col">
                    <select id="status" name="status">
                        <option value="">All</option>
                        {% for status in statuses %}
                            <option value="{{ status }}" {% if status==status_filter %}selected{% endif %}>{{ status }}</option>
                        {% endfor %}
                    </select>
                </div>
                <div><button type="submit">Apply filter</button></div>
            </div>
        </form>

        <table>
            <thead>
                <tr>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Applied</th>
                    <th>Next action</th>
                    <th>Next action date</th>
                    <th>Contact</th>
                    <th>Notes</th>
                </tr>
            </thead>
            <tbody>
                {% if rows %}
                    {% for r in rows %}
                    <tr>
                        <td>{{ r.company }}</td>
                        <td>{{ r.role }}</td>
                        <td>{{ r.status }}</td>
                        <td>{{ r.applied_date }}</td>
                        <td>{{ r.next_action }}</td>
                        <td>{{ r.next_action_date }}</td>
                        <td>{{ r.contact }}</td>
                        <td>{{ r.notes }}</td>
                    </tr>
                    {% endfor %}
                {% else %}
                    <tr><td colspan="8">No applications yet.</td></tr>
                {% endif %}
            </tbody>
        </table>

        <div class="row">
            <div class="col">
                <form method="post" action="{{ url_for('add') }}">
                    <h2>Add application</h2>
                    <label>Company</label>
                    <input type="text" name="company" required>
                    <label>Role</label>
                    <input type="text" name="role" required>
                    <label>Status</label>
                    <input type="text" name="status" placeholder="applied/interview/offer" required>
                    <label>Applied date</label>
                    <input type="date" name="applied_date" value="{{ today }}">
                    <label>Next action</label>
                    <input type="text" name="next_action" placeholder="e.g., send work samples">
                    <label>Next action date</label>
                    <input type="date" name="next_action_date">
                    <label>Contact</label>
                    <input type="text" name="contact" placeholder="recruiter@example.com">
                    <label>Notes</label>
                    <textarea name="notes" rows="3"></textarea>
                    <button type="submit">Add</button>
                </form>
            </div>
            <div class="col">
                <form method="post" action="{{ url_for('update') }}">
                    <h2>Update application</h2>
                    <p>Match by company + role. Leave a field blank to keep its current value.</p>
                    <label>Company</label>
                    <input type="text" name="company" required>
                    <label>Role</label>
                    <input type="text" name="role" required>
                    <label>Status</label>
                    <input type="text" name="status" placeholder="applied/interview/offer">
                    <label>Next action</label>
                    <input type="text" name="next_action" placeholder="e.g., schedule screening">
                    <label>Next action date</label>
                    <input type="date" name="next_action_date">
                    <label>Contact</label>
                    <input type="text" name="contact" placeholder="recruiter@example.com">
                    <label>Notes</label>
                    <textarea name="notes" rows="3"></textarea>
                    <button type="submit">Update</button>
                </form>
            </div>
        </div>
    </body>
    </html>
    """


@app.route("/", methods=["GET"])
def index():
    rows = load_rows(DATA_PATH)
    status_filter = request.args.get("status", "")
    if status_filter:
        rows = [r for r in rows if r.get("status") == status_filter]

    # Map to simple objects for templating (attribute access).
    class RowObj:
        def __init__(self, data: dict):
            for key in FIELDNAMES:
                setattr(self, key, data.get(key, ""))

    row_objs = [RowObj(r) for r in rows]
    message = request.args.get("msg", "")
    return render_template_string(
        _template(),
        rows=row_objs,
        statuses=_sorted_statuses(load_rows(DATA_PATH)),
        status_filter=status_filter,
        message=message,
        today=date.today().isoformat(),
    )


@app.route("/add", methods=["POST"])
def add():
    data = {field: request.form.get(field, "") for field in FIELDNAMES}
    data["applied_date"] = data["applied_date"] or date.today().isoformat()

    rows = load_rows(DATA_PATH)
    rows.append(data)
    save_rows(DATA_PATH, rows)
    return redirect(url_for("index", msg=f"Added {data['company']} - {data['role']}"))


@app.route("/update", methods=["POST"])
def update():
    company = request.form.get("company", "").strip()
    role = request.form.get("role", "").strip()
    if not company or not role:
        return redirect(url_for("index", msg="Company and role are required to update."))

    rows = load_rows(DATA_PATH)
    updated = False
    for r in rows:
        if r.get("company") == company and r.get("role") == role:
            for field in ["status", "next_action", "next_action_date", "contact", "notes"]:
                incoming = request.form.get(field)
                if incoming is not None and incoming != "":
                    r[field] = incoming
            updated = True

    if updated:
        save_rows(DATA_PATH, rows)
        msg = f"Updated {company} - {role}"
    else:
        msg = "No matching application found."
    return redirect(url_for("index", msg=msg))


if __name__ == "__main__":
    app.run(debug=True)
