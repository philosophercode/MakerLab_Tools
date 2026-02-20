"""
Export all 5 AirTable tables to JSON files, preserving record IDs and linkages.

Produces one JSON file per table in a dated folder:
  export-YYYY-MM-DD/
    tools.json
    categories.json
    locations.json
    units.json
    maintenance_logs.json

Each file contains an array of records with { id, createdTime, fields }.
Linked record fields (e.g. tool.category -> ["recXXX"]) are preserved as-is
so the full graph of relationships can be reconstructed offline.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python export_all_tables.py
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import date

API_URL = "https://api.airtable.com/v0"

TABLES = {
    "tools": "tblXHIT0mN2nOzdhd",
    "categories": "tblNpVHquh7H0S8Bc",
    "locations": "tblbwtZhuvtuBKlPO",
    "units": "tblDtKMcCxTyQbXwi",
    "maintenance_logs": "tbl22sgbMLCFbvynl",
}


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


def api_request(path, token):
    """Make a GET request to the AirTable API and return parsed JSON."""
    url = f"{API_URL}{path}"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            retry_after = e.headers.get("Retry-After", "2")
            delay = int(retry_after)
            print(f"  Rate limited, waiting {delay}s...")
            time.sleep(delay)
            return api_request(path, token)
        body = e.read().decode() if e.fp else ""
        print(f"Error {e.code}: {body}")
        raise


def fetch_all_records(base_id, table_id, token):
    """Fetch all records from a table, handling pagination."""
    records = []
    offset = None

    while True:
        path = f"/{base_id}/{table_id}"
        if offset:
            path += f"?offset={offset}"

        data = api_request(path, token)
        records.extend(data.get("records", []))
        offset = data.get("offset")

        if not offset:
            break

        # Small delay between pages to be polite to the API
        time.sleep(0.2)

    return records


def main():
    token, base_id = get_config()
    script_dir = os.path.dirname(os.path.abspath(__file__))

    today = date.today().isoformat()
    export_dir = os.path.join(script_dir, f"export-{today}")
    os.makedirs(export_dir, exist_ok=True)

    print(f"Exporting from base {base_id}...")
    print(f"Output: export-{today}/")
    print()

    for name, table_id in TABLES.items():
        print(f"Fetching {name} ({table_id})...")
        records = fetch_all_records(base_id, table_id, token)
        print(f"  {len(records)} records")

        out_path = os.path.join(export_dir, f"{name}.json")
        with open(out_path, "w") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        print(f"  Saved to {name}.json")

        # Delay between tables to avoid rate limits
        time.sleep(0.5)

    print()
    print(f"Done. export-{today}/")
    for name in TABLES:
        path = os.path.join(export_dir, f"{name}.json")
        size = os.path.getsize(path)
        print(f"  {name}.json  ({size:,} bytes)")


if __name__ == "__main__":
    main()
