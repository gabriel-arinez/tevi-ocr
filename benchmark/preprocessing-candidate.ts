import fs from 'node:fs/promises';

import {
  benchmarkCases,
} from './cases.js';

import {
  aggregateBenchmark,
} from './aggregate.js';

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

interface CandidateResult {
  id: string;
  angle: number;
  preprocessingMs: number;
  ocrMs: number;
  confidence: number | null;

  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;

  cer: number;
  wer: number;
}

function percentage(
  value: number,
): string {
  return `${(
    value * 100
  ).toFixed(2)}%`;
}

async function main(): Promise<void> {
  const results:
    CandidateResult[] = [];

  for (
    const benchmarkCase
    of benchmarkCases
  ) {
    console.log();
    console.log(
      `===== ${benchmarkCase.id} =====`,
    );

    const [
      input,
      expected,
    ] =
      await Promise.all([
        fs.readFile(
          benchmarkCase.fixturePath,
        ),

        fs.readFile(
          benchmarkCase.groundTruthPath,
          'utf8',
        ),
      ]);

    const preprocessingStarted =
      process.hrtime.bigint();

    const medianNormalized =
      await preprocessImage(
        input,
        'median+normalize',
      );

    const deskewed =
      await deskewImage(
        medianNormalized,
      );

    const preprocessingFinished =
      process.hrtime.bigint();

    const preprocessingMs =
      Number(
        preprocessingFinished -
        preprocessingStarted,
      ) /
      1_000_000;

    const engine =
      new TesseractOcrEngine();

    const recognition =
      await engine.recognize(
        deskewed.buffer,
      );

    const metrics =
      calculateOcrMetrics(
        expected,
        recognition.text,
      );

    const result:
      CandidateResult = {
        id:
          benchmarkCase.id,

        angle:
          deskewed.detectedAngle,

        preprocessingMs,

        ocrMs:
          recognition.durationMs,

        confidence:
          recognition.confidence,

        characterDistance:
          metrics.characterDistance,

        wordDistance:
          metrics.wordDistance,

        referenceCharacters:
          metrics.referenceCharacters,

        referenceWords:
          metrics.referenceWords,

        cer:
          metrics.cer,

        wer:
          metrics.wer,
      };

    results.push(
      result,
    );

    console.log(
      'angle:',
      result.angle,
    );

    console.log(
      'CER:',
      percentage(
        result.cer,
      ),
    );

    console.log(
      'WER:',
      percentage(
        result.wer,
      ),
    );

    console.log(
      'confidence:',
      result.confidence,
    );

    console.log(
      'preprocessing:',
      `${result.preprocessingMs.toFixed(2)} ms`,
    );

    console.log(
      'OCR:',
      `${result.ocrMs.toFixed(2)} ms`,
    );
  }

  const aggregate =
    aggregateBenchmark(
      results.map(
        (item) => ({
          characterDistance:
            item.characterDistance,

          wordDistance:
            item.wordDistance,

          referenceCharacters:
            item.referenceCharacters,

          referenceWords:
            item.referenceWords,

          durationMs:
            item.ocrMs,
        }),
      ),
    );

  const totalPreprocessingMs =
    results.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.preprocessingMs,
      0,
    );

  const averagePreprocessingMs =
    results.length === 0
      ? 0
      : totalPreprocessingMs /
        results.length;

  const falseSkewCandidates =
    results.filter(
      (item) =>
        ![
          'rotated',
          'rotation-8deg',
        ].includes(
          item.id,
        ) &&
        Math.abs(
          item.angle,
        ) >= 0.5,
    );

  const report = {
    generatedAt:
      new Date().toISOString(),

    pipeline: [
      'median(3)',
      'normalize',
      'deskew',
    ],

    aggregate,

    preprocessing: {
      totalMs:
        totalPreprocessingMs,

      averageMs:
        averagePreprocessingMs,
    },

    falseSkewCandidates,

    cases:
      results,
  };

  await fs.mkdir(
    'benchmark/results',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/preprocessing-candidate.json',
    JSON.stringify(
      report,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log();
  console.log(
    '===== RESULTADO GLOBAL =====',
  );

  console.log(
    'CER:',
    percentage(
      aggregate.cer,
    ),
  );

  console.log(
    'WER:',
    percentage(
      aggregate.wer,
    ),
  );

  console.log(
    'OCR promedio:',
    `${aggregate.averageDurationMs.toFixed(2)} ms`,
  );

  console.log(
    'Preprocesamiento promedio:',
    `${averagePreprocessingMs.toFixed(2)} ms`,
  );

  console.log();
  console.log(
    '===== POSIBLES FALSOS DESKEW =====',
  );

  if (
    falseSkewCandidates.length === 0
  ) {
    console.log(
      'Ninguno.',
    );
  } else {
    for (
      const item
      of falseSkewCandidates
    ) {
      console.log(
        item.id,
        item.angle,
      );
    }
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
