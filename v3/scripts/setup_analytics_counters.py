"""
Add analytics counter fields to the existing Tools table in AirTable.

Adds three integer fields: view_count, chat_mention_count, and flag_count.
These are denormalized counters updated by the analytics system for fast reads.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_analytics_counters.py
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"


# -- Config -------------------------------------------------------------------


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


# -- API helpers --------------------------------------------------------------


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


# -- Add counter fields -------------------------------------------------------


COUNTER_FIELDS = [
    {
        "name": "view_count",
        "type": "number",
        "description": "Total page views for this tool",
        "options": {"precision": 0},
    },
    {
        "name": "chat_mention_count",
        "type": "number",
        "description": "Times this tool was asked about in AI chat",
        "options": {"precision": 0},
    },
    {
        "name": "flag_count",
        "type": "number",
        "description": "Total content flags submitted for this tool",
        "options": {"precision": 0},
    },
]


def add_counter_fields(token, base_id):
    """Add the three analytics counter fields to the Tools table."""
    path = f"/meta/bases/{base_id}/tables/{TOOLS_TABLE_ID}/fields"

    for field in COUNTER_FIELDS:
        print(f"  Adding field: {field['name']}...")
        result = api_request("POST", path, token, field)
        print(f"    Field ID: {result.get('id')} (type: {result.get('type')})")

    print()
    print("All counter fields added successfully.")


# -- Main ---------------------------------------------------------------------


def main():
    token, base_id = get_config()

    print(f"Using base: {base_id}")
    print(f"Adding counter fields to Tools table: {TOOLS_TABLE_ID}")
    print()

    add_counter_fields(token, base_id)


if __name__ == "__main__":
    main()
