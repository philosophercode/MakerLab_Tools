"""
Create the 3 linked tables in an existing AirTable base:
  Tools -> Units -> Maintenance_Logs

Usage:
  1. Create a base manually in AirTable
  2. Add AIRTABLE_API_KEY and AIRTABLE_BASE_ID to .env
  3. Run: python setup_airtable.py

The script will:
  - Create the Tools, Units, and Maintenance_Logs tables with all fields
  - Link the tables together (Units -> Tools, Maintenance_Logs -> Units)
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"


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


def create_tools_table(token, base_id):
    """Create the Tools table."""
    payload = {
        "name": "Tools",
        "fields": [
            {"name": "name", "type": "singleLineText"},
            {"name": "description", "type": "multilineText"},
            {"name": "image_url", "type": "url"},
            {
                "name": "zone",
                "type": "singleSelect",
                "options": {
                    "choices": [
                        {"name": "Woodshop"},
                        {"name": "3D Printing"},
                        {"name": "Laser Cutting"},
                        {"name": "CNC"},
                        {"name": "Electronics"},
                        {"name": "Scanning/VR"},
                        {"name": "Sewing"},
                        {"name": "Large Format"},
                    ]
                },
            },
            {
                "name": "type",
                "type": "singleSelect",
                "options": {
                    "choices": [
                        {"name": "Tool"},
                        {"name": "Machine"},
                        {"name": "Accessory"},
                        {"name": "Consumable"},
                    ]
                },
            },
            {"name": "manual_urls", "type": "multilineText"},
            {"name": "manual_attachments", "type": "multipleAttachments"},
            {"name": "purchase_link", "type": "url"},
            {"name": "warranty_info", "type": "singleLineText"},
        ],
    }

    print("Creating Tools table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    tools_table_id = result["id"]
    print(f"  Tools table: {tools_table_id}")
    return tools_table_id


def create_units_table(token, base_id, tools_table_id):
    """Create the Units table linked to Tools."""
    payload = {
        "name": "Units",
        "fields": [
            {"name": "label", "type": "singleLineText"},
            {
                "name": "tool",
                "type": "multipleRecordLinks",
                "options": {"linkedTableId": tools_table_id},
            },
            {"name": "serial_number", "type": "singleLineText"},
            {
                "name": "status",
                "type": "singleSelect",
                "options": {
                    "choices": [
                        {"name": "Available"},
                        {"name": "In Use"},
                        {"name": "Under Maintenance"},
                    ]
                },
            },
        ],
    }

    print("Creating Units table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    units_table_id = result["id"]
    print(f"  Units table: {units_table_id}")
    return units_table_id


def create_maintenance_table(token, base_id, units_table_id):
    """Create the Maintenance_Logs table linked to Units."""
    payload = {
        "name": "Maintenance_Logs",
        "fields": [
            {"name": "title", "type": "singleLineText"},
            {
                "name": "unit",
                "type": "multipleRecordLinks",
                "options": {"linkedTableId": units_table_id},
            },
            {"name": "issue", "type": "multilineText"},
            {"name": "reported_by", "type": "singleLineText"},
            {
                "name": "priority",
                "type": "singleSelect",
                "options": {
                    "choices": [
                        {"name": "Low"},
                        {"name": "Normal"},
                        {"name": "High"},
                        {"name": "Critical"},
                    ]
                },
            },
            {
                "name": "status",
                "type": "singleSelect",
                "options": {
                    "choices": [
                        {"name": "Open"},
                        {"name": "In Progress"},
                        {"name": "Resolved"},
                    ]
                },
            },
        ],
    }

    print("Creating Maintenance_Logs table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    maint_table_id = result["id"]
    print(f"  Maintenance_Logs table: {maint_table_id}")
    return maint_table_id


def main():
    token, base_id = get_config()

    print(f"Using base: {base_id}")
    print()

    # Create Tools table
    tools_table_id = create_tools_table(token, base_id)

    # Create Units table linked to Tools
    units_table_id = create_units_table(token, base_id, tools_table_id)

    # Create Maintenance_Logs table linked to Units
    create_maintenance_table(token, base_id, units_table_id)

    print()
    print("Done! Tables created successfully.")
    print(f"  Base URL: https://airtable.com/{base_id}")
    print()
    print("You can now delete the default 'Table 1' in AirTable if it exists.")


if __name__ == "__main__":
    main()
