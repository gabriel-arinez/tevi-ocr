import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  detectSkewAngle,
} from '../../src/preprocessing/deskew.js';

test(
  'detecta aproximadamente la corrección para documento rotado 4 grados',
  async () => {
    const input =
      await fs.readFile(
        'tests/fixtures/degraded/rotated.png',
      );

    const result =
      await detectSkewAngle(
        input,
      );

    assert.ok(
      result.angle >= -5 &&
      result.angle <= -3,
      `Ángulo detectado: ${result.angle}`,
    );
  },
);

test(
  'detecta aproximadamente la corrección para documento rotado 8 grados',
  async () => {
    const input =
      await fs.readFile(
        'tests/fixtures/degraded/rotation-8deg.png',
      );

    const result =
      await detectSkewAngle(
        input,
      );

    assert.ok(
      result.angle >= -9 &&
      result.angle <= -7,
      `Ángulo detectado: ${result.angle}`,
    );
  },
);
