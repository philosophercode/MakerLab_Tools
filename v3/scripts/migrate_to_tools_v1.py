"""
Migrate AirTable base from old Tools table to Tools_v1.

Steps:
  1. Upload images from ./tool_images/ to Tools_v1 image_attachments field
  2. Export all Units data (resolving linked tool names)
  3. Delete old tables: Maintenance_Logs, Units, Tools, Table 1
  4. Recreate Units and Maintenance_Logs linked to Tools_v1
  5. Re-import Units data linked to Tools_v1 records

Usage:
  python migrate_to_tools_v1.py
"""

import io
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

API_URL = "https://api.airtable.com/v0"
CONTENT_URL = "https://content.airtable.com/v0"
IMAGES_DIR = os.path.join(os.path.dirname(__file__), "tool_images")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def api_request(method, path, token, data=None):
    """Make a JSON API request to AirTable. Returns parsed response."""
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
        raw = resp.read()
        if raw:
            return json.loads(raw)
        return None
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"  API Error {e.code}: {error_body}")
        raise


def api_request_fatal(method, path, token, data=None):
    """Like api_request but exits on error."""
    try:
        return api_request(method, path, token, data)
    except urllib.error.HTTPError:
        sys.exit(1)


def get_table_map(token, base_id):
    """Return {table_name: table_id} for all tables in the base."""
    data = api_request_fatal("GET", f"/meta/bases/{base_id}/tables", token)
    return {t["name"]: t["id"] for t in data["tables"]}


def fetch_all_records(token, base_id, table_id, fields=None):
    """Fetch all records from a table, handling pagination."""
    records = []
    params = ""
    if fields:
        field_params = "&".join(f"fields%5B%5D={urllib.request.quote(f)}" for f in fields)
        params = f"?{field_params}"

    offset = None
    while True:
        sep = "&" if params else "?"
        offset_param = f"{sep}offset={offset}" if offset else ""
        result = api_request_fatal(
            "GET",
            f"/{base_id}/{table_id}{params}{offset_param}",
            token,
        )
        records.extend(result.get("records", []))
        offset = result.get("offset")
        if not offset:
            break
        time.sleep(0.25)

    return records


# ---------------------------------------------------------------------------
# Multipart form data helper (stdlib only, no requests)
# ---------------------------------------------------------------------------

def encode_multipart_formdata(file_path):
    """Encode a file as multipart/form-data for upload. Returns (body, content_type)."""
    boundary = f"----PythonBoundary{uuid.uuid4().hex}"
    filename = os.path.basename(file_path)
    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"

    with open(file_path, "rb") as f:
        file_data = f.read()

    body = io.BytesIO()
    # File part
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    )
    body.write(f"Content-Type: {mime_type}\r\n".encode())
    body.write(b"\r\n")
    body.write(file_data)
    body.write(b"\r\n")
    # Closing boundary
    body.write(f"--{boundary}--\r\n".encode())

    content_type = f"multipart/form-data; boundary={boundary}"
    return body.getvalue(), content_type


def upload_attachment(token, base_id, record_id, field_name, file_path):
    """Upload a file to an attachment field via the AirTable content API."""
    body, content_type = encode_multipart_formdata(file_path)
    encoded_field = urllib.request.quote(field_name)
    url = f"{CONTENT_URL}/{base_id}/{record_id}/{encoded_field}/uploadAttachment"

    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
        },
    )
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"    Upload error {e.code}: {error_body}")
        return None


# ---------------------------------------------------------------------------
# Step 1: Upload images to Tools_v1
# ---------------------------------------------------------------------------

def step1_upload_images(token, base_id, tools_v1_table_id):
    print("=" * 60)
    print("STEP 1: Upload images to Tools_v1")
    print("=" * 60)
    print()

    # Fetch all Tools_v1 records to get name -> record_id mapping
    print("Fetching Tools_v1 records...")
    records = fetch_all_records(token, base_id, tools_v1_table_id, fields=["name"])
    name_to_record = {}
    for rec in records:
        name = rec["fields"].get("name", "").strip()
        if name:
            name_to_record[name] = rec["id"]
    print(f"  Found {len(name_to_record)} tools in Tools_v1")

    # Build a lowercase lookup for case-insensitive matching
    lower_lookup = {}
    for name, rid in name_to_record.items():
        lower_lookup[name.lower().strip()] = (name, rid)

    # Collect image files
    if not os.path.isdir(IMAGES_DIR):
        print(f"  Error: Image directory not found: {IMAGES_DIR}")
        return
    image_files = sorted([
        f for f in os.listdir(IMAGES_DIR)
        if os.path.isfile(os.path.join(IMAGES_DIR, f))
        and not f.startswith(".")
    ])
    print(f"  Found {len(image_files)} image files")
    print()

    matched = 0
    unmatched = 0
    uploaded = 0
    failed = 0

    for img_file in image_files:
        # Strip extension to get the tool name
        name_without_ext = os.path.splitext(img_file)[0].strip()
        file_path = os.path.join(IMAGES_DIR, img_file)

        # Try exact match first
        record_id = name_to_record.get(name_without_ext)
        match_name = name_without_ext

        # Try case-insensitive match
        if not record_id:
            result = lower_lookup.get(name_without_ext.lower().strip())
            if result:
                match_name, record_id = result

        # Try trimmed/normalized match (strip trailing commas, periods, etc.)
        if not record_id:
            cleaned = name_without_ext.rstrip(".,;").strip()
            result = lower_lookup.get(cleaned.lower())
            if result:
                match_name, record_id = result

        if not record_id:
            print(f"  NO MATCH: {img_file}")
            unmatched += 1
            continue

        matched += 1
        print(f"  Uploading: {img_file} -> {match_name}")
        result = upload_attachment(token, base_id, record_id, "image_attachments", file_path)
        if result:
            uploaded += 1
        else:
            failed += 1

        time.sleep(0.25)

    print()
    print(f"  Images matched:   {matched}")
    print(f"  Images unmatched: {unmatched}")
    print(f"  Uploads success:  {uploaded}")
    print(f"  Uploads failed:   {failed}")
    print()


# ---------------------------------------------------------------------------
# Step 2: Export Units data
# ---------------------------------------------------------------------------

def step2_export_units(token, base_id, tables):
    print("=" * 60)
    print("STEP 2: Export Units data")
    print("=" * 60)
    print()

    units_table_id = tables.get("Units")
    tools_table_id = tables.get("Tools")

    if not units_table_id:
        print("  Error: Units table not found.")
        return []
    if not tools_table_id:
        print("  Error: Tools table not found.")
        return []

    # Fetch old Tools table to build record_id -> name mapping
    print("Fetching old Tools records...")
    tool_records = fetch_all_records(token, base_id, tools_table_id, fields=["name"])
    tool_id_to_name = {}
    for rec in tool_records:
        name = rec["fields"].get("name", "")
        tool_id_to_name[rec["id"]] = name
    print(f"  Found {len(tool_id_to_name)} tool records")

    # Fetch Units records
    print("Fetching Units records...")
    unit_records = fetch_all_records(
        token, base_id, units_table_id,
        fields=["label", "tool", "serial_number", "status"],
    )
    print(f"  Found {len(unit_records)} unit records")

    # Resolve tool links and build export data
    exported = []
    for rec in unit_records:
        fields = rec["fields"]
        tool_links = fields.get("tool", [])
        tool_name = None
        if tool_links:
            # tool is a list of linked record IDs
            tool_name = tool_id_to_name.get(tool_links[0], "UNKNOWN")

        exported.append({
            "tool_name": tool_name,
            "serial_number": fields.get("serial_number"),
            "status": fields.get("status"),
            "label": fields.get("label"),
        })

    # Save to JSON as backup
    backup_path = os.path.join(os.path.dirname(__file__), "units_export.json")
    with open(backup_path, "w") as f:
        json.dump(exported, f, indent=2)
    print(f"  Exported {len(exported)} units to {backup_path}")
    print()

    return exported


# ---------------------------------------------------------------------------
# Step 3: Delete old tables
# ---------------------------------------------------------------------------

def step3_delete_old_tables(token, base_id, tables):
    print("=" * 60)
    print("STEP 3: Delete old tables")
    print("=" * 60)
    print()

    # Order matters: delete tables that link TO others first
    delete_order = ["Maintenance_Logs", "Units", "Tools", "Table 1"]

    tables_to_delete = []
    for name in delete_order:
        tid = tables.get(name)
        if tid:
            tables_to_delete.append((name, tid))
        else:
            print(f"  Table '{name}' not found, skipping.")

    if not tables_to_delete:
        print("  No tables to delete.")
        return

    print("  The following tables will be DELETED:")
    for name, tid in tables_to_delete:
        print(f"    - {name} ({tid})")
    print()

    confirm = input("  Type 'DELETE' to confirm deletion: ")
    if confirm.strip() != "DELETE":
        print("  Aborted. Tables were NOT deleted.")
        print("  You can re-run the script to try again.")
        sys.exit(0)

    print()
    for name, tid in tables_to_delete:
        print(f"  Deleting {name} ({tid})...")
        try:
            api_request("DELETE", f"/meta/bases/{base_id}/tables/{tid}", token)
            print(f"    Deleted.")
        except urllib.error.HTTPError:
            print(f"    Failed to delete {name}. Continuing...")
        time.sleep(0.25)

    print()


# ---------------------------------------------------------------------------
# Step 4: Recreate Units and Maintenance_Logs linked to Tools_v1
# ---------------------------------------------------------------------------

def step4_recreate_tables(token, base_id, tools_v1_table_id):
    print("=" * 60)
    print("STEP 4: Recreate Units and Maintenance_Logs linked to Tools_v1")
    print("=" * 60)
    print()

    # Create Units table
    units_payload = {
        "name": "Units",
        "fields": [
            {"name": "label", "type": "singleLineText"},
            {
                "name": "tool",
                "type": "multipleRecordLinks",
                "options": {"linkedTableId": tools_v1_table_id},
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

    print("Creating Units table (linked to Tools_v1)...")
    result = api_request_fatal(
        "POST", f"/meta/bases/{base_id}/tables", token, units_payload
    )
    units_table_id = result["id"]
    print(f"  Units table: {units_table_id}")

    time.sleep(0.25)

    # Create Maintenance_Logs table
    maint_payload = {
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

    print("Creating Maintenance_Logs table (linked to Units)...")
    result = api_request_fatal(
        "POST", f"/meta/bases/{base_id}/tables", token, maint_payload
    )
    maint_table_id = result["id"]
    print(f"  Maintenance_Logs table: {maint_table_id}")

    print()
    return units_table_id, maint_table_id


# ---------------------------------------------------------------------------
# Step 5: Re-import Units data
# ---------------------------------------------------------------------------

def step5_reimport_units(token, base_id, tools_v1_table_id, units_table_id, exported_units):
    print("=" * 60)
    print("STEP 5: Re-import Units data linked to Tools_v1")
    print("=" * 60)
    print()

    # Fetch Tools_v1 records to build name -> record_id mapping
    print("Fetching Tools_v1 records for linking...")
    records = fetch_all_records(token, base_id, tools_v1_table_id, fields=["name"])
    name_to_record = {}
    lower_lookup = {}
    for rec in records:
        name = rec["fields"].get("name", "").strip()
        if name:
            name_to_record[name] = rec["id"]
            lower_lookup[name.lower()] = rec["id"]
    print(f"  Found {len(name_to_record)} tools in Tools_v1")

    # Match exported units to Tools_v1 records
    units_to_create = []
    unmatched_tools = set()

    for unit in exported_units:
        tool_name = unit.get("tool_name")
        if not tool_name:
            print(f"  Skipping unit with no tool name: {unit}")
            continue

        # Try exact match, then case-insensitive
        record_id = name_to_record.get(tool_name)
        if not record_id:
            record_id = lower_lookup.get(tool_name.lower())
        if not record_id:
            # Try trimmed match
            record_id = lower_lookup.get(tool_name.strip().lower())

        if not record_id:
            if tool_name not in unmatched_tools:
                print(f"  No match in Tools_v1 for tool: '{tool_name}'")
                unmatched_tools.add(tool_name)
            continue

        fields = {"tool": [record_id]}
        if unit.get("serial_number"):
            fields["serial_number"] = unit["serial_number"]
        if unit.get("status"):
            fields["status"] = unit["status"]
        if unit.get("label"):
            fields["label"] = unit["label"]

        units_to_create.append({"fields": fields})

    print(f"  Units to create: {len(units_to_create)}")
    if unmatched_tools:
        print(f"  Unmatched tool names ({len(unmatched_tools)}):")
        for name in sorted(unmatched_tools):
            print(f"    - {name}")
    print()

    # Batch create units (groups of 10)
    created = 0
    for i in range(0, len(units_to_create), 10):
        batch = units_to_create[i : i + 10]
        try:
            result = api_request(
                "POST",
                f"/{base_id}/{units_table_id}",
                token,
                {"records": batch},
            )
            batch_count = len(result.get("records", []))
            created += batch_count
            print(f"  Created batch {i // 10 + 1}: {batch_count} units")
        except urllib.error.HTTPError:
            print(f"  Failed to create batch {i // 10 + 1}, continuing...")
        time.sleep(0.25)

    print()
    print(f"  Total units created: {created}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    token, base_id = get_config()

    print()
    print("MakerLAB AirTable Migration: Tools -> Tools_v1")
    print(f"Base: {base_id}")
    print()

    # Get current table map
    print("Fetching table list...")
    tables = get_table_map(token, base_id)
    print("  Tables found:")
    for name, tid in tables.items():
        print(f"    {name}: {tid}")
    print()

    tools_v1_table_id = tables.get("Tools_v1")
    if not tools_v1_table_id:
        print("Error: Tools_v1 table not found. Run setup_tools_v1.py first.")
        sys.exit(1)

    # Step 1: Upload images
    step1_upload_images(token, base_id, tools_v1_table_id)

    # Step 2: Export units data
    exported_units = step2_export_units(token, base_id, tables)

    # Step 3: Delete old tables
    step3_delete_old_tables(token, base_id, tables)

    # Step 4: Recreate tables linked to Tools_v1
    units_table_id, maint_table_id = step4_recreate_tables(
        token, base_id, tools_v1_table_id
    )

    # Step 5: Re-import units
    step5_reimport_units(
        token, base_id, tools_v1_table_id, units_table_id, exported_units
    )

    # Done
    print("=" * 60)
    print("Migration complete!")
    print("=" * 60)
    print()
    print(f"  Tools_v1:         {tools_v1_table_id}")
    print(f"  Units (new):      {units_table_id}")
    print(f"  Maintenance_Logs: {maint_table_id}")
    print(f"  Base URL:         https://airtable.com/{base_id}")
    print()
    print("  Units backup saved to: units_export.json")
    print()


if __name__ == "__main__":
    main()
