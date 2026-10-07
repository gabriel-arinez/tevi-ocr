import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import {
  config,
} from '../../src/core/config.js';

import {
  prepareOcrInput,
  DocumentPreparationError,
} from '../../src/files/prepare-ocr-input.js';


test(
  'rechaza imagen que supera el máximo de píxeles',
  async () => {
    const width = 8_000;
    const height = 5_001;

    assert.ok(
      width * height >
      config.ocr.maxImagePixels,
    );

    const pixels =
      Buffer.alloc(
        width * height * 3,
        255,
      );

    const image =
      await sharp(
        pixels,
        {
          raw: {
            width,
            height,
            channels: 3,
          },
        },
      )
        .png()
        .toBuffer();

    await assert.rejects(
      prepareOcrInput({
        source: 'file',
        kind: 'png',
        mimeType: 'image/png',
        originalName:
          'demasiados-pixeles.png',
        buffer: image,
      }),
      (
        error: unknown,
      ) =>
        error instanceof
          DocumentPreparationError &&
        error.code ===
          'IMAGE_PIXEL_LIMIT_EXCEEDED',
    );
  },
);
