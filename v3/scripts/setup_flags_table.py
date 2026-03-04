"""
Create the Flags table in AirTable, linked to the existing Tools table
(tblXHIT0mN2nOzdhd).

Flags tracks community-reported content corrections for tool descriptions,
images, and other fields.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_flags_table.py
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"


# ── Config ───────────────────────────────────────────────────────────


def get_config():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    config = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    config[key] = val

    token = config.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_API_KEY")
    base_id = config.get("AIRTABLE_BASE_ID") or os.environ.get("AIRTABLE_BASE_ID")

    if not token:
        print("Error: AIRTABLE_API_KEY not found in .env or environment.")
        sys.exit(1)
    if not base_id:
        print("Error: AIRTABLE_BASE_ID not found in .env or environment.")
        sys.exit(1)

    return token, base_id


# ── API helpers ──────────────────────────────────────────────────────


def api_request(method, path, token, data=None):
    """Make an AirTable API request and return parsed JSON."""
    url = f"{API_URL}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"API Error {e.code}: {error_body}")
        sys.exit(1)


# ── Create Flags table ──────────────────────────────────────────────


def create_flags_table(token, base_id):
    """Create the Flags table linked to the existing Tools table."""
    fields = [
        {
            "name": "title",
            "type": "singleLineText",
            "description": "Auto-generated summary of the flag (primary field)",
        },
        {
            "name": "field_flagged",
            "type": "singleSelect",
            "description": "Which field of the tool record has incorrect information",
            "options": {
                "choices": [
                    {"name": "description"},
                    {"name": "image"},
                    {"name": "name"},
                    {"name": "category"},
                    {"name": "location"},
                    {"name": "materials"},
                    {"name": "safety_info"},
                ]
            },
        },
        {
            "name": "tool",
            "type": "multipleRecordLinks",
            "description": "Link to the tool whose content is being flagged",
            "options": {"linkedTableId": TOOLS_TABLE_ID},
        },
        {
            "name": "issue_description",
            "type": "multilineText",
            "description": "Description of what is wrong with the flagged content",
        },
        {
            "name": "suggested_fix",
            "type": "multilineText",
            "description": "Optional suggestion for what the correct information should be",
        },
        {
            "name": "reporter",
            "type": "singleLineText",
            "description": "Name or Cornell NetID of the person who submitted this flag (optional)",
        },
        {
            "name": "status",
            "type": "singleSelect",
            "description": "Current review status of this flag",
            "options": {
                "choices": [
                    {"name": "New"},
                    {"name": "Reviewed"},
                    {"name": "Fixed"},
                    {"name": "Dismissed"},
                ]
            },
        },
        {
            "name": "created_at",
            "type": "dateTime",
            "description": "Date and time this flag was submitted",
            "options": {
                "timeZone": "America/New_York",
                "dateFormat": {"name": "iso"},
                "timeFormat": {"name": "24hour"},
            },
        },
    ]

    payload = {"name": "Flags", "fields": fields}

    print("Creating Flags table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    table_id = result["id"]
    print(f"  Table ID: {table_id}")
    return table_id


# ── Main ─────────────────────────────────────────────────────────────


def main():
    token, base_id = get_config()

    print(f"Using base: {base_id}")
    print(f"Linking to existing Tools table: {TOOLS_TABLE_ID}")
    print()

    flags_table_id = create_flags_table(token, base_id)
    print()

    print("Done! Flags table created successfully.")
    print(f"  Flags: {flags_table_id}")
    print(f"  Base URL: https://airtable.com/{base_id}")
    print()
    print("Next steps:")
    print(f"  1. Add 'flags: \"{flags_table_id}\"' to TABLES in v3/app/src/lib/airtable.ts")
    print(f"  2. Add '- Flags table: `{flags_table_id}`' to CLAUDE.md AirTable IDs section")


if __name__ == "__main__":
    main()
