"""
Add a 'notes' field to the existing Tools table in AirTable.

This adds a multilineText field for user-visible notes (tips, quirks, known issues).

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_notes_field.py
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"


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


def api_request(method, path, token, data=None):
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


def main():
    token, base_id = get_config()

    print(f"Using base: {base_id}")
    print(f"Adding 'notes' field to Tools table: {TOOLS_TABLE_ID}")
    print()

    field_payload = {
        "name": "notes",
        "type": "multilineText",
        "description": "User-visible notes about this tool (tips, quirks, known issues)",
    }

    result = api_request(
        "POST",
        f"/meta/bases/{base_id}/tables/{TOOLS_TABLE_ID}/fields",
        token,
        field_payload,
    )

    print(f"Field created: {result.get('name')} (type: {result.get('type')})")
    print(f"Field ID: {result.get('id')}")
    print()
    print("Done! The 'notes' field has been added to the Tools table.")


if __name__ == "__main__":
    main()
