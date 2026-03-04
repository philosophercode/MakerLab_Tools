"""
Create the Verified_QA table in AirTable, linked to the existing Tools table.

Verified_QA stores AI-summarized Q&A pairs that users have confirmed as helpful.
These are crowdsourced from the chat feedback widget and can later be surfaced
as a FAQ or fed back into AI prompts.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_verified_qa_table.py
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


# ── Create Verified_QA table ─────────────────────────────────────────


def create_verified_qa_table(token, base_id):
    """Create the Verified_QA table linked to the existing Tools table."""
    fields = [
        {
            "name": "title",
            "type": "singleLineText",
            "description": "Auto-generated short label for this Q&A entry",
        },
        {
            "name": "question",
            "type": "multilineText",
            "description": "The summarized question from the chat exchange",
        },
        {
            "name": "answer",
            "type": "multilineText",
            "description": "The summarized answer from the chat exchange",
        },
        {
            "name": "tool",
            "type": "multipleRecordLinks",
            "description": "Link to the tool this Q&A is about, if applicable",
            "options": {"linkedTableId": TOOLS_TABLE_ID},
        },
        {
            "name": "source_summary",
            "type": "singleLineText",
            "description": "One-line solution summary from the AI when feedback was offered",
        },
        {
            "name": "helpful_count",
            "type": "number",
            "description": "Number of times users confirmed this answer was helpful (starts at 1)",
            "options": {"precision": 0},
        },
        {
            "name": "created_at",
            "type": "singleLineText",
            "description": "ISO 8601 timestamp of when this Q&A was created",
        },
    ]

    payload = {"name": "Verified_QA", "fields": fields}

    print("Creating Verified_QA table...")
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

    table_id = create_verified_qa_table(token, base_id)
    print()

    print("Done! Verified_QA table created successfully.")
    print(f"  Verified_QA: {table_id}")
    print(f"  Base URL:    https://airtable.com/{base_id}")
    print()
    print("IMPORTANT: Add this table ID to CLAUDE.md and v3/app/src/lib/airtable.ts")


if __name__ == "__main__":
    main()
