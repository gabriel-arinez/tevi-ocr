import {
  execFile,
} from 'node:child_process';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';

import {
  preprocessImage,
  type PreprocessingStrategy,
} from '../src/preprocessing/strategies.js';


const execFileAsync =
  promisify(execFile);

const RESULT_DIR =
  'benchmark/results/'
  + 'handwriting-kraken-preprocessing';

const strategies = [
  {
    id:
      'rgb-original',
    preprocessing:
      null,
  },
  {
    id:
      'grayscale',
    preprocessing:
      'grayscale',
  },
  {
    id:
      'grayscale+normalize',
    preprocessing:
      'grayscale+normalize',
  },
] as const;


interface SourceLine {
  lineNumber: number;
  path: string;
}

interface SourceSample {
  id: string;
  category: string;
  lines: SourceLine[];
}

interface ManifestRow {
  id: string;
  category: string;
  groundTruthPath: string;
}

interface RecognizedDocument {
  id: string;
  category: string;
  lineCount: number;
  text: string;
}

interface RecognitionOutput {
  model: string;
  strategy: string;
  groundTruthUsed: boolean;
  modelLoadSeconds: number;
  totalRecognitionSeconds: number;
  lineCount: number;
  documents: RecognizedDocument[];
}


function percentage(
  value: number,
): string {
  return `${(
    value * 100
  ).toFixed(2)}%`;
}


async function main(): Promise<void> {
  const source =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-final/'
          + 'line-crops.json',
        'utf8',
      ),
    ) as {
      results: SourceSample[];
    };

  const manifest =
    JSON.parse(
      await fs.readFile(
        'benchmark/'
          + 'handwriting-manifest.json',
        'utf8',
      ),
    ) as ManifestRow[];

  const baseline =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-kraken/'
          + 'metrics.json',
        'utf8',
      ),
    ) as {
      cer: number;
      wer: number;
      totalRecognitionSeconds: number;
    };

  const manifestById =
    new Map(
      manifest.map(
        (item) => [
          item.id,
          item,
        ],
      ),
    );

  const tempDirectory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'tevi-ocr-f11-3-',
      ),
    );

  await fs.mkdir(
    RESULT_DIR,
    {
      recursive: true,
    },
  );

  const krakenPython =
    process.env
      .TEVI_OCR_KRAKEN_PYTHON ??
    path.join(
      os.homedir(),
      '.cache',
      'tevi-ocr-venvs',
      'kraken',
      'bin',
      'python',
    );

  const rows = [];

  try {
    for (
      const strategy
      of strategies
    ) {
      console.log();
      console.log(
        `===== ${strategy.id} =====`,
      );

      const strategyDirectory =
        path.join(
          tempDirectory,
          strategy.id.replaceAll(
            '+',
            '-plus-',
          ),
        );

      await fs.mkdir(
        strategyDirectory,
        {
          recursive: true,
        },
      );

      const transformedResults:
        SourceSample[] = [];

      let preprocessingDurationMs = 0;

      for (
        const sample
        of source.results
      ) {
        const transformedLines:
          SourceLine[] = [];

        for (
          const line
          of sample.lines
        ) {
          if (
            strategy.preprocessing ===
              null
          ) {
            transformedLines.push({
              ...line,
            });

            continue;
          }

          const input =
            await fs.readFile(
              line.path,
            );

          const startedAt =
            process.hrtime.bigint();

          const transformed =
            await preprocessImage(
              input,
              strategy.preprocessing as
                PreprocessingStrategy,
            );

          const finishedAt =
            process.hrtime.bigint();

          preprocessingDurationMs +=
            Number(
              finishedAt -
                startedAt,
            ) /
            1_000_000;

          const outputPath =
            path.join(
              strategyDirectory,
              `${sample.id}-${String(
                line.lineNumber,
              ).padStart(
                2,
                '0',
              )}.png`,
            );

          await fs.writeFile(
            outputPath,
            transformed,
          );

          transformedLines.push({
            ...line,
            path:
              outputPath,
          });
        }

        transformedResults.push({
          id:
            sample.id,
          category:
            sample.category,
          lines:
            transformedLines,
        });
      }

      const inputManifest =
        path.join(
          tempDirectory,
          `${strategy.id}-input.json`,
        );

      await fs.writeFile(
        inputManifest,
        JSON.stringify(
          {
            results:
              transformedResults,
          },
          null,
          2,
        ),
        'utf8',
      );

      const recognitionPath =
        path.join(
          RESULT_DIR,
          `recognition-${strategy.id}.json`,
        );

      const {
        stdout,
        stderr,
      } =
        await execFileAsync(
          krakenPython,
          [
            '-u',
            'benchmark/'
              + 'handwriting-kraken-'
              + 'preprocessing-recognize.py',
            '--input-json',
            inputManifest,
            '--output-json',
            recognitionPath,
            '--strategy',
            strategy.id,
          ],
          {
            timeout:
              120_000,
            maxBuffer:
              4 * 1024 * 1024,
          },
        );

      process.stdout.write(
        stdout,
      );

      if (stderr) {
        process.stderr.write(
          stderr,
        );
      }

      const recognition =
        JSON.parse(
          await fs.readFile(
            recognitionPath,
            'utf8',
          ),
        ) as RecognitionOutput;

      if (
        recognition.groundTruthUsed !==
          false ||
        recognition.lineCount !== 61
      ) {
        throw new Error(
          `Salida Kraken inválida para ${strategy.id}`,
        );
      }

      let characterDistance = 0;
      let wordDistance = 0;
      let referenceCharacters = 0;
      let referenceWords = 0;

      const cases = [];

      for (
        const document
        of recognition.documents
      ) {
        const manifestRow =
          manifestById.get(
            document.id,
          );

        if (!manifestRow) {
          throw new Error(
            `No existe manifest para ${document.id}`,
          );
        }

        /*
         * Ground truth únicamente después
         * de finalizar reconocimiento.
         */
        const expected =
          await fs.readFile(
            manifestRow.groundTruthPath,
            'utf8',
          );

        const metrics =
          calculateOcrMetrics(
            expected,
            document.text,
          );

        characterDistance +=
          metrics.characterDistance;

        wordDistance +=
          metrics.wordDistance;

        referenceCharacters +=
          metrics.referenceCharacters;

        referenceWords +=
          metrics.referenceWords;

        cases.push({
          id:
            document.id,
          category:
            document.category,
          lineCount:
            document.lineCount,
          ...metrics,
        });
      }

      const cer =
        characterDistance /
        referenceCharacters;

      const wer =
        wordDistance /
        referenceWords;

      rows.push({
        strategy:
          strategy.id,
        preprocessing:
          strategy.preprocessing ??
          'none',
        samples:
          cases.length,
        lineCount:
          recognition.lineCount,
        characterDistance,
        wordDistance,
        referenceCharacters,
        referenceWords,
        cer,
        wer,
        preprocessingDurationMs,
        modelLoadSeconds:
          recognition.modelLoadSeconds,
        recognitionSeconds:
          recognition
            .totalRecognitionSeconds,
        totalMeasuredSeconds:
          (
            preprocessingDurationMs /
            1000
          ) +
          recognition
            .totalRecognitionSeconds,
        cases,
      });

      console.log(
        [
          strategy.id,
          `CER=${percentage(cer)}`,
          `WER=${percentage(wer)}`,
          `pre=${(
            preprocessingDurationMs /
            1000
          ).toFixed(3)}s`,
          `ocr=${recognition
            .totalRecognitionSeconds
            .toFixed(3)}s`,
        ].join(' | '),
      );
    }

    const ranked =
      [...rows]
        .sort(
          (a, b) =>
            a.cer - b.cer ||
            a.wer - b.wer,
        );

    const winner =
      ranked[0];

    if (!winner) {
      throw new Error(
        'No existen resultados.',
      );
    }

    const output = {
      methodology: {
        detector:
          'CRAFT frozen F7 crops',
        lineCount:
          61,
        recognizer:
          'Kraken 7.1.1 / PP-OCRv6 small',
        groundTruthDuringDetection:
          false,
        groundTruthDuringRecognition:
          false,
        preprocessingScope:
          'recognition crop only',
      },

      baseline: {
        strategy:
          'rgb-original',
        cer:
          baseline.cer,
        wer:
          baseline.wer,
        recognitionSeconds:
          baseline
            .totalRecognitionSeconds,
      },

      rows,
      ranking:
        ranked.map(
          (item) => ({
            strategy:
              item.strategy,
            cer:
              item.cer,
            wer:
              item.wer,
            preprocessingDurationMs:
              item.preprocessingDurationMs,
            recognitionSeconds:
              item.recognitionSeconds,
            totalMeasuredSeconds:
              item.totalMeasuredSeconds,
          }),
        ),

      winner:
        winner.strategy,
    };

    await fs.writeFile(
      path.join(
        RESULT_DIR,
        'matrix.json',
      ),
      JSON.stringify(
        output,
        null,
        2,
      ) + '\n',
      'utf8',
    );

    console.log();
    console.log(
      '===== RANKING GLOBAL =====',
    );

    for (
      const item
      of ranked
    ) {
      console.log(
        [
          item.strategy.padEnd(24),
          `CER ${percentage(
            item.cer,
          ).padStart(7)}`,
          `WER ${percentage(
            item.wer,
          ).padStart(7)}`,
          `pre ${(
            item.preprocessingDurationMs /
            1000
          ).toFixed(3)}s`,
          `ocr ${item
            .recognitionSeconds
            .toFixed(3)}s`,
          `total ${item
            .totalMeasuredSeconds
            .toFixed(3)}s`,
        ].join(' | '),
      );
    }

    console.log();
    console.log(
      'WINNER=',
      winner.strategy,
    );

    console.log(
      'F11_3_MATRIX_OK=1',
    );
  } finally {
    await fs.rm(
      tempDirectory,
      {
        recursive: true,
        force: true,
      },
    );
  }
}


main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
