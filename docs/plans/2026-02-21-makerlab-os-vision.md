# MakerLab OS — Vision Document

**Date:** 2026-02-21
**Status:** Future reference / roadmap ideation

---

## What Exists Today

- Tool inventory browser with search/filters (101 tools)
- AI chat assistant with full doc/PDF/SOP context per tool
- QR code scanning → tool details + chat
- Maintenance issue reporting from chat
- Content flagging system
- AirTable-backed data layer with API caching
- Dynamic follow-up suggestions from AI

## Near-Term: Gateway MCP

A unified API gateway that abstracts all equipment behind a consistent interface. Claude doesn't need to know whether it's talking to OctoPrint, a Trotec API, or a booking spreadsheet.

```
Claude → MakerLab Gateway MCP → routes by tool type
                                    ├── /printers   → OctoPrint/Klipper
                                    ├── /lasers     → Trotec JobControl
                                    ├── /cnc        → LinuxCNC
                                    ├── /booking    → reservation system
                                    └── /inventory  → AirTable (already built)
```

### Unified Tool Interface

- `tool.status(unit_id)` — is it available, in use, down?
- `tool.capabilities(unit_id)` — what can it do, what materials?
- `job.validate(unit_id, file)` — will this file work?
- `job.estimate(unit_id, file)` — how long, how much material?
- `job.submit(unit_id, file, settings)` — queue it (staff gate)
- `job.status(job_id)` — progress, ETA
- `booking.reserve(unit_id, time_slot, student_id)`
- `booking.availability(unit_id)` — open slots

### Safety Layer

All reads (status, capabilities, estimates) are auto-approved. All writes (start job, power on, reserve) go through a staff approval queue. A dashboard shows pending actions for staff to approve/reject.

### Lowest-Hanging Fruit

3D printers via OctoPrint — already has a full REST API. Prototype the entire flow with one Prusa + OctoPrint + an MCP server.

---

## Full Vision

### Smart Scheduling

- AI optimizes job queue across all machines
- "Your laser cut takes 8 min. Trotec #1 is free in 5 min, or I can run it on #2 now but it's slower"
- Batch similar jobs together (all acrylic cuts in one session)
- Predict wait times based on current queue

### Material Inventory

- Weight sensors on filament spools, sheet stock bins
- Real-time: "42g PLA left on Prusa #3, your print needs 28g — cutting it close"
- Auto-reorder when stock drops below threshold
- Cost tracking per student, project, and course

### Access Control

- RFID/badge unlock — machine won't power on without certification
- AI monitors: "You selected 1/4" acrylic but loaded 1/8" — please check"
- Emergency stop wired through the system, logs incident automatically
- Ventilation auto-adjusts based on what's being cut

### Predictive Maintenance

- Usage hours, vibration sensors, error rates
- "Prusa #2 has printed 800 hours since last nozzle change — scheduling maintenance"
- Auto-creates maintenance tickets before things break
- Staff gets a morning briefing: "3 machines need attention today"

### Digital Twin / Live Dashboard

- 3D map of the lab, every machine showing real-time status
- Color coded: green (free), yellow (in use), red (down)
- Click any machine to see queue, current job, ETA
- Kiosk screens around the lab + mobile app

### Intelligent File Pipeline

- Drop in any file (STL, SVG, DXF, STEP, Fusion export)
- AI analyzes geometry, suggests the best tool path
- Auto-slice, auto-nest (pack multiple laser cuts on one sheet), generate toolpaths
- "This part has overhangs — I'd recommend supports here, or split it into two prints"

### Course Integration

- Plug into Canvas — professor assigns "build an enclosure for your circuit"
- System knows assignment constraints, guides students to right tools
- Tracks project completion, time spent, materials used
- TA dashboard shows who needs help

### Knowledge Graph

- Every project, every problem, every fix becomes searchable knowledge
- "Someone cut this same material last week at these settings, it worked great"
- Failure patterns: "3 students broke bits this month on the CNC — maybe the training needs updating"

### Collaboration & Mentorship

- Student working on something complex → system suggests a mentor who's done similar work
- Share designs within the lab community, fork and remix
- "Isaac made a similar enclosure last semester — want to see his approach?"

### AR / Voice Interface

- Hands covered in resin? "Hey MakerLab, what's the cure time for this epoxy?"
- AR glasses showing cut lines overlaid on material
- Step-by-step guidance projected onto the workbench

### Sustainability Tracking

- Material waste per project, per machine, per month
- "If you rotate this part 15 degrees, you save 30% material on the laser bed"
- Energy consumption dashboard
- Scrap material exchange: "Someone has 6x12 plywood offcuts — want to use them?"

### Student Portfolios & Marketplace

- Auto-documented project history from every job submitted
- Open-source designs library for the Cornell community
- Commission board: "I need someone to 3D print 50 wedding favors"
- Skill progression: beginner → intermediate → mentor

---

## Data Layer Considerations

**AirTable stays as source of truth for:**
- Tool/unit inventory, categories, locations
- Maintenance logs, flags, bookings
- Student certifications and training records
- Material inventory counts
- Job queue and status tracking
- Any structured data staff need to edit without code

**Would need additional infrastructure at scale:**
- Redis/MQTT for real-time machine status
- Postgres if job queue volume grows
- S3/Vercel Blob for file storage (STLs, gcode)

At current scale (101 tools, small staff, student traffic), AirTable handles everything with caching.
