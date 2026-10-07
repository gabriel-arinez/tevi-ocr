import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HANDWRITING_FALLBACK_THRESHOLD,
  buildHandwritingReviewModel,
  classifyHandwritingCharacter,
  formatConfidencePercent,
  structuredFieldDisplayValue,
  structuredFieldStatusLabel,
  structuredFieldTypeLabel,
} from '../../public/handwriting-review.mjs';


test(
  'clasifica confianza menor a 0.70 como fallback',
  () => {
    const result =
      classifyHandwritingCharacter({
        confidence: 0.69,
      });

    assert.equal(
      result.level,
      'fallback',
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
  'confianza exactamente 0.70 sigue en revisión',
  () => {
    const result =
      classifyHandwritingCharacter({
        confidence:
          HANDWRITING_FALLBACK_THRESHOLD,
      });

    assert.equal(
      result.level,
      'review',
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
  'confianza alta nunca se marca como aceptación automática',
  () => {
    const result =
      classifyHandwritingCharacter({
        confidence: 0.99,
      });

    assert.equal(
      result.level,
      'review',
    );

    assert.equal(
      result.requiresReview,
      true,
    );

    assert.equal(
      result.requiresFallback,
      false,
    );
  },
);


test(
  'construye resumen manuscrito desde contrato Kraken v2',
  () => {
    const payload = {
      mode:
        'handwritten',

      engine:
        'Kraken 7.1.1 / PP-OCRv6 small',

      model:
        '10.5281/zenodo.21788405',

      text:
        'NIT: 123',

      quality: {
        status:
          'REVIEW',

        requiresReview:
          true,

        fallbackThreshold:
          0.70,

        automaticAcceptEnabled:
          false,
      },

      characters: [
        {
          char: 'N',
          confidence: 0.95,
        },
        {
          char: '1',
          confidence: 0.65,
        },
      ],

      structuredFields: {
        rawText:
          'NIT: 123',

        fields: [
          {
            fieldType: 'NIT',
            raw: '123',
            resolved: '123',
            status: 'UNCHANGED',
          },
        ],
      },

      runtime: {
        persistent:
          true,

        requestCount:
          2,
      },
    };

    const model =
      buildHandwritingReviewModel(
        payload,
      );

    assert.ok(model);

    assert.equal(
      model.rawText,
      'NIT: 123',
    );

    assert.equal(
      model.characterCount,
      2,
    );

    assert.equal(
      model.reviewCharacterCount,
      2,
    );

    assert.equal(
      model.fallbackCharacterCount,
      1,
    );

    assert.equal(
      model.fallbackCharacters[0]
        ?.char,
      '1',
    );

    assert.equal(
      model.automaticAcceptEnabled,
      false,
    );

    assert.equal(
      model.runtime.requestCount,
      2,
    );
  },
);


test(
  'preserva líneas Kraken para la revisión visual',
  () => {
    const model =
      buildHandwritingReviewModel({
        mode:
          'handwritten',

        text:
          'ABC\nDEF',

        characters: [
          {
            lineNumber: 1,
            characterIndex: 0,
            char: 'A',
            confidence: 0.9,
          },
          {
            lineNumber: 2,
            characterIndex: 0,
            char: 'D',
            confidence: 0.6,
          },
        ],

        pages: [
          {
            lines: [
              {
                lineNumber: 1,
                text: 'ABC',
                characters: [
                  {
                    lineNumber: 1,
                    characterIndex: 0,
                    char: 'A',
                    confidence: 0.9,
                  },
                ],
              },
              {
                lineNumber: 2,
                text: 'DEF',
                characters: [
                  {
                    lineNumber: 2,
                    characterIndex: 0,
                    char: 'D',
                    confidence: 0.6,
                  },
                ],
              },
            ],
          },
        ],
      });

    assert.ok(model);

    assert.equal(
      model.lines.length,
      2,
    );

    assert.equal(
      model.lines[0]?.text,
      'ABC',
    );

    assert.equal(
      model.lines[1]?.text,
      'DEF',
    );

    assert.equal(
      model.lines[1]
        ?.characters[0]
        ?.review.level,
      'fallback',
    );
  },
);


test(
  'modelo manuscrito no aplica a OCR impreso',
  () => {
    assert.equal(
      buildHandwritingReviewModel({
        mode: 'printed',
      }),
      null,
    );
  },
);


test(
  'formatea confianza Kraken como porcentaje',
  () => {
    assert.equal(
      formatConfidencePercent(
        0.6534,
      ),
      '65.3%',
    );

    assert.equal(
      formatConfidencePercent(
        null,
      ),
      'N/D',
    );
  },
);


test(
  'campo estructurado distingue raw de resolved',
  () => {
    const result =
      structuredFieldDisplayValue({
        raw:
          'TV:-001-2026',

        resolved:
          'TV-001-2026',

        status:
          'NORMALIZED',
      });

    assert.equal(
      result.raw,
      'TV:-001-2026',
    );

    assert.equal(
      result.resolved,
      'TV-001-2026',
    );

    assert.equal(
      result.changed,
      true,
    );
  },
);


test(
  'campo sin resolved conserva evidencia raw',
  () => {
    const result =
      structuredFieldDisplayValue({
        raw:
          '06/10/26',

        resolved:
          null,

        status:
          'AMBIGUOUS',
      });

    assert.equal(
      result.raw,
      '06/10/26',
    );

    assert.equal(
      result.resolved,
      null,
    );

    assert.equal(
      result.changed,
      false,
    );
  },
);


test(
  'traduce tipos de campos estructurados para la UI',
  () => {
    assert.equal(
      structuredFieldTypeLabel(
        'TV_CORRELATIVO',
      ),
      'Correlativo TV',
    );

    assert.equal(
      structuredFieldTypeLabel(
        'AMOUNT',
      ),
      'Monto',
    );

    assert.equal(
      structuredFieldTypeLabel(
        'DATE',
      ),
      'Fecha',
    );
  },
);


test(
  'traduce estados estructurados para la UI',
  () => {
    assert.equal(
      structuredFieldStatusLabel(
        'UNCHANGED',
      ),
      'Sin cambios',
    );

    assert.equal(
      structuredFieldStatusLabel(
        'NORMALIZED',
      ),
      'Normalizado',
    );

    assert.equal(
      structuredFieldStatusLabel(
        'AMBIGUOUS',
      ),
      'Ambiguo',
    );

    assert.equal(
      structuredFieldStatusLabel(
        'INVALID',
      ),
      'Inválido',
    );
  },
);
