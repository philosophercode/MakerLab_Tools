"""
Create the Units and Maintenance_Logs tables in AirTable, linked to the
existing Tools table (tblXHIT0mN2nOzdhd).

Units tracks individual physical units of each tool type (e.g., "Prusa #1",
"Prusa #2"). Maintenance_Logs tracks maintenance events, issue reports, and
repairs for individual units.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_units_and_logs.py
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


# ── Step 1: Units table ─────────────────────────────────────────────


def create_units_table(token, base_id):
    """Create the Units table linked to the existing Tools table."""
    fields = [
        {
            "name": "unit_label",
            "type": "singleLineText",
            "description": "Short label identifying this specific unit (e.g., Prusa #1)",
        },
        {
            "name": "tool",
            "type": "multipleRecordLinks",
            "description": "Link to the parent tool in the Tools table",
            "options": {"linkedTableId": TOOLS_TABLE_ID},
        },
        {
            "name": "serial_number",
            "type": "singleLineText",
            "description": "Manufacturer serial number, if available",
        },
        {
            "name": "asset_tag",
            "type": "singleLineText",
            "description": "Cornell or lab-assigned asset identifier",
        },
        {
            "name": "status",
            "type": "singleSelect",
            "description": "Current operational status of this unit",
            "options": {
                "choices": [
                    {"name": "Available"},
                    {"name": "In Use"},
                    {"name": "Under Maintenance"},
                    {"name": "Out of Service"},
                    {"name": "Retired"},
                ]
            },
        },
        {
            "name": "condition",
            "type": "singleSelect",
            "description": "Physical condition assessment",
            "options": {
                "choices": [
                    {"name": "Excellent"},
                    {"name": "Good"},
                    {"name": "Fair"},
                    {"name": "Needs Repair"},
                ]
            },
        },
        {
            "name": "date_acquired",
            "type": "date",
            "description": "Date this unit was acquired or put into service",
            "options": {"dateFormat": {"name": "iso"}},
        },
        {
            "name": "notes",
            "type": "multilineText",
            "description": "General notes about this specific unit",
        },
        {
            "name": "qr_code_id",
            "type": "singleLineText",
            "description": "Unique ID encoded in the physical QR sticker on this unit",
        },
    ]

    payload = {"name": "Units", "fields": fields}

    print("Creating Units table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    table_id = result["id"]
    print(f"  Table ID: {table_id}")
    return table_id


# ── Step 2: Maintenance_Logs table ──────────────────────────────────


def create_maintenance_logs_table(token, base_id, units_table_id):
    """Create the Maintenance_Logs table linked to the Units table."""
    fields = [
        {
            "name": "title",
            "type": "singleLineText",
            "description": "Brief summary of the maintenance event or issue",
        },
        {
            "name": "unit",
            "type": "multipleRecordLinks",
            "description": "Link to the specific unit this log entry applies to",
            "options": {"linkedTableId": units_table_id},
        },
        {
            "name": "type",
            "type": "singleSelect",
            "description": "Category of maintenance event",
            "options": {
                "choices": [
                    {"name": "Issue Report"},
                    {"name": "Preventive Maintenance"},
                    {"name": "Repair"},
                    {"name": "Inspection"},
                    {"name": "Calibration"},
                ]
            },
        },
        {
            "name": "priority",
            "type": "singleSelect",
            "description": "Urgency level of this maintenance item",
            "options": {
                "choices": [
                    {"name": "Critical"},
                    {"name": "High"},
                    {"name": "Medium"},
                    {"name": "Low"},
                ]
            },
        },
        {
            "name": "status",
            "type": "singleSelect",
            "description": "Current resolution status",
            "options": {
                "choices": [
                    {"name": "Open"},
                    {"name": "In Progress"},
                    {"name": "Resolved"},
                    {"name": "Closed"},
                ]
            },
        },
        {
            "name": "reported_by",
            "type": "singleLineText",
            "description": "Name or Cornell NetID of the person who reported this",
        },
        {
            "name": "assigned_to",
            "type": "singleLineText",
            "description": "Staff member responsible for resolving this item",
        },
        {
            "name": "description",
            "type": "multilineText",
            "description": "Detailed description of the issue, work performed, or findings",
        },
        {
            "name": "resolution",
            "type": "multilineText",
            "description": "Description of how the issue was resolved or what maintenance was performed",
        },
        {
            "name": "date_reported",
            "type": "date",
            "description": "Date this item was reported or created",
            "options": {"dateFormat": {"name": "iso"}},
        },
        {
            "name": "date_resolved",
            "type": "date",
            "description": "Date this item was resolved or closed",
            "options": {"dateFormat": {"name": "iso"}},
        },
        {
            "name": "photo_attachments",
            "type": "multipleAttachments",
            "description": "Photos documenting the issue, repair process, or final state",
        },
    ]

    payload = {"name": "Maintenance_Logs", "fields": fields}

    print("Creating Maintenance_Logs table...")
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

    # Step 1: Create Units table (must be first — Maintenance_Logs links to it)
    units_table_id = create_units_table(token, base_id)
    print()

    # Step 2: Create Maintenance_Logs table (links to Units)
    logs_table_id = create_maintenance_logs_table(token, base_id, units_table_id)
    print()

    # Summary
    print("Done! Both tables created successfully.")
    print(f"  Units:            {units_table_id}")
    print(f"  Maintenance_Logs: {logs_table_id}")
    print(f"  Base URL:         https://airtable.com/{base_id}")


if __name__ == "__main__":
    main()
