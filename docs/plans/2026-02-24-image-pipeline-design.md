# Image Eval Pipeline — Design Doc

**Date:** 2026-02-24
**Goal:** Process `original_photos/` through a 5-stage AI pipeline to produce clean, validated, transparent-background product images.

## Pipeline Stages

```
original_photos/
  │
  ├─ Stage 1: IDENTIFY (Claude Vision)
  │    "Does this image show the tool named in the filename?"
  │    FAIL → skip (wrong tool)
  │
  ├─ Stage 2: QUALITY (Pillow edge detection)
  │    Laplacian-style blur check via Pillow
  │    FAIL → skip (too blurry to salvage)
  │
  ├─ Stage 3: GREENSCREEN (Gemini 3 Pro Image Preview)
  │    Send original photo + prompt: "keep this exact object, place on
  │    solid #00FF00 greenscreen background"
  │    Uses image-in + image-out capability
  │
  ├─ Stage 4: CHROMA-KEY (Pillow HSV thresholding)
  │    Remove #00FF00 background → transparent PNG
  │    Reuse chromakey_remove() from generate_images.py
  │
  └─ Stage 5: VALIDATE (Claude Vision)
       Final check: "Is this a clean transparent product photo of [tool]?"
       FAIL → flagged for manual review
```

## Output Structure

```
pipeline_output/
  ├── 3_greenscreen/       Gemini-enhanced with green BG
  ├── 4_transparent/       Background removed
  ├── 5_validated/         Final approved images
  └── report.json          Full tracking for all stages
```

## JSON Tracking (report.json)

Every tool gets a complete record with per-stage results, timestamps, and the final disposition. The report also includes run metadata (config, summary counts).

## Key Decisions

- **Pure Python + Pillow + numpy** — no rembg needed since we use chroma-key
- **stdlib for HTTP** — urllib for Gemini and Claude API calls (repo convention)
- **Resumable** — reads existing report.json and skips completed tools
- **Default batch: 10** — `--limit 10`, override with `--limit N` or `--all`
- **Gemini image-in/image-out** — send the original photo as input so Gemini enhances the REAL object, not a hallucinated one
- **Claude for both identify and validate** — bookend the pipeline with vision checks

## APIs Used

- **Gemini** `gemini-3-pro-image-preview` via REST (generativelanguage.googleapis.com)
- **Claude** `claude-sonnet-4-6` via REST (api.anthropic.com)
- Keys loaded from `v3/app/.env.local`
