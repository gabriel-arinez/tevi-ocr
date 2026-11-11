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
import {
  getDefaultWorkerPool,
  resolveSpanishLangPath,
  type TesseractWorkerPool,
} from './tesseract-worker-pool.js';

export interface OcrRecognitionResult {
  text: string;
  confidence: number | null;
  durationMs: number;
  spatialEvidence?: ReturnType<typeof summarizePrintedSpatialEvidence>;
}

export interface TesseractEngineOptions {
  pool?: TesseractWorkerPool;
  disablePool?: boolean;
}

export class TesseractOcrEngine {
  private readonly pool?: TesseractWorkerPool;
  private readonly disablePool: boolean;

  constructor(options: TesseractEngineOptions = {}) {
    this.disablePool = options.disablePool ?? false;
    this.pool = options.pool ?? (this.disablePool ? undefined : getDefaultWorkerPool());
  }

  async recognize(
    input: Buffer | string,
    options: { includeSpatialEvidence?: boolean } = {},
  ): Promise<OcrRecognitionResult> {
    const doRecognize = async (worker: import('tesseract.js').Worker) => {
      const startedAt = process.hrtime.bigint();

      const result = await worker.recognize(
        input,
        {},
        options.includeSpatialEvidence ? { tsv: true } : { text: true },
      );

      const finishedAt = process.hrtime.bigint();
      const durationMs = Number(finishedAt - startedAt) / 1_000_000;
      const confidence = Number.isFinite(result.data.confidence)
        ? result.data.confidence
        : null;

      return {
        text: result.data.text ?? '',
        confidence,
        durationMs,
        ...(options.includeSpatialEvidence
          ? {
              spatialEvidence: summarizePrintedSpatialEvidence(
                parsePrintedTsv(result.data.tsv ?? ''),
              ),
            }
          : {}),
      };
    };

    if (this.pool && !this.disablePool) {
      return this.pool.runWithWorker(doRecognize);
    }

    const worker = await createWorker('spa', OEM.LSTM_ONLY, {
      langPath: resolveSpanishLangPath(),
      gzip: true,
      cacheMethod: 'none',
      logger: () => undefined,
    });

    try {
      return await doRecognize(worker);
    } finally {
      await worker.terminate();
    }
  }
}
