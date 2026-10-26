import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TesseractOcrEngine } from '../src/ocr/tesseract-engine.js';
import { prepareRegionForSecondReading } from '../src/ocr/printed-region-review.js';

async function main() {
  const file = process.argv[2] ?? 'tests/fixtures/camera/foto_texto_impreso.jpeg';
  const out = process.argv[3] ?? path.join(os.homedir(), 'Descargas', 'tevi-ocr-regiones');
  await fs.mkdir(out, { recursive: true });
  const image = await fs.readFile(file);
  const engine = new TesseractOcrEngine();
  const initial = await engine.recognize(image, { includeSpatialEvidence: true });
  const candidates = (initial.spatialEvidence?.words ?? [])
    .filter(w => w.confidence >= 0 && w.confidence < 50)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 5);
  const results = [];
  for (const [i, word] of candidates.entries()) {
    const region = await prepareRegionForSecondReading(image, word);
    if (!region) continue;
    const label = String(i + 1).padStart(2, '0');
    await fs.writeFile(path.join(out, label + '-region.png'), region.original);
    const [normal, contrast] = await Promise.all([
      engine.recognize(region.original),
      engine.recognize(region.contrast),
    ]);
    results.push({
      source: { text: word.text, confidence: word.confidence, bbox: word.bbox },
      region: region.region,
      readings: [
        { strategy: 'region-original', text: normal.text, confidence: normal.confidence },
        { strategy: 'region-normalized', text: contrast.text, confidence: contrast.confidence },
      ],
      appliedCorrection: false,
      note: 'La comparación no implica que la segunda lectura sea correcta.',
    });
  }
  await fs.writeFile(path.join(out, 'comparacion.json'), JSON.stringify({
    source: path.basename(file), originalOCRConfidence: initial.confidence,
    comparisons: results, OCRTextNeverModified: true,
  }, null, 2));
  console.log(JSON.stringify({ evaluated: results.length, output: out }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
