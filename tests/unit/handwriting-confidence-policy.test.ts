import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessHandwritingConfidence,
  HANDWRITING_CONFIDENCE_POLICY,
} from '../../src/ocr/handwriting-confidence-policy.js';


test(
  'mantiene ACCEPT deshabilitado',
  () => {
    assert.equal(
      HANDWRITING_CONFIDENCE_POLICY
        .acceptEnabled,
      false,
    );

    assert.equal(
      HANDWRITING_CONFIDENCE_POLICY
        .acceptThreshold,
      null,
    );

    assert.equal(
      assessHandwritingConfidence(
        1,
      ).action,
      'REVIEW',
    );
  },
);


test(
  'envía confidence menor a 0.70 a FALLBACK',
  () => {
    const result =
      assessHandwritingConfidence(
        0.699999,
      );

    assert.equal(
      result.action,
      'FALLBACK',
    );

    assert.equal(
      result.requiresFallback,
      true,
    );

    assert.equal(
      result.requiresReview,
      true,
    );
  },
);


test(
  'confidence exactamente 0.70 permanece en REVIEW',
  () => {
    const result =
      assessHandwritingConfidence(
        0.70,
      );

    assert.equal(
      result.action,
      'REVIEW',
    );

    assert.equal(
      result.requiresFallback,
      false,
    );

    assert.equal(
      result.requiresReview,
      true,
    );
  },
);


test(
  'confidence alta nunca produce ACCEPT',
  () => {
    for (
      const confidence
      of [
        0.90,
        0.95,
        0.98,
        0.99,
        1,
      ]
    ) {
      assert.equal(
        assessHandwritingConfidence(
          confidence,
        ).action,
        'REVIEW',
      );
    }
  },
);


test(
  'rechaza confidence negativa',
  () => {
    assert.throws(
      () =>
        assessHandwritingConfidence(
          -0.01,
        ),
    );
  },
);


test(
  'rechaza confidence superior a uno',
  () => {
    assert.throws(
      () =>
        assessHandwritingConfidence(
          1.01,
        ),
    );
  },
);


test(
  'rechaza NaN',
  () => {
    assert.throws(
      () =>
        assessHandwritingConfidence(
          Number.NaN,
        ),
    );
  },
);
