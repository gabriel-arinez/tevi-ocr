import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateBenchmark,
} from '../../benchmark/aggregate.js';

test(
  'agrega CER y WER ponderados por tamaño de referencia',
  () => {
    const result =
      aggregateBenchmark([
        {
          characterDistance: 1,
          wordDistance: 1,
          referenceCharacters: 10,
          referenceWords: 5,
          durationMs: 100,
        },
        {
          characterDistance: 2,
          wordDistance: 1,
          referenceCharacters: 20,
          referenceWords: 10,
          durationMs: 300,
        },
      ]);

    assert.equal(
      result.characterDistance,
      3,
    );

    assert.equal(
      result.referenceCharacters,
      30,
    );

    assert.equal(
      result.cer,
      3 / 30,
    );

    assert.equal(
      result.wer,
      2 / 15,
    );

    assert.equal(
      result.totalDurationMs,
      400,
    );

    assert.equal(
      result.averageDurationMs,
      200,
    );
  },
);
