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
  preprocessingStrategies,
} from '../src/preprocessing/strategies.js';

interface StrategyCaseResult {
  caseId: string;
  strategy: string;
  cer: number;
  wer: number;
  confidence: number | null;
  durationMs: number;
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
}

function percent(
  value: number,
): string {
  return `${(
    value * 100
  ).toFixed(2)}%`;
}

async function main(): Promise<void> {
  const results:
    StrategyCaseResult[] = [];

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

    for (
      const strategy
      of preprocessingStrategies
    ) {
      console.log(
        `[${benchmarkCase.id}] ${strategy}`,
      );

      const preprocessed =
        await preprocessImage(
          input,
          strategy,
        );

      const engine =
        new TesseractOcrEngine();

      const recognition =
        await engine.recognize(
          preprocessed,
        );

      const metrics =
        calculateOcrMetrics(
          expected,
          recognition.text,
        );

      results.push({
        caseId:
          benchmarkCase.id,

        strategy,

        cer:
          metrics.cer,

        wer:
          metrics.wer,

        confidence:
          recognition.confidence,

        durationMs:
          recognition.durationMs,

        characterDistance:
          metrics.characterDistance,

        wordDistance:
          metrics.wordDistance,

        referenceCharacters:
          metrics.referenceCharacters,

        referenceWords:
          metrics.referenceWords,
      });

      console.log(
        `  CER ${percent(metrics.cer)} | WER ${percent(metrics.wer)} | conf ${recognition.confidence ?? 'N/D'}`,
      );
    }
  }

  const strategies =
    preprocessingStrategies.map(
      (strategy) => {
        const strategyCases =
          results.filter(
            (item) =>
              item.strategy ===
              strategy,
          );

        const aggregate =
          aggregateBenchmark(
            strategyCases.map(
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
                  item.durationMs,
              }),
            ),
          );

        return {
          strategy,
          aggregate,
          cases:
            strategyCases,
        };
      },
    );

  await fs.mkdir(
    'benchmark/results',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/preprocessing.json',
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),
        strategies,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const lines: string[] = [
    'TEVI OCR — PREPROCESSING MATRIX',
    '================================',
    '',
    'GLOBAL',
    '',
  ];

  for (
    const entry
    of strategies
  ) {
    lines.push(
      `${entry.strategy.padEnd(32)} CER ${percent(entry.aggregate.cer).padStart(7)}  WER ${percent(entry.aggregate.wer).padStart(7)}  avg ${entry.aggregate.averageDurationMs.toFixed(0)} ms`,
    );
  }

  lines.push(
    '',
    'POR CASO',
    '',
  );

  for (
    const benchmarkCase
    of benchmarkCases
  ) {
    lines.push(
      `[${benchmarkCase.id}]`,
    );

    const caseResults =
      results
        .filter(
          (item) =>
            item.caseId ===
            benchmarkCase.id,
        )
        .sort(
          (a, b) =>
            a.cer - b.cer ||
            a.wer - b.wer,
        );

    for (
      const item
      of caseResults
    ) {
      lines.push(
        `${item.strategy.padEnd(32)} CER ${percent(item.cer).padStart(7)}  WER ${percent(item.wer).padStart(7)}  conf ${String(item.confidence ?? 'N/D').padStart(5)}`,
      );
    }

    lines.push('');
  }

  const report =
    lines.join('\n');

  await fs.writeFile(
    'benchmark/results/preprocessing.txt',
    `${report}\n`,
    'utf8',
  );

  console.log();
  console.log(report);
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
