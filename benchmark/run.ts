import fs from 'node:fs/promises';
import path from 'node:path';

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

interface CaseResult {
  id: string;
  category: string;
  description: string;
  fixturePath: string;
  expected: string;
  obtained: string;
  confidence: number | null;
  durationMs: number;

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
  return `${(value * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
  await fs.mkdir(
    'benchmark/results',
    {
      recursive: true,
    },
  );

  const results: CaseResult[] = [];

  for (
    const benchmarkCase of benchmarkCases
  ) {
    console.log(
      `\n[OCR] ${benchmarkCase.id}`,
    );

    const [
      image,
      expected,
    ] = await Promise.all([
      fs.readFile(
        benchmarkCase.fixturePath,
      ),

      fs.readFile(
        benchmarkCase.groundTruthPath,
        'utf8',
      ),
    ]);

    const engine =
      new TesseractOcrEngine();

    const recognition =
      await engine.recognize(image);

    const metrics =
      calculateOcrMetrics(
        expected,
        recognition.text,
      );

    const result: CaseResult = {
      id: benchmarkCase.id,
      category:
        benchmarkCase.category,

      description:
        benchmarkCase.description,

      fixturePath:
        benchmarkCase.fixturePath,

      expected,
      obtained:
        recognition.text,

      confidence:
        recognition.confidence,

      durationMs:
        recognition.durationMs,

      metrics,
    };

    results.push(result);

    console.log(
      `  CER: ${percentage(metrics.cer)}`,
    );

    console.log(
      `  WER: ${percentage(metrics.wer)}`,
    );

    console.log(
      `  Confianza Tesseract: ${
        recognition.confidence === null
          ? 'N/D'
          : recognition.confidence.toFixed(2)
      }`,
    );

    console.log(
      `  Tiempo: ${recognition.durationMs.toFixed(2)} ms`,
    );
  }

  const aggregate =
    aggregateBenchmark(
      results.map(
        (result) => ({
          ...result.metrics,
          durationMs:
            result.durationMs,
        }),
      ),
    );

  const report = {
    generatedAt:
      new Date().toISOString(),

    engine: {
      name: 'tesseract.js',
      language: 'spa',
      preprocessing:
        'none-baseline',
    },

    cases: results,

    aggregate,
  };

  const jsonPath =
    path.join(
      'benchmark/results',
      'baseline.json',
    );

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      report,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const textReport = [
    'TEVI OCR — BASELINE',
    '===================',
    '',
    `Casos: ${results.length}`,
    `CER global: ${percentage(aggregate.cer)}`,
    `WER global: ${percentage(aggregate.wer)}`,
    `Tiempo total OCR: ${aggregate.totalDurationMs.toFixed(2)} ms`,
    `Tiempo promedio: ${aggregate.averageDurationMs.toFixed(2)} ms`,
    '',
    ...results.flatMap(
      (result) => [
        `[${result.id}]`,
        `CER: ${percentage(result.metrics.cer)}`,
        `WER: ${percentage(result.metrics.wer)}`,
        `Confianza: ${
          result.confidence === null
            ? 'N/D'
            : result.confidence.toFixed(2)
        }`,
        `Tiempo: ${result.durationMs.toFixed(2)} ms`,
        '',
      ],
    ),
  ].join('\n');

  await fs.writeFile(
    'benchmark/results/baseline.txt',
    `${textReport}\n`,
    'utf8',
  );

  console.log('\n');
  console.log(textReport);
  console.log(
    `Resultado JSON: ${jsonPath}`,
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
