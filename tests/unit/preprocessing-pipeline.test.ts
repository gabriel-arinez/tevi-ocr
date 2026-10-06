import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import sharp from 'sharp';

import {
  preprocessForOcr,
} from '../../src/preprocessing/pipeline.js';

test(
  'pipeline productivo conserva documento limpio sin deskew falso',
  async () => {
    const input =
      await fs.readFile(
        'tests/fixtures/printed/printed-clean.png',
      );

    const result =
      await preprocessForOcr(
        input,
      );

    assert.equal(
      result.detectedAngle,
      0,
    );

    assert.ok(
      result.durationMs > 0,
    );

    const metadata =
      await sharp(
        result.buffer,
      ).metadata();

    assert.ok(
      metadata.width,
    );

    assert.ok(
      metadata.height,
    );
  },
);

test(
  'pipeline productivo corrige documento rotado cuatro grados',
  async () => {
    const input =
      await fs.readFile(
        'tests/fixtures/degraded/rotated.png',
      );

    const result =
      await preprocessForOcr(
        input,
      );

    assert.ok(
      result.detectedAngle >= -5 &&
      result.detectedAngle <= -3,
      `Ángulo detectado: ${result.detectedAngle}`,
    );

    assert.ok(
      result.durationMs > 0,
    );
  },
);
