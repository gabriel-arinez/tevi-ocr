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

interface LanguageConfig {
  id: string;
  init: Record<string, string>;
}

const languageConfigs:
  readonly LanguageConfig[] = [
    {
      id: 'DEFAULT',
      init: {},
    },

    {
      id: 'NO_SYSTEM_FREQ',
      init: {
        load_system_dawg: '0',
        load_freq_dawg: '0',
      },
    },

    {
      id: 'NO_WORD_DAWGS',
      init: {
        load_system_dawg: '0',
        load_freq_dawg: '0',
        load_unambig_dawg: '0',
        load_bigram_dawg: '0',
      },
    },

    {
      id: 'NO_DAWGS',
      init: {
        load_system_dawg: '0',
        load_freq_dawg: '0',
        load_unambig_dawg: '0',
        load_punc_dawg: '0',
        load_number_dawg: '0',
        load_bigram_dawg: '0',
      },
    },
  ];

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
  languageConfig: string;
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

async function prepareCases():
  Promise<PreparedCase[]> {
  const prepared:
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

    const result =
      await preprocessForOcr(
        input,
      );

    prepared.push({
      id:
        benchmarkCase.id,

      expected,

      buffer:
        result.buffer,
    });

    console.log(
      `${benchmarkCase.id}: angle=${result.detectedAngle}`,
    );
  }

  return prepared;
}

async function main(): Promise<void> {
  const preparedCases =
    await prepareCases();

  const results:
    CaseResult[] = [];

  console.log();
  console.log(
    '===== MATRIZ MODELO LINGÜÍSTICO =====',
  );

  for (
    const languageConfig
    of languageConfigs
  ) {
    console.log();
    console.log(
      `##################################################`,
    );

    console.log(
      `LANGUAGE CONFIG: ${languageConfig.id}`,
    );

    console.log(
      `##################################################`,
    );

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
        languageConfig.init,
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
            languageConfig:
              languageConfig.id,

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

  const summaries =
    languageConfigs.flatMap(
      (
        languageConfig,
      ) =>
        psmConfigs.map(
          (
            psmConfig,
          ) => {
            const cases =
              results.filter(
                (item) =>
                  item.languageConfig ===
                    languageConfig.id &&
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
              languageConfig:
                languageConfig.id,

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
    'benchmark/results/ocr-language-model.json',
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

  const sorted =
    [...summaries].sort(
      (
        a,
        b,
      ) =>
        a.aggregate.cer -
          b.aggregate.cer ||
        a.aggregate.wer -
          b.aggregate.wer,
    );

  const lines: string[] = [
    'TEVI OCR — F6 LANGUAGE MODEL MATRIX',
    '===================================',
    '',
    'GLOBAL',
    '',
  ];

  for (
    const summary
    of sorted
  ) {
    lines.push(
      `${summary.languageConfig.padEnd(16)} ${summary.psmConfig.padEnd(12)} CER ${percentage(summary.aggregate.cer).padStart(7)} WER ${percentage(summary.aggregate.wer).padStart(7)} avg ${summary.aggregate.averageDurationMs.toFixed(0)} ms`,
    );
  }

  lines.push(
    '',
    'CONFUSING CHARACTERS',
    '',
  );

  for (
    const summary
    of sorted
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
      `--- ${summary.languageConfig} / ${summary.psmConfig} ---`,
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
      item.text.trimEnd(),
    );

    lines.push('');
  }

  const report =
    lines.join(
      '\n',
    );

  await fs.writeFile(
    'benchmark/results/ocr-language-model.txt',
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
