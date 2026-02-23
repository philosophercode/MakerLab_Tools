"""
Download an image from URL, remove background with rembg, and save locally.

Usage:
  python replace_from_url.py --tool "Form 2" --url "https://example.com/image.jpg"
"""

import io
import os
import sys
import socket
import ipaddress
import urllib.request
import urllib.parse

MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024  # 8MB
DEFAULT_ALLOWLIST = {
    "upload.wikimedia.org",
    "commons.wikimedia.org",
    "wikipedia.org",
    "images.unsplash.com",
    "images.pexels.com",
}


def is_private_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_unspecified
    )


def get_allowlist() -> set[str]:
    raw = os.environ.get("IMAGE_SOURCE_ALLOWLIST", "").strip()
    if not raw:
        return set(DEFAULT_ALLOWLIST)
    return {h.strip().lower() for h in raw.split(",") if h.strip()}


def validate_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("Only https URLs are allowed")
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError("Invalid URL hostname")
    if (
        hostname == "localhost"
        or hostname.endswith(".localhost")
        or hostname.endswith(".local")
        or hostname.endswith(".internal")
    ):
        raise ValueError("Host is not allowed")

    allowlist = get_allowlist()
    if not any(hostname == h or hostname.endswith(f".{h}") for h in allowlist):
        raise ValueError("Host is not in allowlist")

    infos = socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)
    addrs = {info[4][0] for info in infos}
    if any(is_private_ip(ip) for ip in addrs):
        raise ValueError("Host resolves to a private or local IP")


def download_image(url: str) -> bytes:
    validate_url(url)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "MakerLabTools/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        chunks = []
        total = 0
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_DOWNLOAD_BYTES:
                raise ValueError("Image exceeds max download size")
            chunks.append(chunk)
        return b"".join(chunks)


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
