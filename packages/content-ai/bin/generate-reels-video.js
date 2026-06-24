#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFfprobeDuration, runFfmpeg, resolveOutputPath } from '../_shared/ffmpeg-utils.js';

const SLIDE_COUNT = 6;
const FADE_DURATION_S = 0.5;
const SIZE = 1080;
const FPS = 30;
const MIN_SLIDE_DURATION_S = 2 * FADE_DURATION_S;

const SLIDES_DIR = path.resolve(process.cwd(), 'output', 'carousel-suporte-remoto', 'final');
const OUTPUT_DIR = path.resolve(process.cwd(), 'output', 'reels');
const OUTPUT_BASENAME = 'reels-v1';
const OUTPUT_SUFFIX = '-mudo.mp4';

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

/**
 * Calcula a duração de cada slide para que a duração total do vídeo
 * (N*D - (N-1)*F) seja exatamente igual à duração do áudio (AC-3).
 */
export function calculateSlideDuration(audioDurationS, slideCount = SLIDE_COUNT, fadeDurationS = FADE_DURATION_S) {
  return (audioDurationS + (slideCount - 1) * fadeDurationS) / slideCount;
}

/**
 * AC-5: a duração por slide precisa ser de pelo menos 2x o fade, senão os
 * offsets do xfade ficariam negativos/inválidos.
 */
export function isSlideDurationSafe(slideDurationS, fadeDurationS = FADE_DURATION_S) {
  return slideDurationS >= 2 * fadeDurationS;
}

function _buildFilterComplex(count, slideDurationS) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push(
      `[${i}:v]scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`,
    );
  }

  let prevLabel = 'v0';
  let offset = slideDurationS - FADE_DURATION_S;
  for (let i = 1; i < count; i++) {
    const outLabel = i === count - 1 ? 'vout' : `vx${i}`;
    parts.push(
      `[${prevLabel}][v${i}]xfade=transition=fade:duration=${FADE_DURATION_S}:offset=${offset}[${outLabel}]`,
    );
    prevLabel = outLabel;
    offset += slideDurationS - FADE_DURATION_S;
  }

  return parts.join(';');
}

async function main() {
  const audioPath = process.argv[2];

  if (!audioPath) {
    _log({ event: 'reels.video.error', message: 'Caminho do arquivo de áudio é obrigatório: node generate-reels-video.js <caminho-do-mp3>' });
    process.stderr.write('Uso: node packages/content-ai/bin/generate-reels-video.js <caminho-do-mp3>\n');
    process.exit(1);
  }

  const resolvedAudioPath = path.resolve(process.cwd(), audioPath);
  const startedAt = Date.now();

  let slidePaths;
  try {
    slidePaths = await _validateSlides();
  } catch (err) {
    _log({ event: 'reels.video.error', message: err.message, ts: new Date().toISOString() });
    process.stderr.write(`Falha: ${err.message}\n`);
    process.exit(1);
  }

  let audioDurationS;
  try {
    audioDurationS = await runFfprobeDuration(resolvedAudioPath);
  } catch (err) {
    _log({ event: 'reels.video.error', message: err.message, ts: new Date().toISOString() });
    process.stderr.write(`Falha ao inspecionar duração do áudio: ${err.message}\n`);
    process.exit(1);
  }

  const slideDurationS = calculateSlideDuration(audioDurationS, slidePaths.length);

  if (!isSlideDurationSafe(slideDurationS)) {
    const message = `Áudio muito curto (${audioDurationS.toFixed(3)}s) para ${slidePaths.length} slides com fade de ${FADE_DURATION_S}s: duração calculada por slide (${slideDurationS.toFixed(3)}s) seria menor que o mínimo seguro (${MIN_SLIDE_DURATION_S}s)`;
    _log({ event: 'reels.video.error', message, ts: new Date().toISOString() });
    process.stderr.write(`Falha: ${message}\n`);
    process.exit(1);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = await resolveOutputPath(OUTPUT_DIR, OUTPUT_BASENAME, OUTPUT_SUFFIX);

  _log({
    event: 'reels.video.start',
    slidesDir: SLIDES_DIR,
    audioDurationS,
    slideDurationS,
    ts: new Date().toISOString(),
  });

  const args = ['-y'];
  for (const slidePath of slidePaths) {
    args.push('-loop', '1', '-t', String(slideDurationS), '-i', slidePath);
  }
  args.push(
    '-filter_complex',
    _buildFilterComplex(slidePaths.length, slideDurationS),
    '-map',
    '[vout]',
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  );

  try {
    await runFfmpeg(args);
  } catch (err) {
    _log({ event: 'reels.video.error', message: err.message, ts: new Date().toISOString() });
    process.stderr.write(`Falha na geração do vídeo: ${err.message}\n`);
    process.exit(1);
  }

  const durationMs = Date.now() - startedAt;
  _log({ event: 'reels.video.success', path: outputPath, durationMs, ts: new Date().toISOString() });
  process.stdout.write(JSON.stringify({ path: outputPath, durationMs }, null, 2) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('generate-reels-video.js')) {
  main();
}
