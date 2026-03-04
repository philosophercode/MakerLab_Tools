"""
Create the Analytics_Events table in AirTable, linked to the existing Tools
table (tblXHIT0mN2nOzdhd).

Analytics_Events tracks anonymous usage telemetry: page views, searches,
chat interactions, flags, and maintenance log creation.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_analytics_table.py
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


# -- Create Analytics_Events table --------------------------------------------


def create_analytics_events_table(token, base_id):
    """Create the Analytics_Events table linked to the existing Tools table."""
    fields = [
        {
            "name": "title",
            "type": "singleLineText",
            "description": "Auto-generated event summary (primary field), e.g. 'page_view: Prusa i3'",
        },
        {
            "name": "event_type",
            "type": "singleSelect",
            "description": "The type of analytics event being recorded",
            "options": {
                "choices": [
                    {"name": "page_view"},
                    {"name": "search"},
                    {"name": "chat_question"},
                    {"name": "chat_tool_reference"},
                    {"name": "flag_submitted"},
                    {"name": "maintenance_created"},
                ]
            },
        },
        {
            "name": "tool",
            "type": "multipleRecordLinks",
            "description": "Link to the tool this event is associated with (if any)",
            "options": {"linkedTableId": TOOLS_TABLE_ID},
        },
        {
            "name": "detail",
            "type": "singleLineText",
            "description": "Event-specific data (search query, question text, flag field, etc.)",
        },
        {
            "name": "session_id",
            "type": "singleLineText",
            "description": "Anonymous UUID identifying the browser session",
        },
        {
            "name": "timestamp",
            "type": "dateTime",
            "description": "Date and time this event occurred",
            "options": {
                "timeZone": "America/New_York",
                "dateFormat": {"name": "iso"},
                "timeFormat": {"name": "24hour"},
            },
        },
    ]

    payload = {"name": "Analytics_Events", "fields": fields}

    print("Creating Analytics_Events table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    table_id = result["id"]
    print(f"  Table ID: {table_id}")
    return table_id


# -- Main ---------------------------------------------------------------------


def main():
    token, base_id = get_config()

    print(f"Using base: {base_id}")
    print(f"Linking to existing Tools table: {TOOLS_TABLE_ID}")
    print()

    table_id = create_analytics_events_table(token, base_id)
    print()

    print("Done! Analytics_Events table created successfully.")
    print(f"  Analytics_Events: {table_id}")
    print(f"  Base URL: https://airtable.com/{base_id}")
    print()
    print("Next steps:")
    print(f'  1. Add \'analytics_events: "{table_id}"\' to TABLES in v3/app/src/lib/airtable.ts')
    print(f"  2. Add '- Analytics_Events table: `{table_id}`' to CLAUDE.md AirTable IDs section")


if __name__ == "__main__":
    main()
