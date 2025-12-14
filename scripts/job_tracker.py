#!/usr/bin/env python3
"""
Minimal CSV-backed job application tracker.

Fields: company, role, status, applied_date, next_action, next_action_date, contact, notes

Example usage:
  python scripts/job_tracker.py list
  python scripts/job_tracker.py add --company "ACME" --role "Architect" --status "applied" \
      --applied-date 2024-12-02 --next-action "send work samples" --next-action-date 2024-12-05
  python scripts/job_tracker.py update --company "ACME" --role "Architect" --status "interview"
"""
from __future__ import annotations

import argparse
import csv
from datetime import date
from pathlib import Path
from typing import List, Dict

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "applications.csv"
FIELDNAMES = [
    "company",
    "role",
    "status",
    "applied_date",
    "next_action",
    "next_action_date",
    "contact",
    "notes",
]


def load_rows(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def save_rows(path: Path, rows: List[Dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def add_application(args: argparse.Namespace) -> None:
    rows = load_rows(DATA_PATH)
    record = {
        "company": args.company,
        "role": args.role,
        "status": args.status,
        "applied_date": args.applied_date,
        "next_action": args.next_action or "",
        "next_action_date": args.next_action_date or "",
        "contact": args.contact or "",
        "notes": args.notes or "",
    }
    rows.append(record)
    save_rows(DATA_PATH, rows)
    print(f"Added application for {args.company} - {args.role} (status: {args.status}).")


def list_applications(args: argparse.Namespace) -> None:
    rows = load_rows(DATA_PATH)
    if args.status:
        rows = [r for r in rows if r.get("status") == args.status]
    if not rows:
        print("No applications found.")
        return

    print("company | role | status | applied_date | next_action | next_action_date | contact | notes")
    for r in rows:
        print(
            " | ".join(
                [
                    r.get("company", ""),
                    r.get("role", ""),
                    r.get("status", ""),
                    r.get("applied_date", ""),
                    r.get("next_action", ""),
                    r.get("next_action_date", ""),
                    r.get("contact", ""),
                    r.get("notes", ""),
                ]
            )
        )


def update_application(args: argparse.Namespace) -> None:
    rows = load_rows(DATA_PATH)
    updated = False
    for r in rows:
        if r.get("company") == args.company and r.get("role") == args.role:
            if args.status:
                r["status"] = args.status
            if args.next_action is not None:
                r["next_action"] = args.next_action
            if args.next_action_date is not None:
                r["next_action_date"] = args.next_action_date
            if args.contact is not None:
                r["contact"] = args.contact
            if args.notes is not None:
                r["notes"] = args.notes
            updated = True
    if not updated:
        print("No matching application found.")
    else:
        save_rows(DATA_PATH, rows)
        print(f"Updated application for {args.company} - {args.role}.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="CSV-backed job application tracker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Add a new application")
    add_parser.add_argument("--company", required=True)
    add_parser.add_argument("--role", required=True)
    add_parser.add_argument("--status", required=True, help="e.g., applied, interview, offer, rejected")
    add_parser.add_argument("--applied-date", default=str(date.today()))
    add_parser.add_argument("--next-action")
    add_parser.add_argument("--next-action-date")
    add_parser.add_argument("--contact")
    add_parser.add_argument("--notes")
    add_parser.set_defaults(func=add_application)

    list_parser = subparsers.add_parser("list", help="List applications")
    list_parser.add_argument("--status", help="Filter by status")
    list_parser.set_defaults(func=list_applications)

    update_parser = subparsers.add_parser("update", help="Update an existing application")
    update_parser.add_argument("--company", required=True)
    update_parser.add_argument("--role", required=True)
    update_parser.add_argument("--status")
    update_parser.add_argument("--next-action")
    update_parser.add_argument("--next-action-date")
    update_parser.add_argument("--contact")
    update_parser.add_argument("--notes")
    update_parser.set_defaults(func=update_application)

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
