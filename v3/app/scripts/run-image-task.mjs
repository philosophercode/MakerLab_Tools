#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value == null) continue;
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function runPython(scriptDir, script, scriptArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [script, ...scriptArgs], {
      cwd: scriptDir,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`python3 ${script} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const action = args.action;
  const toolName = args.tool;
  const sourceUrl = args.sourceUrl;

  if (!action || !toolName) {
    throw new Error('Missing required args: --action and --tool');
  }

  const __filename = fileURLToPath(import.meta.url);
  const appDir = path.resolve(path.dirname(__filename), '..');
  const scriptsDir = path.resolve(appDir, '..', 'scripts');
  const publicImagesDir = path.resolve(appDir, 'public', 'tool-images');
  const nobgDir = path.join(scriptsDir, 'tool_images_nobg');
  const generatedDir = path.join(scriptsDir, 'tool_images_generated');

  const safeName = toolName.replace(/\//g, '_');
  const filename = `${safeName}.png`;
  const outputPath = path.join(publicImagesDir, filename);
  const nobgPath = path.join(nobgDir, filename);
  const generatedPath = path.join(generatedDir, filename);

  await mkdir(publicImagesDir, { recursive: true });
  await mkdir(nobgDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });

  if (action === 'regenerate') {
    await runPython(scriptsDir, 'generate_images.py', ['--tool', toolName]);
    await copyFile(generatedPath, outputPath);
    await copyFile(generatedPath, nobgPath);
    return;
  }

  if (action === 'remove-bg') {
    await runPython(scriptsDir, 'remove_backgrounds.py', ['--tool', toolName, '--local']);
    await copyFile(nobgPath, outputPath);
    return;
  }

  if (action === 'replace-from-url') {
    if (!sourceUrl) throw new Error('Missing --sourceUrl for replace-from-url');
    await runPython(scriptsDir, 'replace_from_url.py', ['--tool', toolName, '--url', sourceUrl]);
    await copyFile(nobgPath, outputPath);
    return;
  }

  throw new Error(`Unsupported action: ${action}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
