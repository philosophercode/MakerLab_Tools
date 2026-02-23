"""
Evaluate tool images against their names and descriptions.

Downloads each tool's image from AirTable and sends it to Claude's vision
API to check whether the image actually depicts the described tool.

Outputs a structured report: PASS / FAIL / SKIP for each tool.

Usage:
  python eval_images.py                  # Run full eval (images from AirTable)
  python eval_images.py --local          # Eval local images in tool_images_nobg/
  python eval_images.py --limit 10       # Evaluate first 10 tools only
  python eval_images.py --tool "Form 2"  # Evaluate a single tool by name

Requires ANTHROPIC_API_KEY and AIRTABLE_API_KEY in v3/app/.env.local
"""

import base64
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

TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"

EVAL_PROMPT = """\
You are evaluating whether a product image matches a tool listing.

Tool name: {name}
Tool description: {description}

Look at the image and determine:
1. Does the image show the tool described above?
2. Is the image a reasonable product photo for this listing?

Respond with EXACTLY this JSON format (no markdown, no extra text):
{{
  "match": true or false,
  "confidence": "high" or "medium" or "low",
  "image_shows": "brief description of what the image actually shows",
  "reasoning": "one sentence explaining your verdict"
}}
"""

# ── Helpers ───────────────────────────────────────────────────────────────


def load_env():
    """Load API keys from v3/app/.env.local."""
    env_path = os.path.join(
        os.path.dirname(__file__), "..", "app", ".env.local"
    )
    config = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    config[key.strip()] = val.strip()

    anthropic_key = config.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    airtable_key = config.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_API_KEY")
    base_id = config.get("AIRTABLE_BASE_ID") or os.environ.get("AIRTABLE_BASE_ID")

    if not anthropic_key:
        print("Error: ANTHROPIC_API_KEY not found")
        sys.exit(1)
    if not airtable_key or not base_id:
        print("Error: AIRTABLE_API_KEY / AIRTABLE_BASE_ID not found")
        sys.exit(1)

    return anthropic_key, airtable_key, base_id


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
    """Download an image and return (base64_data, media_type)."""
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req)
    content_type = resp.headers.get("Content-Type", "image/jpeg")
    raw = resp.read()
    return base64.standard_b64encode(raw).decode("ascii"), content_type


def call_claude_vision(anthropic_key, image_b64, media_type, prompt_text):
    """Send an image + prompt to Claude and return the text response."""
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt_text,
                    },
                ],
            }
        ],
    }

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=body,
        method="POST",
        headers={
            "x-api-key": anthropic_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )

    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        return result["content"][0]["text"]
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"    Claude API error {e.code}: {error_body[:300]}")
        return None


def parse_eval_response(text):
    """Parse Claude's JSON response, tolerating markdown fences."""
    if not text:
        return None
    # Strip markdown code fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return {"match": None, "confidence": "unknown", "image_shows": text[:100], "reasoning": "Failed to parse response"}


# ── Main ──────────────────────────────────────────────────────────────────


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Evaluate tool images against descriptions")
    parser.add_argument("--limit", type=int, default=0, help="Max tools to evaluate (0 = all)")
    parser.add_argument("--tool", type=str, default="", help="Evaluate a single tool by name")
    parser.add_argument("--local", action="store_true", help="Eval local images from tool_images_nobg/ instead of AirTable")
    parser.add_argument("--output", type=str, default="", help="Write JSON results to file")
    args = parser.parse_args()

    local_dir = os.path.join(os.path.dirname(__file__), "tool_images_nobg")

    anthropic_key, airtable_key, base_id = load_env()

    # ── Fetch tools from AirTable ──
    print("Fetching tools from AirTable...")
    records = airtable_fetch_all(airtable_key, base_id, TOOLS_TABLE_ID)
    print(f"  Found {len(records)} tools")

    # ── Build evaluation list ──
    # Build name -> description lookup from AirTable records
    name_to_desc = {}
    for rec in records:
        fields = rec["fields"]
        name_to_desc[fields.get("name", "")] = fields.get("description", "")

    tools_to_eval = []

    if args.local:
        # Read from local tool_images_nobg/ directory
        if not os.path.isdir(local_dir):
            print(f"Error: {local_dir} not found. Run remove_backgrounds.py --local first.")
            sys.exit(1)

        local_files = sorted(f for f in os.listdir(local_dir) if f.endswith(".png"))
        print(f"  Found {len(local_files)} local images in tool_images_nobg/")

        for fname in local_files:
            stem = os.path.splitext(fname)[0]
            # Reverse the slash sanitization from remove_backgrounds.py
            tool_name = stem.replace("_", "/")

            if args.tool and tool_name != args.tool:
                # Also try the underscore version
                if args.tool != stem:
                    continue

            description = name_to_desc.get(tool_name, name_to_desc.get(stem, ""))

            tools_to_eval.append({
                "name": tool_name,
                "description": description,
                "status": "PENDING",
                "local_path": os.path.join(local_dir, fname),
                "image_filename": fname,
            })
    else:
        for rec in records:
            fields = rec["fields"]
            name = fields.get("name", "")
            description = fields.get("description", "")
            images = fields.get("image_attachments", [])

            if args.tool and name != args.tool:
                continue

            if not images:
                tools_to_eval.append({
                    "name": name,
                    "description": description,
                    "status": "SKIP",
                    "reason": "no image",
                    "image_filename": None,
                })
                continue

            img = images[0]  # evaluate the primary image
            # Use the "large" thumbnail to save bandwidth (512px)
            thumb = img.get("thumbnails", {}).get("large", {})
            img_url = thumb.get("url") or img.get("url")

            tools_to_eval.append({
                "name": name,
                "description": description,
                "status": "PENDING",
                "image_url": img_url,
                "image_filename": img.get("filename", "?"),
            })

    if args.limit:
        tools_to_eval = tools_to_eval[:args.limit]

    total = len(tools_to_eval)
    to_eval = [t for t in tools_to_eval if t["status"] == "PENDING"]
    skipped = [t for t in tools_to_eval if t["status"] == "SKIP"]

    print(f"  Evaluating {len(to_eval)} tools ({len(skipped)} skipped — no image)")
    print()

    # ── Run evaluations ──
    results = []
    passes = 0
    fails = 0
    warnings = 0
    errors = 0

    for i, tool in enumerate(to_eval, 1):
        name = tool["name"]
        desc = tool["description"]
        img_fn = tool["image_filename"]

        print(f"  [{i}/{len(to_eval)}] {name[:55]}...", end=" ", flush=True)

        # Check 1: filename cross-check (cheap, no API call)
        fn_stem = os.path.splitext(img_fn)[0] if img_fn else ""
        # Normalize for comparison: collapse slashes, underscores, extra spaces
        def normalize(s):
            return s.lower().replace("/", "").replace("_", "").replace("  ", " ").strip()
        filename_mismatch = normalize(fn_stem) != normalize(name)

        # Check 2: load image (local file or download) and run vision eval
        try:
            if "local_path" in tool:
                with open(tool["local_path"], "rb") as f:
                    raw = f.read()
                img_b64 = base64.standard_b64encode(raw).decode("ascii")
                media_type = "image/png"
            else:
                img_b64, media_type = download_image(tool["image_url"])
        except Exception as e:
            print(f"LOAD ERROR: {e}")
            tool["status"] = "ERROR"
            tool["reason"] = f"Load failed: {e}"
            results.append(tool)
            errors += 1
            continue

        # Call Claude vision
        prompt = EVAL_PROMPT.format(name=name, description=desc)
        raw_response = call_claude_vision(anthropic_key, img_b64, media_type, prompt)
        parsed = parse_eval_response(raw_response)

        if parsed and parsed.get("match") is not None:
            is_match = parsed["match"]

            if not is_match:
                tool["status"] = "FAIL"
                tool["eval"] = parsed
                fails += 1
                print(f"FAIL  — image shows: {parsed.get('image_shows', '?')}")
            elif filename_mismatch:
                tool["status"] = "WARN"
                tool["eval"] = parsed
                tool["filename_issue"] = f"expected ~'{name}', got '{img_fn}'"
                warnings += 1
                print(f"WARN  — filename mismatch: '{img_fn}'")
            else:
                tool["status"] = "PASS"
                tool["eval"] = parsed
                passes += 1
                print(f"PASS  ({parsed.get('confidence', '?')})")
        else:
            tool["status"] = "ERROR"
            tool["reason"] = "Could not parse Claude response"
            tool["raw_response"] = raw_response
            errors += 1
            print("PARSE ERROR")

        results.append(tool)

        # Rate limit: be gentle with the API
        time.sleep(0.5)

    # ── Summary ──
    results.extend(skipped)

    print()
    print("=" * 70)
    print(f"RESULTS: {passes} PASS / {fails} FAIL / {warnings} WARN / {errors} ERROR / {len(skipped)} SKIP")
    print("=" * 70)

    if fails:
        print()
        print("FAILED (image does not match tool):")
        for r in results:
            if r["status"] == "FAIL":
                ev = r.get("eval", {})
                print(f"  {r['name']}")
                print(f"    Image filename:  {r.get('image_filename', '?')}")
                print(f"    Image shows:     {ev.get('image_shows', '?')}")
                print(f"    Reasoning:       {ev.get('reasoning', '?')}")
                print(f"    Confidence:      {ev.get('confidence', '?')}")
                print()

    if warnings:
        print("WARNINGS (image content OK but filename mismatch):")
        for r in results:
            if r["status"] == "WARN":
                print(f"  {r['name']}")
                print(f"    {r.get('filename_issue', '?')}")
        print()

    if errors:
        print("ERRORS:")
        for r in results:
            if r["status"] == "ERROR":
                print(f"  {r['name']}: {r.get('reason', '?')}")
        print()

    # ── Write JSON output ──
    output_path = args.output
    if not output_path:
        suffix = "_local" if args.local else ""
        output_path = os.path.join(os.path.dirname(__file__), f"eval_images{suffix}_results.json")

    # Clean up internal fields before writing
    output_results = []
    for r in results:
        entry = {
            "name": r["name"],
            "status": r["status"],
            "image_filename": r.get("image_filename"),
        }
        if r.get("eval"):
            entry["eval"] = r["eval"]
        if r.get("reason"):
            entry["reason"] = r.get("reason")
        if r.get("filename_issue"):
            entry["filename_issue"] = r["filename_issue"]
        output_results.append(entry)

    with open(output_path, "w") as f:
        json.dump(output_results, f, indent=2)
    print(f"Full results written to {output_path}")


if __name__ == "__main__":
    main()
