import fs from 'node:fs/promises';
import { TesseractOcrEngine } from '../src/ocr/tesseract-engine.js';
import { buildGeometricReadingView } from '../src/ocr/printed-geometric-layout.js';

async function main() {
const photo = await fs.readFile('tests/fixtures/camera/foto_texto_impreso.jpeg');
const engine = new TesseractOcrEngine();
const result = await engine.recognize(photo, { includeSpatialEvidence: true });
const view = buildGeometricReadingView(result.spatialEvidence?.words ?? []);
console.log(JSON.stringify({
  confidence: result.confidence,
  wordCount: result.spatialEvidence?.wordCount,
  blocks: view.blocks.map(block => ({
    text: block.text,
    bbox: block.bbox,
    meanConfidence: block.meanConfidence,
  })),
  rawText: result.text,
  reconstructedText: view.text,
}, null, 2));
if (!view.blocks.length || !view.text.trim()) {
  console.error('ERROR: no geometric blocks were reconstructed.');
  process.exitCode = 1;
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
