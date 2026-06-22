#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');

const BASE_DIR = path.join(PROJECT_ROOT, 'output', 'carousel-suporte-remoto');
const FINAL_DIR = path.join(BASE_DIR, 'final');
const FONTS_DIR = path.join(PACKAGE_ROOT, 'assets', 'fonts');
const LOGO_PATH = path.join(PACKAGE_ROOT, 'assets', '01 - LOGO', 'MARCA D_AGUA', '1º LOGO - PNG.png');

const CANVAS_SIZE = 1024;
const MARGIN_X = 56;
const MAX_TEXT_WIDTH = CANVAS_SIZE - MARGIN_X * 2;
const TITLE_FONT_SIZE = 54;
const TITLE_LINE_HEIGHT = 64;
const TITLE_CHAR_WIDTH_RATIO = 0.62;
const SUBTITLE_FONT_SIZE = 30;
const SUBTITLE_LINE_HEIGHT = 40;
const SUBTITLE_CHAR_WIDTH_RATIO = 0.52;
const FOOTER_FONT_SIZE = 22;
const FOOTER_LINE_HEIGHT = 30;
const ACCENT_COLOR = '#00B0EA';
const PADDING_TOP = 40;
const PADDING_BOTTOM = 36;
const LOGO_TARGET_WIDTH = 180;
const LOGO_MARGIN = 32;

const SLIDES = [
  {
    slide: 1,
    title: 'Como o Suporte Remoto Economiza Tempo',
    subtitle: 'Descubra como empresas estão resolvendo problemas em minutos',
  },
  {
    slide: 2,
    title: 'Suporte presencial custa caro e demora',
    subtitle: 'Deslocamento, espera e horas paradas prejudicam sua operação',
  },
  {
    slide: 3,
    title: 'Acesso imediato, sem sair do lugar',
    subtitle: 'Nosso técnico conecta no seu computador em segundos',
  },
  {
    slide: 4,
    title: 'Resolução em minutos, não em horas',
    subtitle: 'Reduza o tempo de inatividade e aumente a produtividade',
  },
  {
    slide: 5,
    title: 'Monitoramento 24h, 7 dias por semana',
    subtitle: 'Identificamos e resolvemos problemas antes que você perceba',
  },
  {
    slide: 6,
    title: 'Sua empresa merece suporte de verdade',
    subtitle: 'Fale com a Master Remote e teste gratuitamente',
    footer: 'masterremote.com.br',
  },
];

function _log(data) {
  console.log(JSON.stringify(data));
}

function _escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _wrapText(text, maxWidthPx, fontSize, charWidthRatio) {
  const avgCharWidth = fontSize * charWidthRatio;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidthPx / avgCharWidth));
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function _setupFontconfig() {
  const confPath = path.join(PROJECT_ROOT, '.aiox', 'fontconfig', 'compose-slides-fonts.conf');
  const cacheDir = path.join(PROJECT_ROOT, '.aiox', 'fontconfig', 'cache');
  await fs.mkdir(path.dirname(confPath), { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  const confXml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONTS_DIR.replace(/\\/g, '/')}</dir>
  <cachedir>${cacheDir.replace(/\\/g, '/')}</cachedir>
</fontconfig>
`;
  await fs.writeFile(confPath, confXml);
  process.env.FONTCONFIG_FILE = confPath;
}

function _buildOverlaySvg({ title, subtitle, footer }) {
  const titleLines = _wrapText(title, MAX_TEXT_WIDTH, TITLE_FONT_SIZE, TITLE_CHAR_WIDTH_RATIO);
  const subtitleLines = _wrapText(subtitle, MAX_TEXT_WIDTH, SUBTITLE_FONT_SIZE, SUBTITLE_CHAR_WIDTH_RATIO);

  const titleBlockHeight = titleLines.length * TITLE_LINE_HEIGHT;
  const lineGap = 24;
  const subtitleBlockHeight = subtitleLines.length * SUBTITLE_LINE_HEIGHT;
  const footerGap = footer ? 16 : 0;
  const footerBlockHeight = footer ? FOOTER_LINE_HEIGHT : 0;

  const overlayHeight = Math.round(
    PADDING_TOP + titleBlockHeight + lineGap + subtitleBlockHeight + footerGap + footerBlockHeight + PADDING_BOTTOM,
  );

  const titleTspans = titleLines
    .map((line, i) => `<tspan x="${MARGIN_X}" dy="${i === 0 ? 0 : TITLE_LINE_HEIGHT}">${_escapeXml(line)}</tspan>`)
    .join('');

  const subtitleTspans = subtitleLines
    .map((line, i) => `<tspan x="${MARGIN_X}" dy="${i === 0 ? 0 : SUBTITLE_LINE_HEIGHT}">${_escapeXml(line)}</tspan>`)
    .join('');

  const lineY = PADDING_TOP + titleBlockHeight + 8;
  const subtitleStartY = PADDING_TOP + titleBlockHeight + lineGap + SUBTITLE_FONT_SIZE * 0.8;
  const footerStartY = subtitleStartY + (subtitleLines.length - 1) * SUBTITLE_LINE_HEIGHT + footerGap + FOOTER_FONT_SIZE * 0.8;

  const footerSvg = footer
    ? `<text x="${MARGIN_X}" y="${footerStartY}" font-family="Ubuntu" font-weight="700" font-size="${FOOTER_FONT_SIZE}" fill="#FFFFFF">${_escapeXml(footer)}</text>`
    : '';

  const svg = `
<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${CANVAS_SIZE}" height="${overlayHeight}" fill="#000000" opacity="0.62" />
  <text x="${MARGIN_X}" y="${PADDING_TOP + TITLE_FONT_SIZE * 0.8}" font-family="Montserrat" font-weight="800" font-size="${TITLE_FONT_SIZE}" fill="#FFFFFF">${titleTspans}</text>
  <rect x="${MARGIN_X}" y="${lineY}" width="160" height="6" fill="${ACCENT_COLOR}" />
  <text x="${MARGIN_X}" y="${subtitleStartY}" font-family="Ubuntu" font-weight="700" font-size="${SUBTITLE_FONT_SIZE}" fill="#FFFFFF" opacity="0.8">${subtitleTspans}</text>
  ${footerSvg}
</svg>
`;

  return Buffer.from(svg);
}

async function main() {
  const startedAt = Date.now();
  await _setupFontconfig();

  const sharp = (await import('sharp')).default;

  await fs.mkdir(FINAL_DIR, { recursive: true });

  const logoBuffer = await sharp(LOGO_PATH)
    .resize({ width: LOGO_TARGET_WIDTH })
    .toBuffer();
  const logoMeta = await sharp(logoBuffer).metadata();

  _log({
    event: 'compose.start',
    totalSlides: SLIDES.length,
    outputDir: FINAL_DIR,
    ts: new Date().toISOString(),
  });

  const completed = [];

  for (const slideSpec of SLIDES) {
    const { slide } = slideSpec;
    const basePath = path.join(BASE_DIR, `slide-${slide}.png`);
    const finalPath = path.join(FINAL_DIR, `slide-${slide}.png`);

    _log({ event: 'compose.slide.start', slide, ts: new Date().toISOString() });
    const slideStartedAt = Date.now();

    try {
      await fs.access(basePath);
    } catch {
      _log({
        event: 'compose.slide.error',
        slide,
        errorType: 'MissingBaseImage',
        message: `Imagem-base não encontrada: ${basePath}`,
        ts: new Date().toISOString(),
      });
      process.stderr.write(
        `Falha no slide ${slide}: imagem-base ausente em ${basePath}\n` +
        `Slides concluídos antes da falha: ${completed.map((c) => c.slide).join(', ') || 'nenhum'}\n`,
      );
      process.exit(1);
    }

    const overlaySvg = _buildOverlaySvg(slideSpec);

    await sharp(basePath)
      .composite([
        { input: overlaySvg, top: 0, left: 0 },
        {
          input: logoBuffer,
          top: CANVAS_SIZE - logoMeta.height - LOGO_MARGIN,
          left: CANVAS_SIZE - logoMeta.width - LOGO_MARGIN,
        },
      ])
      .toFile(finalPath);

    const durationMs = Date.now() - slideStartedAt;
    completed.push({ slide, path: finalPath, durationMs });

    _log({
      event: 'compose.slide.success',
      slide,
      path: finalPath,
      durationMs,
      ts: new Date().toISOString(),
    });
  }

  const totalDurationMs = Date.now() - startedAt;

  _log({
    event: 'compose.complete',
    totalSlides: SLIDES.length,
    totalDurationMs,
    ts: new Date().toISOString(),
  });

  process.stdout.write(JSON.stringify({ slides: completed, totalDurationMs }, null, 2) + '\n');
}

main();
