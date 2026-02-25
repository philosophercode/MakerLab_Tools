"""
Extract original photos from the MakerLAB Excel form responses.

Sources:
  1. Embedded images in the XLSX archive (xl/media/) — mapped to tool rows
     via xl/drawings/drawing1.xml anchors
  2. Google Drive links in column G — downloaded via direct export URL
  3. Filename-only text in column G — skipped (no actual file available)

Output: ../original_photos/<ToolName>.<ext>
Uses only stdlib + openpyxl (already installed).
"""

import os
import re
import zipfile
import xml.etree.ElementTree as ET
import urllib.request
import urllib.error
import time

EXCEL_PATH = os.path.join(
    os.path.dirname(__file__),
    "data",
    "MakerLAB Tools & Equipment Meta Data Generator (Responses).xlsx",
)
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "original_photos")

# Namespaces used in XLSX drawing XML
NS = {
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def safe_filename(name: str) -> str:
    """Sanitize tool name for use as a filename."""
    return re.sub(r'[\\/:*?"<>|]', "_", name).strip()


def extract_embedded_images(xlsx_path: str) -> dict[int, tuple[str, bytes]]:
    """
    Parse the XLSX ZIP to map row numbers to embedded image data.
    Returns {row_0indexed: (ext, image_bytes)}.
    """
    row_to_image: dict[int, tuple[str, bytes]] = {}

    with zipfile.ZipFile(xlsx_path, "r") as zf:
        # 1. Build rId -> filename mapping from relationships
        rels_path = "xl/drawings/_rels/drawing1.xml.rels"
        if rels_path not in zf.namelist():
            print("  No drawing rels found — skipping embedded images")
            return row_to_image

        rels_tree = ET.fromstring(zf.read(rels_path))
        rid_to_file: dict[str, str] = {}
        for rel in rels_tree.findall("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"):
            rid = rel.get("Id", "")
            target = rel.get("Target", "")  # e.g. ../media/image1.jpeg
            rid_to_file[rid] = target

        # 2. Parse drawing anchors to map row -> rId
        drawing_xml = zf.read("xl/drawings/drawing1.xml")
        drawing_tree = ET.fromstring(drawing_xml)

        for anchor_tag in ["xdr:oneCellAnchor", "xdr:twoCellAnchor"]:
            for anchor in drawing_tree.findall(anchor_tag, NS):
                # Get row from <xdr:from><xdr:row>
                from_el = anchor.find("xdr:from", NS)
                if from_el is None:
                    continue
                row_el = from_el.find("xdr:row", NS)
                if row_el is None:
                    continue
                row = int(row_el.text)

                # Get rId from blip
                blip = anchor.find(".//a:blip", NS)
                if blip is None:
                    continue
                rid = blip.get(f'{{{NS["r"]}}}embed', "")
                if not rid or rid not in rid_to_file:
                    continue

                # Resolve the media path
                target = rid_to_file[rid]
                media_path = target.replace("../", "xl/")
                ext = os.path.splitext(media_path)[1]  # .jpeg, .png, etc.

                try:
                    image_bytes = zf.read(media_path)
                    row_to_image[row] = (ext, image_bytes)
                except KeyError:
                    print(f"  Warning: media file not found: {media_path}")

    return row_to_image


def download_gdrive(url: str, dest_path: str) -> bool:
    """Download a file from Google Drive. Returns True on success."""
    # Extract file ID from various Google Drive URL formats
    match = re.search(r"(?:id=|/d/)([a-zA-Z0-9_-]+)", url)
    if not match:
        print(f"  Could not parse Drive ID from: {url}")
        return False

    file_id = match.group(1)
    direct_url = f"https://drive.google.com/uc?export=download&id={file_id}"

    try:
        req = urllib.request.Request(direct_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read()

            # Check if we got an HTML page (auth wall) instead of an image
            if "text/html" in content_type and len(data) < 10000:
                print(f"  Drive file may be private (got HTML): {file_id}")
                return False

            # Determine extension from content type
            ext = ".jpg"
            if "png" in content_type:
                ext = ".png"
            elif "gif" in content_type:
                ext = ".gif"
            elif "webp" in content_type:
                ext = ".webp"

            # If dest_path has no extension, add one
            if not os.path.splitext(dest_path)[1]:
                dest_path += ext

            with open(dest_path, "wb") as f:
                f.write(data)
            return True

    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        print(f"  Download failed for {file_id}: {e}")
        return False


def main():
    import openpyxl

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Reading Excel: {os.path.basename(EXCEL_PATH)}")
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws = wb.active

    # Read tool names and column G values
    rows_data: list[tuple[int, str, str]] = []  # (row_1indexed, tool_name, col_g_value)
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
        tool_name = row[1].value  # Column B
        col_g = row[6].value     # Column G
        if not tool_name or str(tool_name).strip().lower() == "none":
            continue
        rows_data.append((row_idx, str(tool_name).strip(), str(col_g).strip() if col_g else ""))

    print(f"Found {len(rows_data)} tools with names")

    # Extract embedded images (keyed by 0-indexed row)
    print("\nExtracting embedded images from XLSX archive...")
    embedded = extract_embedded_images(EXCEL_PATH)
    print(f"  Found {len(embedded)} embedded images")

    # Track how many times each base filename has been used
    name_counts: dict[str, int] = {}

    def unique_path(base_name: str, ext: str) -> str:
        """Return a unique output path, appending _2, _3, etc. for dupes."""
        key = base_name.lower()
        name_counts[key] = name_counts.get(key, 0) + 1
        if name_counts[key] == 1:
            return os.path.join(OUTPUT_DIR, f"{base_name}{ext}")
        return os.path.join(OUTPUT_DIR, f"{base_name}_{name_counts[key]}{ext}")

    # Process each tool
    stats = {"embedded": 0, "gdrive": 0, "gdrive_fail": 0, "no_image": 0, "dupes": 0}

    for row_1idx, tool_name, col_g in rows_data:
        row_0idx = row_1idx - 1  # Drawing anchors use 0-indexed rows
        fname = safe_filename(tool_name)

        # Try embedded image first
        if row_0idx in embedded:
            ext, data = embedded[row_0idx]
            if ext.lower() == ".jpeg":
                ext = ".jpg"
            out_path = unique_path(fname, ext)
            is_dupe = name_counts[fname.lower()] > 1
            with open(out_path, "wb") as f:
                f.write(data)
            label = os.path.basename(out_path)
            dupe_tag = " (DUPE)" if is_dupe else ""
            print(f"  [embedded] {label} ({len(data) // 1024}KB){dupe_tag}")
            stats["embedded"] += 1
            if is_dupe:
                stats["dupes"] += 1
            continue

        # Try Google Drive link
        if col_g and "drive.google.com" in col_g:
            # Pre-register the name to get the right count, but we don't
            # know the extension yet. Use empty ext, download_gdrive appends it.
            out_path = unique_path(fname, "")
            is_dupe = name_counts[fname.lower()] > 1
            dupe_tag = " (DUPE)" if is_dupe else ""
            print(f"  [gdrive]   {fname}{dupe_tag} ... ", end="", flush=True)
            if download_gdrive(col_g, out_path):
                print("OK")
                stats["gdrive"] += 1
                if is_dupe:
                    stats["dupes"] += 1
            else:
                print("FAILED")
                stats["gdrive_fail"] += 1
            time.sleep(0.3)  # Rate limit
            continue

        # No image available
        print(f"  [none]     {fname}")
        stats["no_image"] += 1

    print(f"\n{'='*50}")
    print(f"Done! Images saved to: {os.path.relpath(OUTPUT_DIR)}")
    print(f"  Embedded:       {stats['embedded']}")
    print(f"  Google Drive:   {stats['gdrive']}")
    print(f"  Drive failed:   {stats['gdrive_fail']}")
    print(f"  No image:       {stats['no_image']}")
    print(f"  Duplicates:     {stats['dupes']}")
    print(f"  Total files:    {stats['embedded'] + stats['gdrive']}")


if __name__ == "__main__":
    main()
