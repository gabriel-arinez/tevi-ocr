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
  preprocessForOcr,
} from '../src/preprocessing/pipeline.js';

interface CaseResult {
  id: string;
  angle: number;
  confidence: number | null;
  preprocessingMs: number;
  ocrMs: number;

  metrics: {
    characterDistance: number;
    wordDistance: number;
    referenceCharacters: number;
    referenceWords: number;
    cer: number;
    wer: number;
  };
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
    CaseResult[] = [];

  for (
    const benchmarkCase
    of benchmarkCases
  ) {
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

    const preprocessed =
      await preprocessForOcr(
        input,
      );

    const engine =
      new TesseractOcrEngine();

    const recognition =
      await engine.recognize(
        preprocessed.buffer,
      );

    const metrics =
      calculateOcrMetrics(
        expected,
        recognition.text,
      );

    results.push({
      id:
        benchmarkCase.id,

      angle:
        preprocessed.detectedAngle,

      confidence:
        recognition.confidence,

      preprocessingMs:
        preprocessed.durationMs,

      ocrMs:
        recognition.durationMs,

      metrics,
    });

    console.log(
      `[${benchmarkCase.id}] angle=${preprocessed.detectedAngle} CER=${percentage(metrics.cer)} WER=${percentage(metrics.wer)} conf=${recognition.confidence ?? 'N/D'} pre=${preprocessed.durationMs.toFixed(0)}ms`,
    );
  }

  const aggregate =
    aggregateBenchmark(
      results.map(
        (result) => ({
          characterDistance:
            result.metrics
              .characterDistance,

          wordDistance:
            result.metrics
              .wordDistance,

          referenceCharacters:
            result.metrics
              .referenceCharacters,

          referenceWords:
            result.metrics
              .referenceWords,

          durationMs:
            result.ocrMs,
        }),
      ),
    );

  const totalPreprocessingMs =
    results.reduce(
      (
        total,
        result,
      ) =>
        total +
        result.preprocessingMs,
      0,
    );

  const averagePreprocessingMs =
    totalPreprocessingMs /
    results.length;

  const falseSkewCandidates =
    results.filter(
      (result) =>
        ![
          'rotated',
          'rotation-8deg',
        ].includes(
          result.id,
        ) &&
        Math.abs(
          result.angle,
        ) >= 0.5,
    );

  const report = {
    generatedAt:
      new Date().toISOString(),

    pipeline: [
      'auto-orient',
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
    'benchmark/results/final-preprocessing.json',
    JSON.stringify(
      report,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const lines = [
    'TEVI OCR — F5 FINAL PREPROCESSING',
    '=================================',
    '',
    `CER global: ${percentage(aggregate.cer)}`,
    `WER global: ${percentage(aggregate.wer)}`,
    `OCR promedio: ${aggregate.averageDurationMs.toFixed(2)} ms`,
    `Preprocesamiento promedio: ${averagePreprocessingMs.toFixed(2)} ms`,
    `Falsos deskew: ${falseSkewCandidates.length}`,
    '',
    ...results.map(
      (result) =>
        `[${result.id}] angle=${result.angle} CER=${percentage(result.metrics.cer)} WER=${percentage(result.metrics.wer)} conf=${result.confidence ?? 'N/D'} pre=${result.preprocessingMs.toFixed(2)} ms`,
    ),
  ];

  const textReport =
    lines.join(
      '\n',
    );

  await fs.writeFile(
    'benchmark/results/final-preprocessing.txt',
    `${textReport}\n`,
    'utf8',
  );

  console.log();
  console.log(
    textReport,
  );
}

main().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode = 1;
  },
);
