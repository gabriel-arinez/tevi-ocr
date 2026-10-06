import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateOcrMetrics,
} from '../../src/metrics/ocr-metrics.js';

test(
  'texto idéntico produce CER y WER igual a cero',
  () => {
    const result =
      calculateOcrMetrics(
        'Reclamo tributario 2026',
        'Reclamo tributario 2026',
      );

    assert.equal(result.cer, 0);
    assert.equal(result.wer, 0);
    assert.equal(
      result.characterDistance,
      0,
    );
    assert.equal(
      result.wordDistance,
      0,
    );
  },
);

test(
  'detecta una sustitución de carácter',
  () => {
    const result =
      calculateOcrMetrics(
        'ABC123',
        'ABC128',
      );

    assert.equal(
      result.characterDistance,
      1,
    );

    assert.equal(
      result.cer,
      1 / 6,
    );
  },
);

test(
  'detecta una palabra incorrecta',
  () => {
    const result =
      calculateOcrMetrics(
        'uno dos tres',
        'uno dos cuatro',
      );

    assert.equal(
      result.wordDistance,
      1,
    );

    assert.equal(
      result.wer,
      1 / 3,
    );
  },
);

test(
  'ignora diferencias puramente de espacios y saltos de línea',
  () => {
    const result =
      calculateOcrMetrics(
        [
          'NIT: 1020304050',
          'Código: TEVI-001-2026',
        ].join('\n'),
        [
          'NIT: 1020304050',
          '',
          '',
          'Código:   TEVI-001-2026',
        ].join('\n'),
      );

    assert.equal(
      result.characterDistance,
      0,
    );

    assert.equal(
      result.wordDistance,
      0,
    );

    assert.equal(
      result.cer,
      0,
    );

    assert.equal(
      result.wer,
      0,
    );
  },
);
