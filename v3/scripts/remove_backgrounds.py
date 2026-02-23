"""
Remove backgrounds from tool images in AirTable.

Downloads each tool's image from AirTable, removes the background using
rembg (local U2-Net model), and re-uploads the transparent PNG, replacing
the original.

Usage:
  python remove_backgrounds.py                  # Process all tools
  python remove_backgrounds.py --limit 5        # Process first 5 only
  python remove_backgrounds.py --tool "Form 2"  # Process a single tool
  python remove_backgrounds.py --local           # Save to disk only (no upload)
  python remove_backgrounds.py --dry-run        # Preview without saving or uploading

Requires rembg and Pillow: pip install rembg pillow
Requires AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env or ../app/.env.local
"""

import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

# ── Config ────────────────────────────────────────────────────────────────

AIRTABLE_API_URL = "https://api.airtable.com/v0"
CONTENT_URL = "https://content.airtable.com/v0"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"
IMAGE_FIELD_ID = "fldvEe7Z9VrymHRTy"

# ── Helpers ───────────────────────────────────────────────────────────────


def load_env():
    """Load API keys from .env or .env.local."""
    config = {}
    for env_path in [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", "app", ".env.local"),
    ]:
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        key, val = line.split("=", 1)
                        config[key.strip()] = val.strip()

    token = config.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_API_KEY")
    base_id = config.get("AIRTABLE_BASE_ID") or os.environ.get("AIRTABLE_BASE_ID")

    if not token or not base_id:
        print("Error: AIRTABLE_API_KEY and AIRTABLE_BASE_ID required")
        sys.exit(1)

    return token, base_id


def airtable_fetch_all(token, base_id, table_id):
    """Fetch all records from an AirTable table, handling pagination."""
    records = []
    offset = None

    while True:
        url = f"{AIRTABLE_API_URL}/{base_id}/{table_id}"
        if offset:
            url += f"?offset={offset}"

        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {token}",
        })
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
        time.sleep(0.25)

    return records


def download_image(url):
    """Download an image and return raw bytes."""
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req)
    return resp.read()


def clear_attachments(token, base_id, record_id):
    """Clear the image_attachments field on a record."""
    url = f"{AIRTABLE_API_URL}/{base_id}/{TOOLS_TABLE_ID}/{record_id}"
    payload = {"fields": {"image_attachments": []}}
    body = json.dumps(payload).encode()

    req = urllib.request.Request(
        url, data=body, method="PATCH",
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
        print(f"CLEAR ERROR {e.code}: {error_body[:200]}")
        return None


def upload_attachment(token, base_id, record_id, png_bytes, filename):
    """Upload a PNG to image_attachments using the content API."""
    payload = {
        "contentType": "image/png",
        "filename": filename,
        "file": base64.encodebytes(png_bytes).decode("utf8"),
    }

    url = f"{CONTENT_URL}/{base_id}/{record_id}/{IMAGE_FIELD_ID}/uploadAttachment"
    body = json.dumps(payload).encode()

    req = urllib.request.Request(
        url, data=body, method="POST",
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
        print(f"UPLOAD ERROR {e.code}: {error_body[:200]}")
        return None


# ── Main ──────────────────────────────────────────────────────────────────


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Remove backgrounds from tool images")
    parser.add_argument("--limit", type=int, default=0, help="Max tools to process (0 = all)")
    parser.add_argument("--tool", type=str, default="", help="Process a single tool by name")
    parser.add_argument("--local", action="store_true", help="Save processed images to disk only (no upload)")
    parser.add_argument("--dry-run", action="store_true", help="Download and process but don't save or upload")
    args = parser.parse_args()

    # Set up local output directory
    output_dir = os.path.join(os.path.dirname(__file__), "tool_images_nobg")
    if args.local:
        os.makedirs(output_dir, exist_ok=True)
        print(f"  Output directory: {output_dir}")

    token, base_id = load_env()

    # ── Fetch tools ──
    print("Fetching tools from AirTable...")
    records = airtable_fetch_all(token, base_id, TOOLS_TABLE_ID)
    print(f"  Found {len(records)} tools")

    # ── Build processing list ──
    to_process = []
    skipped = 0

    for rec in records:
        fields = rec["fields"]
        name = fields.get("name", "")
        images = fields.get("image_attachments", [])

        if args.tool and name != args.tool:
            continue

        if not images:
            skipped += 1
            continue

        img = images[0]
        to_process.append({
            "record_id": rec["id"],
            "name": name,
            "image_url": img.get("url"),
            "image_filename": img.get("filename", "image.jpg"),
        })

    if args.limit:
        to_process = to_process[:args.limit]

    print(f"  Processing {len(to_process)} tools ({skipped} skipped — no image)")
    if args.local:
        print("  LOCAL MODE — saving to disk, not uploading")
    elif args.dry_run:
        print("  DRY RUN — will not save or upload")
    print()

    # ── Load rembg model (downloads on first run) ──
    print("Loading rembg model...")
    from rembg import new_session, remove
    from PIL import Image

    session = new_session("u2net")
    print("  Model ready\n")

    # ── Process images ──
    success = 0
    errors = 0

    for i, tool in enumerate(to_process, 1):
        name = tool["name"]
        print(f"  [{i}/{len(to_process)}] {name[:55]}...", end=" ", flush=True)

        # Download
        try:
            raw_bytes = download_image(tool["image_url"])
        except Exception as e:
            print(f"DOWNLOAD ERROR: {e}")
            errors += 1
            continue

        # Remove background
        try:
            input_img = Image.open(io.BytesIO(raw_bytes))
            output_img = remove(input_img, session=session)

            buf = io.BytesIO()
            output_img.save(buf, format="PNG")
            png_bytes = buf.getvalue()
        except Exception as e:
            print(f"REMBG ERROR: {e}")
            errors += 1
            continue

        orig_kb = len(raw_bytes) // 1024
        new_kb = len(png_bytes) // 1024
        print(f"({orig_kb}KB -> {new_kb}KB) ", end="", flush=True)

        if args.dry_run:
            print("SKIP (dry run)")
            success += 1
            continue

        if args.local:
            # Save to disk for review
            safe_name = tool["name"].replace("/", "_")
            out_path = os.path.join(output_dir, safe_name + ".png")
            with open(out_path, "wb") as f:
                f.write(png_bytes)
            print("SAVED")
            success += 1
            continue

        # Clear old image
        cleared = clear_attachments(token, base_id, tool["record_id"])
        if not cleared:
            errors += 1
            continue
        time.sleep(0.3)

        # Upload new transparent PNG
        new_filename = os.path.splitext(tool["image_filename"])[0] + ".png"
        uploaded = upload_attachment(token, base_id, tool["record_id"], png_bytes, new_filename)

        if uploaded:
            success += 1
            print("OK")
        else:
            errors += 1
            print("UPLOAD FAILED")

        time.sleep(0.5)

    # ── Summary ──
    print()
    print("=" * 70)
    print(f"DONE: {success} processed / {errors} errors / {skipped} skipped (no image)")
    print("=" * 70)


if __name__ == "__main__":
    main()
