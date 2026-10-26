import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';

import {
  createUpperBorderCropCandidate,
  preferBorderCropCandidate,
} from '../../src/ocr/printed-photo-border.js';

test('no elimina encabezados sin suficiente mejora y preservación de texto', () => {
  const original = {
    text: 'AUTORIZACIÓN DE PERMISO '.repeat(15),
    confidence: 89,
  };
  assert.equal(preferBorderCropCandidate(original, {
    text: 'AUTORIZACIÓN DE PERMISO '.repeat(8),
    confidence: 97,
  }), false);
  assert.equal(preferBorderCropCandidate(original, {
    text: original.text,
    confidence: 90,
  }), false);
  assert.equal(preferBorderCropCandidate(original, {
    text: original.text,
    confidence: 93,
  }), true);
});

test('crea candidato de recorte fotográfico sin alterar la imagen original', async () => {
  const input = await fs.readFile(
    'tests/fixtures/camera/foto_texto_impreso.jpeg',
  );
  const candidate = await createUpperBorderCropCandidate(input);
  assert.ok(candidate);
  const originalMetadata = await sharp(input).metadata();
  const cropMetadata = await sharp(candidate).metadata();
  assert.equal(cropMetadata.width, originalMetadata.width);
  assert.ok(cropMetadata.height! < originalMetadata.height!);
  assert.ok(cropMetadata.height! >= originalMetadata.height! * .85);
});

test('no propone recorte sobre imágenes demasiado pequeñas', async () => {
  const small = await sharp({
    create: {
      width: 200, height: 200, channels: 3,
      background: '#ffffff',
    },
  }).png().toBuffer();
  assert.equal(await createUpperBorderCropCandidate(small), null);
});
