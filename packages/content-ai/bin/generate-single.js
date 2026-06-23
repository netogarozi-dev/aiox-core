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

const PROMPT = 'profissional corporativo estressado olhando para monitor, ambiente de escritório moderno, iluminação roxa e azul, estilo premium SaaS, fotorrealista, sem texto na imagem';
const OUTPUT_DIR = path.resolve(process.cwd(), 'output', 'single-post');
const OUTPUT_FILENAME = 'base.png';

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

async function main() {
  const startedAt = Date.now();

  _log({ event: 'single.start', prompt: PROMPT.slice(0, 100), outputDir: OUTPUT_DIR, ts: new Date().toISOString() });

  let result;
  try {
    result = await generateImage(PROMPT, { outputDir: OUTPUT_DIR });
  } catch (err) {
    const errorInfo = _describeError(err);
    _log({ event: 'single.error', ...errorInfo, ts: new Date().toISOString() });
    process.stderr.write(`Falha na geração: ${errorInfo.errorType} — ${errorInfo.message}\n`);
    process.exit(1);
  }

  const finalPath = path.join(OUTPUT_DIR, OUTPUT_FILENAME);
  await fs.rename(result.path, finalPath);

  const durationMs = Date.now() - startedAt;

  _log({ event: 'single.success', path: finalPath, durationMs, ts: new Date().toISOString() });

  process.stdout.write(JSON.stringify({ path: finalPath, durationMs }, null, 2) + '\n');
}

main();
