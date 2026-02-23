"""
Automated image quality pipeline.

Evaluates all tool images against their names and descriptions using
Claude Vision. Any that fail are regenerated via Gemini and background-
removed via rembg, then re-evaluated. Repeats until all pass or max
rounds are reached.

Usage:
  python fix_images.py                  # Run full pipeline
  python fix_images.py --max-rounds 3   # Limit retry rounds (default: 3)
  python fix_images.py --limit 10       # Only evaluate first 10 tools

Requires:
  - ANTHROPIC_API_KEY, GEMINI_API_KEY in ../app/.env.local
  - AIRTABLE_API_KEY, AIRTABLE_BASE_ID in .env or ../app/.env.local
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
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-6"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"

NOBG_DIR = os.path.join(os.path.dirname(__file__), "tool_images_nobg")
GENERATED_DIR = os.path.join(os.path.dirname(__file__), "tool_images_generated")
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "public", "tool-images")

EVAL_PROMPT = """\
You are evaluating whether a product image matches a tool listing.

Tool name: {name}
Tool description: {description}

Look at the image and determine:
1. Does the image show the tool described above?
2. Is the image a reasonable product photo for this listing?
3. Is the subject of the image clearly visible and not cut off or mangled?

Respond with EXACTLY this JSON format (no markdown, no extra text):
{{
  "match": true or false,
  "confidence": "high" or "medium" or "low",
  "image_shows": "brief description of what the image actually shows",
  "reasoning": "one sentence explaining your verdict"
}}
"""

CHROMA_GREEN = "#00FF00"

GENERATE_PROMPT = """\
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
    """Load all API keys."""
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

    keys = {
        "anthropic": config.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"),
        "gemini": config.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY"),
        "airtable": config.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_API_KEY"),
        "base_id": config.get("AIRTABLE_BASE_ID") or os.environ.get("AIRTABLE_BASE_ID"),
    }

    missing = [k for k, v in keys.items() if not v]
    if missing:
        print(f"Error: missing keys: {', '.join(missing)}")
        sys.exit(1)

    return keys


def airtable_fetch_all(token, base_id, table_id):
    """Fetch all records from AirTable."""
    records = []
    offset = None
    while True:
        url = f"{AIRTABLE_API_URL}/{base_id}/{table_id}"
        if offset:
            url += f"?offset={offset}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        records.extend(data.get("records", []))
        offset = data.get("offset")
        if not offset:
            break
        time.sleep(0.25)
    return records


def call_claude_vision(api_key, image_b64, media_type, prompt_text):
    """Send image to Claude Vision and return text response."""
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                {"type": "text", "text": prompt_text},
            ],
        }],
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(ANTHROPIC_API_URL, data=body, method="POST", headers={
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    })
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        return result["content"][0]["text"]
    except urllib.error.HTTPError as e:
        print(f"Claude API error {e.code}: {e.read().decode()[:300]}")
        return None


def parse_eval_response(text):
    """Parse Claude's JSON response."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"match": None, "confidence": "unknown", "image_shows": text[:100], "reasoning": "Parse failed"}


def generate_image_gemini(api_key, prompt):
    """Generate an image via Gemini. Returns raw bytes or None."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(GEMINI_API_URL, data=body, method="POST", headers={
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        result = json.loads(resp.read())
    except (urllib.error.HTTPError, Exception) as e:
        error_msg = e.read().decode()[:300] if hasattr(e, "read") else str(e)
        print(f"Gemini error: {error_msg}")
        return None

    candidates = result.get("candidates", [])
    if not candidates:
        return None
    for part in candidates[0].get("content", {}).get("parts", []):
        for key in ("inlineData", "inline_data"):
            if key in part:
                return base64.b64decode(part[key]["data"])
    return None


def chromakey_remove(image_bytes, hue_center=120, hue_range=40, sat_min=80, val_min=80):
    """Remove chromakey green background using HSV color keying."""
    import numpy as np
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    arr = np.array(img)

    rgb = arr[:, :, :3].astype(np.float32) / 255.0
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    cmax = np.maximum(r, np.maximum(g, b))
    cmin = np.minimum(r, np.minimum(g, b))
    delta = cmax - cmin

    hue = np.zeros_like(cmax)
    mask_r = (cmax == r) & (delta > 0)
    mask_g = (cmax == g) & (delta > 0)
    mask_b = (cmax == b) & (delta > 0)
    hue[mask_r] = 60.0 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60.0 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60.0 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    sat = np.where(cmax > 0, (delta / cmax) * 255, 0)
    val = cmax * 255

    green_mask = (hue >= hue_center - hue_range) & (hue <= hue_center + hue_range) & (sat >= sat_min) & (val >= val_min)

    hue_dist = np.minimum(np.abs(hue - hue_center), 360 - np.abs(hue - hue_center))
    feather_range = 10
    feather = np.clip((hue_dist - (hue_range - feather_range)) / feather_range, 0, 1)

    alpha = arr[:, :, 3].astype(np.float32)
    alpha[green_mask] = 0
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


def safe_name(name):
    return name.replace("/", "_")


# ── Main ──────────────────────────────────────────────────────────────────


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Eval + fix images pipeline")
    parser.add_argument("--max-rounds", type=int, default=3, help="Max regeneration rounds")
    parser.add_argument("--limit", type=int, default=0, help="Limit tools to evaluate")
    args = parser.parse_args()

    keys = load_env()
    os.makedirs(NOBG_DIR, exist_ok=True)
    os.makedirs(GENERATED_DIR, exist_ok=True)
    if os.path.isdir(PUBLIC_DIR):
        os.makedirs(PUBLIC_DIR, exist_ok=True)

    # ── Fetch tool data from AirTable ──
    print("Fetching tools from AirTable...")
    records = airtable_fetch_all(keys["airtable"], keys["base_id"], TOOLS_TABLE_ID)
    tool_data = {}
    for rec in records:
        name = rec["fields"].get("name", "")
        tool_data[name] = rec["fields"].get("description", "")
    print(f"  {len(tool_data)} tools loaded\n")

    # ── Build list of images to evaluate ──
    all_images = sorted(f for f in os.listdir(NOBG_DIR) if f.endswith(".png"))
    if args.limit:
        all_images = all_images[:args.limit]
    print(f"Evaluating {len(all_images)} images\n")

    # ── Load rembg model once ──
    print("Loading rembg model...")
    from rembg import new_session
    rembg_session = new_session("u2net")
    print("  Ready\n")

    # ── Pipeline loop ──
    all_results = []

    for round_num in range(1, args.max_rounds + 1):
        print(f"{'='*70}")
        print(f"ROUND {round_num}")
        print(f"{'='*70}\n")

        # ── Eval phase ──
        failures = []
        passes = 0
        errors = 0

        for i, fname in enumerate(all_images, 1):
            stem = os.path.splitext(fname)[0]
            # Try both underscore and slash versions for name lookup
            tool_name = stem
            description = tool_data.get(stem, "")
            if not description:
                tool_name_slash = stem.replace("_", "/")
                description = tool_data.get(tool_name_slash, "")
                if description:
                    tool_name = tool_name_slash

            img_path = os.path.join(NOBG_DIR, fname)
            print(f"  [{i}/{len(all_images)}] {tool_name[:55]}...", end=" ", flush=True)

            # Load image
            with open(img_path, "rb") as f:
                raw = f.read()
            img_b64 = base64.standard_b64encode(raw).decode("ascii")

            # Call Claude Vision
            prompt = EVAL_PROMPT.format(name=tool_name, description=description)
            raw_response = call_claude_vision(keys["anthropic"], img_b64, "image/png", prompt)
            parsed = parse_eval_response(raw_response)

            if parsed and parsed.get("match") is not None:
                if parsed["match"]:
                    passes += 1
                    print(f"PASS ({parsed.get('confidence', '?')})")
                else:
                    failures.append({
                        "name": tool_name,
                        "filename": fname,
                        "description": description,
                        "eval": parsed,
                    })
                    print(f"FAIL — {parsed.get('image_shows', '?')[:60]}")
            else:
                errors += 1
                print("EVAL ERROR")

            time.sleep(0.5)

        print(f"\n  Round {round_num} results: {passes} PASS / {len(failures)} FAIL / {errors} ERROR\n")

        # Record results
        all_results.append({
            "round": round_num,
            "passes": passes,
            "failures": len(failures),
            "errors": errors,
            "failed_tools": [f["name"] for f in failures],
        })

        # ── Check if done ──
        if not failures:
            print("All images pass! Pipeline complete.\n")
            break

        if round_num == args.max_rounds:
            print(f"Max rounds reached. {len(failures)} still failing.\n")
            break

        # ── Regenerate phase ──
        print(f"  Regenerating {len(failures)} failed images...\n")

        for j, fail in enumerate(failures, 1):
            name = fail["name"]
            desc = fail["description"]
            print(f"    [{j}/{len(failures)}] {name[:55]}...", end=" ", flush=True)

            # Generate via Gemini (chromakey green background)
            prompt = GENERATE_PROMPT.format(name=name, description=desc, chroma=CHROMA_GREEN)
            raw_bytes = generate_image_gemini(keys["gemini"], prompt)

            if not raw_bytes:
                print("GENERATE FAILED")
                continue

            # Chromakey green removal, fallback to rembg
            try:
                png_bytes = chromakey_remove(raw_bytes)
                print("chroma ", end="", flush=True)
            except Exception as e:
                print(f"chroma err, ", end="", flush=True)
                try:
                    png_bytes = remove_background_rembg(raw_bytes, rembg_session)
                    print("rembg ", end="", flush=True)
                except Exception as e2:
                    print(f"rembg err: {e2}")
                    png_bytes = raw_bytes

            # Save to all locations
            sname = safe_name(name)
            out_fname = sname + ".png"

            for d in [NOBG_DIR, GENERATED_DIR]:
                with open(os.path.join(d, out_fname), "wb") as f:
                    f.write(png_bytes)

            if os.path.isdir(PUBLIC_DIR):
                with open(os.path.join(PUBLIC_DIR, out_fname), "wb") as f:
                    f.write(png_bytes)

            print("REGENERATED")
            time.sleep(2)  # Gemini rate limit

        print()

    # ── Final summary ──
    print("=" * 70)
    print("PIPELINE SUMMARY")
    print("=" * 70)
    for r in all_results:
        status = "ALL PASS" if r["failures"] == 0 else f"{r['failures']} failures"
        print(f"  Round {r['round']}: {r['passes']} pass, {status}")
        if r["failed_tools"]:
            for name in r["failed_tools"]:
                print(f"    - {name}")
    print()

    # Write results
    out_path = os.path.join(os.path.dirname(__file__), "fix_images_results.json")
    with open(out_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"Results written to {out_path}")


if __name__ == "__main__":
    main()
