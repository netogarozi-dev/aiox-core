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

const OUTPUT_DIR = path.resolve(process.cwd(), 'output', 'carousel-suporte-remoto');

const SLIDES = [
  {
    slide: 1,
    label: 'Capa',
    prompt: 'purple to blue gradient background, abstract digital network, premium tech aesthetic, clean minimalist, no text',
  },
  {
    slide: 2,
    label: 'Problema',
    prompt: 'person frustrated at desk with multiple phones and papers, purple blue corporate style, no text',
  },
  {
    slide: 3,
    label: 'Solução 1',
    prompt: 'hand clicking remote connection icon on screen, instant connection concept, purple blue gradient, no text',
  },
  {
    slide: 4,
    label: 'Solução 2',
    prompt: 'clock with fast forward concept, efficiency, corporate purple blue, no text',
  },
  {
    slide: 5,
    label: 'Solução 3',
    prompt: 'monitoring dashboard 24/7, screens with metrics, purple blue tech, no text',
  },
  {
    slide: 6,
    label: 'CTA',
    prompt: 'team celebrating success, modern office, purple blue gradient background, no text',
  },
];

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
  _log({
    event: 'carousel.start',
    totalSlides: SLIDES.length,
    outputDir: OUTPUT_DIR,
    ts: new Date().toISOString(),
  });

  const completed = [];

  for (const { slide, label, prompt } of SLIDES) {
    _log({
      event: 'carousel.slide.start',
      slide,
      label,
      prompt: prompt.slice(0, 100),
      ts: new Date().toISOString(),
    });

    let result;
    try {
      result = await generateImage(prompt, { outputDir: OUTPUT_DIR });
    } catch (err) {
      const errorInfo = _describeError(err);
      _log({
        event: 'carousel.slide.error',
        slide,
        label,
        ...errorInfo,
        ts: new Date().toISOString(),
      });
      process.stderr.write(
        `Falha no slide ${slide} (${label}): ${errorInfo.errorType} — ${errorInfo.message}\n` +
        `Slides concluídos antes da falha: ${completed.map((c) => c.slide).join(', ') || 'nenhum'}\n`,
      );
      process.exit(1);
    }

    const finalPath = path.join(OUTPUT_DIR, `slide-${slide}.png`);
    await fs.rename(result.path, finalPath);

    completed.push({ slide, path: finalPath, durationMs: result.durationMs });

    _log({
      event: 'carousel.slide.success',
      slide,
      label,
      path: finalPath,
      durationMs: result.durationMs,
      ts: new Date().toISOString(),
    });
  }

  const totalDurationMs = Date.now() - startedAt;

  _log({
    event: 'carousel.complete',
    totalSlides: SLIDES.length,
    totalDurationMs,
    ts: new Date().toISOString(),
  });

  process.stdout.write(JSON.stringify({ slides: completed, totalDurationMs }, null, 2) + '\n');
}

main();
