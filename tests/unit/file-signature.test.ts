import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectFileType,
} from '../../src/files/file-signature.js';

test(
  'detecta PDF por firma real',
  () => {
    const result =
      detectFileType(
        Buffer.from(
          '%PDF-1.7\n',
        ),
      );

    assert.deepEqual(
      result,
      {
        kind: 'pdf',
        mimeType:
          'application/pdf',
      },
    );
  },
);

test(
  'detecta JPEG por firma real',
  () => {
    const result =
      detectFileType(
        Buffer.from([
          0xff,
          0xd8,
          0xff,
          0xe0,
        ]),
      );

    assert.deepEqual(
      result,
      {
        kind: 'jpeg',
        mimeType:
          'image/jpeg',
      },
    );
  },
);

test(
  'detecta PNG por firma real',
  () => {
    const result =
      detectFileType(
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
      );

    assert.deepEqual(
      result,
      {
        kind: 'png',
        mimeType:
          'image/png',
      },
    );
  },
);

test(
  'rechaza contenido desconocido',
  () => {
    assert.equal(
      detectFileType(
        Buffer.from(
          'no-es-un-documento',
        ),
      ),
      null,
    );
  },
);
