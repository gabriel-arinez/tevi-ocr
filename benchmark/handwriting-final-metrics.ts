import fs from 'node:fs/promises';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';


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

async function main(): Promise<void> {
  const manifest =
    JSON.parse(
      await fs.readFile(
        'benchmark/handwriting-manifest.json',
        'utf8',
      ),
    ) as ManifestRow[];

  const recognition =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/handwriting-final/documents.json',
        'utf8',
      ),
    ) as {
      documents: RecognizedDocument[];
      totalRecognitionSeconds: number;
      modelLoadSeconds: number;
      groundTruthUsed: boolean;
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

  const rows = [];

  let characterDistance = 0;
  let wordDistance = 0;
  let referenceCharacters = 0;
  let referenceWords = 0;

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
        `Sample no encontrado: ${document.id}`,
      );
    }

    /*
     * El ground truth se usa únicamente aquí,
     * después de detección y reconocimiento.
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

    rows.push({
      id: document.id,
      category: document.category,
      lineCount: document.lineCount,
      ...metrics,
    });

    console.log(
      [
        document.id,
        `CER=${(
          metrics.cer * 100
        ).toFixed(2)}%`,
        `WER=${(
          metrics.wer * 100
        ).toFixed(2)}%`,
      ].join(' | '),
    );
  }

  const cer =
    referenceCharacters > 0
      ? characterDistance /
        referenceCharacters
      : 0;

  const wer =
    referenceWords > 0
      ? wordDistance /
        referenceWords
      : 0;

  const output = {
    methodology: {
      detector:
        'CRAFT horizontal+free',
      grouping:
        'geometric line grouping',
      recognizer:
        'ifesther/trocr-spanish-handwritten',
      groundTruthDuringDetection:
        false,
      groundTruthDuringRecognition:
        false,
    },

    samples:
      rows.length,

    characterDistance,
    wordDistance,
    referenceCharacters,
    referenceWords,
    cer,
    wer,

    modelLoadSeconds:
      recognition.modelLoadSeconds,

    totalRecognitionSeconds:
      recognition.totalRecognitionSeconds,

    rows,
  };

  await fs.writeFile(
    'benchmark/results/handwriting-final/metrics.json',
    JSON.stringify(
      output,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log();
  console.log(
    '===== GLOBAL =====',
  );

  console.log(
    'samples =',
    rows.length,
  );

  console.log(
    'CER =',
    `${(
      cer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'WER =',
    `${(
      wer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'groundTruthDuringDetection = false',
  );

  console.log(
    'groundTruthDuringRecognition = false',
  );

  console.log(
    'METRICS_FINAL_OK=1',
  );
}

main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
