"""
AI Image Eval Pipeline — process original_photos/ into clean transparent PNGs.

5 stages:
  1. IDENTIFY  — Claude Vision checks if image matches the filename tool
  2. QUALITY   — Blur detection via Pillow edge variance
  3. GREENSCREEN — Gemini enhances the real photo onto #00FF00 background
  4. CHROMA-KEY — Pillow HSV thresholding removes green → transparent PNG
  5. VALIDATE  — Claude Vision confirms the final image is correct + clean

Usage:
  python image_pipeline.py                   # Process first 10 images
  python image_pipeline.py --limit 5         # Process first 5
  python image_pipeline.py --all             # Process everything
  python image_pipeline.py --tool "Form 2"   # Single tool
  python image_pipeline.py --resume          # Resume from existing report.json

Requires:
  - ANTHROPIC_API_KEY and GEMINI_API_KEY in v3/app/.env.local
  - Pillow and numpy: pip install pillow numpy
"""

import base64
import io
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# ── Paths ────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, "..", "..")
INPUT_DIR = os.path.join(PROJECT_ROOT, "original_photos")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "pipeline_output")

# ── API Config ───────────────────────────────────────────────────────────

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-6"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent"
CHROMA_GREEN = "#00FF00"

# ── Prompts ──────────────────────────────────────────────────────────────

IDENTIFY_PROMPT = """\
You are evaluating whether a product image matches a tool/equipment name.

Tool name: {name}

Look at the image and determine:
1. Does the image show the tool/equipment named above?
2. Is this a reasonable photo of that item?

Respond with EXACTLY this JSON (no markdown, no extra text):
{{
  "match": true or false,
  "confidence": 0.0 to 1.0,
  "image_shows": "brief description of what the image actually shows",
  "reasoning": "one sentence explaining your verdict"
}}"""

VALIDATE_PROMPT = """\
You are validating a processed product image.

Tool name: {name}

Check:
1. Does this image clearly show the tool named above?
2. Is the image quality good (not blurry, not distorted)?
3. Does the object look natural and correctly rendered?

Respond with EXACTLY this JSON (no markdown, no extra text):
{{
  "match": true or false,
  "confidence": 0.0 to 1.0,
  "quality": "good" or "acceptable" or "poor",
  "image_shows": "brief description",
  "reasoning": "one sentence"
}}"""

GREENSCREEN_PROMPT = """\
Take this exact product/tool and place it on a perfectly solid, uniform \
chromakey green background (exact hex {chroma}). Keep the object IDENTICAL \
— same angle, same details, same proportions. Do NOT change, stylize, or \
reimagine the object in any way. Just replace the background with solid \
{chroma} green that extends to every edge.

The background MUST be completely flat {chroma} with no gradients, shadows, \
or reflections. The object itself should NOT contain any {chroma} green. \
Center the object with generous padding on all sides.

Output the image at {size}x{size} pixels.

Product: {name}"""

REIMAGINE_PROMPT = """\
Transform the main object into a flat, 2D vector-style illustration with \
clean black outlines and simplified, solid colors. Remove the original \
background entirely and replace it with a solid, uniform, high-saturation \
chroma key green screen (exact hex {chroma}). Ensure the edges of the object \
are clean and sharp, and preserve the key identifying details and logos of \
the object in the illustrated style.

Output the image at {size}x{size} pixels.

Product: {name}"""

# ── Helpers ──────────────────────────────────────────────────────────────

OUTPUT_SIZE = 512  # Default, overridden by --size arg


class RateLimiter:
    """Token-bucket rate limiter. Blocks until a slot is available."""

    def __init__(self, rpm):
        self.min_interval = 60.0 / rpm  # seconds between calls
        self.lock = threading.Lock()
        self.last_call = 0.0

    def acquire(self):
        with self.lock:
            now = time.time()
            wait = self.min_interval - (now - self.last_call)
            if wait > 0:
                time.sleep(wait)
            self.last_call = time.time()


def resize_for_api(image_bytes, max_dim=512):
    """Resize image to fit within max_dim x max_dim, preserving aspect ratio.

    Returns smaller JPEG bytes for faster API upload.
    """
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes))
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    buf = io.BytesIO()
    if img.mode in ("RGBA", "LA", "PA"):
        img.save(buf, format="PNG", optimize=True)
    else:
        img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def resize_to_square(image_bytes, size=512):
    """Resize Gemini output to a square PNG at the target size.

    Fits the image into a size x size square with transparent padding.
    """
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    img.thumbnail((size, size), Image.LANCZOS)

    # Center on a transparent square canvas
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - img.width) // 2
    y = (size - img.height) // 2
    canvas.paste(img, (x, y), img)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def load_env():
    """Load API keys from .env files."""
    config = {}
    for env_path in [
        os.path.join(SCRIPT_DIR, ".env"),
        os.path.join(SCRIPT_DIR, "..", "app", ".env.local"),
    ]:
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        key, val = line.split("=", 1)
                        config[key.strip()] = val.strip()

    anthropic_key = config.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    gemini_key = config.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")

    if not anthropic_key:
        print("Error: ANTHROPIC_API_KEY not found in v3/app/.env.local")
        sys.exit(1)
    if not gemini_key:
        print("Error: GEMINI_API_KEY not found in v3/app/.env.local")
        sys.exit(1)

    return anthropic_key, gemini_key


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def call_claude_vision(api_key, image_b64, media_type, prompt):
    """Send image + prompt to Claude Vision. Returns parsed JSON or None."""
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "messages": [{
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
                {"type": "text", "text": prompt},
            ],
        }],
    }

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=body,
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read())
        text = result["content"][0]["text"]
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return None, f"Claude API {e.code}: {error_body[:200]}"
    except Exception as e:
        return None, f"Claude error: {e}"

    # Parse JSON response (tolerate markdown fences)
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)
    try:
        return json.loads(cleaned), None
    except json.JSONDecodeError:
        return None, f"Parse error: {text[:200]}"


def call_gemini_with_image(api_key, image_bytes, prompt):
    """Send image + prompt to Gemini for image-in/image-out. Returns PNG bytes or None."""
    # Detect mime type from magic bytes
    if image_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        mime = "image/png"
    else:
        mime = "image/jpeg"

    image_b64 = base64.standard_b64encode(image_bytes).decode("ascii")

    payload = {
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": mime,
                        "data": image_b64,
                    }
                },
                {"text": prompt},
            ]
        }],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        GEMINI_API_URL,
        data=body,
        method="POST",
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        },
    )

    try:
        resp = urllib.request.urlopen(req, timeout=90)
        result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        return None, f"Gemini {e.code}: {error_body[:200]}"
    except Exception as e:
        return None, f"Gemini error: {e}"

    candidates = result.get("candidates", [])
    if not candidates:
        return None, "Gemini: no candidates"

    parts = candidates[0].get("content", {}).get("parts", [])
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline:
            return base64.b64decode(inline["data"]), None

    return None, "Gemini: no image in response"


def check_blur(image_bytes, threshold=100.0):
    """Check if image is blurry using Laplacian-style edge variance via Pillow.

    Converts to grayscale, applies FIND_EDGES filter (approximates Laplacian),
    then computes variance. Low variance = blurry.

    Returns (score, is_blurry).
    """
    from PIL import Image, ImageFilter
    import numpy as np

    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    # Resize to consistent size for comparable scores
    img = img.resize((512, 512))
    edges = img.filter(ImageFilter.FIND_EDGES)
    arr = np.array(edges, dtype=np.float64)
    score = float(arr.var())
    return score, score < threshold


def chromakey_remove(image_bytes, hue_center=120, hue_range=40, sat_min=80, val_min=80):
    """Remove chromakey green background using HSV thresholding.

    Returns (png_bytes, pixels_removed_pct).
    """
    import numpy as np
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    arr = np.array(img)
    total_pixels = arr.shape[0] * arr.shape[1]

    # RGB -> HSV
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

    with np.errstate(invalid="ignore"):
        sat = np.where(cmax > 0, (delta / cmax) * 255, 0)
    val = cmax * 255

    # Green mask
    hue_lo = hue_center - hue_range
    hue_hi = hue_center + hue_range
    green_mask = (hue >= hue_lo) & (hue <= hue_hi) & (sat >= sat_min) & (val >= val_min)

    # Soft edge feathering
    hue_dist = np.minimum(np.abs(hue - hue_center), 360 - np.abs(hue - hue_center))
    feather_range = 10
    feather = np.clip((hue_dist - (hue_range - feather_range)) / feather_range, 0, 1)

    alpha = arr[:, :, 3].astype(np.float32)
    alpha[green_mask] = 0
    near_green = (hue_dist < hue_range + feather_range) & ~green_mask & (sat >= sat_min * 0.5)
    alpha[near_green] = alpha[near_green] * feather[near_green]

    arr[:, :, 3] = alpha.astype(np.uint8)
    result = Image.fromarray(arr)

    removed_pct = float(np.sum(arr[:, :, 3] == 0)) / total_pixels * 100

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue(), removed_pct


# ── Pipeline Stages ──────────────────────────────────────────────────────


def normalize_image(image_bytes):
    """Re-encode image through Pillow to fix unsupported JPEG formats (CMYK, etc.).

    Returns (clean_bytes, media_type) or raises on truly corrupt files.
    """
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()  # Force decode to catch corrupt data early
    except Exception as e:
        raise ValueError(f"Cannot decode image: {e}")

    buf = io.BytesIO()
    if img.mode in ("RGBA", "LA", "PA"):
        img.save(buf, format="PNG")
        return buf.getvalue(), "image/png"
    else:
        img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=95)
        return buf.getvalue(), "image/jpeg"


def stage_identify(anthropic_key, tool_name, image_bytes):
    """Stage 1: Claude Vision checks if image matches the tool name."""
    try:
        clean_bytes, media = normalize_image(image_bytes)
    except ValueError as e:
        return {"status": "error", "error": str(e), "timestamp": now_iso()}

    b64 = base64.standard_b64encode(clean_bytes).decode("ascii")
    prompt = IDENTIFY_PROMPT.format(name=tool_name)
    parsed, err = call_claude_vision(anthropic_key, b64, media, prompt)

    if err:
        return {"status": "error", "error": err, "timestamp": now_iso()}

    if not parsed or parsed.get("match") is None:
        return {"status": "error", "error": "Could not parse response", "timestamp": now_iso()}

    return {
        "status": "pass" if parsed["match"] else "fail",
        "confidence": parsed.get("confidence", 0),
        "claude_says": parsed.get("image_shows", ""),
        "reasoning": parsed.get("reasoning", ""),
        "timestamp": now_iso(),
    }


def stage_quality(image_bytes, threshold=100.0):
    """Stage 2: Blur detection."""
    score, is_blurry = check_blur(image_bytes, threshold)
    return {
        "status": "fail" if is_blurry else "pass",
        "blur_score": round(score, 1),
        "threshold": threshold,
        "timestamp": now_iso(),
    }


def stage_greenscreen(gemini_key, tool_name, image_bytes, reimagine=False, size=512):
    """Stage 3: Gemini enhances the photo onto green background.

    If reimagine=True, Gemini creates a clean uniform product illustration
    based on the reference photo, which avoids aggressive chroma-key issues
    on complex objects with dark edges.
    """
    # Resize input to reduce upload size and speed up API call
    small_bytes = resize_for_api(image_bytes, max_dim=size)

    if reimagine:
        prompt = REIMAGINE_PROMPT.format(name=tool_name, chroma=CHROMA_GREEN, size=size)
    else:
        prompt = GREENSCREEN_PROMPT.format(name=tool_name, chroma=CHROMA_GREEN, size=size)

    result_bytes, err = call_gemini_with_image(gemini_key, small_bytes, prompt)

    if err:
        return None, {"status": "error", "error": err, "timestamp": now_iso()}

    # Resize output to exact target square
    result_bytes = resize_to_square(result_bytes, size)

    return result_bytes, {
        "status": "pass",
        "mode": "reimagine" if reimagine else "greenscreen",
        "gemini_model": "gemini-3-pro-image-preview",
        "size_kb": len(result_bytes) // 1024,
        "output_size": size,
        "timestamp": now_iso(),
    }


def stage_chroma_key(image_bytes):
    """Stage 4: Remove green background."""
    try:
        png_bytes, removed_pct = chromakey_remove(image_bytes)
        return png_bytes, {
            "status": "pass",
            "pixels_removed_pct": round(removed_pct, 1),
            "size_kb": len(png_bytes) // 1024,
            "timestamp": now_iso(),
        }
    except Exception as e:
        return None, {"status": "error", "error": str(e), "timestamp": now_iso()}


def stage_validate(anthropic_key, tool_name, image_bytes):
    """Stage 5: Claude Vision validates the final transparent PNG."""
    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    prompt = VALIDATE_PROMPT.format(name=tool_name)
    parsed, err = call_claude_vision(anthropic_key, b64, "image/png", prompt)

    if err:
        return {"status": "error", "error": err, "timestamp": now_iso()}

    if not parsed or parsed.get("match") is None:
        return {"status": "error", "error": "Could not parse response", "timestamp": now_iso()}

    return {
        "status": "pass" if parsed["match"] else "fail",
        "confidence": parsed.get("confidence", 0),
        "quality": parsed.get("quality", "unknown"),
        "claude_says": parsed.get("image_shows", ""),
        "reasoning": parsed.get("reasoning", ""),
        "timestamp": now_iso(),
    }


# ── Main ─────────────────────────────────────────────────────────────────


def main():
    import argparse

    parser = argparse.ArgumentParser(description="AI Image Eval Pipeline")
    parser.add_argument("--limit", type=int, default=10, help="Max images to process (default: 10)")
    parser.add_argument("--all", action="store_true", help="Process all images")
    parser.add_argument("--tool", type=str, default="", help="Process a single tool by name")
    parser.add_argument("--resume", action="store_true", help="Resume from existing report.json")
    parser.add_argument("--blur-threshold", type=float, default=100.0, help="Blur score threshold (default: 100)")
    parser.add_argument("--reimagine", action="store_true", help="Reimagine tools as clean uniform illustrations instead of just greenscreening")
    parser.add_argument("--greenscreen-only", action="store_true", help="Only run greenscreen stage (skip identify, quality, chroma-key, validate)")
    parser.add_argument("--size", type=int, default=512, help="Output image size in pixels (default: 512)")
    parser.add_argument("--workers", type=int, default=10, help="Parallel workers (default: 10)")
    parser.add_argument("--gemini-rpm", type=int, default=10, help="Gemini API rate limit in RPM (default: 10)")
    parser.add_argument("--run-dir", type=str, default="", help="Continue from an existing run directory (runs stages 4+5 on greenscreen images)")
    args = parser.parse_args()

    if args.all:
        args.limit = 0

    anthropic_key, gemini_key = load_env()

    # ── Set up output directories ──
    if args.run_dir:
        run_dir = args.run_dir
        run_ts = os.path.basename(run_dir).replace("run_", "")
    else:
        run_ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        run_dir = os.path.join(OUTPUT_DIR, f"run_{run_ts}")
    dirs = {
        "greenscreen": os.path.join(run_dir, "3_greenscreen"),
        "transparent": os.path.join(run_dir, "4_transparent"),
        "validated": os.path.join(run_dir, "5_validated"),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    report_path = os.path.join(run_dir, "report.json")
    print(f"Output: {run_dir}")

    # ── Load or init report ──
    report = {
        "run_id": now_iso(),
        "config": {
            "blur_threshold": args.blur_threshold,
            "reimagine": args.reimagine,
            "greenscreen_only": args.greenscreen_only,
            "output_size": args.size,
            "workers": args.workers,
            "gemini_model": "gemini-3-pro-image-preview",
            "claude_model": ANTHROPIC_MODEL,
            "chroma_green": CHROMA_GREEN,
        },
        "results": {},
        "summary": {},
    }

    if args.run_dir and os.path.exists(report_path):
        # Continuing an existing run — load its report
        with open(report_path) as f:
            prev = json.load(f)
        report["results"] = prev.get("results", {})
        print(f"Loaded run report ({len(report['results'])} tools)")
    elif args.resume:
        # Find the latest run folder's report.json
        prev_report = os.path.join(OUTPUT_DIR, "report.json")  # legacy location
        if os.path.isdir(OUTPUT_DIR):
            run_dirs = sorted(
                d for d in os.listdir(OUTPUT_DIR)
                if d.startswith("run_") and os.path.isfile(os.path.join(OUTPUT_DIR, d, "report.json"))
            )
            if run_dirs:
                prev_report = os.path.join(OUTPUT_DIR, run_dirs[-1], "report.json")
        if os.path.exists(prev_report):
            with open(prev_report) as f:
                prev = json.load(f)
            report["results"] = prev.get("results", {})
            print(f"Resuming from {prev_report} ({len(report['results'])} tools already processed)")

    # ── Discover input images ──
    if not os.path.isdir(INPUT_DIR):
        print(f"Error: {INPUT_DIR} not found")
        sys.exit(1)

    all_files = sorted(
        f for f in os.listdir(INPUT_DIR)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp"))
    )

    # Build processing list
    to_process = []
    for fname in all_files:
        tool_name = os.path.splitext(fname)[0]

        if args.tool and tool_name != args.tool:
            continue

        # Skip if already done (resume mode)
        if args.resume and tool_name in report["results"]:
            existing = report["results"][tool_name]
            if args.greenscreen_only:
                # Skip if greenscreen passed OR if image was corrupt (don't retry known-bad files)
                gs = existing.get("stages", {}).get("greenscreen", {})
                if gs.get("status") == "pass":
                    continue
                if "Cannot decode image" in gs.get("error", ""):
                    continue
            elif existing.get("final_status") == "pass":
                continue

        to_process.append((tool_name, fname))

    if args.limit:
        to_process = to_process[:args.limit]

    # ── --run-dir mode: stages 4+5 on existing greenscreen images ──
    if args.run_dir:
        # Build list from greenscreen images that don't have chroma_key + validate done yet
        gs_dir = dirs["greenscreen"]
        gs_files = sorted(f for f in os.listdir(gs_dir) if f.lower().endswith(".png"))
        to_process_45 = []
        for fname in gs_files:
            tool_name = os.path.splitext(fname)[0]
            if args.tool and tool_name != args.tool:
                continue
            # Skip if already fully done
            existing = report["results"].get(tool_name, {})
            if existing.get("final_status") == "pass":
                continue
            to_process_45.append((tool_name, fname))

        if args.limit:
            to_process_45 = to_process_45[:args.limit]

        print(f"STAGES 4+5: {len(to_process_45)} greenscreen images to process")
        print(f"  Workers: {args.workers} parallel")
        print()

        stats = {"pass": 0, "fail_validate": 0, "error": 0}
        report_lock = threading.Lock()
        completed = [0]
        t_start = time.time()
        total_45 = len(to_process_45)

        def progress_45():
            elapsed = time.time() - t_start
            if completed[0] > 0:
                eta = (elapsed / completed[0]) * (total_45 - completed[0])
                return f"[{completed[0]}/{total_45}] {elapsed:.0f}s elapsed, ~{eta:.0f}s remaining"
            return f"[{completed[0]}/{total_45}]"

        def process_chroma_validate(item):
            tool_name, fname = item
            gs_path = os.path.join(gs_dir, fname)
            with open(gs_path, "rb") as gf:
                green_bytes = gf.read()

            entry = report["results"].get(tool_name, {
                "input_file": f"original_photos/{tool_name}.*",
                "stages": {},
                "final_status": None,
                "stopped_at": None,
                "reason": None,
            })

            # Stage 4: Chroma-key
            transparent_bytes, ck_result = stage_chroma_key(green_bytes)
            entry["stages"]["chroma_key"] = ck_result

            if ck_result["status"] != "pass" or not transparent_bytes:
                entry["final_status"] = "fail"
                entry["stopped_at"] = "chroma_key"
                entry["reason"] = f"Chroma-key failed: {ck_result.get('error', '?')}"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["error"] += 1
                    completed[0] += 1
                    print(f"  {progress_45()} ERROR (chroma) {tool_name}")
                return

            # Save transparent
            trans_path = os.path.join(dirs["transparent"], f"{safe_name(tool_name)}.png")
            with open(trans_path, "wb") as tf:
                tf.write(transparent_bytes)
            ck_result["output_file"] = f"pipeline_output/run_{run_ts}/4_transparent/{safe_name(tool_name)}.png"

            # Stage 5: Validate
            val_result = stage_validate(anthropic_key, tool_name, transparent_bytes)
            entry["stages"]["validate"] = val_result

            if val_result["status"] != "pass":
                entry["final_status"] = "fail"
                entry["stopped_at"] = "validate"
                entry["reason"] = f"Validation: {val_result.get('claude_says', val_result.get('error', '?'))}"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["fail_validate"] += 1
                    completed[0] += 1
                    print(f"  {progress_45()} FAIL (validate) {tool_name}: {val_result.get('reasoning', '?')}")
                return

            # Save to validated
            valid_path = os.path.join(dirs["validated"], f"{safe_name(tool_name)}.png")
            with open(valid_path, "wb") as vf:
                vf.write(transparent_bytes)
            val_result["output_file"] = f"pipeline_output/run_{run_ts}/5_validated/{safe_name(tool_name)}.png"

            entry["final_status"] = "pass"
            with report_lock:
                report["results"][tool_name] = entry
                save_report(report, report_path)
                stats["pass"] += 1
                completed[0] += 1
                q = val_result.get('quality', '?')
                c = val_result.get('confidence', '?')
                pct = ck_result.get('pixels_removed_pct', '?')
                print(f"  {progress_45()} PASS {tool_name} (removed {pct}%, quality={q}, conf={c})")

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(process_chroma_validate, item) for item in to_process_45]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    print(f"  Thread error: {e}")

        report["summary"] = {
            "total": len(to_process_45),
            "passed": stats["pass"],
            "failed_validate": stats["fail_validate"],
            "errors": stats["error"],
        }
        save_report(report, report_path)

        print()
        print("=" * 60)
        print("STAGES 4+5 COMPLETE")
        print(f"  Passed:            {stats['pass']}")
        print(f"  Failed (validate): {stats['fail_validate']}")
        print(f"  Errors:            {stats['error']}")
        print(f"  Report: {report_path}")
        print("=" * 60)
        return

    mode_label = "GREENSCREEN ONLY" if args.greenscreen_only else "FULL PIPELINE"
    print(f"{mode_label}: {len(to_process)} images to process from original_photos/")
    print(f"Config: size={args.size}x{args.size}, model=gemini-3-pro-image-preview")
    if args.greenscreen_only:
        print(f"  Workers: {args.workers} parallel")
        print("  Skipping: identify, quality, chroma-key, validate")
    print()

    # ── Process each image ──
    stats = {"pass": 0, "fail_identify": 0, "fail_quality": 0, "fail_validate": 0, "error": 0, "corrupt": 0}
    report_lock = threading.Lock()

    if args.greenscreen_only:
        # ── Parallel greenscreen-only mode ──

        # Pre-filter: validate images and separate valid from corrupt
        valid_items = []
        for tool_name, fname in to_process:
            input_path = os.path.join(INPUT_DIR, fname)
            with open(input_path, "rb") as f:
                original_bytes = f.read()
            try:
                normalize_image(original_bytes)
                valid_items.append((tool_name, fname, original_bytes))
            except ValueError as e:
                entry = report["results"].get(tool_name, {
                    "input_file": f"original_photos/{fname}",
                    "stages": {},
                    "final_status": None,
                    "stopped_at": None,
                    "reason": None,
                })
                entry["input_file"] = f"original_photos/{fname}"
                entry["stages"]["greenscreen"] = {"status": "error", "error": str(e), "timestamp": now_iso()}
                entry["final_status"] = "fail"
                entry["stopped_at"] = "greenscreen"
                entry["reason"] = str(e)
                report["results"][tool_name] = entry
                stats["corrupt"] += 1
                print(f"  SKIP (corrupt): {tool_name}")

        gemini_limiter_gs = RateLimiter(args.gemini_rpm)

        print(f"\n{len(valid_items)} valid images, {stats['corrupt']} corrupt skipped")
        print(f"Workers: {args.workers}, Gemini rate limit: {args.gemini_rpm} RPM\n")
        save_report(report, report_path)

        completed = [0]  # mutable counter for threads
        t_start_gs = time.time()
        total_gs = len(valid_items)

        def progress_gs():
            elapsed = time.time() - t_start_gs
            if completed[0] > 0:
                eta = (elapsed / completed[0]) * (total_gs - completed[0])
                return f"[{completed[0]}/{total_gs}] {elapsed:.0f}s elapsed, ~{eta:.0f}s remaining"
            return f"[{completed[0]}/{total_gs}]"

        def process_one_greenscreen(item):
            tool_name, fname, original_bytes = item
            entry = {
                "input_file": f"original_photos/{fname}",
                "stages": {},
                "final_status": None,
                "stopped_at": None,
                "reason": None,
            }

            gemini_limiter_gs.acquire()
            green_bytes, result = stage_greenscreen(
                gemini_key, tool_name, original_bytes,
                reimagine=args.reimagine, size=args.size,
            )
            entry["stages"]["greenscreen"] = result

            if result["status"] != "pass" or not green_bytes:
                entry["final_status"] = "fail"
                entry["stopped_at"] = "greenscreen"
                entry["reason"] = f"Gemini failed: {result.get('error', '?')}"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["error"] += 1
                    completed[0] += 1
                    print(f"  {progress_gs()} ERROR {tool_name}: {result.get('error', '?')}")
                return

            # Save greenscreen output
            green_path = os.path.join(dirs["greenscreen"], f"{safe_name(tool_name)}.png")
            with open(green_path, "wb") as gf:
                gf.write(green_bytes)
            result["output_file"] = f"pipeline_output/run_{run_ts}/3_greenscreen/{safe_name(tool_name)}.png"

            with report_lock:
                report["results"][tool_name] = entry
                save_report(report, report_path)
                stats["pass"] += 1
                completed[0] += 1
                print(f"  {progress_gs()} PASS {tool_name} ({result['size_kb']}KB)")

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(process_one_greenscreen, item) for item in valid_items]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    print(f"  Thread error: {e}")

    else:
        # ── Full 5-stage waterfall pipeline ──
        # Each image flows through all 5 stages independently.
        # N workers process N images concurrently — no waiting for batches.

        # Pre-filter corrupt images and load bytes
        valid_items = []
        for tool_name, fname in to_process:
            input_path = os.path.join(INPUT_DIR, fname)
            with open(input_path, "rb") as f:
                raw = f.read()
            try:
                normalize_image(raw)
                valid_items.append((tool_name, fname, raw))
            except ValueError as e:
                entry = {"input_file": f"original_photos/{fname}", "stages": {},
                         "final_status": "fail", "stopped_at": "identify", "reason": str(e)}
                report["results"][tool_name] = entry
                stats["corrupt"] += 1
                print(f"  SKIP (corrupt): {tool_name}")

        gemini_limiter = RateLimiter(args.gemini_rpm)

        print(f"\n{len(valid_items)} valid, {stats['corrupt']} corrupt skipped")
        print(f"Workers: {args.workers}, Gemini rate limit: {args.gemini_rpm} RPM")
        print(f"Waterfall: each image flows through all 5 stages independently\n")
        save_report(report, report_path)

        completed = [0]
        t_start = time.time()
        total_valid = len(valid_items)

        def progress():
            elapsed = time.time() - t_start
            if completed[0] > 0:
                eta = (elapsed / completed[0]) * (total_valid - completed[0])
                return f"[{completed[0]}/{total_valid}] {elapsed:.0f}s elapsed, ~{eta:.0f}s left"
            return f"[0/{total_valid}]"

        def process_full_pipeline(item):
            tool_name, fname, original_bytes = item
            entry = {
                "input_file": f"original_photos/{fname}",
                "stages": {},
                "final_status": None,
                "stopped_at": None,
                "reason": None,
            }

            # Stage 1: Identify
            result = stage_identify(anthropic_key, tool_name, original_bytes)
            entry["stages"]["identify"] = result
            if result["status"] != "pass":
                entry["final_status"] = "fail"
                entry["stopped_at"] = "identify"
                entry["reason"] = f"Identify: {result.get('claude_says', result.get('error', '?'))}"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["fail_identify"] += 1
                    completed[0] += 1
                    print(f"  {progress()} FAIL@identify {tool_name}")
                return

            # Stage 2: Quality
            result = stage_quality(original_bytes, args.blur_threshold)
            entry["stages"]["quality"] = result
            if result["status"] != "pass":
                entry["final_status"] = "fail"
                entry["stopped_at"] = "quality"
                entry["reason"] = f"Blurry (score {result['blur_score']})"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["fail_quality"] += 1
                    completed[0] += 1
                    print(f"  {progress()} FAIL@quality {tool_name} (blur={result['blur_score']})")
                return

            # Stage 3: Greenscreen (rate-limited)
            gemini_limiter.acquire()
            green_bytes, result = stage_greenscreen(
                gemini_key, tool_name, original_bytes,
                reimagine=args.reimagine, size=args.size,
            )
            entry["stages"]["greenscreen"] = result
            if result["status"] != "pass" or not green_bytes:
                entry["final_status"] = "fail"
                entry["stopped_at"] = "greenscreen"
                entry["reason"] = f"Gemini: {result.get('error', '?')}"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["error"] += 1
                    completed[0] += 1
                    print(f"  {progress()} ERROR@greenscreen {tool_name}")
                return

            gp = os.path.join(dirs["greenscreen"], f"{safe_name(tool_name)}.png")
            with open(gp, "wb") as gf:
                gf.write(green_bytes)
            result["output_file"] = f"pipeline_output/run_{run_ts}/3_greenscreen/{safe_name(tool_name)}.png"

            # Stage 4: Chroma-key
            transparent_bytes, result = stage_chroma_key(green_bytes)
            entry["stages"]["chroma_key"] = result
            if result["status"] != "pass" or not transparent_bytes:
                entry["final_status"] = "fail"
                entry["stopped_at"] = "chroma_key"
                entry["reason"] = f"Chroma-key: {result.get('error', '?')}"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["error"] += 1
                    completed[0] += 1
                    print(f"  {progress()} ERROR@chroma {tool_name}")
                return

            tp = os.path.join(dirs["transparent"], f"{safe_name(tool_name)}.png")
            with open(tp, "wb") as tf:
                tf.write(transparent_bytes)
            result["output_file"] = f"pipeline_output/run_{run_ts}/4_transparent/{safe_name(tool_name)}.png"

            # Stage 5: Validate
            result = stage_validate(anthropic_key, tool_name, transparent_bytes)
            entry["stages"]["validate"] = result
            if result["status"] != "pass":
                entry["final_status"] = "fail"
                entry["stopped_at"] = "validate"
                entry["reason"] = f"Validate: {result.get('claude_says', result.get('error', '?'))}"
                with report_lock:
                    report["results"][tool_name] = entry
                    save_report(report, report_path)
                    stats["fail_validate"] += 1
                    completed[0] += 1
                    print(f"  {progress()} FAIL@validate {tool_name}")
                return

            vp = os.path.join(dirs["validated"], f"{safe_name(tool_name)}.png")
            with open(vp, "wb") as vf:
                vf.write(transparent_bytes)
            result["output_file"] = f"pipeline_output/run_{run_ts}/5_validated/{safe_name(tool_name)}.png"

            entry["final_status"] = "pass"
            with report_lock:
                report["results"][tool_name] = entry
                save_report(report, report_path)
                stats["pass"] += 1
                completed[0] += 1
                q = result.get('quality', '?')
                c = result.get('confidence', '?')
                print(f"  {progress()} PASS {tool_name} (quality={q}, conf={c})")

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(process_full_pipeline, item) for item in valid_items]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    print(f"  Thread error: {e}")

        save_report(report, report_path)

    # ── Summary ──
    report["summary"] = {
        "total": len(to_process),
        "passed": stats["pass"],
        "failed_identify": stats["fail_identify"],
        "failed_quality": stats["fail_quality"],
        "failed_validate": stats["fail_validate"],
        "errors": stats["error"],
        "corrupt": stats["corrupt"],
    }
    save_report(report, report_path)

    print()
    print("=" * 60)
    print(f"{mode_label} COMPLETE")
    print(f"  Passed:            {stats['pass']}")
    if args.greenscreen_only:
        print(f"  Corrupt (skipped): {stats['corrupt']}")
        print(f"  Errors:            {stats['error']}")
    else:
        print(f"  Failed (identify): {stats['fail_identify']}")
        print(f"  Failed (quality):  {stats['fail_quality']}")
        print(f"  Failed (validate): {stats['fail_validate']}")
        print(f"  Errors:            {stats['error']}")
    print(f"  Report: {report_path}")
    print("=" * 60)


def safe_name(name):
    """Sanitize tool name for filename."""
    return name.replace("/", "_")


def save_report(report, path):
    """Write report.json atomically."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(report, f, indent=2)
    os.replace(tmp, path)


if __name__ == "__main__":
    main()
