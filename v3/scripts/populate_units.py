"""
Populate the Units table with realistic unit records based on tools that
logically have multiple physical units in the MakerLab.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python populate_units.py
"""

import json
import os
import secrets
import sys
import time
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"
UNITS_TABLE_ID = "tblDtKMcCxTyQbXwi"

# Tools with multiple physical units, mapped by record ID.
# Format: (tool_record_id, [(label, status, condition), ...])
UNIT_DATA = [
    # 3D Printers — multiple units of same model
    ("reckY0HP8yVmwrUXW", [  # Prusa i3 MK3S+
        ("Prusa MK3S+ #1", "Available", "Good"),
        ("Prusa MK3S+ #2", "Available", "Good"),
        ("Prusa MK3S+ #3", "Available", "Excellent"),
        ("Prusa MK3S+ #4", "Under Maintenance", "Needs Repair"),
    ]),
    ("recsxQuhH0IMDWEHp", [  # Original Prusa i3 MK3S+ Enclosure Bundle
        ("Prusa Enclosure #1", "Available", "Good"),
        ("Prusa Enclosure #2", "Available", "Good"),
    ]),
    ("recohXvrLHiv7X6Ih", [  # Bambu Lab X1-Carbon Combo
        ("Bambu X1C #1", "Available", "Excellent"),
        ("Bambu X1C #2", "Available", "Excellent"),
    ]),
    ("rec1j0T4xi6SpUn56", [  # Ultimaker 3
        ("Ultimaker 3 #1", "Available", "Fair"),
        ("Ultimaker 3 #2", "Out of Service", "Needs Repair"),
    ]),
    ("rec3KXyzVg0kOQin7", [  # Ultimaker 3 Extended
        ("Ultimaker 3 Ext #1", "Available", "Good"),
    ]),
    ("reccMLQgu2VOcSdbg", [  # Ultimaker S5
        ("Ultimaker S5 #1", "Available", "Good"),
        ("Ultimaker S5 #2", "Available", "Good"),
    ]),

    # Resin printers + post-processing
    ("recpd1jcl1c0hTh8z", [  # Form 2
        ("Form 2 #1", "Available", "Fair"),
    ]),
    ("recrmUPR7GbcCFSZ5", [  # Form 4
        ("Form 4 #1", "Available", "Excellent"),
    ]),
    ("rec3apbYmyQoyVYC9", [  # Form Cure
        ("Form Cure #1", "Available", "Good"),
    ]),
    ("recyNHGSOCpMJMUNe", [  # Form Wash
        ("Form Wash #1", "Available", "Good"),
    ]),

    # Laser cutters
    ("recAmVALSf183SXup", [  # Epilog Helix 24
        ("Epilog Helix #1", "Available", "Good"),
    ]),
    ("recw66bovAeSgd09D", [  # Trotec Speedy 400
        ("Trotec 400 #1", "Available", "Excellent"),
    ]),

    # CNC
    ("reczn3ybnevPnpDvm", [  # Shopbot Buddy
        ("Shopbot #1", "Available", "Good"),
    ]),
    ("rechvVjk7bdZQuff7", [  # Bantam Tools Desktop CNC
        ("Bantam CNC #1", "Available", "Good"),
    ]),
    ("recYGf0rpxIYiuogy", [  # Bantam Desktop PCB Milling
        ("Bantam PCB Mill #1", "Available", "Good"),
    ]),

    # Soldering stations — multiple units
    ("recMFrmUHCY5WF6eI", [  # HAKKO FX-888D
        ("HAKKO #1", "Available", "Good"),
        ("HAKKO #2", "Available", "Good"),
        ("HAKKO #3", "Available", "Fair"),
    ]),
    ("recNSXSVww31GdV0L", [  # Weller WESD51
        ("Weller #1", "Available", "Good"),
        ("Weller #2", "Available", "Good"),
    ]),

    # Sewing machines
    ("recPSJN9Rb3VLEVUX", [  # EverSewn Sparrow X2
        ("EverSewn #1", "Available", "Good"),
    ]),
    ("rec0MBFevqtHoo7os", [  # Singer Stylist 7258
        ("Singer #1", "Available", "Good"),
        ("Singer #2", "Available", "Fair"),
    ]),

    # Vinyl cutter
    ("rec8ChrPgMEiqQn3u", [  # Roland Camm-1 GS-24
        ("Roland Vinyl Cutter #1", "Available", "Good"),
    ]),

    # Waterjet
    ("rec23OWkkd6j4j0I2", [  # WAZER
        ("WAZER #1", "Available", "Good"),
    ]),

    # Vacuum former
    ("recFmh9YWY0IDbi2n", [  # Mayku Form Box
        ("Mayku FormBox #1", "Available", "Good"),
    ]),

    # Sanders
    ("recTS5EgPruymDfXt", [  # DEWALT Orbital Sander
        ("DEWALT Sander #1", "Available", "Good"),
        ("DEWALT Sander #2", "Available", "Good"),
    ]),
    ("recZe9u41jiXaw8G2", [  # WEN Belt and Disc Sander
        ("WEN Sander #1", "Available", "Good"),
        ("WEN Sander #2", "Under Maintenance", "Fair"),
    ]),

    # Drills
    ("recKWWKzrkk1U0JJo", [  # DeWalt Drill DCD777C2
        ("DeWalt Drill #1", "Available", "Good"),
        ("DeWalt Drill #2", "Available", "Good"),
    ]),
    ("recjKz1fM10JzrGI9", [  # RYOBI PCL235
        ("RYOBI Drill #1", "Available", "Good"),
    ]),
    ("rec1XuXG8kIeQuYtA", [  # RYOBI P209D
        ("RYOBI P209D #1", "Available", "Fair"),
    ]),

    # Dremel
    ("rec8lADY1sC4WoqEU", [  # Dremel 3000
        ("Dremel #1", "Available", "Good"),
        ("Dremel #2", "Available", "Good"),
    ]),

    # Routers
    ("reczRJVdQgPJAlBVL", [  # MAKITA RT0701C
        ("Makita Router #1", "Available", "Good"),
        ("Makita Router #2", "Available", "Good"),
    ]),

    # Shaper Origin
    ("recAL3eOuvoF1CiFf", [  # Shaper Origin
        ("Shaper Origin #1", "Available", "Excellent"),
    ]),

    # Drill press
    ("recfb2iVhBPzTFO3f", [  # RYOBI Drill Press
        ("Drill Press #1", "Available", "Good"),
    ]),

    # Hot glue gun
    ("reclX5WrI29WK37yi", [  # RYOBI Hot Glue Gun
        ("Hot Glue Gun #1", "Available", "Good"),
        ("Hot Glue Gun #2", "Available", "Good"),
    ]),

    # Dust collection
    ("recWSQOw6k1Pc3udN", [  # Festool Dust Extractor
        ("Festool Dust Extractor #1", "Available", "Good"),
    ]),
    ("recTfX7Aqi3koULwe", [  # WEN Dust Collector
        ("WEN Dust Collector #1", "Available", "Good"),
    ]),

    # iPad / Scanner / VR
    ("rec5Q4zdolQmqkQmP", [  # iPad 6th gen
        ("iPad #1", "Available", "Good"),
        ("iPad #2", "Available", "Fair"),
    ]),
    ("rec3Yjqf4qOUTMHWi", [  # Meta Quest 2
        ("Quest 2 #1", "Available", "Good"),
        ("Quest 2 #2", "Available", "Good"),
    ]),
    ("recNXk4vNqNPzQ7Sx", [  # GoPro 7
        ("GoPro #1", "Available", "Good"),
    ]),
]


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


def api_request(method, path, token, data=None):
    url = f"{API_URL}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=body, method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            retry_after = e.headers.get("Retry-After", "2")
            delay = int(retry_after)
            print(f"  Rate limited, waiting {delay}s...")
            time.sleep(delay)
            return api_request(method, path, token, data)
        body = e.read().decode() if e.fp else ""
        print(f"Error {e.code}: {body}")
        raise


def main():
    token, base_id = get_config()

    # Build all unit records (AirTable allows up to 10 per batch)
    all_records = []
    for tool_id, units in UNIT_DATA:
        for label, status, condition in units:
            all_records.append({
                "fields": {
                    "unit_label": label,
                    "tool": [tool_id],
                    "status": status,
                    "condition": condition,
                    "qr_code_id": secrets.token_hex(4),  # 8-char hex
                }
            })

    print(f"Creating {len(all_records)} units across {len(UNIT_DATA)} tools...")
    print()

    # Batch create in groups of 10
    created = 0
    for i in range(0, len(all_records), 10):
        batch = all_records[i:i + 10]
        result = api_request(
            "POST",
            f"/{base_id}/{UNITS_TABLE_ID}",
            token,
            {"records": batch},
        )
        created += len(result.get("records", []))
        labels = [r["fields"]["unit_label"] for r in batch]
        print(f"  Batch {i // 10 + 1}: {', '.join(labels)}")
        time.sleep(0.3)

    print()
    print(f"Done. Created {created} unit records.")


if __name__ == "__main__":
    main()
