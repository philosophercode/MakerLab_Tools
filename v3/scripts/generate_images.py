"""
Generate replacement product images for tools that failed the eval.

Reads the eval results to find FAIL entries, pulls tool descriptions from
AirTable, generates a product photo via Gemini, then strips the background
with rembg. Saves to tool_images_generated/ for review.

Usage:
  python generate_images.py                  # Generate for all failures
  python generate_images.py --limit 3        # Generate first 3 only
  python generate_images.py --tool "Form 2"  # Generate for a single tool

Requires:
  - GEMINI_API_KEY in ../app/.env.local
  - AIRTABLE_API_KEY and AIRTABLE_BASE_ID in .env or ../app/.env.local
  - rembg and Pillow: pip install rembg pillow
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
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"

CHROMA_GREEN = "#00FF00"

IMAGE_PROMPT = """\
Generate a clean product photograph of the following tool/equipment on a \
solid, uniform chromakey green background (exact hex {chroma}). The \
background MUST be completely flat, solid {chroma} green with no gradients, \
shadows, or reflections on the backdrop. The item itself should NOT contain \
any {chroma} green. The image should look like a professional catalog or \
e-commerce product shot — well-lit, centered, no text overlays, no \
watermarks, no people. Show the complete item from a 3/4 angle.

IMPORTANT: The background will be digitally removed in the next step using \
chromakey, so the solid {chroma} green must extend to every edge of the \
image with no other colors in the background area.

Product: {name}
Description: {description}
"""

# ── Helpers ───────────────────────────────────────────────────────────────


def load_env():
    """Load API keys from .env and .env.local."""
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

    gemini_key = config.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    airtable_key = config.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_API_KEY")
    base_id = config.get("AIRTABLE_BASE_ID") or os.environ.get("AIRTABLE_BASE_ID")

    if not gemini_key:
        print("Error: GEMINI_API_KEY not found")
        sys.exit(1)
    if not airtable_key or not base_id:
        print("Error: AIRTABLE_API_KEY / AIRTABLE_BASE_ID not found")
        sys.exit(1)

    return gemini_key, airtable_key, base_id


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


def generate_image(gemini_key, prompt):
    """Call Gemini to generate an image. Returns raw PNG bytes or None."""
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"]
        }
    }

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        GEMINI_API_URL,
        data=body,
        method="POST",
        headers={
            "x-goog-api-key": gemini_key,
            "Content-Type": "application/json",
        },
    )

    try:
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"GEMINI ERROR {e.code}: {error_body[:300]}")
        return None
    except Exception as e:
        print(f"GEMINI ERROR: {e}")
        return None

    # Extract the image from the response
    candidates = result.get("candidates", [])
    if not candidates:
        print("GEMINI ERROR: no candidates in response")
        return None

    parts = candidates[0].get("content", {}).get("parts", [])
    for part in parts:
        if "inlineData" in part:
            img_data = part["inlineData"].get("data", "")
            return base64.b64decode(img_data)
        # Also check snake_case variant
        if "inline_data" in part:
            img_data = part["inline_data"].get("data", "")
            return base64.b64decode(img_data)

    print("GEMINI ERROR: no image in response parts")
    return None


def chromakey_remove(image_bytes, hue_center=120, hue_range=40, sat_min=80, val_min=80):
    """Remove chromakey green background using HSV color keying.

    Works like a real green screen: converts to HSV, masks pixels near
    the target green hue, and sets them transparent. Uses edge feathering
    for clean anti-aliased edges.

    Args:
        hue_center: Target hue in degrees (120 = pure green / #00FF00)
        hue_range: +/- tolerance in degrees for hue matching
        sat_min: Minimum saturation (0-255) to count as green
        val_min: Minimum value/brightness (0-255) to count as green
    """
    import numpy as np
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    arr = np.array(img)

    # Convert RGB to HSV for robust color detection
    rgb = arr[:, :, :3].astype(np.float32) / 255.0
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    cmax = np.maximum(r, np.maximum(g, b))
    cmin = np.minimum(r, np.minimum(g, b))
    delta = cmax - cmin

    # Hue calculation (0-360)
    hue = np.zeros_like(cmax)
    mask_r = (cmax == r) & (delta > 0)
    mask_g = (cmax == g) & (delta > 0)
    mask_b = (cmax == b) & (delta > 0)
    hue[mask_r] = 60.0 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60.0 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60.0 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    # Saturation (0-255 scale)
    sat = np.where(cmax > 0, (delta / cmax) * 255, 0)

    # Value (0-255 scale)
    val = cmax * 255

    # Build green mask: hue near target, high saturation, reasonable brightness
    hue_lo = hue_center - hue_range
    hue_hi = hue_center + hue_range
    green_mask = (hue >= hue_lo) & (hue <= hue_hi) & (sat >= sat_min) & (val >= val_min)

    # Soft edge: compute distance from green in hue space for feathering
    hue_dist = np.minimum(np.abs(hue - hue_center), 360 - np.abs(hue - hue_center))
    # Feather zone: pixels near the edge of the mask get partial transparency
    feather_range = 10  # degrees of feathering
    feather = np.clip((hue_dist - (hue_range - feather_range)) / feather_range, 0, 1)

    # Apply alpha: green pixels become transparent, edge pixels feathered
    alpha = arr[:, :, 3].astype(np.float32)
    alpha[green_mask] = 0
    # Apply feathering only to near-green pixels
    near_green = (hue_dist < hue_range + feather_range) & ~green_mask & (sat >= sat_min * 0.5)
    alpha[near_green] = alpha[near_green] * feather[near_green]

    arr[:, :, 3] = alpha.astype(np.uint8)
    result = Image.fromarray(arr)

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()


def remove_background_rembg(image_bytes, session):
    """Fallback: remove background using rembg AI model."""
    from rembg import remove
    from PIL import Image

    input_img = Image.open(io.BytesIO(image_bytes))
    output_img = remove(input_img, session=session)

    buf = io.BytesIO()
    output_img.save(buf, format="PNG")
    return buf.getvalue()


# ── Main ──────────────────────────────────────────────────────────────────


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate replacement images for failed eval tools")
    parser.add_argument("--limit", type=int, default=0, help="Max tools to generate (0 = all failures)")
    parser.add_argument("--tool", type=str, default="", help="Generate for a single tool by name")
    parser.add_argument("--eval-file", type=str, default="", help="Path to eval results JSON (default: eval_images_local_results.json)")
    parser.add_argument("--skip-rembg", action="store_true", help="Skip background removal (save Gemini output directly)")
    args = parser.parse_args()

    gemini_key, airtable_key, base_id = load_env()

    # ── Load eval results to find failures ──
    eval_path = args.eval_file or os.path.join(os.path.dirname(__file__), "eval_images_local_results.json")
    if not os.path.exists(eval_path):
        print(f"Error: eval results not found at {eval_path}")
        print("Run: python eval_images.py --local  first")
        sys.exit(1)

    with open(eval_path) as f:
        eval_results = json.load(f)

    failed_names = set()
    if args.tool:
        failed_names.add(args.tool)
    else:
        for r in eval_results:
            if r["status"] == "FAIL":
                failed_names.add(r["name"])

    print(f"Found {len(failed_names)} tools to regenerate")

    # ── Fetch descriptions from AirTable ──
    print("Fetching tool descriptions from AirTable...")
    records = airtable_fetch_all(airtable_key, base_id, TOOLS_TABLE_ID)

    tools_to_generate = []
    for rec in records:
        fields = rec["fields"]
        name = fields.get("name", "")
        if name in failed_names:
            tools_to_generate.append({
                "name": name,
                "description": fields.get("description", ""),
            })

    if args.limit:
        tools_to_generate = tools_to_generate[:args.limit]

    print(f"  Matched {len(tools_to_generate)} tools with descriptions")
    print()

    # ── Set up output directory ──
    output_dir = os.path.join(os.path.dirname(__file__), "tool_images_generated")
    os.makedirs(output_dir, exist_ok=True)

    # ── Load rembg model ──
    session = None
    if not args.skip_rembg:
        print("Loading rembg model...")
        from rembg import new_session
        session = new_session("u2net")
        print("  Model ready\n")

    # ── Generate images ──
    success = 0
    errors = 0

    for i, tool in enumerate(tools_to_generate, 1):
        name = tool["name"]
        desc = tool["description"]
        print(f"  [{i}/{len(tools_to_generate)}] {name[:55]}...", end=" ", flush=True)

        # Generate via Gemini (chromakey green background)
        prompt = IMAGE_PROMPT.format(name=name, description=desc, chroma=CHROMA_GREEN)
        raw_bytes = generate_image(gemini_key, prompt)

        if not raw_bytes:
            errors += 1
            continue

        gemini_kb = len(raw_bytes) // 1024
        print(f"({gemini_kb}KB) ", end="", flush=True)

        # Step 1: Chromakey green removal (precise, color-based)
        try:
            png_bytes = chromakey_remove(raw_bytes)
            final_kb = len(png_bytes) // 1024
            print(f"-> chroma ({final_kb}KB) ", end="", flush=True)
        except Exception as e:
            print(f"CHROMA ERR: {e}, ", end="", flush=True)
            # Step 2: Fall back to rembg AI model
            if session:
                try:
                    png_bytes = remove_background_rembg(raw_bytes, session)
                    final_kb = len(png_bytes) // 1024
                    print(f"-> rembg ({final_kb}KB) ", end="", flush=True)
                except Exception as e2:
                    print(f"REMBG ERR: {e2}")
                    png_bytes = raw_bytes
            else:
                png_bytes = raw_bytes

        # Save locally
        safe_name = name.replace("/", "_")
        out_path = os.path.join(output_dir, safe_name + ".png")
        with open(out_path, "wb") as f:
            f.write(png_bytes)

        print("SAVED")
        success += 1

        # Rate limit Gemini API
        time.sleep(2)

    # ── Summary ──
    print()
    print("=" * 70)
    print(f"DONE: {success} generated / {errors} errors")
    print(f"Output: {output_dir}")
    print("=" * 70)


if __name__ == "__main__":
    main()
