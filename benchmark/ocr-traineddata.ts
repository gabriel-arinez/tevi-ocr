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

const dataModule =
  require.resolve(
    '@tesseract.js-data/spa',
  );

const dataRoot =
  path.dirname(
    dataModule,
  );

const modelConfigs = [
  {
    id: 'SPA_4_0_0',
    langPath:
      path.join(
        dataRoot,
        '4.0.0',
      ),
  },
  {
    id: 'SPA_4_0_0_BEST_INT',
    langPath:
      path.join(
        dataRoot,
        '4.0.0_best_int',
      ),
  },
] as const;

const psmConfigs = [
  {
    id: 'AUTO',
    psm: PSM.AUTO,
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
  model: string;
  psmConfig: string;
  psm: string;
  caseId: string;
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
  console.log(
    '===== VALIDAR TRAINEDDATA =====',
  );

  for (
    const model
    of modelConfigs
  ) {
    const filename =
      path.join(
        model.langPath,
        'spa.traineddata.gz',
      );

    const stat =
      await fs.stat(
        filename,
      );

    console.log(
      `${model.id}: ${filename} (${stat.size} bytes)`,
    );
  }

  console.log();
  console.log(
    '===== PREPROCESAMIENTO FIJO =====',
  );

  const preparedCases:
    PreparedCase[] = [];

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

  const results:
    CaseResult[] = [];

  for (
    const model
    of modelConfigs
  ) {
    console.log();
    console.log(
      `############################################`,
    );

    console.log(
      `MODEL: ${model.id}`,
    );

    console.log(
      `############################################`,
    );

    const worker =
      await createWorker(
        'spa',
        OEM.LSTM_ONLY,
        {
          langPath:
            model.langPath,

          gzip: true,

          cacheMethod:
            'none',

          logger:
            () => undefined,
        },
      );

    try {
      for (
        const psmConfig
        of psmConfigs
      ) {
        await worker.setParameters({
          tessedit_pageseg_mode:
            psmConfig.psm,
        });

        console.log();
        console.log(
          `--- ${psmConfig.id} / PSM ${psmConfig.psm} ---`,
        );

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
            model:
              model.id,

            psmConfig:
              psmConfig.id,

            psm:
              psmConfig.psm,

            caseId:
              item.id,

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
  }

  const configurations =
    modelConfigs.flatMap(
      (model) =>
        psmConfigs.map(
          (
            psmConfig,
          ) => {
            const cases =
              results.filter(
                (item) =>
                  item.model ===
                    model.id &&
                  item.psmConfig ===
                    psmConfig.id,
              );

            const aggregate =
              aggregateBenchmark(
                cases.map(
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
              model:
                model.id,

              psmConfig:
                psmConfig.id,

              psm:
                psmConfig.psm,

              aggregate,

              cases,
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
    'benchmark/results/ocr-traineddata.json',
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        configurations,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const sorted =
    [...configurations]
      .sort(
        (
          a,
          b,
        ) =>
          a.aggregate.cer -
            b.aggregate.cer ||
          a.aggregate.wer -
            b.aggregate.wer,
      );

  const lines = [
    'TEVI OCR — F6 TRAINEDDATA MATRIX',
    '================================',
    '',
    'GLOBAL',
    '',
  ];

  for (
    const configuration
    of sorted
  ) {
    lines.push(
      `${configuration.model.padEnd(22)} ${configuration.psmConfig.padEnd(12)} CER ${percentage(configuration.aggregate.cer).padStart(7)} WER ${percentage(configuration.aggregate.wer).padStart(7)} avg ${configuration.aggregate.averageDurationMs.toFixed(0)} ms`,
    );
  }

  lines.push(
    '',
    'CONFUSING CHARACTERS',
    '',
  );

  for (
    const configuration
    of sorted
  ) {
    const confusing =
      configuration.cases.find(
        (item) =>
          item.caseId ===
          'confusing-characters',
      );

    if (!confusing) {
      continue;
    }

    lines.push(
      `--- ${configuration.model} / ${configuration.psmConfig} ---`,
    );

    lines.push(
      `CER: ${percentage(confusing.cer)}`,
    );

    lines.push(
      `WER: ${percentage(confusing.wer)}`,
    );

    lines.push(
      `Confianza: ${confusing.confidence ?? 'N/D'}`,
    );

    lines.push(
      confusing.text.trimEnd(),
    );

    lines.push('');
  }

  const report =
    lines.join(
      '\n',
    );

  await fs.writeFile(
    'benchmark/results/ocr-traineddata.txt',
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
