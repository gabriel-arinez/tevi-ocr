import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNitOcrField,
  normalizeOcrField,
  normalizeTvCorrelativoOcrField,
} from '../../src/ocr/contextual-normalizer.js';

test(
  'NIT correcto permanece sin cambios',
  () => {
    assert.deepEqual(
      normalizeNitOcrField(
        '1020304050',
      ),
      {
        fieldType: 'NIT',
        input: '1020304050',
        value: '1020304050',
        status: 'UNCHANGED',
      },
    );
  },
);

test(
  'NIT corrige confusiones OCR únicamente en contexto numérico',
  () => {
    const cases = [
      ['1O2O3O4O5O', '1020304050'],
      ['I020304050', '1020304050'],
      ['l020304050', '1020304050'],
      ['10203040S0', '1020304050'],
      ['10Z0304050', '1020304050'],
    ] as const;

    for (
      const [
        input,
        expected,
      ]
      of cases
    ) {
      const result =
        normalizeNitOcrField(
          input,
        );

      assert.equal(
        result.value,
        expected,
      );

      assert.equal(
        result.status,
        'NORMALIZED',
      );
    }
  },
);

test(
  'NIT no elimina puntuación para forzar un resultado',
  () => {
    const result =
      normalizeNitOcrField(
        '1020-304050',
      );

    assert.equal(
      result.value,
      null,
    );

    assert.equal(
      result.status,
      'INVALID',
    );
  },
);

test(
  'NIT rechaza texto no normalizable',
  () => {
    const result =
      normalizeNitOcrField(
        'ABC',
      );

    assert.equal(
      result.value,
      null,
    );

    assert.equal(
      result.status,
      'INVALID',
    );
  },
);

test(
  'NIT respeta máximo contractual de 20 dígitos',
  () => {
    assert.equal(
      normalizeNitOcrField(
        '12345678901234567890',
      ).status,
      'UNCHANGED',
    );

    assert.equal(
      normalizeNitOcrField(
        '123456789012345678901',
      ).status,
      'INVALID',
    );
  },
);

test(
  'correlativo TV correcto permanece sin cambios',
  () => {
    const result =
      normalizeTvCorrelativoOcrField(
        'TV-001-2026',
      );

    assert.equal(
      result.value,
      'TV-001-2026',
    );

    assert.equal(
      result.status,
      'UNCHANGED',
    );
  },
);

test(
  'correlativo TV normaliza solo segmentos numéricos',
  () => {
    const cases = [
      [
        'TV-OO1-2026',
        'TV-001-2026',
      ],
      [
        'TV-001-2O26',
        'TV-001-2026',
      ],
      [
        'TV-O0I-2O26',
        'TV-001-2026',
      ],
      [
        'TV-I000-2O26',
        'TV-1000-2026',
      ],
    ] as const;

    for (
      const [
        input,
        expected,
      ]
      of cases
    ) {
      const result =
        normalizeTvCorrelativoOcrField(
          input,
        );

      assert.equal(
        result.value,
        expected,
      );

      assert.equal(
        result.status,
        'NORMALIZED',
      );
    }
  },
);

test(
  'correlativo TV acepta números superiores a 999',
  () => {
    const result =
      normalizeTvCorrelativoOcrField(
        'TV-1000-2026',
      );

    assert.equal(
      result.value,
      'TV-1000-2026',
    );

    assert.equal(
      result.status,
      'UNCHANGED',
    );
  },
);

test(
  'correlativo TV nunca adivina el prefijo',
  () => {
    const result =
      normalizeTvCorrelativoOcrField(
        '7V-001-2026',
      );

    assert.equal(
      result.value,
      null,
    );

    assert.equal(
      result.status,
      'INVALID',
    );
  },
);

test(
  'normalizador TV no altera correlativos de otros contratos',
  () => {
    for (
      const input
      of [
        'TEVI-001-2026',
        'SAC-000001',
        'DEN-001',
      ]
    ) {
      assert.equal(
        normalizeTvCorrelativoOcrField(
          input,
        ).status,
        'INVALID',
      );
    }
  },
);

test(
  'correlativo TV exige mínimo tres dígitos de secuencia',
  () => {
    assert.equal(
      normalizeTvCorrelativoOcrField(
        'TV-01-2026',
      ).status,
      'INVALID',
    );
  },
);

test(
  'dispatcher aplica únicamente la estrategia solicitada',
  () => {
    assert.equal(
      normalizeOcrField(
        'NIT',
        '1O20304050',
      ).value,
      '1020304050',
    );

    assert.equal(
      normalizeOcrField(
        'TV_CORRELATIVO',
        'TV-OO1-2O26',
      ).value,
      'TV-001-2026',
    );
  },
);
