import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  app,
} from '../../src/server.js';

async function withServer(
  callback: (
    baseUrl: string,
  ) => Promise<void>,
): Promise<void> {
  const server =
    app.listen(
      0,
      '127.0.0.1',
    );

  try {
    await new Promise<void>(
      (resolve) => {
        server.once(
          'listening',
          resolve,
        );
      },
    );

    const address =
      server.address();

    assert.ok(
      address &&
      typeof address === 'object',
    );

    await callback(
      `http://127.0.0.1:${address.port}`,
    );
  } finally {
    await new Promise<void>(
      (resolve, reject) => {
        server.close(
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          },
        );
      },
    );
  }
}

test(
  'rechaza request sin archivo',
  async () => {
    await withServer(
      async (baseUrl) => {
        const form =
          new FormData();

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'FILE_REQUIRED',
        );
      },
    );
  },
);

test(
  'rechaza archivo cuyo MIME no coincide con su firma',
  async () => {
    await withServer(
      async (baseUrl) => {
        const png =
          await fs.readFile(
            'tests/fixtures/printed/printed-clean.png',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [png],
            {
              type:
                'application/pdf',
            },
          ),
          'falso.pdf',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'INVALID_DOCUMENT',
        );
      },
    );
  },
);

test(
  'procesa PNG válido mediante OCR',
  async () => {
    await withServer(
      async (baseUrl) => {
        const png =
          await fs.readFile(
            'tests/fixtures/printed/printed-clean.png',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [png],
            {
              type:
                'image/png',
            },
          ),
          'printed-clean.png',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          200,
        );

        const payload =
          await response.json() as {
            ok: boolean;
            document: {
              kind: string;
              mimeType: string;
            };
            ocr: {
              text: string;
              confidence:
                number | null;
              quality: {
                status: string;
                requiresReview: boolean;
                reasons: string[];
              };
              pages: Array<{
                quality: {
                  status: string;
                  requiresReview: boolean;
                };
              }>;
            };
          };

        assert.equal(
          payload.ok,
          true,
        );

        assert.equal(
          payload.document.kind,
          'png',
        );

        assert.equal(
          payload.document.mimeType,
          'image/png',
        );

        assert.match(
          payload.ocr.text,
          /SERVICIO DE IMPUESTOS NACIONALES/,
        );

        assert.equal(
          payload.ocr.quality.status,
          'ACCEPTABLE',
        );

        assert.equal(
          payload.ocr.quality.requiresReview,
          false,
        );

        assert.equal(
          payload.ocr.pages[0]?.quality.status,
          'ACCEPTABLE',
        );

        assert.equal(
          payload.ocr.pages[0]
            ?.quality.requiresReview,
          false,
        );
      },
    );
  },
);

test(
  'procesa JPEG válido mediante OCR',
  async () => {
    await withServer(
      async (baseUrl) => {
        const jpeg =
          await fs.readFile(
            'tests/fixtures/printed/printed-clean.jpg',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [jpeg],
            {
              type:
                'image/jpeg',
            },
          ),
          'printed-clean.jpg',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          200,
        );

        const payload =
          await response.json() as {
            ok: boolean;
            document: {
              kind: string;
              mimeType: string;
            };
            ocr: {
              text: string;
            };
          };

        assert.equal(
          payload.ok,
          true,
        );

        assert.equal(
          payload.document.kind,
          'jpeg',
        );

        assert.equal(
          payload.document.mimeType,
          'image/jpeg',
        );

        assert.match(
          payload.ocr.text,
          /SERVICIO DE IMPUESTOS NACIONALES/,
        );
      },
    );
  },
);

test(
  'procesa PDF válido mediante rasterización y OCR',
  async () => {
    await withServer(
      async (baseUrl) => {
        const pdf =
          await fs.readFile(
            'tests/fixtures/printed/printed-clean.pdf',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [pdf],
            {
              type:
                'application/pdf',
            },
          ),
          'printed-clean.pdf',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          200,
        );

        const payload =
          await response.json() as {
            ok: boolean;
            document: {
              kind: string;
              mimeType: string;
            };
            ocr: {
              text: string;
            };
          };

        assert.equal(
          payload.ok,
          true,
        );

        assert.equal(
          payload.document.kind,
          'pdf',
        );

        assert.equal(
          payload.document.mimeType,
          'application/pdf',
        );

        assert.match(
          payload.ocr.text,
          /SERVICIO DE IMPUESTOS NACIONALES/,
        );

        assert.match(
          payload.ocr.text,
          /1020304050/,
        );
      },
    );
  },
);

test(
  'rechaza archivos mayores al límite configurado',
  async () => {
    await withServer(
      async (baseUrl) => {
        const oversized =
          Buffer.alloc(
            20 * 1024 * 1024 + 1,
            0x41,
          );

        oversized.set(
          [
            0x89,
            0x50,
            0x4e,
            0x47,
            0x0d,
            0x0a,
            0x1a,
            0x0a,
          ],
          0,
        );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [oversized],
            {
              type:
                'image/png',
            },
          ),
          'demasiado-grande.png',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          413,
        );

        const payload =
          await response.json() as {
            ok: boolean;
            error: string;
          };

        assert.equal(
          payload.ok,
          false,
        );

        assert.equal(
          payload.error,
          'FILE_TOO_LARGE',
        );
      },
    );
  },
);

test(
  'procesa todas las páginas de un PDF permitido',
  async () => {
    await withServer(
      async (baseUrl) => {
        const pdf =
          await fs.readFile(
            'tests/fixtures/printed/printed-two-pages.pdf',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [pdf],
            {
              type:
                'application/pdf',
            },
          ),
          'printed-two-pages.pdf',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          200,
        );

        const payload =
          await response.json() as {
            document: {
              pages: number;
            };
            ocr: {
              text: string;
              pages: Array<{
                pageNumber: number;
                text: string;
              }>;
            };
          };

        assert.equal(
          payload.document.pages,
          2,
        );

        assert.equal(
          payload.ocr.pages.length,
          2,
        );

        assert.equal(
          payload.ocr.pages[0]?.pageNumber,
          1,
        );

        assert.equal(
          payload.ocr.pages[1]?.pageNumber,
          2,
        );

        assert.match(
          payload.ocr.text,
          /PAGINA UNO/,
        );

        assert.match(
          payload.ocr.text,
          /SEGUNDA PAGINA DEL DOCUMENTO/,
        );

        // El endpoint expone OCR raw. Tesseract puede
        // confundir I/1 sin afectar el procesamiento
        // correcto de la segunda página.
        assert.match(
          payload.ocr.text,
          /TEV[I1]-002-2026/,
        );
      },
    );
  },
);

test(
  'rechaza PDF que supera el máximo de páginas',
  async () => {
    await withServer(
      async (baseUrl) => {
        const pdf =
          await fs.readFile(
            'tests/fixtures/printed/printed-four-pages.pdf',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [pdf],
            {
              type:
                'application/pdf',
            },
          ),
          'printed-four-pages.pdf',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'PDF_PAGE_LIMIT_EXCEEDED',
        );
      },
    );
  },
);

test(
  'rechaza PDF con firma válida pero contenido corrupto',
  async () => {
    await withServer(
      async (baseUrl) => {
        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [
              Buffer.from(
                '%PDF-1.4\nesto no es un PDF válido',
              ),
            ],
            {
              type:
                'application/pdf',
            },
          ),
          'corrupto.pdf',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'INVALID_PDF',
        );
      },
    );
  },
);

test(
  'rechaza PNG con firma válida pero contenido corrupto',
  async () => {
    await withServer(
      async (baseUrl) => {
        const corruptPng =
          Buffer.concat([
            Buffer.from([
              0x89,
              0x50,
              0x4e,
              0x47,
              0x0d,
              0x0a,
              0x1a,
              0x0a,
            ]),
            Buffer.from(
              'contenido corrupto',
            ),
          ]);

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [corruptPng],
            {
              type:
                'image/png',
            },
          ),
          'corrupto.png',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'INVALID_IMAGE',
        );
      },
    );
  },
);

test(
  'conserva camera como origen de una captura enviada al OCR',
  async () => {
    await withServer(
      async (baseUrl) => {
        const jpeg =
          await fs.readFile(
            'tests/fixtures/printed/printed-clean.jpg',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [jpeg],
            {
              type:
                'image/jpeg',
            },
          ),
          'camera-capture.jpg',
        );

        form.append(
          'source',
          'camera',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          200,
        );

        const payload =
          await response.json() as {
            document: {
              source: string;
              kind: string;
            };
            ocr: {
              text: string;
            };
          };

        assert.equal(
          payload.document.source,
          'camera',
        );

        assert.equal(
          payload.document.kind,
          'jpeg',
        );

        assert.match(
          payload.ocr.text,
          /SERVICIO DE IMPUESTOS NACIONALES/,
        );
      },
    );
  },
);

test(
  'rechaza PDF enviado falsamente como origen camera',
  async () => {
    await withServer(
      async (baseUrl) => {
        const pdf =
          await fs.readFile(
            'tests/fixtures/printed/printed-clean.pdf',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [pdf],
            {
              type:
                'application/pdf',
            },
          ),
          'captura.pdf',
        );

        form.append(
          'source',
          'camera',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'INVALID_DOCUMENT',
        );
      },
    );
  },
);

test(
  'preprocesa y corrige documento rotado antes del OCR',
  async () => {
    await withServer(
      async (baseUrl) => {
        const png =
          await fs.readFile(
            'tests/fixtures/degraded/rotated.png',
          );

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [png],
            {
              type:
                'image/png',
            },
          ),
          'rotated.png',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method:
                'POST',

              body:
                form,
            },
          );

        assert.equal(
          response.status,
          200,
        );

        const payload =
          await response.json() as {
            document: {
              pages: number;
            };

            ocr: {
              text: string;

              preprocessingDurationMs:
                number;

              pages: Array<{
                pageNumber: number;
                detectedAngle: number;
                preprocessingDurationMs:
                  number;
              }>;
            };
          };

        assert.equal(
          payload.document.pages,
          1,
        );

        assert.equal(
          payload.ocr.pages.length,
          1,
        );

        assert.ok(
          payload.ocr.preprocessingDurationMs >
          0,
        );

        assert.ok(
          payload.ocr.pages[0]!
            .detectedAngle >=
            -5 &&
          payload.ocr.pages[0]!
            .detectedAngle <=
            -3,
        );

        assert.ok(
          payload.ocr.pages[0]!
            .preprocessingDurationMs >
            0,
        );

        assert.match(
          payload.ocr.text,
          /SERVICIO DE IMPUESTOS NACIONALES/,
        );

        assert.match(
          payload.ocr.text,
          /TEVI-001-2026/,
        );

        assert.match(
          payload.ocr.text,
          /06\/10\/2026/,
        );
      },
    );
  },
);

test(
  'rechaza archivo vacío',
  async () => {
    await withServer(
      async (baseUrl) => {
        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [
              Buffer.alloc(0),
            ],
            {
              type:
                'image/png',
            },
          ),
          'vacio.png',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'INVALID_DOCUMENT',
        );
      },
    );
  },
);

test(
  'rechaza tipo MIME no soportado',
  async () => {
    await withServer(
      async (baseUrl) => {
        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [
              Buffer.from(
                'documento de texto',
              ),
            ],
            {
              type:
                'text/plain',
            },
          ),
          'documento.txt',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'INVALID_DOCUMENT',
        );
      },
    );
  },
);

test(
  'rechaza JPEG con firma válida pero contenido corrupto',
  async () => {
    await withServer(
      async (baseUrl) => {
        const corruptJpeg =
          Buffer.concat([
            Buffer.from([
              0xff,
              0xd8,
              0xff,
              0xe0,
            ]),
            Buffer.from(
              'contenido corrupto',
            ),
          ]);

        const form =
          new FormData();

        form.append(
          'file',
          new Blob(
            [
              corruptJpeg,
            ],
            {
              type:
                'image/jpeg',
            },
          ),
          'corrupto.jpg',
        );

        const response =
          await fetch(
            `${baseUrl}/api/ocr/file`,
            {
              method: 'POST',
              body: form,
            },
          );

        assert.equal(
          response.status,
          400,
        );

        const payload =
          await response.json() as {
            error: string;
          };

        assert.equal(
          payload.error,
          'INVALID_IMAGE',
        );
      },
    );
  },
);
