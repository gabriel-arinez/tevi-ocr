import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  KrakenRuntimeClient,
  KrakenRuntimeClientError,
} from '../../src/ocr/handwriting-kraken-client.js';


const previousPython =
  process.env
    .TEVI_OCR_KRAKEN_PYTHON;

const previousRuntime =
  process.env
    .TEVI_OCR_KRAKEN_RUNTIME;

const previousMode =
  process.env
    .TEVI_OCR_FAKE_KRAKEN_MODE;


async function makeFakeRuntime():
  Promise<{
    directory: string;
    python: string;
    runtime: string;
  }> {
  const directory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'tevi-ocr-fake-kraken-',
      ),
    );

  const fakeRuntime =
    path.join(
      directory,
      'fake-runtime.mjs',
    );

  const fakePython =
    path.join(
      directory,
      'fake-python.sh',
    );

  await fs.writeFile(
    fakeRuntime,
    `
import readline from 'node:readline';

const mode =
  process.env.TEVI_OCR_FAKE_KRAKEN_MODE
  ?? 'valid';

let requestCount = 0;

const emit = (payload) => {
  process.stdout.write(
    JSON.stringify(payload) + '\\n'
  );
};

if (mode === 'invalid-ready') {
  emit({
    type: 'ready',
    ok: true,
    engine: 'fake',
    model: 'fake',
    modelLoadSeconds: 0.01,
    threads: 9,
    interopThreads: 9,
  });
} else if (mode === 'invalid-json') {
  process.stdout.write('NOT_JSON\\n');
} else {
  emit({
    type: 'ready',
    ok: true,
    engine: 'fake-kraken',
    model: 'fake-model',
    modelLoadSeconds: 0.01,
    threads: 4,
    interopThreads: 2,
  });
}

const reader =
  readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

reader.on(
  'line',
  async (line) => {
    const request =
      JSON.parse(line);

    requestCount += 1;

    if (mode === 'timeout') {
      return;
    }

    if (mode === 'crash') {
      process.exitCode = 7;
      reader.close();
      return;
    }

    if (mode === 'failure') {
      emit({
        type: 'result',
        id: request.id,
        ok: false,
        error: 'RECOGNITION_FAILED',
      });
      return;
    }

    if (mode === 'wrong-id') {
      emit({
        type: 'result',
        id: 'unexpected-id',
        ok: true,
      });
      return;
    }

    if (mode === 'stderr-noise') {
      process.stderr.write(
        'x'.repeat(256 * 1024)
      );
    }

    if (mode === 'slow-valid') {
      await new Promise(
        (resolve) =>
          setTimeout(resolve, 80)
      );
    }

    const confidence =
      requestCount === 1
        ? 0.8
        : 0.9;

    const character = {
      lineNumber: 1,
      characterIndex: 0,
      char: 'A',
      cut: [
        { x: 1, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 4 },
        { x: 1, y: 4 },
      ],
      bbox: {
        x1: 1,
        y1: 2,
        x2: 3,
        y2: 4,
      },
      confidence,
    };

    const response = {
      type: 'result',
      id: request.id,
      ok: true,
      engine: 'fake-kraken',
      model: 'fake-model',
      modelLoadSeconds: 0.01,
      recognitionSeconds: 0.02,
      lineCount: 1,
      characterCount: 1,
      text: 'A',
      lines: [
        {
          lineNumber: 1,
          text: 'A',
          prediction: 'A',
          bbox: {
            x1: 10,
            y1: 20,
            x2: 30,
            y2: 40,
          },
          recognitionSeconds: 0.02,
          characters: [
            character,
          ],
        },
      ],
      characters: [
        character,
      ],
      runtime: {
        persistent: true,
        threads: 4,
        interopThreads: 2,
        requestCount,
      },
    };

    emit(response);
  },
);
`,
    'utf8',
  );

  await fs.writeFile(
    fakePython,
    `#!/usr/bin/env bash
shift
shift
exec "${process.execPath}" "${fakeRuntime}"
`,
    {
      encoding: 'utf8',
      mode: 0o755,
    },
  );

  return {
    directory,
    python:
      fakePython,
    runtime:
      fakeRuntime,
  };
}


function restoreEnvironment(): void {
  if (
    previousPython === undefined
  ) {
    delete process.env
      .TEVI_OCR_KRAKEN_PYTHON;
  } else {
    process.env
      .TEVI_OCR_KRAKEN_PYTHON =
      previousPython;
  }

  if (
    previousRuntime === undefined
  ) {
    delete process.env
      .TEVI_OCR_KRAKEN_RUNTIME;
  } else {
    process.env
      .TEVI_OCR_KRAKEN_RUNTIME =
      previousRuntime;
  }

  if (
    previousMode === undefined
  ) {
    delete process.env
      .TEVI_OCR_FAKE_KRAKEN_MODE;
  } else {
    process.env
      .TEVI_OCR_FAKE_KRAKEN_MODE =
      previousMode;
  }
}


async function withFakeRuntime(
  mode: string,
  callback:
    (
      client:
        KrakenRuntimeClient,
    ) => Promise<void>,
): Promise<void> {
  const fake =
    await makeFakeRuntime();

  const client =
    new KrakenRuntimeClient();

  process.env
    .TEVI_OCR_KRAKEN_PYTHON =
    fake.python;

  process.env
    .TEVI_OCR_KRAKEN_RUNTIME =
    fake.runtime;

  process.env
    .TEVI_OCR_FAKE_KRAKEN_MODE =
    mode;

  try {
    await callback(client);
  } finally {
    await client.close();

    restoreEnvironment();

    await fs.rm(
      fake.directory,
      {
        recursive: true,
        force: true,
      },
    );
  }
}


test(
  'reutiliza el mismo runtime Kraken entre solicitudes',
  async () => {
    await withFakeRuntime(
      'valid',
      async (client) => {
        const first =
          await client.recognize(
            '/tmp/detection-a.json',
          );

        const second =
          await client.recognize(
            '/tmp/detection-b.json',
          );

        assert.equal(
          first.runtime
            .requestCount,
          1,
        );

        assert.equal(
          second.runtime
            .requestCount,
          2,
        );

        assert.equal(
          first.modelLoadSeconds,
          second.modelLoadSeconds,
        );
      },
    );
  },
);


test(
  'serializa solicitudes concurrentes sobre un solo runtime',
  async () => {
    await withFakeRuntime(
      'slow-valid',
      async (client) => {
        const [
          first,
          second,
        ] =
          await Promise.all([
            client.recognize(
              '/tmp/a.json',
            ),
            client.recognize(
              '/tmp/b.json',
            ),
          ]);

        assert.deepEqual(
          [
            first.runtime
              .requestCount,
            second.runtime
              .requestCount,
          ],
          [
            1,
            2,
          ],
        );
      },
    );
  },
);


test(
  'drena stderr sin bloquear el runtime',
  async () => {
    await withFakeRuntime(
      'stderr-noise',
      async (client) => {
        const result =
          await client.recognize(
            '/tmp/a.json',
          );

        assert.equal(
          result.text,
          'A',
        );
      },
    );
  },
);


test(
  'rechaza timeout y termina el runtime bloqueado',
  async () => {
    await withFakeRuntime(
      'timeout',
      async (client) => {
        await assert.rejects(
          client.recognize(
            '/tmp/a.json',
            50,
          ),
          (
            error:
              unknown,
          ) => (
            error instanceof
              KrakenRuntimeClientError
            &&
            error.code ===
              'KRAKEN_RUNTIME_TIMEOUT'
          ),
        );
      },
    );
  },
);


test(
  'rechaza fallo de reconocimiento sin filtrar detalles',
  async () => {
    await withFakeRuntime(
      'failure',
      async (client) => {
        await assert.rejects(
          client.recognize(
            '/tmp/a.json',
          ),
          (
            error:
              unknown,
          ) => (
            error instanceof
              KrakenRuntimeClientError
            &&
            error.code ===
              'KRAKEN_RUNTIME_PROCESSING_ERROR'
          ),
        );
      },
    );
  },
);


test(
  'rechaza identificador de respuesta inesperado',
  async () => {
    await withFakeRuntime(
      'wrong-id',
      async (client) => {
        await assert.rejects(
          client.recognize(
            '/tmp/a.json',
          ),
          (
            error:
              unknown,
          ) => (
            error instanceof
              KrakenRuntimeClientError
            &&
            error.code ===
              'KRAKEN_RUNTIME_PROTOCOL_ERROR'
          ),
        );
      },
    );
  },
);


test(
  'rechaza handshake con configuración distinta a 4/2',
  async () => {
    await withFakeRuntime(
      'invalid-ready',
      async (client) => {
        await assert.rejects(
          client.recognize(
            '/tmp/a.json',
          ),
          (
            error:
              unknown,
          ) => (
            error instanceof
              KrakenRuntimeClientError
            &&
            error.code ===
              'KRAKEN_RUNTIME_PROTOCOL_ERROR'
          ),
        );
      },
    );
  },
);


test(
  'rechaza salida que no sea JSON',
  async () => {
    await withFakeRuntime(
      'invalid-json',
      async (client) => {
        await assert.rejects(
          client.recognize(
            '/tmp/a.json',
          ),
          (
            error:
              unknown,
          ) => (
            error instanceof
              KrakenRuntimeClientError
            &&
            error.code ===
              'KRAKEN_RUNTIME_PROTOCOL_ERROR'
          ),
        );
      },
    );
  },
);


test.after(
  restoreEnvironment,
);
