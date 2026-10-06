import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import sharp from 'sharp';

import {
  preprocessImage,
  preprocessingStrategies,
} from '../../src/preprocessing/strategies.js';

test(
  'todas las estrategias producen una imagen válida',
  async () => {
    const input =
      await fs.readFile(
        'tests/fixtures/printed/printed-clean.png',
      );

    for (
      const strategy of preprocessingStrategies
    ) {
      const output =
        await preprocessImage(
          input,
          strategy,
        );

      assert.ok(
        output.length > 0,
        strategy,
      );

      const metadata =
        await sharp(output)
          .metadata();

      assert.ok(
        metadata.width,
        strategy,
      );

      assert.ok(
        metadata.height,
        strategy,
      );
    }
  },
);

test(
  'none conserva exactamente el buffer original',
  async () => {
    const input =
      await fs.readFile(
        'tests/fixtures/printed/printed-clean.png',
      );

    const output =
      await preprocessImage(
        input,
        'none',
      );

    assert.equal(
      output,
      input,
    );
  },
);
