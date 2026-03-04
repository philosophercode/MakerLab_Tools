"""
Assign qr_code_id to any units that are missing one.

Run this after manually adding units in Airtable to ensure every unit
has a QR code ID for scanning.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python backfill_qr_codes.py
"""

import json
import os
import secrets
import sys
import time
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"
UNITS_TABLE_ID = "tblDtKMcCxTyQbXwi"


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
        url, data=body, method=method,
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
            return api_request(method, path, token, data)
        error_body = e.read().decode() if e.fp else ""
        print(f"Error {e.code}: {error_body}")
        raise


def fetch_all_units(token, base_id):
    records = []
    offset = None
    while True:
        url = f"{API_URL}/{base_id}/{UNITS_TABLE_ID}"
        if offset:
            url += f"?offset={offset}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        })
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        records.extend(data["records"])
        offset = data.get("offset")
        if not offset:
            break
    return records


def main():
    token, base_id = get_config()

    print("Fetching all units...")
    units = fetch_all_units(token, base_id)
    print(f"Found {len(units)} total units")

    # Collect existing QR codes to avoid duplicates
    existing_qr = {
        u["fields"]["qr_code_id"]
        for u in units
        if u["fields"].get("qr_code_id")
    }

    # Find units missing qr_code_id
    missing = [u for u in units if not u["fields"].get("qr_code_id")]

    if not missing:
        print("All units already have qr_code_id. Nothing to do.")
        return

    print(f"Found {len(missing)} units without qr_code_id")
    print()

    # Generate unique QR codes and batch update
    updates = []
    for unit in missing:
        # Generate a unique 8-char hex ID
        while True:
            qr_id = secrets.token_hex(4)
            if qr_id not in existing_qr:
                existing_qr.add(qr_id)
                break

        label = unit["fields"].get("unit_label", "unknown")
        updates.append({
            "id": unit["id"],
            "fields": {"qr_code_id": qr_id},
        })
        print(f"  {label} -> {qr_id}")

    # Batch update in groups of 10
    updated = 0
    for i in range(0, len(updates), 10):
        batch = updates[i:i + 10]
        api_request(
            "PATCH",
            f"/{base_id}/{UNITS_TABLE_ID}",
            token,
            {"records": batch},
        )
        updated += len(batch)
        time.sleep(0.3)

    print()
    print(f"Done. Assigned qr_code_id to {updated} units.")


if __name__ == "__main__":
    main()
