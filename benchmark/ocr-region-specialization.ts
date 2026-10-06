import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  createWorker,
  OEM,
  PSM,
} from 'tesseract.js';

import {
  preprocessForOcr,
} from '../src/preprocessing/pipeline.js';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';

const require =
  createRequire(
    __filename,
  );

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RegionDefinition {
  id: string;
  expected: string;
  rectangle: Rectangle;
  whitelist?: string;
}

interface Strategy {
  id: string;
  psm: PSM;
  useWhitelist: boolean;
}

interface ResultRow {
  region: string;
  strategy: string;
  psm: PSM;
  whitelist: boolean;
  text: string;
  confidence: number | null;
  durationMs: number;
  cer: number;
  wer: number;
}

function paddedRectangle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  padding: number,
  imageWidth: number,
  imageHeight: number,
): Rectangle {
  const left =
    Math.max(
      0,
      x0 - padding,
    );

  const top =
    Math.max(
      0,
      y0 - padding,
    );

  const right =
    Math.min(
      imageWidth,
      x1 + padding,
    );

  const bottom =
    Math.min(
      imageHeight,
      y1 + padding,
    );

  return {
    left,
    top,
    width:
      right - left,
    height:
      bottom - top,
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
  const modulePath =
    require.resolve(
      '@tesseract.js-data/spa',
    );

  const langPath =
    path.join(
      path.dirname(modulePath),
      '4.0.0',
    );

  const input =
    await fs.readFile(
      'tests/fixtures/printed/confusing-characters.png',
    );

  const prepared =
    await preprocessForOcr(
      input,
    );

  /*
   * El fixture mide 3600x2000 y F5 no cambia
   * sus dimensiones en este caso.
   *
   * Las coordenadas provienen del análisis
   * F6.4 de Tesseract.
   */
  const imageWidth = 3600;
  const imageHeight = 2000;

  const regions:
    RegionDefinition[] = [
      {
        id: 'ambiguous-line',

        expected:
          'O0O0 I1I1 l1l1 S5S5 B8B8 Z2Z2',

        rectangle:
          paddedRectangle(
            204,
            414,
            1405,
            473,
            20,
            imageWidth,
            imageHeight,
          ),

        whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',
      },

      {
        id: 'nit',

        expected:
          '1010010101',

        rectangle:
          paddedRectangle(
            375,
            532,
            844,
            589,
            16,
            imageWidth,
            imageHeight,
          ),

        whitelist:
          '0123456789',
      },

      {
        id: 'codigo',

        expected:
          'OI1L-05S8-Z220',

        rectangle:
          paddedRectangle(
            518,
            648,
            1125,
            705,
            16,
            imageWidth,
            imageHeight,
          ),

        whitelist:
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      },

      {
        id: 'monto',

        expected:
          '8.505,10',

        rectangle:
          paddedRectangle(
            607,
            764,
            936,
            829,
            16,
            imageWidth,
            imageHeight,
          ),

        whitelist:
          '0123456789.,',
      },
    ];

  const strategies:
    Strategy[] = [
      {
        id: 'SINGLE_LINE',
        psm:
          PSM.SINGLE_LINE,
        useWhitelist:
          false,
      },

      {
        id: 'SINGLE_LINE_WHITELIST',
        psm:
          PSM.SINGLE_LINE,
        useWhitelist:
          true,
      },

      {
        id: 'RAW_LINE',
        psm:
          PSM.RAW_LINE,
        useWhitelist:
          false,
      },

      {
        id: 'RAW_LINE_WHITELIST',
        psm:
          PSM.RAW_LINE,
        useWhitelist:
          true,
      },
    ];

  const worker =
    await createWorker(
      'spa',
      OEM.LSTM_ONLY,
      {
        langPath,
        gzip: true,
        cacheMethod: 'none',
        logger: () => undefined,
      },
    );

  const results:
    ResultRow[] = [];

  try {
    for (
      const region
      of regions
    ) {
      console.log();
      console.log(
        '============================================================',
      );

      console.log(
        `REGION: ${region.id}`,
      );

      console.log(
        `EXPECTED: ${region.expected}`,
      );

      console.log(
        '============================================================',
      );

      for (
        const strategy
        of strategies
      ) {
        const parameters:
          Record<string, string> = {
            tessedit_pageseg_mode:
              strategy.psm,
        };

        if (
          strategy.useWhitelist &&
          region.whitelist
        ) {
          parameters
            .tessedit_char_whitelist =
              region.whitelist;
        } else {
          parameters
            .tessedit_char_whitelist =
              '';
        }

        await worker.setParameters(
          parameters,
        );

        const startedAt =
          process.hrtime.bigint();

        const recognition =
          await worker.recognize(
            prepared.buffer,
            {
              rectangle:
                region.rectangle,
            },
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
          (
            recognition.data.text ??
            ''
          ).trim();

        const metrics =
          calculateOcrMetrics(
            region.expected,
            text,
          );

        const confidence =
          Number.isFinite(
            recognition.data.confidence,
          )
            ? recognition.data.confidence
            : null;

        results.push({
          region:
            region.id,

          strategy:
            strategy.id,

          psm:
            strategy.psm,

          whitelist:
            strategy.useWhitelist,

          text,

          confidence,

          durationMs,

          cer:
            metrics.cer,

          wer:
            metrics.wer,
        });

        console.log(
          `${strategy.id.padEnd(24)} => "${text}" | CER=${percentage(metrics.cer)} WER=${percentage(metrics.wer)} conf=${confidence ?? 'N/D'} time=${durationMs.toFixed(0)}ms`,
        );
      }
    }
  } finally {
    await worker.terminate();
  }

  const winners =
    regions.map(
      (
        region,
      ) => {
        const candidates =
          results
            .filter(
              (item) =>
                item.region ===
                region.id,
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

        return {
          region:
            region.id,

          expected:
            region.expected,

          best:
            candidates[0],
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
    'benchmark/results/ocr-region-specialization.json',
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        preprocessing: {
          detectedAngle:
            prepared.detectedAngle,

          durationMs:
            prepared.durationMs,
        },

        results,

        winners,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  const lines: string[] = [
    'TEVI OCR — F6 REGION SPECIALIZATION',
    '===================================',
    '',
  ];

  for (
    const winner
    of winners
  ) {
    lines.push(
      `REGION: ${winner.region}`,
    );

    lines.push(
      `Esperado: ${winner.expected}`,
    );

    if (
      winner.best
    ) {
      lines.push(
        `Mejor: ${winner.best.strategy}`,
      );

      lines.push(
        `Obtenido: ${winner.best.text}`,
      );

      lines.push(
        `CER: ${percentage(winner.best.cer)}`,
      );

      lines.push(
        `WER: ${percentage(winner.best.wer)}`,
      );

      lines.push(
        `Confianza: ${winner.best.confidence ?? 'N/D'}`,
      );
    }

    lines.push('');
  }

  const report =
    lines.join(
      '\n',
    );

  await fs.writeFile(
    'benchmark/results/ocr-region-specialization.txt',
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
