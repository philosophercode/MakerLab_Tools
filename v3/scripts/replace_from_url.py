"""
Download an image from URL, remove background with rembg, and save locally.

Usage:
  python replace_from_url.py --tool "Form 2" --url "https://example.com/image.jpg"
"""

import io
import os
import sys
import urllib.request


def download_image(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "MakerLabTools/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Replace tool image from a URL and remove background")
    parser.add_argument("--tool", required=True, help="Tool name")
    parser.add_argument("--url", required=True, help="Source image URL")
    args = parser.parse_args()

    safe_name = args.tool.replace("/", "_")
    base_dir = os.path.dirname(__file__)
    nobg_dir = os.path.join(base_dir, "tool_images_nobg")
    gen_dir = os.path.join(base_dir, "tool_images_generated")
    os.makedirs(nobg_dir, exist_ok=True)
    os.makedirs(gen_dir, exist_ok=True)

    try:
      raw = download_image(args.url)
    except Exception as e:
      print(f"DOWNLOAD ERROR: {e}")
      return 1

    try:
      from rembg import new_session, remove
      from PIL import Image

      session = new_session("u2net")
      input_img = Image.open(io.BytesIO(raw))
      output_img = remove(input_img, session=session)
      buf = io.BytesIO()
      output_img.save(buf, format="PNG")
      png_bytes = buf.getvalue()
    except Exception as e:
      print(f"REMBG ERROR: {e}")
      return 1

    out_nobg = os.path.join(nobg_dir, f"{safe_name}.png")
    out_gen = os.path.join(gen_dir, f"{safe_name}.png")
    with open(out_nobg, "wb") as f:
      f.write(png_bytes)
    with open(out_gen, "wb") as f:
      f.write(png_bytes)

    print(f"SAVED: {out_nobg}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
