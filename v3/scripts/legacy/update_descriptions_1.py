#!/usr/bin/env python3
"""
Update tool descriptions in tools_v2_data.json with accurate product descriptions.
Batch 1 (tools 1-26) and Batch 2 (tools 27-52) of 52 total updates.
"""

import json
import os

JSON_PATH = os.path.join(os.path.dirname(__file__), "tools_v2_data.json")

# Dict mapping tool name -> new description
DESCRIPTIONS = {
    "AIRAJ HackSaw": "Multi-purpose hacksaw with adjustable blade tension for cutting metal, plastic, and wood. Accommodates standard 12-inch hacksaw blades.",
    "AOYUE Int 2703A+": "Lead-free soldering station with adjustable temperature control for precision electronics assembly and repair. Features a ceramic heating element for stable temperature output.",
    "Apple Pencil": "First-generation Apple Pencil stylus for iPad with pressure and tilt sensitivity. Used for digital sketching, design work, and annotation in creative apps.",
    "BGA Rework Station": "Specialized rework station for removing and re-soldering Ball Grid Array (BGA) components on printed circuit boards. Provides controlled hot-air flow for precise IC-level repairs.",
    "BOSCH GST 150 BCE": "Professional barrel-grip jigsaw with 780W motor, variable speed, and orbital action for cutting wood, metal, and plastic. Features SDS tool-free blade change and anti-vibration system.",
    "Bambu Lab X1-Carbon Combo 3D Printer": "High-speed CoreXY FDM 3D printer with multi-color AMS (Automatic Material System), lidar-assisted auto calibration, and hardened steel nozzle for engineering-grade filaments. Build volume 256\u00d7256\u00d7256 mm, prints at up to 500 mm/s.",
    "Bantam Desktop PCB Milling Machine (Othermill Pro)": "Precision desktop CNC mill designed specifically for milling printed circuit boards and soft metals. Features a 26,000 RPM spindle with 0.001\" accuracy and an enclosed, compact footprint.",
    "Bantam Tools Desktop CNC Milling Machine": "Desktop CNC mill for PCB prototyping, engraving, and milling of aluminum, brass, and plastics. Features automatic tool length measurement, material locating, and a fully enclosed design.",
    "Bofa AD500 Fume Extractor": "Industrial fume extraction system with HEPA and activated carbon filters, designed for laser cutting and soldering environments. Captures particulates and VOCs to maintain safe air quality.",
    "Brother Compact Monochrome Laser Printer": "Compact black-and-white laser printer for fast document printing, labels, and reference sheets. Reliable workhorse for general-purpose makerspace printing needs.",
    "Cowryman Router Plane": "Woodworking hand plane for smoothing and leveling grooves, dados, and mortises. Features an adjustable blade depth for precise, controlled material removal.",
    "Cricut Easy Press 3": "Heat press for applying iron-on vinyl (HTV) to fabric and other materials. Bluetooth-connected with precise temperature and timer control up to 400\u00b0F.",
    "Cricut Maker\u00ae 3": "Digital cutting machine that cuts 300+ materials including vinyl, fabric, balsa wood, and leather. Features 10x cutting force and compatibility with Smart Materials for matless cutting.",
    "DEWALT DCB107 12V/20V MAX Lithium Ion Charger": "Charger compatible with all DEWALT 12V and 20V MAX lithium-ion battery packs. Charges a compact battery in approximately 90 minutes with LED charge indicator.",
    "DEWALT Orbital Sander DWE6421": "5-inch random orbit sander with a 3.0 amp motor delivering 12,000 OPM for smooth finishing on wood and composite surfaces. Features a dust-sealed switch and hook-and-loop pad.",
    "DEWALT Screwdriver Bit Set": "Assorted set of screwdriver bits including Phillips, flathead, Torx, and hex profiles for use with power drills and impact drivers. Comes in a compact carrying case for organization.",
    "DREMEL Workstation 220": "Drill press stand and tool holder for Dremel rotary tools, converting them into a benchtop drill press for precision drilling and routing. Provides controlled, repeatable plunge depth.",
    "DeWalt Drill (DCD777C2)": "20V MAX brushless compact cordless drill/driver with 2-speed transmission (0\u2013500 / 0\u20131,750 RPM) for drilling and fastening. Includes two 20V batteries and a charger.",
    "Dremel 3000": "Variable-speed rotary tool operating at 5,000\u201332,000 RPM for grinding, sanding, cutting, polishing, and engraving across a wide range of materials. Compatible with all standard Dremel accessories.",
    "Drill master Heat Gun": "Dual-temperature heat gun (572\u00b0F / 1,112\u00b0F) for shrink wrap, paint removal, bending PVC, and general workshop heating tasks.",
    "Dust Masks": "Disposable particulate respirator masks (N95 or equivalent) for protection against wood dust, sanding particles, and general workshop debris.",
    "Epilog Helix 24 laser (8000 Laser System)": "CO2 laser cutter/engraver with a 24\"\u00d718\" work area and up to 75W power. Cuts and engraves wood, acrylic, leather, fabric, and other materials with high precision and adjustable speed/power settings.",
    "EverSewn Sparrow X2 Sewing & Embroidery Machine": "Computerized sewing and embroidery machine with 120 built-in stitches, a 4\"\u00d74\" embroidery hoop, and an LCD touchscreen for design selection and customization.",
    "FESTOOL PS 300 EQ-PLUS TRION JIGSAW": "Precision barrel-grip jigsaw with 720W motor, variable speed, and triple-blade guidance system for splinter-free cuts in wood, metal, and plastic. Features tool-free blade change and integrated dust extraction.",
    "FULTON Hose Ring Clamp": "Metal ring clamp for securing dust collection hoses to woodworking machines and dust extraction ports. Provides a tight, vibration-resistant seal.",
    "Festool 575267 Dust Extractor CT Midi Hepa": "Mobile dust extraction unit with HEPA filtration and auto-start function that activates when a connected Festool power tool is turned on. Captures fine dust for clean workshop operation.",
    "Festool Bench": "Festool MFT/3 Multi-Function Work Table with a perforated top for clamping, routing, and assembly. Compatible with the Festool guide rail system for repeatable straight cuts.",
    "Form 2": "Formlabs desktop SLA (stereolithography) 3D printer with 145\u00d7145\u00d7175 mm build volume and 25-micron XY resolution. Supports a wide selection of engineering, dental, and specialty resins.",
    "Form 4": "Formlabs latest-generation MSLA 3D printer with fast print speeds (up to 100 mm/hr), an 11.2\"\u00d77\" build platform, and Low Force Display technology for exceptional surface accuracy.",
    "Form Cure": "Formlabs UV post-curing station for hardening SLA resin prints. Features adjustable temperature (up to 80\u00b0C) and 405 nm UV LEDs to ensure prints reach full mechanical properties.",
    "Form Wash": "Formlabs automated wash station for cleaning SLA 3D prints in isopropyl alcohol. Accommodates parts up to 17.5 cm tall with programmable wash cycles.",
    "GoPro 7 Hero Black": "4K60 action camera with HyperSmooth video stabilization, waterproof to 33 ft without a housing, and voice control. Used for documenting projects and workshop activities.",
    "HAKKO FX-888D": "Digital soldering station with adjustable temperature (120\u2013899\u00b0F), rapid heat recovery, and multiple interchangeable tips. Industry-standard tool for electronics prototyping and rework.",
    "HP Sprout (J4W72AA#ABA)": "All-in-one desktop PC with a built-in 3D scanner, Intel RealSense depth camera, and projected touch mat for 3D scanning, design, and creative workflows.",
    "Heat Gun (TruePower / DrillMaster)": "Dual-temperature heat gun for workshop tasks including shrink tubing, paint softening, bending plastics, and adhesive removal.",
    "Hercules Sanding Sheets": "Replacement sanding sheet packs in various grits for use with orbital sanders and hand sanding blocks. Hook-and-loop or adhesive-backed for quick changes.",
    "Hi-Spec 16 Piece Metal Hand & Needle Files Tool Set Kit": "Set of 16 precision metal files in various profiles (flat, round, half-round, triangular, square) for deburring, shaping, and finishing metal and plastic parts.",
    "Husky Coping Saw": "Fine-toothed frame saw for making intricate curved and interior cuts in wood, plastic, and thin metal. Features a quick-release blade tension mechanism.",
    "Infrared IC Heater": "Infrared heating station for BGA and IC rework, providing focused radiant heat for component removal and soldering on circuit boards without damaging surrounding parts.",
    "KOOTANS Spokeshave Planer": "Adjustable flat-bottom spokeshave for shaping curves, chamfers, and rounded edges on wood. Ideal for chair legs, tool handles, and sculptural woodworking.",
    "Label Maker AC Adapter": "AC power adapter for a handheld label maker, providing wall-outlet power as an alternative to batteries for extended labeling sessions.",
    "MAKITA Plunge Base": "Plunge base attachment for the Makita RT0701C compact router, converting it into a plunge router for mortise cutting, inlay work, and template routing.",
    "MAKITA RT0701C": "1-1/4 HP compact router with variable speed (10,000\u201330,000 RPM), slim ergonomic body, and quick-release cam lock system for easy bit changes.",
    "Marples MPS10189 Japanese Style Pull Saw": "Japanese-style pull saw with crosscut teeth for clean, precise cuts in wood. Pull-stroke cutting design requires less force and produces a thinner kerf than western saws.",
    "Marvey Hotwire Foam Cutter": "Heated nichrome wire tool for cutting and shaping expanded polystyrene (EPS) foam. Ideal for architectural models, rapid prototyping, and scenic fabrication.",
    "Matter and Form 3D Scanner": "Desktop 3D scanner that captures objects up to 9.8\"\u00d77\" using structured light technology. Outputs STL, OBJ, and PLY files for 3D printing and digital modeling.",
    "Mayku Form Box Vacuum Former": "Desktop vacuum forming machine that heats and molds plastic sheets over custom forms using standard 12\"\u00d712\" sheets. Used for rapid prototyping of molds, packaging, and enclosures.",
    "Meta Quest 2 VR Headset": "Standalone VR headset with 1832\u00d71920 per-eye resolution, 6DOF inside-out tracking, and hand tracking support. Used for immersive design review, spatial computing, and VR prototyping.",
    "Original Prusa i3 MK3S+ Enclosure Bundle": "Acrylic enclosure kit for the Prusa i3 MK3S+ 3D printer, providing temperature stability and noise reduction for printing ABS, ASA, and other temperature-sensitive filaments.",
    "Oscilloscope Textronix": "Tektronix digital oscilloscope for visualizing and measuring electrical signals in the time and frequency domains. Essential for electronics debugging, signal analysis, and circuit verification.",
    "PEACHTREE WOODWORKING SUPPLY PVC Hose": "Flexible PVC dust collection hose for connecting woodworking machines to dust extractors and shop vacuum systems. Maintains airflow while resisting collapse under suction.",
    "POWERTEC Hose Coupler (70136)": "Quick-connect coupler for joining dust collection hoses, allowing easy tool-to-tool switching on a central dust collection system without tools.",
}


def main():
    # Read the JSON file
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    tools = data.get("tools", [])
    updated_count = 0
    skipped_names = []

    for tool in tools:
        name = tool.get("name", "")
        if name in DESCRIPTIONS:
            tool["description"] = DESCRIPTIONS[name]
            tool["description_reviewed"] = False
            updated_count += 1
        else:
            skipped_names.append(name)

    print(f"Total tools in file: {len(tools)}")
    print(f"Updated: {updated_count}")
    print(f"Kept existing description: {len(skipped_names)}")
    if skipped_names:
        print("\nTools NOT updated (kept existing):")
        for n in skipped_names:
            print(f"  - {n}")

    # Write back to JSON
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")  # trailing newline

    print(f"\nSuccessfully wrote updated JSON to {JSON_PATH}")


if __name__ == "__main__":
    main()
