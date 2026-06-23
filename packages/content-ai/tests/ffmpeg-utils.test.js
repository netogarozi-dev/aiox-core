import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { resolveOutputPath, runFfmpeg, runFfprobeDuration } from '../_shared/ffmpeg-utils.js';

describe('resolveOutputPath (AC-7 da Story 484.7: sem sobrescrita)', () => {
  test('retorna o caminho base quando o arquivo não existe', async () => {
    const existsFn = async () => false;
    const result = await resolveOutputPath('/out', 'reels-suporte-remoto-v1', '.mp4', existsFn);
    assert.equal(result, path.join('/out', 'reels-suporte-remoto-v1.mp4'));
  });

  test('incrementa para -v2 quando -v1 já existe', async () => {
    const existing = new Set(['/out/reels-suporte-remoto-v1.mp4']);
    const existsFn = async (p) => existing.has(p.replace(/\\/g, '/'));
    const result = await resolveOutputPath('/out', 'reels-suporte-remoto-v1', '.mp4', existsFn);
    assert.equal(result.replace(/\\/g, '/'), '/out/reels-suporte-remoto-v2.mp4');
  });

  test('incrementa para -v3 quando -v1 e -v2 já existem', async () => {
    const existing = new Set([
      '/out/reels-suporte-remoto-v1.mp4',
      '/out/reels-suporte-remoto-v2.mp4',
    ]);
    const existsFn = async (p) => existing.has(p.replace(/\\/g, '/'));
    const result = await resolveOutputPath('/out', 'reels-suporte-remoto-v1', '.mp4', existsFn);
    assert.equal(result.replace(/\\/g, '/'), '/out/reels-suporte-remoto-v3.mp4');
  });

  test('AC-7 da Story 484.9: suporta sufixo composto (ex: "-mudo.mp4") com versão no meio do nome final', async () => {
    const existing = new Set(['/out/reels-v1-mudo.mp4']);
    const existsFn = async (p) => existing.has(p.replace(/\\/g, '/'));
    const result = await resolveOutputPath('/out', 'reels-v1', '-mudo.mp4', existsFn);
    assert.equal(result.replace(/\\/g, '/'), '/out/reels-v2-mudo.mp4');
  });
});

describe('runFfmpeg (AC-9 da Story 484.7: tratamento de erro do FFmpeg)', () => {
  function mockSpawn({ exitCode = 0, stderrChunks = [], emitError = null }) {
    return () => {
      const proc = new EventEmitter();
      proc.stderr = new EventEmitter();
      queueMicrotask(() => {
        for (const chunk of stderrChunks) {
          proc.stderr.emit('data', Buffer.from(chunk));
        }
        if (emitError) {
          proc.emit('error', emitError);
        } else {
          proc.emit('close', exitCode);
        }
      });
      return proc;
    };
  }

  test('resolve quando ffmpeg sai com código 0', async () => {
    await assert.doesNotReject(() => runFfmpeg(['-version'], mockSpawn({ exitCode: 0 })));
  });

  test('rejeita com mensagem truncada quando ffmpeg sai com código != 0', async () => {
    const longError = 'x'.repeat(600);
    await assert.rejects(
      () => runFfmpeg(['-bad-arg'], mockSpawn({ exitCode: 1, stderrChunks: [longError] })),
      (err) => {
        assert.match(err.message, /código 1/);
        assert.ok(err.message.length < 600, 'mensagem de erro deve ser truncada');
        return true;
      },
    );
  });

  test('rejeita com mensagem clara quando ffmpeg não é encontrado (ENOENT)', async () => {
    const enoentErr = new Error('spawn ffmpeg ENOENT');
    enoentErr.code = 'ENOENT';
    await assert.rejects(
      () => runFfmpeg(['-version'], mockSpawn({ emitError: enoentErr })),
      (err) => {
        assert.match(err.message, /não encontrado no PATH/);
        return true;
      },
    );
  });
});

describe('runFfprobeDuration (AR-3 da Story 484.6/484.7: guarda contra NaN)', () => {
  function mockSpawn({ stdout = '', exitCode = 0 }) {
    return () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      queueMicrotask(() => {
        if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
        proc.emit('close', exitCode);
      });
      return proc;
    };
  }

  test('resolve com a duração parseada quando ffprobe retorna um número válido', async () => {
    const result = await runFfprobeDuration('/in.mp4', mockSpawn({ stdout: '15.533333\n' }));
    assert.equal(result, 15.533333);
  });

  test('rejeita quando ffprobe retorna saída não numérica (NaN guard)', async () => {
    await assert.rejects(
      () => runFfprobeDuration('/in.mp4', mockSpawn({ stdout: 'N/A\n' })),
      (err) => {
        assert.match(err.message, /duração inválida/);
        return true;
      },
    );
  });
});
