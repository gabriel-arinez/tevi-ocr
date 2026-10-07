import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAmountOcrField,
  normalizeDateOcrField,
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
        reason: 'NO_CHANGE',
      },
    );
  },
);


test(
  'NIT corrige únicamente confusiones OCR numéricas',
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

      assert.equal(
        result.reason,
        'NUMERIC_CONTEXT',
      );
    }
  },
);


test(
  'NIT no elimina puntuación para fabricar valor',
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

    assert.equal(
      result.reason,
      'INVALID_FORMAT',
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
    assert.deepEqual(
      normalizeTvCorrelativoOcrField(
        'TV-001-2026',
      ),
      {
        fieldType:
          'TV_CORRELATIVO',
        input:
          'TV-001-2026',
        value:
          'TV-001-2026',
        status:
          'UNCHANGED',
        reason:
          'NO_CHANGE',
      },
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
        result.reason,
        'NUMERIC_CONTEXT',
      );
    }
  },
);


test(
  'correlativo TV nunca adivina prefijo',
  () => {
    for (
      const input
      of [
        '7V-001-2026',
        'TU-001-2026',
        'TEVI-001-2026',
        'SAC-000001',
        'DEN-001',
      ]
    ) {
      const result =
        normalizeTvCorrelativoOcrField(
          input,
        );

      assert.equal(
        result.value,
        null,
      );

      assert.equal(
        result.reason,
        'INVALID_FORMAT',
      );
    }
  },
);


test(
  'correlativo TV exige mínimo tres dígitos',
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
  'fecha contractual permanece sin cambios',
  () => {
    assert.deepEqual(
      normalizeDateOcrField(
        '06/10/2026',
      ),
      {
        fieldType: 'DATE',
        input: '06/10/2026',
        value: '06/10/2026',
        status: 'UNCHANGED',
        reason: 'NO_CHANGE',
      },
    );
  },
);


test(
  'fecha corrige confusiones OCR solo en componentes numéricos',
  () => {
    const result =
      normalizeDateOcrField(
        '1S/09/2O26',
      );

    assert.equal(
      result.value,
      '15/09/2026',
    );

    assert.equal(
      result.status,
      'NORMALIZED',
    );

    assert.equal(
      result.reason,
      'NUMERIC_CONTEXT',
    );
  },
);


test(
  'fecha puede normalizar espacios sin llamarlo corrección OCR',
  () => {
    const result =
      normalizeDateOcrField(
        '06 / 10 / 2026',
      );

    assert.equal(
      result.value,
      '06/10/2026',
    );

    assert.equal(
      result.reason,
      'FORMAT_NORMALIZATION',
    );
  },
);


test(
  'fecha corta queda ambigua y no inventa siglo',
  () => {
    const result =
      normalizeDateOcrField(
        '06/10/26',
      );

    assert.equal(
      result.value,
      null,
    );

    assert.equal(
      result.status,
      'AMBIGUOUS',
    );

    assert.equal(
      result.reason,
      'SHORT_YEAR',
    );
  },
);


test(
  'fecha corta con confusión OCR sigue ambigua',
  () => {
    const result =
      normalizeDateOcrField(
        '1S/09/26',
      );

    assert.equal(
      result.value,
      null,
    );

    assert.equal(
      result.status,
      'AMBIGUOUS',
    );

    assert.equal(
      result.reason,
      'SHORT_YEAR',
    );
  },
);


test(
  'fecha rechaza fechas calendario imposibles',
  () => {
    for (
      const input
      of [
        '31/02/2026',
        '00/10/2026',
        '15/13/2026',
      ]
    ) {
      const result =
        normalizeDateOcrField(
          input,
        );

      assert.equal(
        result.value,
        null,
      );

      assert.equal(
        result.reason,
        'INVALID_DATE',
      );
    }
  },
);


test(
  'fecha no cambia separadores arbitrarios',
  () => {
    assert.equal(
      normalizeDateOcrField(
        '06-10-2026',
      ).value,
      null,
    );
  },
);


test(
  'monto contractual permanece sin cambios',
  () => {
    assert.deepEqual(
      normalizeAmountOcrField(
        'Bs 3.850,50',
      ),
      {
        fieldType: 'AMOUNT',
        input: 'Bs 3.850,50',
        value: 'Bs 3.850,50',
        status: 'UNCHANGED',
        reason: 'NO_CHANGE',
      },
    );
  },
);


test(
  'monto corrige confusiones OCR dentro del valor numérico',
  () => {
    const result =
      normalizeAmountOcrField(
        'Bs. 8. S05, 10',
      );

    assert.equal(
      result.value,
      'Bs 8.505,10',
    );

    assert.equal(
      result.status,
      'NORMALIZED',
    );

    assert.equal(
      result.reason,
      'NUMERIC_CONTEXT',
    );
  },
);


test(
  'monto normaliza únicamente formato cuando no cambia dígitos',
  () => {
    const result =
      normalizeAmountOcrField(
        'bs. 3.850,50',
      );

    assert.equal(
      result.value,
      'Bs 3.850,50',
    );

    assert.equal(
      result.reason,
      'FORMAT_NORMALIZATION',
    );
  },
);


test(
  'monto acepta cantidades menores a mil',
  () => {
    assert.equal(
      normalizeAmountOcrField(
        'Bs 850,10',
      ).value,
      'Bs 850,10',
    );
  },
);


test(
  'monto exige marcador monetario Bs',
  () => {
    assert.equal(
      normalizeAmountOcrField(
        '3.850,50',
      ).value,
      null,
    );
  },
);


test(
  'monto no repara separadores ambiguos',
  () => {
    for (
      const input
      of [
        'Bs 3,850,50',
        'Bs 3.85,050',
        'Bs 38.50,50',
        'Bs 3.850.50',
      ]
    ) {
      const result =
        normalizeAmountOcrField(
          input,
        );

      assert.equal(
        result.value,
        null,
      );

      assert.equal(
        result.reason,
        'INVALID_FORMAT',
      );
    }
  },
);


test(
  'dispatcher aplica únicamente estrategia solicitada',
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

    assert.equal(
      normalizeOcrField(
        'DATE',
        '1S/09/2O26',
      ).value,
      '15/09/2026',
    );

    assert.equal(
      normalizeOcrField(
        'AMOUNT',
        'Bs. 8. S05, 10',
      ).value,
      'Bs 8.505,10',
    );
  },
);


test(
  'correlativo TV normaliza espacios alrededor de guiones',
  () => {
    const result =
      normalizeTvCorrelativoOcrField(
        'TV- 125- 2026',
      );

    assert.equal(
      result.value,
      'TV-125-2026',
    );

    assert.equal(
      result.status,
      'NORMALIZED',
    );

    assert.equal(
      result.reason,
      'FORMAT_NORMALIZATION',
    );
  },
);


test(
  'correlativo TV sigue rechazando puntuación extra',
  () => {
    const result =
      normalizeTvCorrelativoOcrField(
        'TV:-001-2026',
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
