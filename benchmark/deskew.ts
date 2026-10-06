import fs from 'node:fs/promises';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';

import {
  TesseractOcrEngine,
} from '../src/ocr/tesseract-engine.js';

import {
  preprocessImage,
} from '../src/preprocessing/strategies.js';

import {
  deskewImage,
} from '../src/preprocessing/deskew.js';

const cases = [
  {
    id:
      'printed-clean',

    fixture:
      'tests/fixtures/printed/printed-clean.png',

    truth:
      'benchmark/ground-truth/printed-clean.txt',
  },
  {
    id:
      'rotated',

    fixture:
      'tests/fixtures/degraded/rotated.png',

    truth:
      'benchmark/ground-truth/rotated.txt',
  },
  {
    id:
      'rotation-8deg',

    fixture:
      'tests/fixtures/degraded/rotation-8deg.png',

    truth:
      'benchmark/ground-truth/rotation-8deg.txt',
  },
  {
    id:
      'noisy',

    fixture:
      'tests/fixtures/degraded/noisy.png',

    truth:
      'benchmark/ground-truth/noisy.txt',
  },
  {
    id:
      'mixed-noise',

    fixture:
      'tests/fixtures/degraded/mixed-noise.png',

    truth:
      'benchmark/ground-truth/mixed-noise.txt',
  },
];

function pct(
  value: number,
): string {
  return (
    value * 100
  ).toFixed(2) + '%';
}

async function recognize(
  buffer: Buffer,
  expected: string,
) {
  const engine =
    new TesseractOcrEngine();

  const result =
    await engine.recognize(
      buffer,
    );

  return {
    metrics:
      calculateOcrMetrics(
        expected,
        result.text,
      ),

    confidence:
      result.confidence,

    durationMs:
      result.durationMs,
  };
}

async function main() {
  for (
    const item
    of cases
  ) {
    const [
      input,
      expected,
    ] =
      await Promise.all([
        fs.readFile(
          item.fixture,
        ),

        fs.readFile(
          item.truth,
          'utf8',
        ),
      ]);

    const baseline =
      await recognize(
        input,
        expected,
      );

    const medianNormalize =
      await preprocessImage(
        input,
        'median+normalize',
      );

    const filtered =
      await recognize(
        medianNormalize,
        expected,
      );

    const deskewed =
      await deskewImage(
        medianNormalize,
      );

    const final =
      await recognize(
        deskewed.buffer,
        expected,
      );

    console.log();
    console.log(
      `===== ${item.id} =====`,
    );

    console.log(
      'angle:',
      deskewed.detectedAngle,
    );

    console.log(
      'none:',
      pct(
        baseline.metrics.cer,
      ),
      pct(
        baseline.metrics.wer,
      ),
      'conf',
      baseline.confidence,
    );

    console.log(
      'median+normalize:',
      pct(
        filtered.metrics.cer,
      ),
      pct(
        filtered.metrics.wer,
      ),
      'conf',
      filtered.confidence,
    );

    console.log(
      'median+normalize+deskew:',
      pct(
        final.metrics.cer,
      ),
      pct(
        final.metrics.wer,
      ),
      'conf',
      final.confidence,
    );
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
