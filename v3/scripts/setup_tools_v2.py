"""
Create the Categories, Locations, and Tools_v2 tables in AirTable and
import clean tool data from tools_v2_data.json.

This is the v2 schema: it uses linked lookup tables for categories and
locations instead of flat singleSelect fields, adds multipleSelects for
materials/ppe/tags, and uses proper checkbox fields for booleans.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Ensure tools_v2_data.json exists in the same directory (run prepare_tools_v2.py first)
  3. Run: python setup_tools_v2.py
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"


# ── Data loading ─────────────────────────────────────────────────────


def load_data():
    """Load tool data from tools_v2_data.json."""
    data_path = os.path.join(os.path.dirname(__file__), "tools_v2_data.json")
    if not os.path.exists(data_path):
        print("Error: tools_v2_data.json not found. Run prepare_tools_v2.py first.")
        sys.exit(1)
    with open(data_path) as f:
        return json.load(f)


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


def fetch_all_records(token, base_id, table_id):
    """Fetch all records from a table, handling pagination."""
    records = []
    offset = None

    while True:
        path = f"/{base_id}/{table_id}"
        if offset:
            path += f"?offset={offset}"

        result = api_request("GET", path, token)
        records.extend(result.get("records", []))

        offset = result.get("offset")
        if not offset:
            break

        time.sleep(0.25)

    return records


def batch_create_records(token, base_id, table_id, records, label="records"):
    """Create records in batches of 10 with rate limiting."""
    created = 0

    for i in range(0, len(records), 10):
        batch = records[i : i + 10]
        payload = {"records": [{"fields": r} for r in batch]}

        result = api_request("POST", f"/{base_id}/{table_id}", token, payload)
        created += len(result["records"])

        batch_num = (i // 10) + 1
        total_batches = (len(records) + 9) // 10
        print(f"  Batch {batch_num}/{total_batches}: {len(result['records'])} {label}")

        time.sleep(0.25)

    return created


# ── Step 1: Categories table ────────────────────────────────────────


def create_categories_table(token, base_id, categories):
    """Create the Categories lookup table and insert records."""
    groups = sorted(categories.keys())

    payload = {
        "name": "Categories",
        "fields": [
            {
                "name": "name",
                "type": "singleLineText",
                "description": "Subcategory name (e.g., FDM Printer, Hand Saw)",
            },
            {
                "name": "group",
                "type": "singleSelect",
                "description": "Parent category group",
                "options": {"choices": [{"name": g} for g in groups]},
            },
        ],
    }

    print("Creating Categories table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    table_id = result["id"]
    print(f"  Table ID: {table_id}")

    # Build records: one per subcategory
    records = []
    for group in groups:
        for sub in sorted(categories[group]):
            records.append({"name": sub, "group": group})

    print(f"  Inserting {len(records)} category records...")
    batch_create_records(token, base_id, table_id, records, label="categories")

    # Fetch back all records to build the (group, sub) -> record_id mapping
    print("  Fetching category record IDs...")
    all_records = fetch_all_records(token, base_id, table_id)

    cat_map = {}
    for rec in all_records:
        fields = rec["fields"]
        group = fields.get("group")
        name = fields.get("name")
        if group and name:
            cat_map[(group, name)] = rec["id"]

    print(f"  Mapped {len(cat_map)} categories")
    return table_id, cat_map


# ── Step 2: Locations table ─────────────────────────────────────────


def create_locations_table(token, base_id, locations):
    """Create the Locations lookup table and insert records."""
    rooms = sorted(locations.keys())

    payload = {
        "name": "Locations",
        "fields": [
            {
                "name": "name",
                "type": "singleLineText",
                "description": "Zone name within the room",
            },
            {
                "name": "room",
                "type": "singleSelect",
                "description": "Building room identifier",
                "options": {"choices": [{"name": r} for r in rooms]},
            },
        ],
    }

    print("Creating Locations table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    table_id = result["id"]
    print(f"  Table ID: {table_id}")

    # Build records: one per zone
    records = []
    for room in rooms:
        for zone in sorted(locations[room]):
            records.append({"name": zone, "room": room})

    print(f"  Inserting {len(records)} location records...")
    batch_create_records(token, base_id, table_id, records, label="locations")

    # Fetch back all records to build the (room, zone) -> record_id mapping
    print("  Fetching location record IDs...")
    all_records = fetch_all_records(token, base_id, table_id)

    loc_map = {}
    for rec in all_records:
        fields = rec["fields"]
        room = fields.get("room")
        name = fields.get("name")
        if room and name:
            loc_map[(room, name)] = rec["id"]

    print(f"  Mapped {len(loc_map)} locations")
    return table_id, loc_map


# ── Step 3: Tools_v2 table ──────────────────────────────────────────


def create_tools_v2_table(token, base_id, categories_table_id, locations_table_id,
                          materials_vocab, ppe_vocab, tags_vocab):
    """Create the Tools_v2 table with all fields."""
    fields = [
        # Primary field
        {
            "name": "name",
            "type": "singleLineText",
            "description": "Name of the tool or equipment",
        },
        # Description
        {
            "name": "description",
            "type": "multilineText",
            "description": "Description of the tool, its capabilities, and common use cases",
        },
        # Review flag
        {
            "name": "description_reviewed",
            "type": "checkbox",
            "description": "Whether this description has been verified by staff",
            "options": {"icon": "check", "color": "greenBright"},
        },
        # Category (linked)
        {
            "name": "category",
            "type": "multipleRecordLinks",
            "description": "Tool category — linked to Categories table",
            "options": {"linkedTableId": categories_table_id},
        },
        # Location (linked)
        {
            "name": "location",
            "type": "multipleRecordLinks",
            "description": "Physical location in the lab — linked to Locations table",
            "options": {"linkedTableId": locations_table_id},
        },
        # Materials
        {
            "name": "materials",
            "type": "multipleSelects",
            "description": "Materials this tool works with (e.g., Acrylic, PLA, MDF)",
            "options": {"choices": [{"name": m} for m in materials_vocab]},
        },
        # PPE
        {
            "name": "ppe_required",
            "type": "multipleSelects",
            "description": "Personal protective equipment required to operate this tool",
            "options": {"choices": [{"name": p} for p in ppe_vocab]},
        },
        # Tags
        {
            "name": "tags",
            "type": "multipleSelects",
            "description": "Labels describing capabilities, compatible materials, and common use cases for search",
            "options": {"choices": [{"name": t} for t in tags_vocab]},
        },
        # Auth & Training (checkboxes)
        {
            "name": "authorized_only",
            "type": "checkbox",
            "description": "Whether this tool is restricted to authorized users only",
            "options": {"icon": "check", "color": "redBright"},
        },
        {
            "name": "training_required",
            "type": "checkbox",
            "description": "Whether prerequisite training is required before use",
            "options": {"icon": "check", "color": "yellowBright"},
        },
        # Text fields
        {
            "name": "use_restrictions",
            "type": "multilineText",
            "description": "Notes on compliance, supervision requirements, or usage restrictions",
        },
        {
            "name": "emergency_stop",
            "type": "multilineText",
            "description": "Description of emergency stop location, if applicable",
        },
        # URLs
        {
            "name": "safety_doc_url",
            "type": "url",
            "description": "Link to safety and basic use documentation",
        },
        {
            "name": "sop_url",
            "type": "url",
            "description": "Standard operating procedure or manufacturer manual link",
        },
        {
            "name": "video_url",
            "type": "url",
            "description": "Tutorial video from MakerLAB YouTube or other verified sources",
        },
        # Map tag
        {
            "name": "map_tag",
            "type": "singleLineText",
            "description": "Internal ID for a specific cabinet or storage unit within a zone. Used for map overlays and QR code signage.",
        },
        # Attachments
        {
            "name": "image_attachments",
            "type": "multipleAttachments",
            "description": "Square-format image with clean background. Prefer product images from manufacturer website when available.",
        },
        {
            "name": "manual_attachments",
            "type": "multipleAttachments",
            "description": "Attached manufacturer manuals or reference documents",
        },
    ]

    payload = {"name": "Tools_v2", "fields": fields}

    print("Creating Tools_v2 table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    table_id = result["id"]
    print(f"  Table ID: {table_id}")
    return table_id


# ── Step 4: Import tool records ─────────────────────────────────────


def import_tools(token, base_id, table_id, cat_map, loc_map, tools):
    """Import all tool records into the Tools_v2 table."""
    records = []

    for tool in tools:
        fields = {
            "name": tool["name"],
            "description": tool["description"],
        }

        # Checkbox: description_reviewed (only include if True)
        if tool.get("description_reviewed"):
            fields["description_reviewed"] = True

        # Linked category
        cat_key = (tool["category_group"], tool["category_sub"])
        cat_rec_id = cat_map.get(cat_key)
        if cat_rec_id:
            fields["category"] = [cat_rec_id]
        else:
            print(f"  Warning: no category record for {cat_key} (tool: {tool['name']})")

        # Linked location
        loc_key = (tool["location_room"], tool["location_zone"])
        loc_rec_id = loc_map.get(loc_key)
        if loc_rec_id:
            fields["location"] = [loc_rec_id]
        else:
            print(f"  Warning: no location record for {loc_key} (tool: {tool['name']})")

        # multipleSelects - values must exactly match vocab
        if tool.get("materials"):
            fields["materials"] = tool["materials"]
        if tool.get("ppe_required"):
            fields["ppe_required"] = tool["ppe_required"]
        if tool.get("tags"):
            fields["tags"] = tool["tags"]

        # Checkboxes: only include if True
        if tool.get("authorized_only"):
            fields["authorized_only"] = True
        if tool.get("training_required"):
            fields["training_required"] = True

        # Optional text fields - omit if None
        if tool.get("use_restrictions"):
            fields["use_restrictions"] = tool["use_restrictions"]
        if tool.get("emergency_stop"):
            fields["emergency_stop"] = tool["emergency_stop"]

        # Optional URL fields - omit if None
        if tool.get("safety_doc_url"):
            fields["safety_doc_url"] = tool["safety_doc_url"]
        if tool.get("sop_url"):
            fields["sop_url"] = tool["sop_url"]
        if tool.get("video_url"):
            fields["video_url"] = tool["video_url"]

        # Optional map tag
        if tool.get("map_tag"):
            fields["map_tag"] = tool["map_tag"]

        records.append(fields)

    print(f"Importing {len(records)} tools...")
    created = batch_create_records(token, base_id, table_id, records, label="tools")
    return created


# ── Main ─────────────────────────────────────────────────────────────


def main():
    token, base_id = get_config()

    # Load data from JSON file
    data = load_data()
    categories = data["categories"]        # dict of group -> [subcategories]
    locations = data["locations"]           # dict of room -> [zones]
    materials_vocab = data["materials_vocab"]  # list of strings
    ppe_vocab = data["ppe_vocab"]           # list of strings
    tags_vocab = data["tags_vocab"]         # list of strings
    tools = data["tools"]                   # list of tool dicts

    print(f"Using base: {base_id}")
    print(f"Data: {len(tools)} tools, {sum(len(v) for v in categories.values())} categories, "
          f"{sum(len(v) for v in locations.values())} locations")
    print()

    # Step 1: Categories
    categories_table_id, cat_map = create_categories_table(token, base_id, categories)
    print()

    # Step 2: Locations
    locations_table_id, loc_map = create_locations_table(token, base_id, locations)
    print()

    # Step 3: Tools_v2 table
    tools_table_id = create_tools_v2_table(
        token, base_id, categories_table_id, locations_table_id,
        materials_vocab, ppe_vocab, tags_vocab
    )
    print()

    # Step 4: Import tool records
    created = import_tools(token, base_id, tools_table_id, cat_map, loc_map, tools)

    print()
    print("Done! All tables created and data imported.")
    print(f"  Categories: {categories_table_id} ({len(cat_map)} records)")
    print(f"  Locations:  {locations_table_id} ({sum(len(v) for v in locations.values())} records)")
    print(f"  Tools_v2:   {tools_table_id} ({created} records)")
    print(f"  Base URL:   https://airtable.com/{base_id}")


if __name__ == "__main__":
    main()
