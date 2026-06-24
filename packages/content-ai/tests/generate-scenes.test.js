import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateScenes } from '../bin/generate-scenes.js';

const SAMPLE_SCENES = [
  { scene: 1, prompt: 'prompt 1' },
  { scene: 2, prompt: 'prompt 2' },
  { scene: 3, prompt: 'prompt 3' },
];

describe('generateScenes', () => {
  test('AC-5: pula cenas cujo arquivo já existe, sem chamar generateImage', async () => {
    const existing = new Set(['/out/scene-1.png', '/out/scene-3.png']);
    const existsFn = async (p) => existing.has(p.replace(/\\/g, '/'));
    const calledPrompts = [];

    const summary = await generateScenes(SAMPLE_SCENES, {
      outputDir: '/out',
      existsFn,
      generateImageFn: async (prompt, opts) => {
        calledPrompts.push(prompt);
        return { path: `${opts.outputDir}/generated.png`, durationMs: 10 };
      },
      renameFn: async () => {},
    });

    assert.deepEqual(calledPrompts, ['prompt 2']);
    assert.equal(summary.totals.skipped, 2);
    assert.equal(summary.totals.generated, 1);
    assert.equal(summary.totals.error, 0);

    const scene1 = summary.scenes.find((s) => s.scene === 1);
    const scene2 = summary.scenes.find((s) => s.scene === 2);
    assert.equal(scene1.status, 'skipped');
    assert.equal(scene2.status, 'generated');
  });

  test('AC-7: erro em uma cena não impede a geração das demais', async () => {
    const existsFn = async () => false;
    const generateImageFn = async (prompt, opts) => {
      if (prompt === 'prompt 2') {
        const err = new Error('falha simulada');
        err.name = 'StabilityApiError';
        err.statusCode = 500;
        throw err;
      }
      return { path: `${opts.outputDir}/generated.png`, durationMs: 5 };
    };

    const summary = await generateScenes(SAMPLE_SCENES, {
      outputDir: '/out',
      existsFn,
      generateImageFn,
      renameFn: async () => {},
    });

    assert.equal(summary.totals.generated, 2);
    assert.equal(summary.totals.error, 1);
    assert.equal(summary.totals.skipped, 0);

    const scene2 = summary.scenes.find((s) => s.scene === 2);
    assert.equal(scene2.status, 'error');
    assert.equal(scene2.error.errorType, 'StabilityApiError');

    const scene3 = summary.scenes.find((s) => s.scene === 3);
    assert.equal(scene3.status, 'generated');
  });

  test('retorna todos gerados quando nenhum arquivo existe e nenhum erro ocorre', async () => {
    const existsFn = async () => false;
    const generateImageFn = async (prompt, opts) => ({ path: `${opts.outputDir}/generated.png`, durationMs: 1 });

    const summary = await generateScenes(SAMPLE_SCENES, { outputDir: '/out', existsFn, generateImageFn, renameFn: async () => {} });

    assert.equal(summary.totals.generated, 3);
    assert.equal(summary.totals.skipped, 0);
    assert.equal(summary.totals.error, 0);
  });
});
