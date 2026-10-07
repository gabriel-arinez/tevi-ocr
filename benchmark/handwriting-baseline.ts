import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  createWorker,
  OEM,
  PSM,
} from 'tesseract.js';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';

import {
  preprocessForOcr,
} from '../src/preprocessing/pipeline.js';

interface HandwritingSample {
  id: string;
  category: string;
  fixturePath: string;
  groundTruthPath: string;
  writerId: string;
  capture: string;
}

interface PreparedSample {
  sample: HandwritingSample;
  expected: string;
  raw: Buffer;
  preprocessed: Buffer;
  preprocessingDurationMs: number;
  detectedAngle: number;
}

interface ResultRow {
  id: string;
  category: string;
  writerId: string;
  pipeline: 'RAW' | 'PREPROCESSED';
  psm: string;
  psmValue: PSM;
  text: string;
  confidence: number | null;
  durationMs: number;
  preprocessingDurationMs: number;
  detectedAngle: number;
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  cer: number;
  wer: number;
}

interface AggregateRow {
  pipeline: string;
  psm: string;
  cases: number;
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  cer: number;
  wer: number;
  averageConfidence: number | null;
  averageOcrDurationMs: number;
  averagePreprocessingDurationMs: number;
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
    pipeline:
      rows[0]?.pipeline ?? 'N/A',

    psm:
      rows[0]?.psm ?? 'N/A',

    cases:
      rows.length,

    characterDistance,

    wordDistance,

    referenceCharacters,

    referenceWords,

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

    averageOcrDurationMs:
      rows.length > 0
        ? rows.reduce(
            (sum, row) =>
              sum + row.durationMs,
            0,
          ) /
          rows.length
        : 0,

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

  const prepared:
    PreparedSample[] = [];

  console.log(
    '===== PREPARAR CORPUS =====',
  );

  for (
    const sample
    of manifest
  ) {
    const [
      raw,
      expected,
    ] =
      await Promise.all([
        fs.readFile(
          sample.fixturePath,
        ),

        fs.readFile(
          sample.groundTruthPath,
          'utf8',
        ),
      ]);

    const preprocessing =
      await preprocessForOcr(
        raw,
      );

    prepared.push({
      sample,
      expected,
      raw,
      preprocessed:
        preprocessing.buffer,

      preprocessingDurationMs:
        preprocessing.durationMs,

      detectedAngle:
        preprocessing.detectedAngle,
    });

    console.log(
      `${sample.id} | category=${sample.category} | angle=${preprocessing.detectedAngle} | preprocessing=${preprocessing.durationMs.toFixed(0)}ms`,
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
      const psm
      of psmConfigurations
    ) {
      await worker.setParameters({
        tessedit_pageseg_mode:
          psm.value,
      });

      for (
        const pipeline
        of [
          'RAW',
          'PREPROCESSED',
        ] as const
      ) {
        console.log();
        console.log(
          `===== ${pipeline} / ${psm.id} =====`,
        );

        for (
          const item
          of prepared
        ) {
          const input =
            pipeline === 'RAW'
              ? item.raw
              : item.preprocessed;

          const startedAt =
            process.hrtime.bigint();

          const recognition =
            await worker.recognize(
              input,
            );

          const finishedAt =
            process.hrtime.bigint();

          const durationMs =
            Number(
              finishedAt -
              startedAt,
            ) /
            1_000_000;

          const text =
            recognition.data.text ?? '';

          const metrics =
            calculateOcrMetrics(
              item.expected,
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
                item.sample.id,

              category:
                item.sample.category,

              writerId:
                item.sample.writerId,

              pipeline,

              psm:
                psm.id,

              psmValue:
                psm.value,

              text,

              confidence,

              durationMs,

              preprocessingDurationMs:
                pipeline ===
                'PREPROCESSED'
                  ? item
                      .preprocessingDurationMs
                  : 0,

              detectedAngle:
                pipeline ===
                'PREPROCESSED'
                  ? item.detectedAngle
                  : 0,

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
              `[${row.id}]`,
              `CER=${percentage(row.cer)}`,
              `WER=${percentage(row.wer)}`,
              `conf=${row.confidence ?? 'N/D'}`,
              `ocr=${row.durationMs.toFixed(0)}ms`,
            ].join(' '),
          );

          console.log(
            'OCR:',
          );

          console.log(
            row.text.trimEnd() ||
              '[VACÍO]',
          );

          console.log(
            '----------------------------------------',
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
    const pipeline
    of [
      'RAW',
      'PREPROCESSED',
    ] as const
  ) {
    for (
      const psm
      of psmConfigurations
    ) {
      const rows =
        results.filter(
          (row) =>
            row.pipeline ===
              pipeline &&
            row.psm ===
              psm.id,
        );

      aggregates.push(
        aggregate(rows),
      );
    }
  }

  const categoryAggregates =
    [
      ...new Set(
        manifest.map(
          (item) =>
            item.category,
        ),
      ),
    ].flatMap(
      (category) =>
        aggregates.map(
          (configuration) => {
            const rows =
              results.filter(
                (row) =>
                  row.category ===
                    category &&
                  row.pipeline ===
                    configuration.pipeline &&
                  row.psm ===
                    configuration.psm,
              );

            return {
              category,
              ...aggregate(rows),
            };
          },
        ),
    );

  await fs.mkdir(
    'benchmark/results',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/handwriting-baseline.json',
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        corpusSize:
          manifest.length,

        psmConfigurations:
          psmConfigurations.map(
            (item) => ({
              id: item.id,
              value:
                item.value,
            }),
          ),

        results,
        aggregates,
        categoryAggregates,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

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

  const lines:
    string[] = [
      'TEVI OCR — F7 HANDWRITING BASELINE',
      '==================================',
      '',
      'GLOBAL',
      '',
    ];

  for (
    const row
    of sorted
  ) {
    lines.push(
      [
        row.pipeline.padEnd(12),
        row.psm.padEnd(14),
        `CER ${percentage(row.cer).padStart(7)}`,
        `WER ${percentage(row.wer).padStart(7)}`,
        `conf ${
          row.averageConfidence === null
            ? 'N/D'
            : row.averageConfidence.toFixed(1)
        }`,
        `ocr ${row.averageOcrDurationMs.toFixed(0)}ms`,
        `pre ${row.averagePreprocessingDurationMs.toFixed(0)}ms`,
      ].join(' | '),
    );
  }

  lines.push(
    '',
    'POR CATEGORÍA',
    '',
  );

  for (
    const category
    of [
      ...new Set(
        manifest.map(
          (item) =>
            item.category,
        ),
      ),
    ]
  ) {
    lines.push(
      `### ${category}`,
    );

    const rows =
      categoryAggregates
        .filter(
          (item) =>
            item.category ===
            category,
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

    for (
      const row
      of rows
    ) {
      lines.push(
        [
          row.pipeline.padEnd(12),
          row.psm.padEnd(14),
          `CER ${percentage(row.cer).padStart(7)}`,
          `WER ${percentage(row.wer).padStart(7)}`,
          `conf ${
            row.averageConfidence === null
              ? 'N/D'
              : row.averageConfidence.toFixed(1)
          }`,
        ].join(' | '),
      );
    }

    lines.push('');
  }

  lines.push(
    'POR MUESTRA — MEJOR CONFIGURACIÓN',
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
              b.wer ||
            (
              b.confidence ??
              -1
            ) -
              (
                a.confidence ??
                -1
              ),
        );

    const best =
      candidates[0];

    if (!best) {
      continue;
    }

    lines.push(
      `[${sample.id}] ${best.pipeline}/${best.psm} — CER ${percentage(best.cer)} / WER ${percentage(best.wer)} / conf ${best.confidence ?? 'N/D'}`,
    );
  }

  const report =
    lines.join('\n');

  await fs.writeFile(
    'benchmark/results/handwriting-baseline.txt',
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
