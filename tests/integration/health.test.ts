import test from 'node:test';
import assert from 'node:assert/strict';

import {
  app,
} from '../../src/server.js';

test(
  'GET /api/health responde estado operativo',
  async () => {
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

      const response =
        await fetch(
          `http://127.0.0.1:${address.port}/api/health`,
        );

      assert.equal(
        response.status,
        200,
      );

      assert.deepEqual(
        await response.json(),
        {
          ok: true,
          service: 'tevi-ocr',
        },
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
  },
);
