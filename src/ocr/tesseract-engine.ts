import path from 'node:path';
import { createRequire } from 'node:module';

import {
  createWorker,
  OEM,
} from 'tesseract.js';

import {
  parsePrintedTsv,
  summarizePrintedSpatialEvidence,
} from './printed-spatial-evidence.js';

const require = createRequire(__filename);

export interface OcrRecognitionResult {
  text: string;
  confidence: number | null;
  durationMs: number;
  spatialEvidence?: ReturnType<typeof summarizePrintedSpatialEvidence>;
}

function resolveSpanishLangPath(): string {
  const modulePath =
    require.resolve('@tesseract.js-data/spa');

  return path.join(
    path.dirname(modulePath),
    '4.0.0',
  );
}

export class TesseractOcrEngine {
  async recognize(
    input: Buffer | string,
    options: { includeSpatialEvidence?: boolean } = {},
  ): Promise<OcrRecognitionResult> {
    const worker = await createWorker(
      'spa',
      OEM.LSTM_ONLY,
      {
        langPath: resolveSpanishLangPath(),
        gzip: true,
        cacheMethod: 'none',
        logger: () => undefined,
      },
    );

    try {
      const startedAt =
        process.hrtime.bigint();

      const result =
        await worker.recognize(
          input,
          {},
          options.includeSpatialEvidence ? { tsv: true } : { text: true },
        );

      const finishedAt =
        process.hrtime.bigint();

      const durationMs =
        Number(finishedAt - startedAt) /
        1_000_000;

      const confidence =
        Number.isFinite(result.data.confidence)
          ? result.data.confidence
          : null;

      return {
        text: result.data.text ?? '',
        confidence,
        durationMs,
        ...(options.includeSpatialEvidence ? {
          spatialEvidence: summarizePrintedSpatialEvidence(
            parsePrintedTsv(result.data.tsv ?? ''),
          ),
        } : {}),
      };
    } finally {
      await worker.terminate();
    }
  }
}
