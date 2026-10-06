import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocumentInput,
  InvalidDocumentError,
} from '../../src/files/create-document-input.js';

function createFile(
  overrides: Partial<
    Express.Multer.File
  > = {},
): Express.Multer.File {
  const buffer =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

  return {
    fieldname: 'file',
    originalname:
      'documento.png',
    encoding: '7bit',
    mimetype:
      'image/png',
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  };
}

test(
  'crea DocumentInput cuando MIME y firma coinciden',
  () => {
    const result =
      createDocumentInput(
        createFile(),
      );

    assert.equal(
      result.source,
      'file',
    );

    assert.equal(
      result.kind,
      'png',
    );

    assert.equal(
      result.mimeType,
      'image/png',
    );
  },
);

test(
  'rechaza MIME falsificado',
  () => {
    assert.throws(
      () =>
        createDocumentInput(
          createFile({
            mimetype:
              'application/pdf',
          }),
        ),
      InvalidDocumentError,
    );
  },
);

test(
  'rechaza contenido sin firma válida',
  () => {
    const buffer =
      Buffer.from(
        'contenido falso',
      );

    assert.throws(
      () =>
        createDocumentInput(
          createFile({
            buffer,
            size:
              buffer.length,
          }),
        ),
      InvalidDocumentError,
    );
  },
);

test(
  'rechaza PDF declarado como captura de cámara',
  () => {
    const buffer =
      Buffer.from(
        '%PDF-1.4\n',
      );

    assert.throws(
      () =>
        createDocumentInput(
          createFile({
            originalname:
              'captura.pdf',
            mimetype:
              'application/pdf',
            buffer,
            size:
              buffer.length,
          }),
          'camera',
        ),
      InvalidDocumentError,
    );
  },
);
