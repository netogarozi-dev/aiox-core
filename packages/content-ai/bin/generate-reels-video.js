#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SLIDE_COUNT = 6;
const SLIDE_DURATION_S = 3;
const FADE_DURATION_S = 0.5;
const SIZE = 1080;
const FPS = 30;

const SLIDES_DIR = path.resolve(process.cwd(), 'output', 'carousel-suporte-remoto', 'final');
const OUTPUT_DIR = path.resolve(process.cwd(), 'output', 'reels');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'reels-v1-mudo.mp4');

function _log(data) {
  console.log(JSON.stringify(data));
}

async function _validateSlides() {
  const paths = [];
  for (let i = 1; i <= SLIDE_COUNT; i++) {
    const slidePath = path.join(SLIDES_DIR, `slide-${i}.png`);
    try {
      await fs.access(slidePath);
    } catch {
      throw new Error(`Slide não encontrado: ${slidePath}`);
    }
    paths.push(slidePath);
  }
  return paths;
}

function _buildFilterComplex(count) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push(
      `[${i}:v]scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`,
    );
  }

  let prevLabel = 'v0';
  let offset = SLIDE_DURATION_S - FADE_DURATION_S;
  for (let i = 1; i < count; i++) {
    const outLabel = i === count - 1 ? 'vout' : `vx${i}`;
    parts.push(
      `[${prevLabel}][v${i}]xfade=transition=fade:duration=${FADE_DURATION_S}:offset=${offset}[${outLabel}]`,
    );
    prevLabel = outLabel;
    offset += SLIDE_DURATION_S - FADE_DURATION_S;
  }

  return parts.join(';');
}

export function _runFfmpeg(args, spawnFn = spawn) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawnFn('ffmpeg', args);
    } catch (err) {
      reject(err);
      return;
    }

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Binário "ffmpeg" não encontrado no PATH'));
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg saiu com código ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

async function main() {
  const startedAt = Date.now();
  _log({ event: 'reels.video.start', slidesDir: SLIDES_DIR, ts: new Date().toISOString() });

  let slidePaths;
  try {
    slidePaths = await _validateSlides();
  } catch (err) {
    _log({ event: 'reels.video.error', message: err.message, ts: new Date().toISOString() });
    process.stderr.write(`Falha: ${err.message}\n`);
    process.exit(1);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const args = ['-y'];
  for (const slidePath of slidePaths) {
    args.push('-loop', '1', '-t', String(SLIDE_DURATION_S), '-i', slidePath);
  }
  args.push(
    '-filter_complex',
    _buildFilterComplex(slidePaths.length),
    '-map',
    '[vout]',
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    OUTPUT_PATH,
  );

  try {
    await _runFfmpeg(args);
  } catch (err) {
    _log({ event: 'reels.video.error', message: err.message, ts: new Date().toISOString() });
    process.stderr.write(`Falha na geração do vídeo: ${err.message}\n`);
    process.exit(1);
  }

  const durationMs = Date.now() - startedAt;
  _log({ event: 'reels.video.success', path: OUTPUT_PATH, durationMs, ts: new Date().toISOString() });
  process.stdout.write(JSON.stringify({ path: OUTPUT_PATH, durationMs }, null, 2) + '\n');
}

main();
