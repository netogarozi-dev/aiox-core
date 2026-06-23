#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFfprobeDuration, runFfmpeg, resolveOutputPath } from '../_shared/ffmpeg-utils.js';

const REELS_DIR = path.resolve(process.cwd(), 'output', 'reels');
const VIDEO_PATH = path.join(REELS_DIR, 'reels-v1-mudo.mp4');
const OUTPUT_BASENAME = 'reels-suporte-remoto-v1';

function _log(data) {
  console.log(JSON.stringify(data));
}

async function _exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const audioPath = process.argv[2];

  if (!audioPath) {
    _log({ event: 'reels.audio.error', message: 'Caminho do arquivo de áudio é obrigatório: node combine-reels-audio.js <caminho-do-mp3>' });
    process.stderr.write('Uso: node packages/content-ai/bin/combine-reels-audio.js <caminho-do-mp3>\n');
    process.exit(1);
  }

  const resolvedAudioPath = path.resolve(process.cwd(), audioPath);
  const startedAt = Date.now();

  _log({ event: 'reels.audio.start', videoPath: VIDEO_PATH, audioPath: resolvedAudioPath, ts: new Date().toISOString() });

  if (!(await _exists(VIDEO_PATH))) {
    _log({ event: 'reels.audio.error', message: `Vídeo mudo não encontrado: ${VIDEO_PATH}`, ts: new Date().toISOString() });
    process.stderr.write(`Falha: vídeo mudo não encontrado em ${VIDEO_PATH} — execute generate-reels-video.js primeiro\n`);
    process.exit(1);
  }

  if (!(await _exists(resolvedAudioPath))) {
    _log({ event: 'reels.audio.error', message: `Arquivo de áudio não encontrado: ${resolvedAudioPath}`, ts: new Date().toISOString() });
    process.stderr.write(`Falha: arquivo de áudio não encontrado em ${resolvedAudioPath}\n`);
    process.exit(1);
  }

  const outputPath = await resolveOutputPath(REELS_DIR, OUTPUT_BASENAME, '.mp4');

  let videoDuration;
  let audioDuration;
  try {
    videoDuration = await runFfprobeDuration(VIDEO_PATH);
    audioDuration = await runFfprobeDuration(resolvedAudioPath);
  } catch (err) {
    _log({ event: 'reels.audio.error', message: err.message, ts: new Date().toISOString() });
    process.stderr.write(`Falha ao inspecionar durações: ${err.message}\n`);
    process.exit(1);
  }

  const audioLongerThanVideo = audioDuration > videoDuration;

  const args = ['-y', '-i', VIDEO_PATH, '-i', resolvedAudioPath];
  if (audioLongerThanVideo) {
    // Áudio mais longo que o vídeo: congela o último frame até o fim do áudio (AC-6).
    // Requer re-encode do vídeo (tpad não é compatível com -c:v copy).
    args.push(
      '-filter_complex',
      `[0:v]tpad=stop_mode=clone:stop_duration=${(audioDuration - videoDuration).toFixed(3)}[v]`,
      '-map', '[v]',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
    );
  } else {
    // Áudio igual ou mais curto: vídeo mantido intacto (copy), continua mudo até o fim.
    args.push(
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
    );
  }
  args.push(outputPath);

  try {
    await runFfmpeg(args);
  } catch (err) {
    _log({ event: 'reels.audio.error', message: err.message, ts: new Date().toISOString() });
    process.stderr.write(`Falha na combinação: ${err.message}\n`);
    process.exit(1);
  }

  const durationMs = Date.now() - startedAt;
  _log({ event: 'reels.audio.success', path: outputPath, durationMs, ts: new Date().toISOString() });
  process.stdout.write(JSON.stringify({ path: outputPath, durationMs }, null, 2) + '\n');
}

if (process.argv[1] && process.argv[1].endsWith('combine-reels-audio.js')) {
  main();
}
