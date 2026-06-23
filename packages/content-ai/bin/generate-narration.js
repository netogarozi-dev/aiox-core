#!/usr/bin/env node
import {
  generateNarration,
  ConfigurationError,
  ElevenLabsApiError,
  RateLimitError,
  TimeoutError,
} from '../elevenlabs.js';

function _log(data) {
  console.log(JSON.stringify(data));
}

function _describeError(err) {
  if (err instanceof ConfigurationError) return { errorType: 'ConfigurationError', message: err.message };
  if (err instanceof RateLimitError) return { errorType: 'RateLimitError', message: err.message };
  if (err instanceof ElevenLabsApiError) return { errorType: 'ElevenLabsApiError', message: err.message, statusCode: err.statusCode };
  if (err instanceof TimeoutError) return { errorType: 'TimeoutError', message: err.message };
  return { errorType: err.name || 'Error', message: err.message };
}

async function main() {
  const text = process.argv[2];

  if (!text || text.trim().length === 0) {
    _log({ event: 'narration.error', errorType: 'ConfigurationError', message: 'Texto da narração é obrigatório como argumento: node generate-narration.js "<texto>"' });
    process.stderr.write('Uso: node packages/content-ai/bin/generate-narration.js "<texto>"\n');
    process.exit(1);
  }

  const startedAt = Date.now();

  _log({ event: 'narration.start', text: text.slice(0, 100), ts: new Date().toISOString() });

  let result;
  try {
    result = await generateNarration(text);
  } catch (err) {
    const errorInfo = _describeError(err);
    _log({ event: 'narration.error', ...errorInfo, ts: new Date().toISOString() });
    process.stderr.write(`Falha na geração: ${errorInfo.errorType} — ${errorInfo.message}\n`);
    process.exit(1);
  }

  const durationMs = Date.now() - startedAt;

  _log({ event: 'narration.success', path: result.path, durationMs, ts: new Date().toISOString() });

  process.stdout.write(JSON.stringify({ path: result.path, durationMs }, null, 2) + '\n');
}

main();
