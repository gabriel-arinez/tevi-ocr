import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateOcrQuality,
  assessOcrQuality,
  OCR_QUALITY_THRESHOLDS,
} from '../../src/ocr/ocr-quality.js';


test(
  'clasifica confianza >= 90 como ACCEPTABLE',
  () => {
    const result =
      assessOcrQuality({
        text: 'SERVICIO DE IMPUESTOS NACIONALES',
        confidence: 95,
      });

    assert.equal(
      result.status,
      'ACCEPTABLE',
    );

    assert.equal(
      result.requiresReview,
      false,
    );
  },
);

test(
  'clasifica confianza entre 70 y 89 como REVIEW',
  () => {
    const result =
      assessOcrQuality({
        text: 'TV-001-2026',
        confidence: 84,
      });

    assert.equal(
      result.status,
      'REVIEW',
    );

    assert.equal(
      result.requiresReview,
      true,
    );
  },
);

test(
  'clasifica confianza menor a 70 como INSUFFICIENT',
  () => {
    const result =
      assessOcrQuality({
        text: 'texto degradado',
        confidence: 60,
      });

    assert.equal(
      result.status,
      'INSUFFICIENT',
    );
  },
);

test(
  'texto vacío siempre es INSUFFICIENT',
  () => {
    const result =
      assessOcrQuality({
        text: '   ',
        confidence: 99,
      });

    assert.equal(
      result.status,
      'INSUFFICIENT',
    );

    assert.deepEqual(
      result.reasons,
      [
        'EMPTY_TEXT',
      ],
    );
  },
);

test(
  'confidence null requiere revisión',
  () => {
    const result =
      assessOcrQuality({
        text: 'texto válido',
        confidence: null,
      });

    assert.equal(
      result.status,
      'REVIEW',
    );

    assert.deepEqual(
      result.reasons,
      [
        'CONFIDENCE_UNAVAILABLE',
      ],
    );
  },
);

test(
  'respeta exactamente los límites calibrados',
  () => {
    assert.equal(
      OCR_QUALITY_THRESHOLDS
        .acceptableConfidence,
      90,
    );

    assert.equal(
      OCR_QUALITY_THRESHOLDS
        .insufficientConfidence,
      70,
    );

    assert.equal(
      assessOcrQuality({
        text: 'x',
        confidence: 90,
      }).status,
      'ACCEPTABLE',
    );

    assert.equal(
      assessOcrQuality({
        text: 'x',
        confidence: 70,
      }).status,
      'REVIEW',
    );

    assert.equal(
      assessOcrQuality({
        text: 'x',
        confidence: 69.99,
      }).status,
      'INSUFFICIENT',
    );
  },
);

test(
  'documento multipágina adopta la peor calidad',
  () => {
    const result =
      aggregateOcrQuality([
        assessOcrQuality({
          text: 'página buena',
          confidence: 95,
        }),
        assessOcrQuality({
          text: 'página dudosa',
          confidence: 84,
        }),
        assessOcrQuality({
          text: 'página buena',
          confidence: 94,
        }),
      ]);

    assert.equal(
      result.status,
      'REVIEW',
    );

    assert.equal(
      result.requiresReview,
      true,
    );
  },
);

test(
  'una página insuficiente vuelve insuficiente el documento',
  () => {
    const result =
      aggregateOcrQuality([
        assessOcrQuality({
          text: 'página buena',
          confidence: 95,
        }),
        assessOcrQuality({
          text: 'página mala',
          confidence: 59,
        }),
      ]);

    assert.equal(
      result.status,
      'INSUFFICIENT',
    );
  },
);
