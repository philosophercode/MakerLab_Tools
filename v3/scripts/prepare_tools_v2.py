"""
Read the MakerLAB form-responses Excel file and produce a clean
tools_v2_data.json for import into AirTable.

The JSON contains:
  - categories   (group -> [subcategories])
  - locations     (room -> [zones])
  - materials_vocab, ppe_vocab, tags_vocab
  - tools         (list of cleaned tool dicts)

Usage:
  python prepare_tools_v2.py
"""

import json
import os
import re
import sys

import openpyxl

# ── Paths ────────────────────────────────────────────────────────────

FORM_XLSX = os.path.join(
    os.path.dirname(__file__), "..", "..",
    "MakerLAB Tools & Equipment Meta Data Generator (Responses).xlsx",
)

# ── Category taxonomy ────────────────────────────────────────────────

CATEGORIES = {
    "3D Printing": [
        "FDM Printer", "SLA Printer", "Post-Processing",
        "Vacuum Former", "3D Scanner", "Accessory",
    ],
    "Laser Cutting": ["Laser Cutter", "Fume Extractor"],
    "CNC & Digital Fabrication": [
        "CNC Mill", "Vinyl Cutter", "Waterjet", "Workstation",
    ],
    "Woodworking": [
        "Hand Saw", "Power Saw", "Sander", "Drill/Driver", "Plane",
        "Router", "Chisel/Scraper", "Clamp", "Nailer/Stapler",
        "Measuring", "General Hand Tool", "Accessory",
    ],
    "Electronics": [
        "Soldering", "Rework Station", "Test Equipment", "Workstation",
    ],
    "Sewing & Textiles": [
        "Sewing Machine", "Embroidery Machine", "Heat Press",
    ],
    "Scanning & VR": [
        "VR Headset", "Camera", "3D Scanner", "Tablet/Accessory",
    ],
    "Printing & Large Format": [
        "Plotter", "Laser Printer", "Label Maker",
    ],
    "Safety & Infrastructure": [
        "PPE", "Dust Extraction", "Fume Extraction",
        "Air Compressor", "Hose/Accessory",
    ],
}

# ── Location taxonomy ────────────────────────────────────────────────

LOCATIONS = {
    "Studio 101": [
        "3D Printing Zone", "Electronics Bench", "Sewing Area",
        "Scanning/VR Area", "Common Space",
    ],
    "Studio 101A": ["Woodshop"],
    "Studio 101C": ["Laser Room"],
}

# ── Category mapping rules  (regex on tool name -> (group, sub)) ─────

CATEGORY_RULES = [
    # 3D Printing
    (r"Ultimaker.*Expansion|Ultimaker.*Air Manager|Original Prusa.*Enclosure",
     ("3D Printing", "Accessory")),
    (r"Ultimaker|Prusa|Bambu",
     ("3D Printing", "FDM Printer")),
    (r"Form [24]$|Form [24] ",
     ("3D Printing", "SLA Printer")),
    (r"Form Cure|Form Wash",
     ("3D Printing", "Post-Processing")),
    (r"Mayku|Formbox|FormBox",
     ("3D Printing", "Vacuum Former")),
    (r"Matter and Form.*Scanner|Structure Sensor",
     ("3D Printing", "3D Scanner")),

    # Laser Cutting
    (r"Epilog|Trotec",
     ("Laser Cutting", "Laser Cutter")),
    (r"Bofa|Fume Extractor",
     ("Laser Cutting", "Fume Extractor")),

    # CNC & Digital Fabrication
    (r"Bantam|Shopbot|ShopBot",
     ("CNC & Digital Fabrication", "CNC Mill")),
    (r"Shaper Origin",
     ("CNC & Digital Fabrication", "CNC Mill")),
    (r"Shaper Workstation",
     ("CNC & Digital Fabrication", "Workstation")),
    (r"Roland.*Vinyl|Cricut Maker",
     ("CNC & Digital Fabrication", "Vinyl Cutter")),
    (r"WAZER",
     ("CNC & Digital Fabrication", "Waterjet")),

    # Electronics
    (r"Soldering|HAKKO|AOYUE|Weller",
     ("Electronics", "Soldering")),
    (r"BGA.*Rework|SMD.*Rework|Rework Station",
     ("Electronics", "Rework Station")),
    (r"Oscilloscope",
     ("Electronics", "Test Equipment")),
    (r"DREMEL Workstation",
     ("Electronics", "Workstation")),
    (r"Infrared IC Heater",
     ("Electronics", "Rework Station")),

    # Sewing & Textiles
    (r"EverSewn",
     ("Sewing & Textiles", "Embroidery Machine")),
    (r"Singer",
     ("Sewing & Textiles", "Sewing Machine")),
    (r"Cricut Easy Press",
     ("Sewing & Textiles", "Heat Press")),

    # Scanning & VR
    (r"Meta Quest",
     ("Scanning & VR", "VR Headset")),
    (r"GoPro",
     ("Scanning & VR", "Camera")),
    (r"HP Sprout|3D Scanner",
     ("Scanning & VR", "3D Scanner")),
    (r"iPad|Apple Pencil|Tripod",
     ("Scanning & VR", "Tablet/Accessory")),

    # Printing & Large Format
    (r"DesignJet|Plotter",
     ("Printing & Large Format", "Plotter")),
    (r"Brother.*Laser|B&W Laser|Laser Printer",
     ("Printing & Large Format", "Laser Printer")),
    (r"Label Maker",
     ("Printing & Large Format", "Label Maker")),

    # Safety & Infrastructure
    (r"Dust Mask",
     ("Safety & Infrastructure", "PPE")),
    (r"CALIFORNIA AIR|Compressor",
     ("Safety & Infrastructure", "Air Compressor")),
    (r"Dust Extractor|Dust Collector|FESTOOL CT|Mobile Dust",
     ("Safety & Infrastructure", "Dust Extraction")),
    (r"Hose Coupler|Hose Ring|PVC Hose",
     ("Safety & Infrastructure", "Hose/Accessory")),

    # Woodworking - specific tool types  (order matters: specific before general)
    (r"Nail Gun|Nailer|Brad Nailer|Staple Gun|Stapler",
     ("Woodworking", "Nailer/Stapler")),
    (r"Bandsaw|Band Saw|Back Saw|Dozuki|AIRAJ.*Saw|Hack.*Saw|Utility Saw|"
     r"STANLEY.*Saw|Coping Saw|Tenon Saw|Pull Saw|SPEAR.*Saw|Marples.*Saw",
     ("Woodworking", "Hand Saw")),
    (r"Jigsaw|Jig Saw|Circular Saw|Miter Saw|SKIL.*Saw|RYOBI.*Saw|"
     r"Track Saw|FESTOOL.*PS|BOSCH GST|BladeRunner|Hotwire.*Cutter|Foam Cutter|Pex Cutter",
     ("Woodworking", "Power Saw")),
    (r"Orbital Sander|Belt.*Sander|Disc Sander|WEN.*Sander|"
     r"Sander|Sanding Sheet",
     ("Woodworking", "Sander")),
    (r"Drill Press|Drill.*Driver|Drill \(",
     ("Woodworking", "Drill/Driver")),
    (r"Bench Plane|Block Plane|Smoothing Plane|Router Plane|"
     r"Spokeshave|Jack Plane|Hand Planer|Plunge Ba",
     ("Woodworking", "Plane")),
    (r"RT0701C|Compact Router|Plunge.*Base|Router(?!.*Plane)",
     ("Woodworking", "Router")),
    (r"Chisel|Scraper|Rasp|File(?:s| Set)",
     ("Woodworking", "Chisel/Scraper")),
    (r"Clamp|Quick-Grip",
     ("Woodworking", "Clamp")),
    (r"Measuring Tape|Tape Measure",
     ("Woodworking", "Measuring")),
    (r"Snips|Shears|Pliers|Wrench|Screwdriver|Hex Key|Allen|Socket.*Bit|"
     r"HUSKY|Bit Set|Heat Gun|Dremel [0-9]|Mallet|Dead Blow|Hammer|"
     r"Glue Gun|Hot Glue|Vacuum Cleaner",
     ("Woodworking", "General Hand Tool")),

    # Woodworking accessories
    (r"Battery|Charger|DCB|Replacement Blade|Sanding Sheet",
     ("Woodworking", "Accessory")),

    # Catch-all for remaining woodworking items
    (r"Festool Bench|Storage Bench|Rolling Cart|A Frame.*Cart|Valley Craft|"
     r"Woodworking Tools|Plywood.*Cart",
     ("CNC & Digital Fabrication", "Workstation")),
]

# ── Location mapping ─────────────────────────────────────────────────

LOCATION_MAP = {
    "1. Studio101 - All Purpose Open Space": ("Studio 101", "Common Space"),
    "2. Studio101- 3D Printing Zone": ("Studio 101", "3D Printing Zone"),
    "3. Studio101 A - Woodshop": ("Studio 101A", "Woodshop"),
    "4. Studio101 C - Laser Room": ("Studio 101C", "Laser Room"),
    "Wood Shop 101A": ("Studio 101A", "Woodshop"),
    "Woodworking Zone": ("Studio 101A", "Woodshop"),
    "3D Scanning": ("Studio 101", "Scanning/VR Area"),
    "Sewing/Embroidery Zone": ("Studio 101", "Sewing Area"),
    "Common Purpose Space": ("Studio 101", "Common Space"),
}

LOCATION_FALLBACK = {
    "3D Printing": ("Studio 101", "3D Printing Zone"),
    "Laser Cutting": ("Studio 101C", "Laser Room"),
    "CNC & Digital Fabrication": ("Studio 101A", "Woodshop"),
    "Woodworking": ("Studio 101A", "Woodshop"),
    "Electronics": ("Studio 101", "Electronics Bench"),
    "Sewing & Textiles": ("Studio 101", "Sewing Area"),
    "Scanning & VR": ("Studio 101", "Scanning/VR Area"),
    "Printing & Large Format": ("Studio 101", "Common Space"),
    "Safety & Infrastructure": ("Studio 101A", "Woodshop"),
}

# ── Name fixes ────────────────────────────────────────────────────────

NAME_FIXES = {
    "MAKITA  Plunge Bass": "MAKITA Plunge Base",
    "SUIZAN  Dozuki Dovetail Saw": "SUIZAN Dozuki Dovetail Saw",
    "EverSewn Sparrow X2 Sewing & Embroidery Machine,":
        "EverSewn Sparrow X2 Sewing & Embroidery Machine",
    "RYOBI P322 ONE+ HP 18V 18-Gauge Brushless Cordless Airstrike Brad Nailer":
        "RYOBI P322 Brad Nailer",
}

# ── Materials normalization ──────────────────────────────────────────

MATERIALS_NORMALIZE = {
    "wood": "Wood",
    "pla": "PLA",
    "abs": "ABS",
    "petg": "PETG",
    "tpu": "TPU",
    "nylon": "Nylon",
    "cpe": "CPE",
    "mdf": "MDF",
    "acrylic": "Acrylic",
    "plywood": "Plywood",
    "aluminum": "Aluminum",
    "plastic": "Plastic",
    "vinyl": "Vinyl",
    "leather": "Leather",
    "fabric": "Fabric",
    "resin": "Resin",
    "glass": "Glass",
    "steel": "Steel",
    "copper": "Copper",
    "brass": "Brass",
    "foam": "Foam",
    "cardboard": "Cardboard",
    "paper": "Paper",
    "hardwood": "Hardwood",
    "softwood": "Softwood",
    "laminate": "Laminate",
    "polycarbonate": "Polycarbonate",
    "composite": "Composite",
    "pvc": "PVC",
    "rubber": "Rubber",
    "ceramic": "Ceramic",
    "wax": "Wax",
    "denim": "Denim",
    "silk": "Silk",
    "canvas": "Canvas",
    "polyester": "Polyester",
    "felt": "Felt",
    "cotton": "Cotton",
}

# Reverse map: lowercase alias -> canonical name
_MAT_ALIASES = {
    "polylactic acid": "PLA",
    "acrylonitrile butadiene styrene": "ABS",
    "polyethylene terephthalate glycol": "PETG",
    "thermoplastic polyurethane": "TPU",
    "medium density fiberboard": "MDF",
    "aluminium": "Aluminum",
    "softwoods": "Softwood",
    "hardwoods": "Hardwood",
    "laminates": "Laminate",
    "plastics": "Plastic",
    "metals": "Steel",
    "metal": "Steel",
    "composites": "Composite",
    "ceramics": "Ceramic",
    "tile": "Ceramic",
    "stone": "Ceramic",
    "particle board": "MDF",
    "chipboard": "MDF",
    "pine": "Softwood",
    "cedar": "Softwood",
    "fir": "Softwood",
    "spruce": "Softwood",
    "oak": "Hardwood",
    "maple": "Hardwood",
    "cherry": "Hardwood",
    "walnut": "Hardwood",
    "birch": "Hardwood",
    "varnish": "Laminate",
}

# PPE normalization
PPE_NORMALIZE = {
    "glasses": "Safety Glasses",
    "safety glasses": "Safety Glasses",
    "mask": "Dust Mask",
    "dust mask": "Dust Mask",
    "dust masks": "Dust Mask",
    "gloves": "Gloves",
}

# ── Description overrides (real descriptions from the Excel data) ────

DESCRIPTION_OVERRIDES = {
    "Epilog Helix 24 laser (8000 Laser System)":
        "40W Epilog Helix 24x18 CO2 laser cutter and engraver for precision cutting "
        "and raster engraving on wood, acrylic, cardboard, fabric, and paper.",

    "Bofa AD500 Fume Extractor":
        "Industrial fume extraction unit rated at approximately 324 CFM (550 m3/hr). "
        "Features HEPA/gas filtration, automatic flow control, real-time airflow "
        "monitoring, and remote diagnostics. Paired with the laser cutters in the Laser Room.",

    "Trotec Speedy 400, 80w":
        "80W Trotec Speedy 400 CO2 laser cutter with a 40x24-inch bed for cutting "
        "and engraving wood, acrylic, cardboard, fabric, and paper.",

    "Dremel 3000":
        "The Dremel 3000 is a versatile corded rotary tool used for cutting, sanding, "
        "grinding, polishing, carving, and engraving on materials like wood, metal, "
        "plastic, and tile. It features variable speeds (5,000-35,000 RPM), a comfortable "
        "soft-grip design, and an EZ Twist nose cap for easy accessory changes.",

    "Cowryman Router Plane":
        "The Cowryman router plane is a woodworking hand tool used for smoothing and "
        "leveling grooves, dados, and mortises. It has an adjustable blade and flat sole "
        "for precise, controlled cutting, making it ideal for clean, accurate joints "
        "and inlays.",

    "WAZER - Waterjet Pro":
        "Desktop waterjet cutter with a 12x18-inch cutting area. Cuts aluminum up to 1 inch "
        "and stainless steel up to 0.375 inches. Runs on filtered tap water with a 2.1 kW "
        "hydraulic pump. Continuous cutting time up to 90 minutes per session.",

    "Festool 575267 Dust Extractor CT Midi Hepa":
        "HEPA-rated mobile dust extractor from Festool. Designed for connection to power "
        "tools for on-tool dust collection. Features automatic tool-start and adjustable "
        "suction.",

    "WEN Woodworking Dust Collector (DC3401)":
        "Shop dust collection system for capturing airborne sawdust and wood chips. "
        "Connects to stationary woodworking equipment via 4-inch hose ports.",

    "Rockwell BladeRunner X2 (RK7323)":
        "Compact portable tabletop saw using T-shank blades for cutting wood, ceramic tile, "
        "PVC, aluminum, and steel. Features adjustable depth, rip fence, and miter gauge.",
}

# ── Description templates  (category_sub -> template) ────────────────

DESCRIPTION_TEMPLATES = {
    # 3D Printing
    "FDM Printer":
        "{name} FDM 3D printer for additive manufacturing with thermoplastic filaments "
        "including {materials_or_default}.",
    "SLA Printer":
        "{name} SLA 3D printer for high-resolution resin-based additive manufacturing.",
    "Post-Processing":
        "{name} post-processing station for SLA 3D prints. "
        "Used for washing or curing resin parts after printing.",
    "Vacuum Former":
        "{name} desktop vacuum former for thermoforming plastic sheets over custom molds.",
    "3D Scanner":
        "{name} 3D scanner for capturing physical objects as digital 3D models.",

    # Laser Cutting
    "Laser Cutter":
        "{name} CO2 laser cutter and engraver for precision cutting and engraving on "
        "{materials_or_default}.",
    "Fume Extractor":
        "{name} fume extraction unit for filtering hazardous particles and gases "
        "produced during laser cutting.",

    # CNC & Digital Fabrication
    "CNC Mill":
        "{name} CNC milling machine for subtractive fabrication of "
        "{materials_or_default}.",
    "Vinyl Cutter":
        "{name} for cutting vinyl, paper, and thin sheet materials from digital designs.",
    "Waterjet":
        "{name} waterjet cutter for cutting metal, stone, glass, and other hard materials "
        "using a high-pressure water and abrasive stream.",
    "Workstation":
        "{name} workstation providing a dedicated workspace for fabrication tasks.",

    # Woodworking
    "Hand Saw":
        "{name} hand saw for precision cutting of wood and similar materials.",
    "Power Saw":
        "{name} power saw for cutting {materials_or_default}.",
    "Sander":
        "{name} sander for smoothing and finishing wood and other surfaces.",
    "Drill/Driver":
        "{name} for drilling holes and driving fasteners in {materials_or_default}.",
    "Plane":
        "{name} hand plane for smoothing, flattening, and shaping wood surfaces.",
    "Router":
        "{name} compact router for edge profiling, trimming, and groove cutting "
        "in {materials_or_default}.",
    "Chisel/Scraper":
        "{name} for shaping, smoothing, and finishing wood and metal surfaces.",
    "Clamp":
        "{name} clamp for securing workpieces during gluing, cutting, or assembly.",
    "Nailer/Stapler":
        "{name} for driving nails or staples into wood, trim, and similar materials.",
    "Measuring":
        "{name} measuring tool for accurate layout and dimensioning.",
    "General Hand Tool":
        "{name} general-purpose hand tool for workshop tasks.",

    # Electronics
    "Soldering":
        "{name} soldering station for joining electronic components using solder.",
    "Rework Station":
        "{name} rework station for removing and replacing surface-mount and "
        "through-hole electronic components.",
    "Test Equipment":
        "{name} test instrument for measuring and analyzing electronic signals.",

    # Sewing & Textiles
    "Sewing Machine":
        "{name} sewing machine for stitching fabric, leather, and textiles.",
    "Embroidery Machine":
        "{name} sewing and embroidery machine for stitching and decorative embroidery "
        "on fabric and textiles.",
    "Heat Press":
        "{name} heat press for transferring designs onto fabric and other substrates.",

    # Scanning & VR
    "VR Headset":
        "{name} virtual reality headset for immersive 3D visualization and interactive "
        "design review.",
    "Camera":
        "{name} action camera for recording video of projects and processes.",
    "Tablet/Accessory":
        "{name} tablet accessory for digital design, 3D scanning, and project documentation.",

    # Printing & Large Format
    "Plotter":
        "{name} large-format plotter for printing posters, architectural drawings, "
        "and signage.",
    "Laser Printer":
        "{name} monochrome laser printer for fast, high-quality document output.",
    "Label Maker":
        "{name} label maker for creating adhesive labels for organization and signage.",

    # Safety & Infrastructure
    "PPE":
        "{name} personal protective equipment for workshop safety.",
    "Dust Extraction":
        "{name} dust extraction system for capturing airborne dust and particles "
        "during woodworking and fabrication.",
    "Fume Extraction":
        "{name} fume extraction system for filtering hazardous fumes and particulates.",
    "Air Compressor":
        "{name} air compressor providing compressed air for pneumatic tools and cleaning.",
    "Hose/Accessory":
        "{name} hose or coupler accessory for dust collection and air systems.",

    # Accessory (shared between categories)
    "Accessory":
        "{name} accessory for expanding the capabilities of the parent tool or system.",
}

# ── Generic/stub descriptions to ignore ──────────────────────────────

_GENERIC_DESCRIPTIONS = {
    "hand tool", "power tool", "sander", "router", "cutter",
    "nail gun", "heat gun", "power saw", "belt and disc sander",
    "3d printer accessories", "vacuum former", "vacuum cleaner",
    "dust masks", "dust extractor", "dust collector", "sanding sheet",
    "none", "n/a", "",
}

# ── Tags to exclude (brand-only or noise) ────────────────────────────

_TAG_BLACKLIST_PATTERNS = [
    r"^(ryobi|dewalt|makita|stanley|bosch|festool|wen|dremel|husky|"
    r"spear.*jackson|cowryman|suizan|marples|airaj|hi-spec|hercules|"
    r"powertec|peachtree|fulton|wazer|shopbot|bantam|shaper|roland|"
    r"cricut|singer|eversewn|mayku|formlabs|ultimaker|prusa|bambu|"
    r"bofa|trotec|epilog|hakko|aoyue|weller|gopro|meta|apple|hp|"
    r"brother|skil|rockwell|marvey|infrared|donaldson|valley craft)$",
    r"^\s*$",
    r"^n/?a$",
    r"^\d+$",
]


# ── Helpers ──────────────────────────────────────────────────────────


def clean_text(val):
    """Return cleaned text or None."""
    if val is None:
        return None
    val = str(val).strip()
    if val.lower() in ("none", "n/a", "", "none ", "n/a "):
        return None
    return val


def clean_url(val):
    """Return a valid URL or None."""
    if not val:
        return None
    val = str(val).strip()
    if val.lower() in ("none", "n/a", "", "none "):
        return None
    if val.startswith("http://") or val.startswith("https://"):
        return val
    if val.startswith("www."):
        return f"https://{val}"
    if "docs.google.com" in val or "drive.google.com" in val:
        return f"https://{val}"
    return None


def clean_bool(val):
    """Convert a YES/NO/None string to a boolean."""
    if not val:
        return False
    val = str(val).strip().upper()
    return val == "YES"


def classify_tool(name):
    """Apply CATEGORY_RULES to determine (group, sub) for a tool name."""
    for pattern, category in CATEGORY_RULES:
        if re.search(pattern, name, re.IGNORECASE):
            return category
    return None


def resolve_location(raw_loc, category_group):
    """Map a raw location string to (room, zone)."""
    if raw_loc:
        loc = str(raw_loc).strip()
        if loc in LOCATION_MAP:
            return LOCATION_MAP[loc]
    # Fallback by category group
    if category_group and category_group in LOCATION_FALLBACK:
        return LOCATION_FALLBACK[category_group]
    return ("Studio 101", "Common Space")


def parse_materials(raw):
    """Parse a comma-separated materials string into a list of canonical names."""
    if not raw:
        return []
    raw = str(raw).strip()
    if raw.lower() in ("n/a", "none", ""):
        return []

    result = set()
    # Split on commas, semicolons, or " and "
    parts = re.split(r"[,;]\s*|\s+and\s+", raw)
    for part in parts:
        # Strip parenthetical explanations  e.g. "PLA (Polylactic Acid)"
        part = re.sub(r"\s*\(.*?\)", "", part).strip().rstrip(".,;")
        if not part:
            continue
        lower = part.lower()

        # Try direct match
        if lower in MATERIALS_NORMALIZE:
            result.add(MATERIALS_NORMALIZE[lower])
            continue

        # Try alias
        if lower in _MAT_ALIASES:
            result.add(_MAT_ALIASES[lower])
            continue

        # Try substring match for multi-word entries
        matched = False
        for key, canon in MATERIALS_NORMALIZE.items():
            if key in lower:
                result.add(canon)
                matched = True
                break
        if matched:
            continue

        for key, canon in _MAT_ALIASES.items():
            if key in lower:
                result.add(canon)
                matched = True
                break
        if matched:
            continue

        # Skip things like "Laserable", "Standard", "Tough", etc.
        if lower in ("laserable", "standard", "tough", "flexible",
                      "castable", "dental", "water-washable",
                      "high-temperature", "clear", "n/a", "none"):
            continue

        # If it looks like a real material word, keep as title-case
        if len(part) > 2 and part[0].isalpha():
            # Skip if it looks like a brand name or model number
            if not re.search(r"\d{3,}", part):
                result.add(part.title())

    return sorted(result)


def parse_ppe(raw):
    """Parse PPE string into a list of canonical PPE items."""
    if not raw:
        return []
    raw = str(raw).strip()
    if raw.lower() in ("none", "n/a", ""):
        return []

    result = set()
    parts = re.split(r"[,;]\s*", raw)
    for part in parts:
        lower = part.strip().lower()
        if lower in PPE_NORMALIZE:
            result.add(PPE_NORMALIZE[lower])
    return sorted(result)


def parse_tags(raw):
    """Parse comma-separated tags, normalize, and filter."""
    if not raw:
        return []
    raw = str(raw).strip()
    if raw.lower() in ("n/a", "none", ""):
        return []

    result = set()
    parts = re.split(r"[,;]\s*", raw)
    for part in parts:
        tag = part.strip().rstrip(".").lower()
        if not tag or len(tag) < 2:
            continue
        if tag in ("n/a", "none"):
            continue

        # Skip blacklisted tags
        skip = False
        for pat in _TAG_BLACKLIST_PATTERNS:
            if re.match(pat, tag, re.IGNORECASE):
                skip = True
                break
        if skip:
            continue

        # Skip very long tags (likely descriptions not tags)
        if len(tag) > 60:
            continue

        # Normalize: lowercase, trim
        result.add(tag)

    return sorted(result)


def generate_description(name, category_group, category_sub, materials_list):
    """Generate a 1-2 sentence description from metadata."""
    # Check overrides first
    if name in DESCRIPTION_OVERRIDES:
        return DESCRIPTION_OVERRIDES[name]

    template = DESCRIPTION_TEMPLATES.get(category_sub)
    if not template:
        return f"{name} tool available in the MakerLAB."

    # Build a materials snippet
    if materials_list:
        materials_or_default = ", ".join(materials_list[:5])
    else:
        # Reasonable defaults by subcategory
        defaults = {
            "FDM Printer": "PLA, ABS, PETG, and TPU",
            "Laser Cutter": "wood, acrylic, cardboard, and fabric",
            "CNC Mill": "wood, plastic, and soft metals",
            "Power Saw": "wood, plywood, and MDF",
            "Router": "wood, plywood, and laminate",
            "Drill/Driver": "wood, metal, and plastic",
            "Vinyl Cutter": "vinyl and thin sheet materials",
        }
        materials_or_default = defaults.get(category_sub, "various materials")

    return template.format(
        name=name,
        materials_or_default=materials_or_default,
    )


# ── Main ─────────────────────────────────────────────────────────────


def main():
    if not os.path.exists(FORM_XLSX):
        print(f"Error: Excel file not found at {FORM_XLSX}")
        sys.exit(1)

    print(f"Reading {FORM_XLSX} ...")
    wb = openpyxl.load_workbook(FORM_XLSX, read_only=True)
    ws = wb["Form Responses 1"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    print(f"  {len(rows)} raw rows")

    # ── Pass 1: Parse and deduplicate ────────────────────────────────

    tools_by_name = {}

    for r in rows:
        r = list(r) + [None] * (17 - len(r))

        name = clean_text(r[1])
        if not name:
            continue

        # Apply name fixes
        name = NAME_FIXES.get(name, name)
        # Collapse multiple spaces
        name = re.sub(r"\s{2,}", " ", name).strip()

        raw_desc = clean_text(r[5])
        raw_loc = clean_text(r[3])
        raw_materials = clean_text(r[7])
        raw_ppe = clean_text(r[14])
        raw_tags = clean_text(r[16])
        raw_auth = clean_text(r[8])
        raw_training = clean_text(r[9])
        raw_restrictions = clean_text(r[10])
        raw_safety_url = clean_url(r[11])
        raw_sop_url = clean_url(r[12])
        raw_estop = clean_text(r[13])
        raw_video_url = clean_url(r[15])
        raw_map_tag = clean_text(r[4])

        entry = {
            "raw_name": name,
            "raw_desc": raw_desc,
            "raw_loc": raw_loc,
            "raw_materials": raw_materials,
            "raw_ppe": raw_ppe,
            "raw_tags": raw_tags,
            "raw_auth": raw_auth,
            "raw_training": raw_training,
            "raw_restrictions": raw_restrictions,
            "safety_doc_url": raw_safety_url,
            "sop_url": raw_sop_url,
            "raw_estop": raw_estop,
            "video_url": raw_video_url,
            "raw_map_tag": raw_map_tag,
        }

        if name in tools_by_name:
            # Merge: prefer the entry with more data (keep URLs and materials
            # from whichever row has them)
            existing = tools_by_name[name]
            for key in entry:
                if entry[key] and not existing.get(key):
                    existing[key] = entry[key]
            # For descriptions, prefer longer one
            if entry["raw_desc"] and (
                not existing["raw_desc"]
                or len(str(entry["raw_desc"])) > len(str(existing["raw_desc"]))
            ):
                existing["raw_desc"] = entry["raw_desc"]
        else:
            tools_by_name[name] = entry

    print(f"  {len(tools_by_name)} unique tools after dedup")

    # ── Pass 2: Classify, clean, and generate descriptions ───────────

    all_tags = set()
    all_materials = set()
    tools = []
    unclassified = []

    for name, raw in sorted(tools_by_name.items()):
        # Category
        cat = classify_tool(name)
        if cat is None:
            unclassified.append(name)
            # Attempt fallback based on raw category text from Excel
            # Skip tools we truly cannot categorize
            continue
        category_group, category_sub = cat

        # Location
        loc_room, loc_zone = resolve_location(raw["raw_loc"], category_group)

        # Materials
        materials = parse_materials(raw["raw_materials"])
        all_materials.update(materials)

        # PPE
        ppe = parse_ppe(raw["raw_ppe"])

        # Tags
        tags = parse_tags(raw["raw_tags"])
        all_tags.update(tags)

        # Description
        raw_desc = raw["raw_desc"]
        desc_reviewed = False
        if raw_desc and raw_desc.lower() not in _GENERIC_DESCRIPTIONS and len(raw_desc) > 30:
            # Check if it's in our overrides (we clean those up)
            if name in DESCRIPTION_OVERRIDES:
                description = DESCRIPTION_OVERRIDES[name]
            else:
                description = raw_desc
            desc_reviewed = True
        else:
            description = generate_description(name, category_group, category_sub, materials)

        # Boolean fields
        authorized_only = clean_bool(raw["raw_auth"])
        training_text = clean_text(raw["raw_training"])
        training_required = bool(
            training_text
            and training_text.lower() not in ("none", "n/a", "no")
        )

        # Text fields
        use_restrictions = clean_text(raw["raw_restrictions"])
        if use_restrictions and use_restrictions.lower() in ("n/a", "none"):
            use_restrictions = None
        emergency_stop = clean_text(raw["raw_estop"])
        if emergency_stop and emergency_stop.lower() in ("none", "n/a"):
            emergency_stop = None

        # Map tag
        map_tag = clean_text(raw["raw_map_tag"])
        if map_tag and map_tag.lower() in ("n/a", "none"):
            map_tag = None

        tool = {
            "name": name,
            "description": description,
            "description_reviewed": desc_reviewed,
            "category_group": category_group,
            "category_sub": category_sub,
            "location_room": loc_room,
            "location_zone": loc_zone,
            "materials": materials if materials else None,
            "ppe_required": ppe if ppe else None,
            "tags": tags if tags else None,
            "authorized_only": authorized_only,
            "training_required": training_required,
            "use_restrictions": use_restrictions,
            "emergency_stop": emergency_stop,
            "safety_doc_url": raw.get("safety_doc_url"),
            "sop_url": raw.get("sop_url"),
            "video_url": raw.get("video_url"),
            "map_tag": map_tag,
        }
        tools.append(tool)

    print(f"  {len(tools)} tools classified")
    if unclassified:
        print(f"  {len(unclassified)} unclassified (skipped):")
        for n in unclassified:
            print(f"    - {n}")

    # ── Build vocab lists ────────────────────────────────────────────

    materials_vocab = sorted(all_materials)
    ppe_vocab = sorted({"Safety Glasses", "Dust Mask", "Gloves"})
    tags_vocab = sorted(all_tags)

    # ── Build output ─────────────────────────────────────────────────

    output = {
        "categories": CATEGORIES,
        "locations": LOCATIONS,
        "materials_vocab": materials_vocab,
        "ppe_vocab": ppe_vocab,
        "tags_vocab": tags_vocab,
        "tools": tools,
    }

    out_path = os.path.join(os.path.dirname(__file__), "tools_v2_data.json")
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    # ── Summary statistics ───────────────────────────────────────────

    print(f"\nWrote {len(tools)} tools to {out_path}")
    print(f"\nVocabulary sizes:")
    print(f"  Materials:  {len(materials_vocab)}")
    print(f"  PPE:        {len(ppe_vocab)}")
    print(f"  Tags:       {len(tags_vocab)}")

    print(f"\nCategory distribution:")
    cat_counts = {}
    for t in tools:
        key = f"{t['category_group']} > {t['category_sub']}"
        cat_counts[key] = cat_counts.get(key, 0) + 1
    for key in sorted(cat_counts):
        print(f"  {key:45s} {cat_counts[key]:3d}")

    print(f"\nLocation distribution:")
    loc_counts = {}
    for t in tools:
        key = f"{t['location_room']} > {t['location_zone']}"
        loc_counts[key] = loc_counts.get(key, 0) + 1
    for key in sorted(loc_counts):
        print(f"  {key:45s} {loc_counts[key]:3d}")

    print(f"\nField coverage:")
    field_names = [
        "description", "materials", "ppe_required", "tags",
        "safety_doc_url", "sop_url", "video_url",
        "use_restrictions", "emergency_stop", "map_tag",
    ]
    for field in field_names:
        count = sum(1 for t in tools if t.get(field))
        print(f"  {field:25s} {count:3d}/{len(tools)}")

    reviewed = sum(1 for t in tools if t.get("description_reviewed"))
    generated = len(tools) - reviewed
    print(f"\nDescriptions: {reviewed} reviewed, {generated} auto-generated")

    auth_count = sum(1 for t in tools if t.get("authorized_only"))
    train_count = sum(1 for t in tools if t.get("training_required"))
    print(f"Access control: {auth_count} authorized-only, {train_count} training-required")


if __name__ == "__main__":
    main()
