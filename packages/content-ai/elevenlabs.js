import fs from 'node:fs/promises';
import path from 'node:path';

const TIMEOUT_MS = 30_000;
const RETRY_AFTER_DEFAULT_MS = 10_000;

export class ElevenLabsApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ElevenLabsApiError';
    this.statusCode = statusCode;
  }
}

export class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function _validateConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new ConfigurationError(
      'ELEVENLABS_API_KEY environment variable is required but not set',
    );
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) {
    throw new ConfigurationError(
      'ELEVENLABS_VOICE_ID environment variable is required but not set',
    );
  }
  return { apiKey, voiceId };
}

function _buildRequestBody(text) {
  return JSON.stringify({ text });
}

function _buildUrl(voiceId) {
  return `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
}

async function _callApi(url, requestBody, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: requestBody,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new TimeoutError('ElevenLabs API did not respond within 30 seconds');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _handleApiError(response) {
  let message = `ElevenLabs API error: HTTP ${response.status}`;
  try {
    const text = await response.text();
    if (text) {
      message += ` — ${text.slice(0, 200)}`;
    }
  } catch {
    // ignore read errors on error response body
  }
  throw new ElevenLabsApiError(message, response.status);
}

async function _callWithRetry(url, text, apiKey) {
  const response = await _callApi(url, _buildRequestBody(text), apiKey);

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const waitMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000
      : RETRY_AFTER_DEFAULT_MS;

    _log({ event: 'elevenlabs.rate_limit.retry', waitMs, ts: new Date().toISOString() });
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    const retryResponse = await _callApi(url, _buildRequestBody(text), apiKey);
    if (!retryResponse.ok) {
      if (retryResponse.status === 429) {
        throw new RateLimitError('ElevenLabs rate limit exceeded after 1 retry');
      }
      await _handleApiError(retryResponse);
    }
    return retryResponse;
  }

  if (!response.ok) {
    await _handleApiError(response);
  }

  return response;
}

async function _ensureOutputDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function _generateFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const shortId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `narration-${datePart}-${timePart}-${shortId}.mp3`;
}

function _log(data) {
  console.log(JSON.stringify(data));
}

export async function generateNarration(text, options = {}) {
  const { apiKey, voiceId } = _validateConfig();

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new ConfigurationError('text must be a non-empty string');
  }

  const startedAt = Date.now();
  const url = _buildUrl(voiceId);

  _log({
    event: 'elevenlabs.generate.start',
    text: text.slice(0, 200),
    voiceId,
    ts: new Date().toISOString(),
  });

  let response;
  try {
    response = await _callWithRetry(url, text, apiKey);
  } catch (err) {
    _log({
      event: 'elevenlabs.generate.error',
      errorType: err.name,
      message: err.message,
      statusCode: err.statusCode,
      ts: new Date().toISOString(),
    });
    throw err;
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.resolve(process.cwd(), 'output', 'audio');
  await _ensureOutputDir(outputDir);

  const filename = _generateFilename();
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, buffer);

  const durationMs = Date.now() - startedAt;
  const generatedAt = new Date().toISOString();

  _log({
    event: 'elevenlabs.generate.success',
    path: filePath,
    durationMs,
    ts: generatedAt,
  });

  return {
    path: filePath,
    filename,
    text,
    voiceId,
    durationMs,
    generatedAt,
  };
}
