/**
 * Printed OCR diagnostic on real photographs and regression fixtures.
 * Does NOT modify the productive pipeline or select a "winner".
 * Run: ./node_modules/.bin/tsx benchmark/printed-photo-diagnostics.ts
 * Optional: TEVI_OCR_DIAG_DIR="$HOME/Descargas/..." to choose output directory.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { TesseractOcrEngine } from '../src/ocr/tesseract-engine.js';
import { preprocessImage } from '../src/preprocessing/strategies.js';
import { preprocessForOcr } from '../src/preprocessing/pipeline.js';
import { calculateOcrMetrics } from '../src/metrics/ocr-metrics.js';

const samples = [
  { name: 'foto-real', file: 'tests/fixtures/camera/foto_texto_impreso.jpeg', truth: null },
  { name: 'impreso-limpio', file: 'tests/fixtures/printed/printed-clean.png', truth: 'benchmark/ground-truth/printed-clean.txt' },
  { name: 'rotado-4', file: 'tests/fixtures/degraded/rotated.png', truth: 'benchmark/ground-truth/rotated.txt' },
  { name: 'rotado-8', file: 'tests/fixtures/degraded/rotation-8deg.png', truth: 'benchmark/ground-truth/rotation-8deg.txt' },
] as const;

async function main() {
  const output = process.env.TEVI_OCR_DIAG_DIR ??
    path.join(os.homedir(), 'Descargas', 'tevi-ocr-evaluacion-impresos');
  await fs.mkdir(output, { recursive: true });
  const rows = [];

  for (const sample of samples) {
    const original = await fs.readFile(sample.file);
    const oriented = await sharp(original).rotate().png().toBuffer();
    const filtered = await preprocessImage(oriented, 'median+normalize');
    const pipeline = await preprocessForOcr(original);
    const truth = sample.truth ? await fs.readFile(sample.truth, 'utf8') : null;
    const alternatives = [
      { id: 'original', buffer: original },
      { id: 'orientado', buffer: oriented },
      { id: 'filtrado', buffer: filtered },
      { id: 'pipeline', buffer: pipeline.buffer },
    ];

    for (const candidate of alternatives) {
      const engine = new TesseractOcrEngine();
      const result = await engine.recognize(candidate.buffer);
      const metrics = truth === null ? null : calculateOcrMetrics(truth, result.text);
      const record = {
        sample: sample.name,
        variant: candidate.id,
        confidence: result.confidence,
        recognitionMs: Math.round(result.durationMs),
        textLength: result.text.length,
        detectedAngle: candidate.id === 'pipeline' ? pipeline.detectedAngle : null,
        cer: metrics?.cer ?? null,
        wer: metrics?.wer ?? null,
      };
      rows.push(record);

      await fs.writeFile(path.join(output,
        sample.name + '--' + candidate.id + '.txt'), result.text, 'utf8');
      if (sample.name === 'foto-real') {
        await fs.writeFile(path.join(output,
          sample.name + '--' + candidate.id + '.png'),
          await sharp(candidate.buffer).png().toBuffer());
      }
      console.log(JSON.stringify(record));
    }
  }
  await fs.writeFile(path.join(output, 'results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log('DIAGNOSTICO_COMPLETADO=1');
  console.log('RESULTADOS=' + output);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
