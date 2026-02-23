/**
 * Integration test for Gemini image generation.
 * Run with: npx tsx src/lib/gemini-image.test.ts
 *
 * Calls the live API, verifies the response shape, and saves
 * the generated image to /tmp/gemini-test-output.png so you
 * can visually confirm the result.
 */

import { generateImage } from "./gemini-image";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Load env vars from .env.local (no dotenv dependency)
const envPath = resolve(__dirname, "../../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) process.env[match[1]] = match[2];
}

const PROJECT_PROMPT = `A laser-cut wooden phone stand with geometric cutout patterns,
made from 3mm birch plywood, sitting on a clean white desk. The stand has an angled
slot to hold a phone upright and decorative hexagonal perforations along the sides.
Warm natural wood tones, soft studio lighting, product photography, slightly elevated
camera angle.`;

async function runTest() {
  console.log("=== Gemini Image Generation Test ===\n");
  console.log(`Model: gemini-3-pro-image-preview`);
  console.log(`Prompt: ${PROJECT_PROMPT.trim().slice(0, 80)}...\n`);

  const start = Date.now();

  try {
    const result = await generateImage(PROJECT_PROMPT);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`✓ Image generated in ${elapsed}s`);
    console.log(`  - mimeType: ${result.mimeType}`);
    console.log(`  - base64 length: ${result.imageBase64.length} chars`);
    console.log(`  - approx size: ${Math.round(result.imageBase64.length * 0.75 / 1024)} KB`);
    if (result.text) {
      console.log(`  - text: ${result.text.slice(0, 200)}`);
    }

    // Validate response shape
    if (!result.imageBase64 || result.imageBase64.length < 1000) {
      throw new Error("Image data too small — likely not a real image");
    }
    if (!result.mimeType.startsWith("image/")) {
      throw new Error(`Unexpected mimeType: ${result.mimeType}`);
    }

    // Decode and save to disk
    const ext = result.mimeType === "image/png" ? "png" : "jpg";
    const outPath = `/tmp/gemini-test-output.${ext}`;
    const buffer = Buffer.from(result.imageBase64, "base64");
    writeFileSync(outPath, buffer);
    console.log(`\n✓ Saved to ${outPath}`);
    console.log(`  Open with: open ${outPath}`);

    console.log("\n=== ALL CHECKS PASSED ===");
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`\n✗ FAILED after ${elapsed}s`);
    console.error(`  ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

runTest();
