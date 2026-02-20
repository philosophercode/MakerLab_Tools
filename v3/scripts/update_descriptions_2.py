#!/usr/bin/env python3
"""Update tool descriptions (batch 2: tools 53-101) in tools_v2_data.json."""

import json
from pathlib import Path

DESCRIPTIONS = {
    "Plunge Cut Track Saw TS 55 REQ-F-Plus": "Festool precision track saw with 1200W motor and plunge-cut action for straight, splinter-free cuts in sheet goods and solid wood. Used with a guide rail for table-saw-quality rip and crosscuts.",
    "Plywood Stacking Rolling Cart": "Mobile workshop cart for storing and transporting sheet goods, plywood, and large flat materials around the makerspace.",
    "Prusa i3 MK3S+": "Open-source FDM 3D printer with 250x210x210mm build volume, removable magnetic steel sheet bed, and automatic mesh bed leveling. Supports PLA, PETG, ASA, ABS, and flexible filaments.",
    "RYOBI Drill Press": "Benchtop drill press for precise, repeatable drilling operations in wood, metal, and plastic. Features adjustable speed settings and depth stop.",
    "RYOBI Nail Gun": "RYOBI ONE+ 18V cordless brad nailer that drives 18-gauge nails without a compressor. Used for trim, molding, cabinetry, and light framing tasks.",
    "RYOBI ONE+ 18V Lithium-Ion 1.5 Ah Battery PBP002": "Compact 18V lithium-ion battery (1.5 Ah) compatible with all RYOBI ONE+ cordless tools. Lightweight option for shorter tasks.",
    "RYOBI ONE+ 18V Lithium-Ion 3.0 Ah Battery P103": "Mid-capacity 18V lithium-ion battery (3.0 Ah) for RYOBI ONE+ tools, offering a balance of runtime and weight for general workshop use.",
    "RYOBI ONE+ 18V Lithium-Ion 4 Ah Battery PBP004": "High-capacity 18V lithium-ion battery (4.0 Ah) for extended runtime on RYOBI ONE+ cordless tools during longer cutting, drilling, and sanding tasks.",
    "RYOBI ONE+ 18V Lithium-Ion Charger PCG002": "Standard charger for RYOBI ONE+ 18V lithium-ion batteries. Charges a 1.5 Ah battery in approximately 55 minutes.",
    "RYOBI P117 Dual Chemistry 12V - 18V Battery Charger Replacement": "Dual-chemistry charger compatible with both RYOBI 12V and 18V lithium-ion and NiCd battery packs, with built-in diagnostics and energy-saving mode.",
    "RYOBI P209D Drill Driver": "RYOBI ONE+ 18V cordless drill/driver with 2-speed gearbox (0-440 / 0-1600 RPM), 24-position clutch, and keyless chuck for drilling and fastening.",
    "RYOBI P305 ONE+ 18V Lithium Ion Cordless Hot Glue Gun": "Cordless 18V hot glue gun that heats up in 90 seconds and runs on RYOBI ONE+ batteries. Uses standard full-size glue sticks for bonding, crafting, and quick assembly.",
    "RYOBI P322 Brad Nailer": "RYOBI ONE+ HP 18V brushless cordless 18-gauge brad nailer with AirStrike technology -- drives nails without a compressor for trim, molding, and cabinetry.",
    "RYOBI P593 18-Volt ONE+ Lithium Ion Cordless PVC and Pex Cutter": "Cordless ratcheting cutter for cleanly cutting PVC pipe and PEX tubing up to 2 inches in diameter with a one-handed squeeze.",
    "RYOBI PCL235 ONE+ 18V Drill/ Driver": "RYOBI ONE+ 18V cordless drill/driver with 2-speed transmission and 24-position clutch for precise drilling and screw driving in wood, metal, and plastic.",
    "RYOBI Vacuum Cleaner P7131": "RYOBI ONE+ 18V cordless handheld vacuum with wide-mouth nozzle for quick workshop cleanup of sawdust, debris, and small particles.",
    "Rockwell BladeRunner X2 (RK7323)": "Portable tabletop saw that makes rip cuts, crosscuts, scroll cuts, and inside cuts using standard T-shank jigsaw blades. Compact alternative to a table saw for thin materials.",
    "Roland Camm-1 GS-24 Desktop Vinyl Cutter": "24-inch desktop vinyl cutter with up to 500 gf cutting force. Cuts adhesive vinyl, heat transfer vinyl, and thin cardstock for signage, stickers, and garment decoration.",
    "SKIL Multi - Detail Sander": "Compact detail sander with triangular sanding pad for reaching tight corners, edges, and intricate shapes that larger sanders cannot access.",
    "SMD Rework Station": "Hot air rework station for removing, replacing, and soldering surface-mount components (SMD/SMT) on PCBs. Features adjustable temperature and airflow.",
    "SPEAR & JACKSON Traditional Brass Back Tenon Saw 9550B": "Traditional brass-backed tenon saw with 10-inch blade and hardpoint teeth for precise crosscuts and tenon joints in fine woodworking.",
    "STANLEY 20-221 10-Inch 12 Points Per Inch SharpTooth Mini Utility Saw": "Compact 10-inch utility handsaw with 12 TPI SharpTooth blade for smooth crosscuts and general-purpose cutting of wood, PVC, and laminate.",
    "STANLEY 20-807 10-Inch Mini-Hack Light-Duty Utility Saw": "Lightweight 10-inch mini hacksaw for cutting thin metal, PVC pipe, and plastic tubing in tight spaces.",
    "STANLEY Coping Saw": "6-1/2 inch coping saw with fine-toothed blade for making intricate curved cuts, scrollwork, and interior cutouts in wood and plastic.",
    "STANLEY Hand Planer, Contractor Grade, Low Angle": "Low-angle contractor-grade hand plane for trimming, chamfering, and smoothing end grain on doors, boards, and panels.",
    "STANLEY Heavy Duty Extreme Staple Gun TR150": "Heavy-duty squeeze-action staple gun that fires narrow crown staples and brad nails for upholstery, insulation, and light construction tasks.",
    "STANLEY Saw 15-206": "STANLEY 15-inch SharpTooth hand saw with 12 TPI for smooth crosscutting of wood, plywood, and composite board.",
    "STANLEY SharpTooth Heavy Duty Saw 15-087": "STANLEY 26-inch 12 TPI SharpTooth aggressive-cut hand saw for fast crosscuts and rip cuts in framing lumber and sheet goods.",
    "SUIZAN Dozuki Dovetail Saw": "Japanese-style dozuki saw with ultra-fine crosscut teeth for precision joinery including dovetails, tenons, and small detail cuts. Pull-stroke design provides excellent control.",
    "SUIZAN Replacement Blade": "Replacement blade for the SUIZAN Dozuki Dovetail Saw, featuring the same fine crosscut tooth pattern for continued precision joinery work.",
    "Shaper Origin": "Handheld CNC router with computer vision guidance that tracks its position on the workpiece in real time. Cuts precise joints, inlays, and complex shapes freehand on a workbench.",
    "Shopbot Buddy BT48[L36\u201d x W76\u201d x H67\u201d]": "Full-size 3-axis CNC router with 48\"x24\" cutting area (BT48 model). Routes wood, plastics, aluminum, and foam for furniture, signage, and large-scale fabrication.",
    "Singer Stylist 7258": "Computerized sewing machine with 100 built-in stitches, automatic needle threader, and drop-in bobbin system. Suitable for garment construction, quilting, and textile prototyping.",
    "Stanley 1-12-137 62-Low Angle Sweetheart Jack Plane": "Low-angle (12 deg) Sweetheart jack plane for smoothing end grain, shooting edges, and general-purpose planing. Ductile cast iron body with adjustable mouth.",
    "Structure Sensor": "3D scanning sensor that attaches to iPad for capturing full-color 3D scans of objects and spaces. Outputs mesh files for 3D printing, modeling, and AR applications.",
    "Tripod with adapter": "Adjustable camera/device tripod with universal adapter mount for holding cameras, phones, and scanning equipment during documentation and 3D scanning.",
    "Trotec Speedy 400, 80w": "Professional CO2 laser cutter/engraver with 80W power and a 40\"x24\" work area. Cuts and engraves acrylic, wood, leather, fabric, and paper at high speed with excellent precision.",
    "Ultimaker 3": "Dual-extrusion FDM 3D printer with 215x215x200mm build volume, swappable print cores, and water-soluble PVA support for complex geometries.",
    "Ultimaker 3 Extended": "Dual-extrusion FDM 3D printer with extended 215x215x300mm build volume for taller prints, featuring swappable print cores and PVA support capability.",
    "Ultimaker Metal Expansion Kit": "Upgrade kit for Ultimaker printers enabling metal-fill and specialty composite filament printing with a hardened steel nozzle and modified feeder.",
    "Ultimaker S5": "Professional dual-extrusion FDM 3D printer with large 330x240x300mm build volume, enclosed chamber, and filament flow sensor for reliable unattended printing with engineering materials.",
    "Ultimaker S5 Air Manager": "Enclosed air filtration add-on for the Ultimaker S5 that captures up to 95% of ultrafine particles, creating a safer environment when printing ABS, Nylon, and other materials that produce fumes.",
    "Valley Craft A Frame Bin Cart": "Heavy-duty A-frame cart with bin storage for organizing and transporting tools, parts, and supplies around the workshop.",
    "WAZER - Waterjet Pro": "Desktop waterjet cutter with 12\"x18\" cutting area that cuts virtually any material -- metal, glass, stone, carbon fiber, and tile -- using abrasive garnet and high-pressure water.",
    "WEN Benchtop Belt and Disc Sander (6502T)": "Combination 4\"x36\" belt and 6\" disc sander for shaping, deburring, and finishing wood, metal, and plastic workpieces on the benchtop.",
    "WEN Woodworking Dust Collector (DC3401)": "750 CFM dust collector with 1-micron bag filtration for capturing sawdust and chips from woodworking machines. Features a 2-1/2 inch dust port and 50-gallon collection bag.",
    "Weller WESD51": "Professional 60W digital soldering station with adjustable temperature (350-850 deg F), ESD-safe design, and quick-change Weller ET series tips for electronics assembly and repair.",
    "Woodworking Tools & Storage Bench": "Heavy-duty workbench with built-in tool storage for woodworking hand tools, providing a dedicated assembly and hand-tool workspace.",
    "iPad 6th generation [MR7F2LL./A]": "Apple iPad (6th generation) with 9.7\" Retina display and Apple Pencil support. Used with 3D scanning apps, design tools, and as a reference device in the makerspace.",
}

DATA_FILE = Path(__file__).parent / "tools_v2_data.json"


def main():
    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    updated = 0
    not_found = []

    tool_lookup = {tool["name"]: tool for tool in data["tools"]}

    for name, new_desc in DESCRIPTIONS.items():
        if name in tool_lookup:
            tool = tool_lookup[name]
            tool["description"] = new_desc
            tool["description_reviewed"] = False
            updated += 1
        else:
            not_found.append(name)

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"Updated {updated} / {len(DESCRIPTIONS)} tool descriptions.")
    if not_found:
        print(f"NOT FOUND ({len(not_found)}):")
        for name in not_found:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
