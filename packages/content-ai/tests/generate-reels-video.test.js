import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSlideDuration, isSlideDurationSafe } from '../bin/generate-reels-video.js';

describe('calculateSlideDuration (AC-3: duração total exata do áudio)', () => {
  test('a duração total resultante (N*D - (N-1)*F) bate exatamente com a duração do áudio', () => {
    const audioDurationS = 4.737007;
    const slideCount = 6;
    const fadeDurationS = 0.5;

    const slideDuration = calculateSlideDuration(audioDurationS, slideCount, fadeDurationS);
    const totalVideoDuration = slideCount * slideDuration - (slideCount - 1) * fadeDurationS;

    assert.ok(
      Math.abs(totalVideoDuration - audioDurationS) < 1e-9,
      `duração total (${totalVideoDuration}) deveria bater com a duração do áudio (${audioDurationS})`,
    );
  });

  test('caso de referência: áudio de 15.5s com 6 slides e fade de 0.5s', () => {
    // Mesmo cenário validado com FFmpeg real na Story 484.7 (slides de 3s fixos, fade 0.5s)
    // — usado aqui como caso de regressão para a fórmula dinâmica.
    const slideDuration = calculateSlideDuration(15.5, 6, 0.5);
    assert.ok(Math.abs(slideDuration - 3) < 1e-9, `esperado ~3s, recebido ${slideDuration}`);
  });

  test('áudio mais longo resulta em slides proporcionalmente mais longos', () => {
    const shortDuration = calculateSlideDuration(10, 6, 0.5);
    const longDuration = calculateSlideDuration(30, 6, 0.5);
    assert.ok(longDuration > shortDuration);
  });
});

describe('isSlideDurationSafe (AC-5: duração mínima de segurança)', () => {
  test('duração igual a 2x o fade é considerada segura (limite inclusivo)', () => {
    assert.equal(isSlideDurationSafe(1.0, 0.5), true);
  });

  test('duração maior que 2x o fade é segura', () => {
    assert.equal(isSlideDurationSafe(3, 0.5), true);
  });

  test('duração menor que 2x o fade NÃO é segura (áudio muito curto para 6 slides)', () => {
    const audioDurationS = 1; // muito curto para 6 slides com fade de 0.5s
    const slideDuration = calculateSlideDuration(audioDurationS, 6, 0.5);
    assert.equal(isSlideDurationSafe(slideDuration, 0.5), false);
  });
});
