#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  generateImage,
  ConfigurationError,
  StabilityApiError,
  RateLimitError,
  TimeoutError,
} from '../stability.js';

export const SCENES = [
  {
    scene: 1,
    prompt: 'Frustrated businessman in suit, hands on head, staring at dark monitor, cinematic purple and blue neon lighting, photorealistic, 8k, no text, no logos',
  },
  {
    scene: 2,
    prompt: 'Clock melting with money coins falling, dark corporate office background, dramatic purple lighting, cinematic, photorealistic, 8k, no text',
  },
  {
    scene: 3,
    prompt: 'IT technician working remotely on multiple screens, digital connection lines, blue and purple neon glow, futuristic office, photorealistic, 8k, no text',
  },
  {
    scene: 4,
    prompt: 'Modern monitoring dashboard with glowing graphs, purple and blue neon server room background, 24/7 display, cinematic, photorealistic, 8k, no text',
  },
  {
    scene: 5,
    prompt: 'Happy business team in modern office, productivity, success, purple and blue corporate lighting, photorealistic, 8k, no text',
  },
  {
    scene: 6,
    prompt: 'Modern tech company logo reveal, dark background, purple and blue neon lights, cinematic, clean, 8k, no text',
  },
];

const OUTPUT_DIR = path.resolve(process.cwd(), 'output', 'reels');

function _log(data) {
  console.log(JSON.stringify(data));
}

function _describeError(err) {
  if (err instanceof ConfigurationError) return { errorType: 'ConfigurationError', message: err.message };
  if (err instanceof RateLimitError) return { errorType: 'RateLimitError', message: err.message };
  if (err instanceof StabilityApiError) return { errorType: 'StabilityApiError', message: err.message, statusCode: err.statusCode };
  if (err instanceof TimeoutError) return { errorType: 'TimeoutError', message: err.message };
  return { errorType: err.name || 'Error', message: err.message };
}

async function _exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function generateScenes(scenes = SCENES, { outputDir = OUTPUT_DIR, generateImageFn = generateImage, existsFn = _exists, renameFn = fs.rename } = {}) {
  const startedAt = Date.now();
  const results = [];

  for (const { scene, prompt } of scenes) {
    const finalPath = path.join(outputDir, `scene-${scene}.png`);

    if (await existsFn(finalPath)) {
      _log({ event: 'scenes.scene.skip', scene, path: finalPath, ts: new Date().toISOString() });
      results.push({ scene, status: 'skipped', path: finalPath });
      continue;
    }

    _log({ event: 'scenes.scene.start', scene, prompt: prompt.slice(0, 100), ts: new Date().toISOString() });

    try {
      const result = await generateImageFn(prompt, { outputDir });
      await renameFn(result.path, finalPath);
      _log({ event: 'scenes.scene.success', scene, path: finalPath, durationMs: result.durationMs, ts: new Date().toISOString() });
      results.push({ scene, status: 'generated', path: finalPath, durationMs: result.durationMs });
    } catch (err) {
      const errorInfo = _describeError(err);
      _log({ event: 'scenes.scene.error', scene, ...errorInfo, ts: new Date().toISOString() });
      results.push({ scene, status: 'error', error: errorInfo });
    }
  }

  const totalDurationMs = Date.now() - startedAt;
  const totals = {
    generated: results.filter((r) => r.status === 'generated').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    error: results.filter((r) => r.status === 'error').length,
  };

  _log({ event: 'scenes.complete', totals, totalDurationMs, ts: new Date().toISOString() });

  return { scenes: results, totalDurationMs, totals };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const summary = await generateScenes();

  process.stdout.write(JSON.stringify({ scenes: summary.scenes, totalDurationMs: summary.totalDurationMs }, null, 2) + '\n');

  process.exit(summary.totals.error > 0 ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('generate-scenes.js')) {
  main();
}
