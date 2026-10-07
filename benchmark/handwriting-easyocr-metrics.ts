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


interface RecognitionArtifact {
  documents: RecognizedDocument[];
  totalRecognitionSeconds: number;
  modelLoadSeconds: number;
  detectorUsed: boolean;
  groundTruthUsed: boolean;
  frozenCraftCrops: boolean;
}


interface BaselineMetrics {
  cer: number;
  wer: number;
  totalRecognitionSeconds: number;
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
        'benchmark/results/'
          + 'handwriting-easyocr/'
          + 'documents.json',
        'utf8',
      ),
    ) as RecognitionArtifact;

  const kraken =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-kraken/'
          + 'metrics.json',
        'utf8',
      ),
    ) as BaselineMetrics;

  const trocr =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-final/'
          + 'metrics.json',
        'utf8',
      ),
    ) as BaselineMetrics;

  if (
    recognition.detectorUsed !== false ||
    recognition.groundTruthUsed !== false ||
    recognition.frozenCraftCrops !== true
  ) {
    throw new Error(
      'El artefacto EasyOCR viola la metodología congelada.',
    );
  }

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
     * Ground truth entra únicamente
     * después del reconocimiento.
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
      id:
        document.id,

      category:
        document.category,

      lineCount:
        document.lineCount,

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
      ? characterDistance
        / referenceCharacters
      : 0;

  const wer =
    referenceWords > 0
      ? wordDistance
        / referenceWords
      : 0;

  const output = {
    methodology: {
      detector:
        'CRAFT horizontal+free',

      grouping:
        'geometric line grouping',

      crops:
        'frozen F7 line crops',

      recognizer:
        'EasyOCR 1.7.2 / latin_g2',

      detectorRerun:
        false,

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
      recognition
        .totalRecognitionSeconds,

    comparison: {
      kraken: {
        cer:
          kraken.cer,

        wer:
          kraken.wer,

        recognitionSeconds:
          kraken
            .totalRecognitionSeconds,

        cerDelta:
          cer - kraken.cer,

        werDelta:
          wer - kraken.wer,
      },

      trocr: {
        cer:
          trocr.cer,

        wer:
          trocr.wer,

        recognitionSeconds:
          trocr
            .totalRecognitionSeconds,

        cerDelta:
          cer - trocr.cer,

        werDelta:
          wer - trocr.wer,
      },
    },

    rows,
  };

  await fs.writeFile(
    'benchmark/results/'
      + 'handwriting-easyocr/'
      + 'metrics.json',
    JSON.stringify(
      output,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log();
  console.log(
    '===== GLOBAL EASYOCR =====',
  );

  console.log(
    'SAMPLES=',
    rows.length,
  );

  console.log(
    'CER=',
    `${(
      cer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'WER=',
    `${(
      wer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'RECOGNITION_SECONDS=',
    recognition
      .totalRecognitionSeconds
      .toFixed(6),
  );

  console.log();
  console.log(
    'KRAKEN_CER=',
    `${(
      kraken.cer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'KRAKEN_WER=',
    `${(
      kraken.wer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'KRAKEN_SECONDS=',
    kraken
      .totalRecognitionSeconds
      .toFixed(6),
  );

  console.log();
  console.log(
    'TROCR_CER=',
    `${(
      trocr.cer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'TROCR_WER=',
    `${(
      trocr.wer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'TROCR_SECONDS=',
    trocr
      .totalRecognitionSeconds
      .toFixed(6),
  );

  const gate =
    rows.length === 8
    && Number.isFinite(cer)
    && Number.isFinite(wer)
    && recognition
      .totalRecognitionSeconds > 0;

  console.log();
  console.log(
    'F11_6_EASYOCR_METRICS_GATE=',
    Number(gate),
  );

  if (!gate) {
    process.exitCode = 1;
  }
}


main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
