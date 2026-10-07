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
  aggregateOcrQuality,
  assessOcrQuality,
} from './ocr/ocr-quality.js';

const app = express();

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
        const result =
          await engine.recognize(
            page.buffer,
          );

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
            result.durationMs,

          detectedAngle:
            page.detectedAngle,

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
          text:
            pageResults
              .map(
                (page) =>
                  page.text,
              )
              .join('\n\n'),

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
