import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  createWorker,
  OEM,
  PSM,
} from 'tesseract.js';

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
  preprocessForOcr,
} from '../src/preprocessing/pipeline.js';

const require =
  createRequire(
    __filename,
  );

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

const configurations = [
  {
    id: 'AUTO',
    psm: PSM.AUTO,
  },
  {
    id: 'SINGLE_COLUMN',
    psm: PSM.SINGLE_COLUMN,
  },
  {
    id: 'SINGLE_BLOCK',
    psm: PSM.SINGLE_BLOCK,
  },
  {
    id: 'SPARSE_TEXT',
    psm: PSM.SPARSE_TEXT,
  },
] as const;

interface PreparedCase {
  id: string;
  expected: string;
  buffer: Buffer;
}

interface CaseResult {
  caseId: string;
  configuration: string;
  psm: string;
  text: string;
  confidence: number | null;
  durationMs: number;

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
  /*
   * Preprocesamos cada fixture una sola vez.
   * Así la matriz F6 mide únicamente cambios del OCR/PSM.
   */
  const preparedCases:
    PreparedCase[] = [];

  console.log(
    '===== PREPROCESAMIENTO FIJO =====',
  );

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

    const prepared =
      await preprocessForOcr(
        input,
      );

    preparedCases.push({
      id:
        benchmarkCase.id,

      expected,

      buffer:
        prepared.buffer,
    });

    console.log(
      `${benchmarkCase.id}: angle=${prepared.detectedAngle}`,
    );
  }

  console.log();
  console.log(
    '===== OCR PSM MATRIX =====',
  );

  /*
   * Un solo worker para evitar que la inicialización
   * de Tesseract contamine la comparación entre PSM.
   */
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
    CaseResult[] = [];

  try {
    for (
      const configuration
      of configurations
    ) {
      console.log();
      console.log(
        `######## ${configuration.id} / PSM ${configuration.psm} ########`,
      );

      await worker.setParameters({
        tessedit_pageseg_mode:
          configuration.psm,
      });

      for (
        const item
        of preparedCases
      ) {
        const startedAt =
          process.hrtime.bigint();

        const recognition =
          await worker.recognize(
            item.buffer,
          );

        const finishedAt =
          process.hrtime.bigint();

        const durationMs =
          Number(
            finishedAt -
            startedAt,
          ) /
          1_000_000;

        const metrics =
          calculateOcrMetrics(
            item.expected,
            recognition.data.text ?? '',
          );

        const confidence =
          Number.isFinite(
            recognition.data.confidence,
          )
            ? recognition.data.confidence
            : null;

        results.push({
          caseId:
            item.id,

          configuration:
            configuration.id,

          psm:
            configuration.psm,

          text:
            recognition.data.text ?? '',

          confidence,

          durationMs,

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
        });

        console.log(
          `[${item.id}] CER=${percentage(metrics.cer)} WER=${percentage(metrics.wer)} conf=${confidence ?? 'N/D'} time=${durationMs.toFixed(0)}ms`,
        );
      }
    }
  } finally {
    await worker.terminate();
  }

  const summaries =
    configurations.map(
      (
        configuration,
      ) => {
        const items =
          results.filter(
            (item) =>
              item.configuration ===
              configuration.id,
          );

        const aggregate =
          aggregateBenchmark(
            items.map(
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
          configuration:
            configuration.id,

          psm:
            configuration.psm,

          aggregate,

          cases:
            items,
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
    'benchmark/results/ocr-psm.json',
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        configurations:
          summaries,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const lines: string[] = [
    'TEVI OCR — F6 PSM MATRIX',
    '========================',
    '',
    'GLOBAL',
    '',
  ];

  for (
    const summary
    of summaries
  ) {
    lines.push(
      `${summary.configuration.padEnd(16)} PSM ${String(summary.psm).padEnd(2)}  CER ${percentage(summary.aggregate.cer).padStart(7)}  WER ${percentage(summary.aggregate.wer).padStart(7)}  avg ${summary.aggregate.averageDurationMs.toFixed(0)} ms`,
    );
  }

  lines.push(
    '',
    'CONFUSING CHARACTERS',
    '',
  );

  for (
    const summary
    of summaries
  ) {
    const item =
      summary.cases.find(
        (entry) =>
          entry.caseId ===
          'confusing-characters',
      );

    if (!item) {
      continue;
    }

    lines.push(
      `--- ${summary.configuration} / PSM ${summary.psm} ---`,
    );

    lines.push(
      `CER: ${percentage(item.cer)}`,
    );

    lines.push(
      `WER: ${percentage(item.wer)}`,
    );

    lines.push(
      `Confianza: ${item.confidence ?? 'N/D'}`,
    );

    lines.push(
      'Texto:',
    );

    lines.push(
      item.text.trimEnd(),
    );

    lines.push('');
  }

  lines.push(
    'POR CASO — MEJOR PSM',
    '',
  );

  for (
    const benchmarkCase
    of benchmarkCases
  ) {
    const candidates =
      results
        .filter(
          (item) =>
            item.caseId ===
            benchmarkCase.id,
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

    lines.push(
      `[${benchmarkCase.id}] ${best.configuration} — CER ${percentage(best.cer)} / WER ${percentage(best.wer)} / conf ${best.confidence ?? 'N/D'}`,
    );
  }

  const report =
    lines.join(
      '\n',
    );

  await fs.writeFile(
    'benchmark/results/ocr-psm.txt',
    `${report}\n`,
    'utf8',
  );

  console.log();
  console.log(report);
}

main().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode = 1;
  },
);
