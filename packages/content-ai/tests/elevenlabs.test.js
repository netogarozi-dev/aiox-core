import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateNarration, ElevenLabsApiError, RateLimitError, TimeoutError, ConfigurationError } from '../elevenlabs.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function makeAudioBuffer() {
  return Buffer.from([0x49, 0x44, 0x33, 0x00, 0x00, 0x00, 0x00]); // ID3-like header, conteúdo fictício
}

function makeSuccessResponse() {
  const audio = makeAudioBuffer();
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => {
      const ab = new ArrayBuffer(audio.length);
      new Uint8Array(ab).set(audio);
      return ab;
    },
  };
}

function makeErrorResponse(status, body = '') {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => body,
  };
}

function make429Response(retryAfterSeconds = null) {
  return {
    ok: false,
    status: 429,
    headers: {
      get: (name) =>
        name.toLowerCase() === 'retry-after'
          ? (retryAfterSeconds !== null ? String(retryAfterSeconds) : null)
          : null,
    },
    text: async () => 'Rate limit exceeded',
  };
}

let savedFetch;
let savedApiKey;
let savedVoiceId;
let tmpDir;

describe('generateNarration', () => {
  beforeEach(async () => {
    savedFetch = globalThis.fetch;
    savedApiKey = process.env.ELEVENLABS_API_KEY;
    savedVoiceId = process.env.ELEVENLABS_VOICE_ID;
    process.env.ELEVENLABS_API_KEY = 'sk-test-key-123';
    process.env.ELEVENLABS_VOICE_ID = 'voice-test-456';
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'elevenlabs-test-'));
  });

  afterEach(async () => {
    globalThis.fetch = savedFetch;
    if (savedApiKey === undefined) {
      delete process.env.ELEVENLABS_API_KEY;
    } else {
      process.env.ELEVENLABS_API_KEY = savedApiKey;
    }
    if (savedVoiceId === undefined) {
      delete process.env.ELEVENLABS_VOICE_ID;
    } else {
      process.env.ELEVENLABS_VOICE_ID = savedVoiceId;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('success: retorna metadados corretos e salva arquivo em disco', async () => {
    globalThis.fetch = async () => makeSuccessResponse();

    const result = await generateNarration('texto de teste', { outputDir: tmpDir });

    assert.equal(result.text, 'texto de teste');
    assert.equal(result.voiceId, 'voice-test-456');
    assert.ok(result.path.startsWith(tmpDir));
    assert.ok(/^narration-\d{4}-\d{2}-\d{2}-\d{6}-[a-f0-9]{8}\.mp3$/.test(result.filename));
    assert.ok(typeof result.generatedAt === 'string');
    assert.ok(result.durationMs >= 0);

    const fileExists = await fs.access(result.path).then(() => true).catch(() => false);
    assert.ok(fileExists, 'arquivo MP3 deve existir em disco');
  });

  test('ConfigurationError quando ELEVENLABS_API_KEY está ausente', async () => {
    delete process.env.ELEVENLABS_API_KEY;

    await assert.rejects(
      () => generateNarration('texto', { outputDir: tmpDir }),
      (err) => {
        assert.ok(
          err instanceof ConfigurationError,
          `esperado ConfigurationError, recebido ${err.constructor.name}`,
        );
        return true;
      },
    );
  });

  test('ConfigurationError quando ELEVENLABS_VOICE_ID está ausente', async () => {
    delete process.env.ELEVENLABS_VOICE_ID;

    await assert.rejects(
      () => generateNarration('texto', { outputDir: tmpDir }),
      (err) => {
        assert.ok(
          err instanceof ConfigurationError,
          `esperado ConfigurationError, recebido ${err.constructor.name}`,
        );
        return true;
      },
    );
  });

  test('ConfigurationError quando texto é vazio', async () => {
    await assert.rejects(
      () => generateNarration('', { outputDir: tmpDir }),
      (err) => {
        assert.ok(
          err instanceof ConfigurationError,
          `esperado ConfigurationError, recebido ${err.constructor.name}`,
        );
        return true;
      },
    );
  });

  test('429 → aguarda Retry-After → sucesso no segundo attempt', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) return make429Response(0);
      return makeSuccessResponse();
    };

    const result = await generateNarration('texto de teste', { outputDir: tmpDir });
    assert.equal(callCount, 2, 'deve realizar exatamente 2 chamadas (inicial + retry)');
    assert.ok(result.path, 'deve retornar path do arquivo gerado');
  });

  test('429 duas vezes → lança RateLimitError', async () => {
    globalThis.fetch = async () => make429Response(0);

    await assert.rejects(
      () => generateNarration('texto de teste', { outputDir: tmpDir }),
      (err) => {
        assert.ok(
          err instanceof RateLimitError,
          `esperado RateLimitError, recebido ${err.constructor.name}`,
        );
        return true;
      },
    );
  });

  test('500 → lança ElevenLabsApiError sem retry', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return makeErrorResponse(500, 'Internal Server Error');
    };

    await assert.rejects(
      () => generateNarration('texto de teste', { outputDir: tmpDir }),
      (err) => {
        assert.ok(
          err instanceof ElevenLabsApiError,
          `esperado ElevenLabsApiError, recebido ${err.constructor.name}`,
        );
        assert.equal(err.statusCode, 500);
        return true;
      },
    );
    assert.equal(callCount, 1, 'não deve fazer retry em erro 500');
  });

  test('timeout → lança TimeoutError', async () => {
    globalThis.fetch = () =>
      new Promise((_, reject) => {
        setTimeout(() => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        }, 50);
      });

    await assert.rejects(
      () => generateNarration('texto de teste', { outputDir: tmpDir }),
      (err) => {
        assert.ok(
          err instanceof TimeoutError,
          `esperado TimeoutError, recebido ${err.constructor.name}`,
        );
        return true;
      },
    );
  });

  test('diretório de output criado automaticamente se não existir', async () => {
    const deepDir = path.join(tmpDir, 'nested', 'subdir', 'audio');
    globalThis.fetch = async () => makeSuccessResponse();

    const result = await generateNarration('texto de teste', { outputDir: deepDir });

    const dirExists = await fs.access(deepDir).then(() => true).catch(() => false);
    assert.ok(dirExists, 'diretório aninhado deve ser criado automaticamente');
    assert.ok(result.path.startsWith(deepDir));
  });
});
