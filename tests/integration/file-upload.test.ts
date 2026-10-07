import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  app,
} from '../../src/server.js';

import {
  handwritingKrakenClient,
} from '../../src/ocr/handwriting-kraken-client.js';

async function makeFakeHandwritingRuntimes(
  krakenMode:
    | 'valid'
    | 'failure',
): Promise<{
  directory: string;
  detectorPython: string;
  krakenPython: string;
  krakenRuntime: string;
}> {
  const directory =
    await fs.mkdtemp(
      '/tmp/tevi-ocr-handwriting-integration-',
    );

  const detectorPython =
    `${directory}/fake-detector.sh`;

  const detectorScript =
    `${directory}/fake-detector.mjs`;

  const krakenPython =
    `${directory}/fake-kraken-python.sh`;

  const krakenRuntime =
    `${directory}/fake-kraken-runtime.mjs`;

  await fs.writeFile(
    detectorScript,
    `
import fs from 'node:fs';

const args =
  process.argv.slice(2);

const valueAfter = (name) => {
  const index =
    args.indexOf(name);

  return index >= 0
    ? args[index + 1]
    : undefined;
};

const outputDir =
  valueAfter('--output-dir');

const jsonPath =
  valueAfter('--json');

if (!outputDir || !jsonPath) {
  process.exitCode = 2;
} else {
  fs.mkdirSync(
    outputDir,
    {
      recursive: true,
    },
  );

  const linePath =
    outputDir + '/line-001.png';

  fs.writeFileSync(
    linePath,
    Buffer.from([]),
  );

  fs.writeFileSync(
    jsonPath,
    JSON.stringify({
      ok: true,
      detectionSeconds: 0.01,
      lineCount: 1,
      lines: [
        {
          lineNumber: 1,
          path: linePath,
          bbox: {
            x1: 10,
            y1: 20,
            x2: 100,
            y2: 50,
          },
        },
      ],
    }),
  );
}
`,
    'utf8',
  );

  await fs.writeFile(
    detectorPython,
    `#!/usr/bin/env bash
shift
exec "${process.execPath}" "${detectorScript}" "$@"
`,
    {
      encoding: 'utf8',
      mode: 0o755,
    },
  );

  await fs.writeFile(
    krakenRuntime,
    `
import readline from 'node:readline';

const mode =
  process.env
    .TEVI_OCR_FAKE_KRAKEN_INTEGRATION_MODE
  ?? 'valid';

let requestCount = 0;

const emit = (payload) => {
  process.stdout.write(
    JSON.stringify(payload) + '\\n'
  );
};

emit({
  type: 'ready',
  ok: true,
  engine:
    'Kraken 7.1.1 / PP-OCRv6 small',
  model:
    '10.5281/zenodo.21788405',
  modelLoadSeconds: 0.02,
  threads: 4,
  interopThreads: 2,
});

const reader =
  readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

reader.on(
  'line',
  (raw) => {
    const request =
      JSON.parse(raw);

    requestCount += 1;

    if (mode === 'failure') {
      emit({
        type: 'result',
        id: request.id,
        ok: false,
        error:
          'RECOGNITION_FAILED',
      });

      return;
    }

    const makeCharacter = (
      characterIndex,
      char,
      confidence,
      x1,
      x2,
    ) => ({
      lineNumber: 1,
      characterIndex,
      char,
      cut: [
        { x: x1, y: 1 },
        { x: x2, y: 1 },
        { x: x2, y: 10 },
        { x: x1, y: 10 },
      ],
      bbox: {
        x1,
        y1: 1,
        x2,
        y2: 10,
      },
      confidence,
    });

    const characters = [
      makeCharacter(
        0,
        'N',
        0.95,
        1,
        5,
      ),
      makeCharacter(
        1,
        'I',
        0.92,
        6,
        10,
      ),
      makeCharacter(
        2,
        'T',
        0.91,
        11,
        15,
      ),
      makeCharacter(
        3,
        ':',
        0.88,
        16,
        18,
      ),
      makeCharacter(
        4,
        ' ',
        0.80,
        19,
        21,
      ),
      makeCharacter(
        5,
        '1',
        0.65,
        22,
        26,
      ),
      makeCharacter(
        6,
        '2',
        0.93,
        27,
        31,
      ),
      makeCharacter(
        7,
        '3',
        0.94,
        32,
        36,
      ),
    ];

    const text =
      characters
        .map(
          (item) => item.char,
        )
        .join('');

    emit({
      type: 'result',
      id: request.id,
      ok: true,

      engine:
        'Kraken 7.1.1 / PP-OCRv6 small',

      model:
        '10.5281/zenodo.21788405',

      modelLoadSeconds:
        0.02,

      recognitionSeconds:
        0.03,

      lineCount:
        1,

      characterCount:
        characters.length,

      text,

      lines: [
        {
          lineNumber:
            1,

          text,

          prediction:
            text,

          bbox: {
            x1: 10,
            y1: 20,
            x2: 100,
            y2: 50,
          },

          recognitionSeconds:
            0.03,

          characters,
        },
      ],

      characters,

      runtime: {
        persistent:
          true,

        threads:
          4,

        interopThreads:
          2,

        requestCount,
      },
    });
  },
);
`,
    'utf8',
  );

  await fs.writeFile(
    krakenPython,
    `#!/usr/bin/env bash
shift
shift
exec "${process.execPath}" "${krakenRuntime}"
`,
    {
      encoding: 'utf8',
      mode: 0o755,
    },
  );

  process.env
    .TEVI_OCR_FAKE_KRAKEN_INTEGRATION_MODE =
    krakenMode;

  return {
    directory,
    detectorPython,
    krakenPython,
    krakenRuntime,
  };
}


async function withFakeHandwritingRuntime(
  krakenMode:
    | 'valid'
    | 'failure',
  callback: () => Promise<void>,
): Promise<void> {
  const previousDetector =
    process.env
      .TEVI_OCR_DETECTOR_PYTHON;

  const previousKrakenPython =
    process.env
      .TEVI_OCR_KRAKEN_PYTHON;

  const previousKrakenRuntime =
    process.env
      .TEVI_OCR_KRAKEN_RUNTIME;

  const previousMode =
    process.env
      .TEVI_OCR_FAKE_KRAKEN_INTEGRATION_MODE;

  const fake =
    await makeFakeHandwritingRuntimes(
      krakenMode,
    );

  await handwritingKrakenClient
    .close();

  process.env
    .TEVI_OCR_DETECTOR_PYTHON =
    fake.detectorPython;

  process.env
    .TEVI_OCR_KRAKEN_PYTHON =
    fake.krakenPython;

  process.env
    .TEVI_OCR_KRAKEN_RUNTIME =
    fake.krakenRuntime;

  try {
    await callback();
  } finally {
    await handwritingKrakenClient
      .close();

    if (
      previousDetector ===
      undefined
    ) {
      delete process.env
        .TEVI_OCR_DETECTOR_PYTHON;
    } else {
      process.env
        .TEVI_OCR_DETECTOR_PYTHON =
        previousDetector;
    }

    if (
      previousKrakenPython ===
      undefined
    ) {
      delete process.env
        .TEVI_OCR_KRAKEN_PYTHON;
    } else {
      process.env
        .TEVI_OCR_KRAKEN_PYTHON =
        previousKrakenPython;
    }

    if (
      previousKrakenRuntime ===
      undefined
    ) {
      delete process.env
        .TEVI_OCR_KRAKEN_RUNTIME;
    } else {
      process.env
        .TEVI_OCR_KRAKEN_RUNTIME =
        previousKrakenRuntime;
    }

    if (
      previousMode ===
      undefined
    ) {
      delete process.env
        .TEVI_OCR_FAKE_KRAKEN_INTEGRATION_MODE;
    } else {
      process.env
        .TEVI_OCR_FAKE_KRAKEN_INTEGRATION_MODE =
        previousMode;
    }

    await fs.rm(
      fake.directory,
      {
        recursive: true,
        force: true,
      },
    );
  }
}


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
          (payload.ocr as {
            mode?: string;
          }).mode,
          'printed',
        );

        assert.equal(
          (payload.ocr as {
            engine?: string;
          }).engine,
          'tesseract.js',
        );

        assert.equal(
          (payload.ocr as {
            experimental?: boolean;
          }).experimental,
          false,
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


test(
  'rechaza modo OCR desconocido',
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

        form.append(
          'mode',
          'handwriten',
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
            ok: boolean;
            error: string;
          };

        assert.equal(
          payload.ok,
          false,
        );

        assert.equal(
          payload.error,
          'OCR_MODE_INVALID',
        );
      },
    );
  },
);


test(
  'modo manuscrito rechaza PDF antes de ejecutar recognizer',
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

        form.append(
          'mode',
          'handwritten',
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
            ok: boolean;
            error: string;
          };

        assert.equal(
          payload.ok,
          false,
        );

        assert.equal(
          payload.error,
          'INVALID_DOCUMENT',
        );
      },
    );
  },
);


test(
  'modo manuscrito expone contrato Kraken v2 completo',
  async () => {
    await withFakeHandwritingRuntime(
      'valid',
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

            form.append(
              'mode',
              'handwritten',
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
                ok: boolean;

                ocr: {
                  mode: string;
                  experimental:
                    boolean;
                  engine: string;
                  model: string;
                  text: string;
                  confidence: null;

                  quality: {
                    status: string;
                    requiresReview:
                      boolean;
                    characterCount:
                      number;
                    fallbackCharacterCount:
                      number;
                    reviewCharacterCount:
                      number;
                    fallbackThreshold:
                      number;
                    automaticAcceptEnabled:
                      boolean;
                  };

                  characterCount:
                    number;

                  characters:
                    Array<{
                      char: string;
                      confidence:
                        number;
                    }>;

                  structuredFields: {
                    rawText: string;
                    fields:
                      Array<{
                        fieldType:
                          string;
                        raw:
                          string;
                        resolved:
                          string | null;
                        status:
                          string;
                      }>;
                  };

                  runtime: {
                    persistent:
                      boolean;
                    threads:
                      number;
                    interopThreads:
                      number;
                    requestCount:
                      number;
                  };

                  pages:
                    Array<{
                      lineCount:
                        number;
                      characterCount:
                        number;
                      lines:
                        unknown[];
                      characters:
                        unknown[];
                      structuredFields: {
                        rawText:
                          string;
                      };
                    }>;
                };
              };

            assert.equal(
              payload.ok,
              true,
            );

            assert.equal(
              payload.ocr.mode,
              'handwritten',
            );

            assert.equal(
              payload.ocr.experimental,
              true,
            );

            assert.match(
              payload.ocr.engine,
              /Kraken/,
            );

            assert.equal(
              payload.ocr.model,
              '10.5281/zenodo.21788405',
            );

            assert.equal(
              payload.ocr.text,
              'NIT: 123',
            );

            assert.equal(
              payload.ocr.confidence,
              null,
            );

            assert.equal(
              payload.ocr
                .quality.status,
              'REVIEW',
            );

            assert.equal(
              payload.ocr
                .quality.requiresReview,
              true,
            );

            assert.equal(
              payload.ocr
                .quality.characterCount,
              8,
            );

            assert.equal(
              payload.ocr
                .quality.fallbackCharacterCount,
              1,
            );

            assert.equal(
              payload.ocr
                .quality.reviewCharacterCount,
              8,
            );

            assert.equal(
              payload.ocr
                .quality.fallbackThreshold,
              0.70,
            );

            assert.equal(
              payload.ocr
                .quality.automaticAcceptEnabled,
              false,
            );

            assert.equal(
              payload.ocr.characterCount,
              8,
            );

            assert.equal(
              payload.ocr.characters.length,
              8,
            );

            assert.equal(
              payload.ocr
                .characters[5]
                ?.confidence,
              0.65,
            );

            assert.equal(
              payload.ocr
                .structuredFields
                .rawText,
              payload.ocr.text,
            );

            assert.equal(
              payload.ocr
                .structuredFields
                .fields.length,
              1,
            );

            assert.equal(
              payload.ocr
                .structuredFields
                .fields[0]
                ?.fieldType,
              'NIT',
            );

            assert.equal(
              payload.ocr
                .structuredFields
                .fields[0]
                ?.raw,
              '123',
            );

            assert.equal(
              payload.ocr
                .structuredFields
                .fields[0]
                ?.resolved,
              '123',
            );

            assert.equal(
              payload.ocr
                .runtime.persistent,
              true,
            );

            assert.equal(
              payload.ocr
                .runtime.threads,
              4,
            );

            assert.equal(
              payload.ocr
                .runtime.interopThreads,
              2,
            );

            assert.equal(
              payload.ocr
                .runtime.requestCount,
              1,
            );

            assert.equal(
              payload.ocr.pages.length,
              1,
            );

            assert.equal(
              payload.ocr.pages[0]
                ?.lineCount,
              1,
            );

            assert.equal(
              payload.ocr.pages[0]
                ?.characterCount,
              8,
            );

            assert.equal(
              payload.ocr.pages[0]
                ?.structuredFields
                .rawText,
              payload.ocr.text,
            );
          },
        );
      },
    );
  },
);


test(
  'runtime Kraken ausente responde 503 sin filtrar rutas locales',
  async () => {
    const previousDetector =
      process.env
        .TEVI_OCR_DETECTOR_PYTHON;

    const previousKraken =
      process.env
        .TEVI_OCR_KRAKEN_PYTHON;

    const previousRuntime =
      process.env
        .TEVI_OCR_KRAKEN_RUNTIME;

    const fake =
      await makeFakeHandwritingRuntimes(
        'valid',
      );

    await handwritingKrakenClient
      .close();

    process.env
      .TEVI_OCR_DETECTOR_PYTHON =
      fake.detectorPython;

    process.env
      .TEVI_OCR_KRAKEN_PYTHON =
      '/tmp/tevi-ocr-no-existe-kraken';

    process.env
      .TEVI_OCR_KRAKEN_RUNTIME =
      fake.krakenRuntime;

    try {
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

          form.append(
            'mode',
            'handwritten',
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
            503,
          );

          const payload =
            await response.json() as {
              error: string;
              message: string;
            };

          assert.equal(
            payload.error,
            'HANDWRITING_RUNTIME_UNAVAILABLE',
          );

          assert.equal(
            payload.message,
            'Runtime OCR manuscrito no disponible.',
          );

          assert.doesNotMatch(
            payload.message,
            /\/tmp\/|\/home\//,
          );
        },
      );
    } finally {
      await handwritingKrakenClient
        .close();

      if (
        previousDetector ===
        undefined
      ) {
        delete process.env
          .TEVI_OCR_DETECTOR_PYTHON;
      } else {
        process.env
          .TEVI_OCR_DETECTOR_PYTHON =
          previousDetector;
      }

      if (
        previousKraken ===
        undefined
      ) {
        delete process.env
          .TEVI_OCR_KRAKEN_PYTHON;
      } else {
        process.env
          .TEVI_OCR_KRAKEN_PYTHON =
          previousKraken;
      }

      if (
        previousRuntime ===
        undefined
      ) {
        delete process.env
          .TEVI_OCR_KRAKEN_RUNTIME;
      } else {
        process.env
          .TEVI_OCR_KRAKEN_RUNTIME =
          previousRuntime;
      }

      delete process.env
        .TEVI_OCR_FAKE_KRAKEN_INTEGRATION_MODE;

      await fs.rm(
        fake.directory,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);


test(
  'fallo interno de Kraken responde 500',
  async () => {
    await withFakeHandwritingRuntime(
      'failure',
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

            form.append(
              'mode',
              'handwritten',
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
              500,
            );

            const payload =
              await response.json() as {
                error: string;
                message: string;
              };

            assert.equal(
              payload.error,
              'HANDWRITING_PROCESSING_ERROR',
            );

            assert.doesNotMatch(
              payload.message,
              /\/tmp\/|\/home\//,
            );
          },
        );
      },
    );
  },
);
