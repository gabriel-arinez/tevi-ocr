import express from 'express';
import multer from 'multer';

import {
  config,
} from './core/config.js';

import {
  createDocumentInput,
  InvalidDocumentError,
} from './files/create-document-input.js';

import {
  DocumentPreparationError,
  prepareOcrInput,
} from './files/prepare-ocr-input.js';

import {
  resolveDocumentSource,
} from './files/document-source.js';

import {
  TesseractOcrEngine,
} from './ocr/tesseract-engine.js';

import {
  HandwritingOcrEngine,
  HandwritingOcrError,
} from './ocr/handwriting-engine.js';

import {
  aggregateOcrQuality,
  assessOcrQuality,
} from './ocr/ocr-quality.js';

import {
  InvalidOcrModeError,
  resolveOcrMode,
} from './ocr/ocr-mode.js';

import {
  shouldVerifyPrintedDeskew,
  preferOriginalPrintedRecognition,
} from './ocr/printed-deskew-safety.js';

import { buildPrintedTextView } from './ocr/printed-document-layout.js';
import { buildGeometricReadingView } from './ocr/printed-geometric-layout.js';
import { prepareRegionForSecondReading } from './ocr/printed-region-review.js';
import type { PrintedSpatialWord } from './ocr/printed-spatial-evidence.js';

const app = express();
let regionalReviewsInFlight = 0;
const MAX_CONCURRENT_REGION_REVIEWS = 2;

app.disable('x-powered-by');

app.use(
  express.json({
    limit: '1mb',
  }),
);

app.use(
  express.static('public'),
);

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        config.upload.maxBytes,
      files: 1,
    },
  });

app.get(
  '/api/health',
  (_request, response) => {
    response.json({
      ok: true,
      service: 'tevi-ocr',
    });
  },
);

app.post(
  '/api/ocr/file',
  upload.single('file'),
  async (
    request,
    response,
  ) => {
    try {
      if (!request.file) {
        response
          .status(400)
          .json({
            ok: false,
            error:
              'FILE_REQUIRED',
            message:
              'Debe adjuntar un archivo en el campo "file".',
          });

        return;
      }

      const documentInput =
        createDocumentInput(
          request.file,
          resolveDocumentSource(
            request.body?.source,
          ),
        );

      const mode =
        resolveOcrMode(
          request.body?.mode,
        );

      if (
        mode === 'handwritten'
      ) {
        if (
          documentInput.kind ===
          'pdf'
        ) {
          throw new InvalidDocumentError(
            'El modo manuscrito admite únicamente imágenes JPEG o PNG.',
          );
        }

        const engine =
          new HandwritingOcrEngine();

        const result =
          await engine.recognize(
            documentInput.buffer,
          );

        const quality =
          result.quality;

        response.json({
          ok: true,

          document: {
            source:
              documentInput.source,

            kind:
              documentInput.kind,

            mimeType:
              documentInput.mimeType,

            originalName:
              documentInput.originalName,

            sizeBytes:
              documentInput.buffer.length,

            pages: 1,
          },

          ocr: {
            mode:
              'handwritten',

            engine:
              result.engine,

            model:
              result.model,

            experimental:
              true,

            text:
              result.text,

            confidence:
              null,

            quality,

            characterCount:
              result.characterCount,

            characters:
              result.characters,

            structuredFields:
              result.structuredFields,

            runtime:
              result.runtime,

            durationMs:
              result.durationMs,

            detectionDurationMs:
              result.detectionDurationMs,

            recognitionDurationMs:
              result.recognitionDurationMs,

            modelLoadDurationMs:
              result.modelLoadDurationMs,

            pages: [
              {
                pageNumber: 1,

                text:
                  result.text,

                confidence:
                  null,

                quality,

                durationMs:
                  result.durationMs,

                lineCount:
                  result.lineCount,

                characterCount:
                  result.characterCount,

                lines:
                  result.lines,

                characters:
                  result.characters,

                structuredFields:
                  result.structuredFields,
              },
            ],
          },
        });

        return;
      }

      const prepared =
        await prepareOcrInput(
          documentInput,
        );

      const engine =
        new TesseractOcrEngine();

      const pageResults = [];

      for (
        const page of prepared.pages
      ) {
        let result =
          await engine.recognize(
            page.buffer,
            {
              includeSpatialEvidence:
                documentInput.kind === 'jpeg' ||
                documentInput.kind === 'png',
            },
          );

        // El detector de inclinación puede elegir el extremo (+/-10°)
        // cuando la fotografía contiene fondo o bordes ajenos al texto.
        // En ese caso contrastamos con el ORIGINAL, usando el MISMO
        // Tesseract y sin aplicar una rotación potencialmente destructiva.
        // Nunca usamos esta comparación para PDF ni para giros menores.
        let selectedAngle =
          page.detectedAngle;

        let recognitionDurationMs =
          result.durationMs;

        if (
          shouldVerifyPrintedDeskew(
            documentInput.kind,
            page.detectedAngle,
          )
        ) {
          const originalCandidate =
            await engine.recognize(
              documentInput.buffer,
              { includeSpatialEvidence: true },
            );

          recognitionDurationMs +=
            originalCandidate.durationMs;

          if (
            preferOriginalPrintedRecognition(
              result,
              originalCandidate,
            )
          ) {
            result = originalCandidate;
            selectedAngle = 0;
          }
        }

        pageResults.push({
          pageNumber:
            page.pageNumber,

          text:
            result.text,

          confidence:
            result.confidence,

          quality:
            assessOcrQuality({
              text:
                result.text,
              confidence:
                result.confidence,
            }),

          durationMs:
            recognitionDurationMs,

          detectedAngle:
            selectedAngle,

          ...(result.spatialEvidence
            ? { spatialEvidence: result.spatialEvidence }
            : {}),

          preprocessingDurationMs:
            page.preprocessingDurationMs,
        });
      }

      const confidences =
        pageResults
          .map(
            (page) =>
              page.confidence,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          );

      const confidence =
        confidences.length === 0
          ? null
          : confidences.reduce(
              (
                total,
                current,
              ) =>
                total +
                current,
              0,
            ) /
            confidences.length;

      const quality =
        aggregateOcrQuality(
          pageResults.map(
            (page) =>
              page.quality,
          ),
        );

      const durationMs =
        pageResults.reduce(
          (
            total,
            page,
          ) =>
            total +
            page.durationMs,
          0,
        );

      const preprocessingDurationMs =
        pageResults.reduce(
          (
            total,
            page,
          ) =>
            total +
            page.preprocessingDurationMs,
          0,
        );

      response.json({
        ok: true,

        document: {
          source:
            documentInput.source,

          kind:
            documentInput.kind,

          mimeType:
            documentInput.mimeType,

          originalName:
            documentInput.originalName,

          sizeBytes:
            documentInput.buffer.length,

          pages:
            pageResults.length,
        },

        ocr: {
          mode:
            'printed',

          engine:
            'tesseract.js',

          experimental:
            false,

          text:
            pageResults
              .map(
                (page) =>
                  page.text,
              )
              .join('\n\n'),

          readableText: buildPrintedTextView(pageResults.map(page => page.text).join('\n\n')).readable,
          structuredText: pageResults.map(page => {
            const words = page.spatialEvidence?.words ?? [];
            return words.length > 0 ? buildGeometricReadingView(words).text : buildPrintedTextView(page.text).readable;
          }).join('\n\n'),
          layoutBlocks: pageResults.map(page => ({
            pageNumber: page.pageNumber,
            ...buildGeometricReadingView(page.spatialEvidence?.words ?? []),
          })),
          confidence,
          quality,
          durationMs,
          preprocessingDurationMs,
          pages:
            pageResults,
        },
      });
    } catch (error) {
      if (
        error instanceof
        InvalidOcrModeError
      ) {
        response
          .status(400)
          .json({
            ok: false,
            error:
              'OCR_MODE_INVALID',
            message:
              error.message,
          });

        return;
      }

      if (
        error instanceof
        HandwritingOcrError
      ) {
        response
          .status(
            error.code ===
              'HANDWRITING_RUNTIME_UNAVAILABLE'
              ? 503
              : error.code ===
                  'HANDWRITING_INVALID_IMAGE'
                ? 400
                : 500,
          )
          .json({
            ok: false,
            error:
              error.code,
            message:
              error.message,
          });

        return;
      }

      if (
        error instanceof
        DocumentPreparationError
      ) {
        response
          .status(400)
          .json({
            ok: false,
            error:
              error.code,
            message:
              error.message,
          });

        return;
      }

      if (
        error instanceof
        InvalidDocumentError
      ) {
        response
          .status(400)
          .json({
            ok: false,
            error:
              'INVALID_DOCUMENT',
            message:
              error.message,
          });

        return;
      }

      if (
        error instanceof
          multer.MulterError &&
        error.code ===
          'LIMIT_FILE_SIZE'
      ) {
        response
          .status(413)
          .json({
            ok: false,
            error:
              'FILE_TOO_LARGE',
            message:
              'El archivo excede el tamaño máximo permitido.',
          });

        return;
      }

      console.error(
        'OCR file error:',
        error,
      );

      response
        .status(500)
        .json({
          ok: false,
          error:
            'OCR_PROCESSING_ERROR',
          message:
            'No fue posible procesar el documento.',
        });
    }
  },
);

/**
 * On-demand second reading of a selected box. This endpoint never writes,
 * deletes or replaces any source OCR text. Image coordinates refer to the
 * EXIF-oriented original image, not a deskew-rotated candidate.
 */
app.post(
  '/api/ocr/region-review',
  upload.single('file'),
  async (request, response) => {
    if (regionalReviewsInFlight >= MAX_CONCURRENT_REGION_REVIEWS) {
      response.status(429).json({ ok: false, error: 'REGION_REVIEW_BUSY' });
      return;
    }
    regionalReviewsInFlight += 1;
    try {
      if (!request.file) {
        response.status(400).json({ ok: false, error: 'FILE_REQUIRED' });
        return;
      }
      const input = createDocumentInput(request.file, 'file');
      if (input.kind === 'pdf') {
        response.status(400).json({ ok: false, error: 'IMAGE_REQUIRED' });
        return;
      }
      const box = {
        left: Number(request.body?.left),
        top: Number(request.body?.top),
        width: Number(request.body?.width),
        height: Number(request.body?.height),
      };
      if (![box.left, box.top, box.width, box.height].every(Number.isFinite) ||
          box.left < 0 || box.top < 0 || box.width < 1 || box.height < 1) {
        response.status(400).json({ ok: false, error: 'INVALID_REGION' });
        return;
      }
      const word: PrintedSpatialWord = {
        page: 1, block: 0, paragraph: 0, line: 0,
        text: '', confidence: 0, bbox: box,
      };
      const crop = await prepareRegionForSecondReading(input.buffer, word);
      if (!crop || crop.region.width * crop.region.height > 2_000_000) {
        response.status(400).json({ ok: false, error: 'INVALID_REGION' });
        return;
      }
      const engine = new TesseractOcrEngine();
      const original = await engine.recognize(crop.original);
      const normalized = await engine.recognize(crop.contrast);
      response.json({
        ok: true, originalTextUntouched: true, region: crop.region,
        alternatives: [
          { type: 'regional-original', text: original.text, confidence: original.confidence },
          { type: 'regional-normalized', text: normalized.text, confidence: normalized.confidence },
        ],
        requiresReview: true,
      });
    } catch (error) {
      if (error instanceof InvalidDocumentError) {
        response.status(400).json({ ok: false, error: 'INVALID_DOCUMENT' });
        return;
      }
      console.error('Printed region review error:', error);
      response.status(500).json({ ok: false, error: 'REGION_REVIEW_ERROR' });
    } finally {
      regionalReviewsInFlight -= 1;
    }
  },
);

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    if (
      error instanceof
        multer.MulterError
    ) {
      if (
        error.code ===
        'LIMIT_FILE_SIZE'
      ) {
        response
          .status(413)
          .json({
            ok: false,
            error:
              'FILE_TOO_LARGE',
            message:
              'El archivo excede el tamaño máximo permitido.',
          });

        return;
      }

      response
        .status(400)
        .json({
          ok: false,
          error:
            'UPLOAD_ERROR',
          message:
            'No fue posible recibir el archivo.',
        });

      return;
    }

    next(error);
  },
);

if (
  process.env.NODE_ENV !== 'test'
) {
  app.listen(
    config.port,
    '127.0.0.1',
    () => {
      console.log(
        `TEVI OCR disponible en http://127.0.0.1:${config.port}`,
      );
    },
  );
}

export { app };
