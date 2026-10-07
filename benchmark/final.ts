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
  assessOcrQuality,
  type OcrQualityAssessment,
} from '../src/ocr/ocr-quality.js';

import {
  TesseractOcrEngine,
} from '../src/ocr/tesseract-engine.js';

import {
  preprocessForOcr,
} from '../src/preprocessing/pipeline.js';


interface FinalBenchmarkCase {
  id: string;
  angle: number;
  confidence: number | null;
  quality: OcrQualityAssessment;

  preprocessingMs: number;
  ocrMs: number;
  totalMs: number;

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
    FinalBenchmarkCase[] = [];

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

    const quality =
      assessOcrQuality({
        text:
          recognition.text,

        confidence:
          recognition.confidence,
      });

    const totalMs =
      preprocessed.durationMs +
      recognition.durationMs;

    const result:
      FinalBenchmarkCase = {
        id:
          benchmarkCase.id,

        angle:
          preprocessed.detectedAngle,

        confidence:
          recognition.confidence,

        quality,

        preprocessingMs:
          preprocessed.durationMs,

        ocrMs:
          recognition.durationMs,

        totalMs,

        metrics,
      };

    results.push(
      result,
    );

    console.log(
      [
        `[${result.id}]`,
        `CER=${percentage(result.metrics.cer)}`,
        `WER=${percentage(result.metrics.wer)}`,
        `conf=${result.confidence ?? 'N/D'}`,
        `quality=${result.quality.status}`,
        `angle=${result.angle}`,
        `total=${result.totalMs.toFixed(0)}ms`,
      ].join(' '),
    );
  }

  const aggregate =
    aggregateBenchmark(
      results.map(
        (result) => ({
          ...result.metrics,
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

  const totalPipelineMs =
    results.reduce(
      (
        total,
        result,
      ) =>
        total +
        result.totalMs,
      0,
    );

  const averagePreprocessingMs =
    totalPreprocessingMs /
    results.length;

  const averagePipelineMs =
    totalPipelineMs /
    results.length;

  const qualityCounts = {
    ACCEPTABLE:
      results.filter(
        (result) =>
          result.quality.status ===
          'ACCEPTABLE',
      ).length,

    REVIEW:
      results.filter(
        (result) =>
          result.quality.status ===
          'REVIEW',
      ).length,

    INSUFFICIENT:
      results.filter(
        (result) =>
          result.quality.status ===
          'INSUFFICIENT',
      ).length,
  };

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

    scope:
      'productive-printed-ocr',

    engine: {
      name:
        'tesseract.js',

      language:
        'spa',
    },

    pipeline: [
      'input-validation',
      'auto-orient',
      'median(3)',
      'normalize',
      'deskew',
      'tesseract-spa',
      'quality-assessment',
    ],

    cases:
      results.length,

    aggregate,

    preprocessing: {
      totalMs:
        totalPreprocessingMs,

      averageMs:
        averagePreprocessingMs,
    },

    pipelineTiming: {
      totalMs:
        totalPipelineMs,

      averageMs:
        averagePipelineMs,
    },

    quality:
      qualityCounts,

    falseSkewCandidates:
      falseSkewCandidates.map(
        (result) => ({
          id:
            result.id,

          angle:
            result.angle,
        }),
      ),

    results,
  };

  await fs.mkdir(
    'benchmark/results',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/final.json',
    JSON.stringify(
      report,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const lines = [
    'TEVI OCR — FINAL PRODUCTIVE BENCHMARK',
    '=====================================',
    '',
    `Casos: ${results.length}`,
    `CER global: ${percentage(aggregate.cer)}`,
    `WER global: ${percentage(aggregate.wer)}`,
    `OCR promedio: ${aggregate.averageDurationMs.toFixed(2)} ms`,
    `Preprocesamiento promedio: ${averagePreprocessingMs.toFixed(2)} ms`,
    `Pipeline promedio: ${averagePipelineMs.toFixed(2)} ms`,
    '',
    'Calidad:',
    `  ACCEPTABLE: ${qualityCounts.ACCEPTABLE}`,
    `  REVIEW: ${qualityCounts.REVIEW}`,
    `  INSUFFICIENT: ${qualityCounts.INSUFFICIENT}`,
    '',
    `Falsos deskew: ${falseSkewCandidates.length}`,
    '',
    ...results.map(
      (result) =>
        [
          `[${result.id}]`,
          `CER=${percentage(result.metrics.cer)}`,
          `WER=${percentage(result.metrics.wer)}`,
          `conf=${result.confidence ?? 'N/D'}`,
          `quality=${result.quality.status}`,
          `angle=${result.angle}`,
          `pre=${result.preprocessingMs.toFixed(2)}ms`,
          `ocr=${result.ocrMs.toFixed(2)}ms`,
          `total=${result.totalMs.toFixed(2)}ms`,
        ].join(' '),
    ),
  ];

  const textReport =
    lines.join(
      '\n',
    );

  await fs.writeFile(
    'benchmark/results/final.txt',
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
