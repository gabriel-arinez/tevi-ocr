import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import sharp from 'sharp';

import {
  createWorker,
  OEM,
  PSM,
} from 'tesseract.js';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';

import {
  preprocessImage,
  preprocessingStrategies,
  type PreprocessingStrategy,
} from '../src/preprocessing/strategies.js';

import {
  detectSkewAngle,
} from '../src/preprocessing/deskew.js';

interface HandwritingSample {
  id: string;
  category: string;
  fixturePath: string;
  groundTruthPath: string;
  writerId: string;
  capture: string;
}

interface ResultRow {
  id: string;
  category: string;
  writerId: string;
  strategy: string;
  psm: string;
  text: string;
  confidence: number | null;
  preprocessingDurationMs: number;
  ocrDurationMs: number;
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  cer: number;
  wer: number;
}

interface AggregateRow {
  strategy: string;
  psm: string;
  cases: number;
  cer: number;
  wer: number;
  averageConfidence: number | null;
  averagePreprocessingDurationMs: number;
  averageOcrDurationMs: number;
}

const require =
  createRequire(__filename);

function resolveSpanishLangPath(): string {
  const modulePath =
    require.resolve(
      '@tesseract.js-data/spa',
    );

  return path.join(
    path.dirname(modulePath),
    '4.0.0',
  );
}

const psmConfigurations = [
  {
    id: 'AUTO',
    value: PSM.AUTO,
  },
  {
    id: 'SINGLE_BLOCK',
    value: PSM.SINGLE_BLOCK,
  },
  {
    id: 'SPARSE_TEXT',
    value: PSM.SPARSE_TEXT,
  },
] as const;

function percentage(
  value: number,
): string {
  return `${(value * 100).toFixed(2)}%`;
}

function aggregate(
  rows: readonly ResultRow[],
): AggregateRow {
  const characterDistance =
    rows.reduce(
      (sum, row) =>
        sum + row.characterDistance,
      0,
    );

  const wordDistance =
    rows.reduce(
      (sum, row) =>
        sum + row.wordDistance,
      0,
    );

  const referenceCharacters =
    rows.reduce(
      (sum, row) =>
        sum + row.referenceCharacters,
      0,
    );

  const referenceWords =
    rows.reduce(
      (sum, row) =>
        sum + row.referenceWords,
      0,
    );

  const confidenceValues =
    rows
      .map((row) => row.confidence)
      .filter(
        (
          value,
        ): value is number =>
          value !== null,
      );

  return {
    strategy:
      rows[0]?.strategy ?? 'N/A',

    psm:
      rows[0]?.psm ?? 'N/A',

    cases:
      rows.length,

    cer:
      referenceCharacters > 0
        ? characterDistance /
          referenceCharacters
        : 0,

    wer:
      referenceWords > 0
        ? wordDistance /
          referenceWords
        : 0,

    averageConfidence:
      confidenceValues.length > 0
        ? confidenceValues.reduce(
            (sum, value) =>
              sum + value,
            0,
          ) /
          confidenceValues.length
        : null,

    averagePreprocessingDurationMs:
      rows.length > 0
        ? rows.reduce(
            (sum, row) =>
              sum +
              row.preprocessingDurationMs,
            0,
          ) /
          rows.length
        : 0,

    averageOcrDurationMs:
      rows.length > 0
        ? rows.reduce(
            (sum, row) =>
              sum +
              row.ocrDurationMs,
            0,
          ) /
          rows.length
        : 0,
  };
}

async function main(): Promise<void> {
  const manifest =
    JSON.parse(
      await fs.readFile(
        'benchmark/handwriting-manifest.json',
        'utf8',
      ),
    ) as HandwritingSample[];

  console.log(
    '===== DIAGNÓSTICO DE ÁNGULO =====',
  );

  for (const sample of manifest) {
    const raw =
      await fs.readFile(
        sample.fixturePath,
      );

    const oriented =
      await sharp(raw)
        .rotate()
        .png()
        .toBuffer();

    const medianNormalized =
      await preprocessImage(
        oriented,
        'median+normalize',
      );

    const rawAngle =
      await detectSkewAngle(
        oriented,
      );

    const filteredAngle =
      await detectSkewAngle(
        medianNormalized,
      );

    console.log(
      [
        sample.id,
        `raw=${rawAngle.angle}`,
        `rawScore=${rawAngle.score.toFixed(0)}`,
        `medianNormalize=${filteredAngle.angle}`,
        `medianNormalizeScore=${filteredAngle.score.toFixed(0)}`,
      ].join(' | '),
    );
  }

  const worker =
    await createWorker(
      'spa',
      OEM.LSTM_ONLY,
      {
        langPath:
          resolveSpanishLangPath(),

        gzip: true,

        cacheMethod:
          'none',

        logger:
          () => undefined,
      },
    );

  const results:
    ResultRow[] = [];

  try {
    for (
      const strategy
      of preprocessingStrategies
    ) {
      for (
        const psm
        of psmConfigurations
      ) {
        await worker.setParameters({
          tessedit_pageseg_mode:
            psm.value,
        });

        console.log();
        console.log(
          `===== ${strategy} / ${psm.id} =====`,
        );

        for (
          const sample
          of manifest
        ) {
          const raw =
            await fs.readFile(
              sample.fixturePath,
            );

          const expected =
            await fs.readFile(
              sample.groundTruthPath,
              'utf8',
            );

          /*
           * Solo orientación EXIF.
           * NO se ejecuta deskew.
           */
          const oriented =
            await sharp(raw)
              .rotate()
              .png()
              .toBuffer();

          const preprocessingStartedAt =
            process.hrtime.bigint();

          const input =
            await preprocessImage(
              oriented,
              strategy as
                PreprocessingStrategy,
            );

          const preprocessingFinishedAt =
            process.hrtime.bigint();

          const preprocessingDurationMs =
            Number(
              preprocessingFinishedAt -
              preprocessingStartedAt,
            ) /
            1_000_000;

          const ocrStartedAt =
            process.hrtime.bigint();

          const recognition =
            await worker.recognize(
              input,
            );

          const ocrFinishedAt =
            process.hrtime.bigint();

          const ocrDurationMs =
            Number(
              ocrFinishedAt -
              ocrStartedAt,
            ) /
            1_000_000;

          const text =
            recognition.data.text ?? '';

          const metrics =
            calculateOcrMetrics(
              expected,
              text,
            );

          const confidence =
            Number.isFinite(
              recognition.data.confidence,
            )
              ? recognition.data.confidence
              : null;

          const row:
            ResultRow = {
              id:
                sample.id,

              category:
                sample.category,

              writerId:
                sample.writerId,

              strategy,

              psm:
                psm.id,

              text,

              confidence,

              preprocessingDurationMs,

              ocrDurationMs,

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

          results.push(row);

          console.log(
            [
              sample.id,
              `CER=${percentage(row.cer)}`,
              `WER=${percentage(row.wer)}`,
              `conf=${row.confidence ?? 'N/D'}`,
              `pre=${preprocessingDurationMs.toFixed(0)}ms`,
              `ocr=${ocrDurationMs.toFixed(0)}ms`,
            ].join(' | '),
          );
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  const aggregates:
    AggregateRow[] = [];

  for (
    const strategy
    of preprocessingStrategies
  ) {
    for (
      const psm
      of psmConfigurations
    ) {
      aggregates.push(
        aggregate(
          results.filter(
            (row) =>
              row.strategy ===
                strategy &&
              row.psm ===
                psm.id,
          ),
        ),
      );
    }
  }

  const sorted =
    [...aggregates]
      .sort(
        (
          a,
          b,
        ) =>
          a.cer -
            b.cer ||
          a.wer -
            b.wer,
      );

  await fs.mkdir(
    'benchmark/results',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/handwriting-preprocessing-matrix.json',
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        corpusSize:
          manifest.length,

        strategies:
          preprocessingStrategies,

        psmConfigurations:
          psmConfigurations.map(
            (item) => ({
              id: item.id,
              value: item.value,
            }),
          ),

        aggregates:
          sorted,

        results,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const report:
    string[] = [
      'TEVI OCR — F7.3A MATRIZ SIN DESKEW',
      '===================================',
      '',
      'RANKING GLOBAL',
      '',
    ];

  for (
    const row
    of sorted
  ) {
    report.push(
      [
        row.strategy.padEnd(30),
        row.psm.padEnd(14),
        `CER ${percentage(row.cer).padStart(7)}`,
        `WER ${percentage(row.wer).padStart(7)}`,
        `conf ${
          row.averageConfidence === null
            ? 'N/D'
            : row.averageConfidence.toFixed(1)
        }`,
        `pre ${row.averagePreprocessingDurationMs.toFixed(0)}ms`,
        `ocr ${row.averageOcrDurationMs.toFixed(0)}ms`,
      ].join(' | '),
    );
  }

  report.push(
    '',
    'MEJOR POR MUESTRA',
    '',
  );

  for (
    const sample
    of manifest
  ) {
    const candidates =
      results
        .filter(
          (row) =>
            row.id ===
            sample.id,
        )
        .sort(
          (
            a,
            b,
          ) =>
            a.cer -
              b.cer ||
            a.wer -
              b.wer,
        );

    const best =
      candidates[0];

    if (!best) {
      continue;
    }

    report.push(
      [
        `[${sample.id}]`,
        `${best.strategy}/${best.psm}`,
        `CER=${percentage(best.cer)}`,
        `WER=${percentage(best.wer)}`,
        `conf=${best.confidence ?? 'N/D'}`,
      ].join(' '),
    );
  }

  const text =
    report.join('\n');

  await fs.writeFile(
    'benchmark/results/handwriting-preprocessing-matrix.txt',
    `${text}\n`,
    'utf8',
  );

  console.log();
  console.log(text);
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
