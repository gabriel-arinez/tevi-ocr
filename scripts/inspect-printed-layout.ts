import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { TesseractOcrEngine } from '../src/ocr/tesseract-engine.js';
import { buildPrintedTextView } from '../src/ocr/printed-document-layout.js';

async function main() {
  const imagePath = process.argv[2] ?? 'tests/fixtures/camera/foto_texto_impreso.jpeg';
  const out = process.argv[3] ?? path.join(os.homedir(), 'Descargas', 'tevi-ocr-inspeccion');
  await fs.mkdir(out, { recursive: true });

  const input = await fs.readFile(imagePath);
  const engine = new TesseractOcrEngine();
  const result = await engine.recognize(input, { includeSpatialEvidence: true });
  const view = buildPrintedTextView(result.text);
  await fs.writeFile(path.join(out, 'original.txt'), view.raw);
  await fs.writeFile(path.join(out, 'legible.txt'), view.readable);
  await fs.writeFile(path.join(out, 'coordenadas.json'), JSON.stringify({
    source: path.basename(imagePath),
    confidence: result.confidence,
    durationMs: result.durationMs,
    spatialEvidence: result.spatialEvidence,
  }, null, 2));

  const meta = await sharp(input).metadata();
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  if (!width || !height) throw new Error('Dimensiones de imagen inválidas');

  const safe = (value: string) => value.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rects = (result.spatialEvidence?.words ?? []).map(word => {
    const box = word.bbox;
    const color = word.confidence >= 50 ? '#16a34a' : '#dc2626';
    return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="none" stroke="${color}" stroke-width="2"><title>${safe(word.text)} (${word.confidence.toFixed(2)}%)</title></rect>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
  await fs.writeFile(path.join(out, 'cajas.svg'), svg);
  console.log(JSON.stringify({
    success: true, source: imagePath, confidence: result.confidence,
    words: result.spatialEvidence?.wordCount ?? 0,
    lowConfidenceWords: result.spatialEvidence?.lowConfidenceWordCount ?? 0,
    output: out,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
