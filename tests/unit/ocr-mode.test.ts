import test from 'node:test';
import assert from 'node:assert/strict';

import {
  InvalidOcrModeError,
  resolveOcrMode,
} from '../../src/ocr/ocr-mode.js';


test(
  'modo ausente conserva compatibilidad y usa printed',
  () => {
    assert.equal(
      resolveOcrMode(
        undefined,
      ),
      'printed',
    );

    assert.equal(
      resolveOcrMode(
        '',
      ),
      'printed',
    );
  },
);


test(
  'acepta únicamente modos soportados',
  () => {
    assert.equal(
      resolveOcrMode(
        'printed',
      ),
      'printed',
    );

    assert.equal(
      resolveOcrMode(
        'handwritten',
      ),
      'handwritten',
    );
  },
);


test(
  'rechaza modo OCR desconocido',
  () => {
    assert.throws(
      () =>
        resolveOcrMode(
          'handwriten',
        ),
      InvalidOcrModeError,
    );
  },
);
