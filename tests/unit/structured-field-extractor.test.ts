import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractStructuredFields,
} from '../../src/ocr/structured-field-extractor.js';


test(
  'extrae NIT etiquetado sin alterar rawText',
  () => {
    const rawText =
      'NIT: L0203040s0';

    const result =
      extractStructuredFields(
        rawText,
        [
          {
            lineNumber: 4,
            text:
              'NIT: L0203040s0',
          },
        ],
      );

    assert.equal(
      result.rawText,
      rawText,
    );

    assert.deepEqual(
      result.fields,
      [
        {
          fieldType: 'NIT',
          rawLine:
            'NIT: L0203040s0',
          raw:
            'L0203040s0',
          resolved:
            '1020304050',
          status:
            'NORMALIZED',
          reason:
            'NUMERIC_CONTEXT',
          lineNumber: 4,
        },
      ],
    );
  },
);


test(
  'extrae Código con tilde y conserva correlativo inválido',
  () => {
    const result =
      extractStructuredFields(
        'Código: TU-001-2026',
        [
          {
            lineNumber: 5,
            text:
              'Código: TU-001-2026',
          },
        ],
      );

    assert.equal(
      result.fields.length,
      1,
    );

    assert.equal(
      result.fields[0]?.fieldType,
      'TV_CORRELATIVO',
    );

    assert.equal(
      result.fields[0]?.raw,
      'TU-001-2026',
    );

    assert.equal(
      result.fields[0]?.resolved,
      null,
    );

    assert.equal(
      result.fields[0]?.status,
      'INVALID',
    );
  },
);


test(
  'normaliza Código sin depender de mayúsculas',
  () => {
    const result =
      extractStructuredFields(
        'codigo: TV-OO1-2O26',
        [
          {
            lineNumber: 1,
            text:
              'codigo: TV-OO1-2O26',
          },
        ],
      );

    assert.equal(
      result.fields[0]?.resolved,
      'TV-001-2026',
    );
  },
);


test(
  'extrae fecha válida etiquetada',
  () => {
    const result =
      extractStructuredFields(
        'Fecha: 1S/09/2O26',
        [
          {
            lineNumber: 7,
            text:
              'Fecha: 1S/09/2O26',
          },
        ],
      );

    assert.equal(
      result.fields[0]?.resolved,
      '15/09/2026',
    );

    assert.equal(
      result.fields[0]?.reason,
      'NUMERIC_CONTEXT',
    );
  },
);


test(
  'año corto permanece ambiguo y no inventa siglo',
  () => {
    const result =
      extractStructuredFields(
        'Fecha: 06/10/26',
        [
          {
            lineNumber: 7,
            text:
              'Fecha: 06/10/26',
          },
        ],
      );

    assert.equal(
      result.fields[0]?.raw,
      '06/10/26',
    );

    assert.equal(
      result.fields[0]?.resolved,
      null,
    );

    assert.equal(
      result.fields[0]?.status,
      'AMBIGUOUS',
    );

    assert.equal(
      result.fields[0]?.reason,
      'SHORT_YEAR',
    );
  },
);


test(
  'extrae monto etiquetado y aplica normalización segura',
  () => {
    const result =
      extractStructuredFields(
        'Monto Bs. 8. S05, 10',
        [
          {
            lineNumber: 6,
            text:
              'Monto Bs. 8. S05, 10',
          },
        ],
      );

    assert.equal(
      result.fields[0]?.raw,
      'Bs. 8. S05, 10',
    );

    assert.equal(
      result.fields[0]?.resolved,
      'Bs 8.505,10',
    );
  },
);


test(
  'no interpreta etiquetas no autorizadas como campos',
  () => {
    const lines = [
      {
        lineNumber: 1,
        text:
          'N: 4587123019',
      },
      {
        lineNumber: 2,
        text:
          'MontoX: Bs. 8.505,10',
      },
      {
        lineNumber: 3,
        text:
          'Fechaa: 06/10/2026',
      },
      {
        lineNumber: 4,
        text:
          'CodigoX: TV-001-2026',
      },
      {
        lineNumber: 5,
        text:
          'TU-001-2026',
      },
    ];

    const rawText =
      lines
        .map(
          (line) =>
            line.text,
        )
        .join('\n');

    const result =
      extractStructuredFields(
        rawText,
        lines,
      );

    assert.deepEqual(
      result.fields,
      [],
    );
  },
);

test(
  'no interpreta un valor aislado como NIT',
  () => {
    const result =
      extractStructuredFields(
        '4587123019',
        [
          {
            lineNumber: 6,
            text:
              '4587123019',
          },
        ],
      );

    assert.equal(
      result.fields.length,
      0,
    );
  },
);


test(
  'no adivina TV desde prefijo ambiguo',
  () => {
    const result =
      extractStructuredFields(
        'Código: 7V-001-2026',
        [
          {
            lineNumber: 5,
            text:
              'Código: 7V-001-2026',
          },
        ],
      );

    assert.equal(
      result.fields.length,
      1,
    );

    assert.equal(
      result.fields[0]?.resolved,
      null,
    );

    assert.equal(
      result.fields[0]?.status,
      'INVALID',
    );
  },
);


test(
  'preserva múltiples campos independientes',
  () => {
    const lines = [
      {
        lineNumber: 4,
        text:
          'NIT: 4587123019',
      },
      {
        lineNumber: 5,
        text:
          'Código: TV-125-2026',
      },
      {
        lineNumber: 6,
        text:
          'Monto: Bs 8.505,10',
      },
      {
        lineNumber: 7,
        text:
          'Fecha: 15/09/2026',
      },
    ];

    const rawText =
      lines
        .map(
          (line) =>
            line.text,
        )
        .join('\n');

    const result =
      extractStructuredFields(
        rawText,
        lines,
      );

    assert.equal(
      result.rawText,
      rawText,
    );

    assert.deepEqual(
      result.fields.map(
        (field) =>
          field.fieldType,
      ),
      [
        'NIT',
        'TV_CORRELATIVO',
        'AMOUNT',
        'DATE',
      ],
    );

    assert.deepEqual(
      result.fields.map(
        (field) =>
          field.resolved,
      ),
      [
        '4587123019',
        'TV-125-2026',
        'Bs 8.505,10',
        '15/09/2026',
      ],
    );
  },
);


test(
  'Código NFD conserva exactamente el valor original',
  () => {
    const line =
      'Co\u0301digo: TV-125-2026';

    const result =
      extractStructuredFields(
        line,
        [
          {
            lineNumber: 1,
            text: line,
          },
        ],
      );

    assert.equal(
      result.fields.length,
      1,
    );

    assert.equal(
      result.fields[0]?.raw,
      'TV-125-2026',
    );

    assert.equal(
      result.fields[0]?.resolved,
      'TV-125-2026',
    );
  },
);


test(
  'Código NFC conserva exactamente el valor original',
  () => {
    const line =
      'Código: TV-125-2026';

    const result =
      extractStructuredFields(
        line,
        [
          {
            lineNumber: 1,
            text: line,
          },
        ],
      );

    assert.equal(
      result.fields[0]?.raw,
      'TV-125-2026',
    );
  },
);


test(
  'acepta únicamente aliases NIT explícitos observados',
  () => {
    const cases = [
      'VIT: 1020304050',
      'Nιt: 4587123019',
      'νιt: 4587123019',
    ];

    for (
      const [
        index,
        text,
      ]
      of cases.entries()
    ) {
      const result =
        extractStructuredFields(
          text,
          [
            {
              lineNumber:
                index + 1,
              text,
            },
          ],
        );

      assert.equal(
        result.fields.length,
        1,
      );

      assert.equal(
        result.fields[0]?.fieldType,
        'NIT',
      );
    }
  },
);


test(
  'N aislada sigue sin considerarse alias NIT',
  () => {
    const result =
      extractStructuredFields(
        'N: 4587123019',
        [
          {
            lineNumber: 1,
            text:
              'N: 4587123019',
          },
        ],
      );

    assert.deepEqual(
      result.fields,
      [],
    );
  },
);


test(
  'acepta aliases Código observados sin corregir el valor',
  () => {
    const cases = [
      [
        'Códio: TV-125-2026',
        'TV-125-2026',
      ],
      [
        'Cóhigoν: TU-001-2026',
        null,
      ],
      [
        'Códlgo TV-12S-2026',
        'TV-125-2026',
      ],
      [
        'Cádig0 Tv- 125 -2026',
        'TV-125-2026',
      ],
    ] as const;

    for (
      const [
        text,
        expected,
      ]
      of cases
    ) {
      const result =
        extractStructuredFields(
          text,
          [
            {
              lineNumber: 1,
              text,
            },
          ],
        );

      assert.equal(
        result.fields.length,
        1,
      );

      assert.equal(
        result.fields[0]?.fieldType,
        'TV_CORRELATIVO',
      );

      assert.equal(
        result.fields[0]?.resolved,
        expected,
      );
    }
  },
);


test(
  'acepta aliases Monto observados pero no fuerza valores inválidos',
  () => {
    const cases = [
      [
        'Monts: Bs. 8. 50, 10',
        null,
      ],
      [
        'Monte: Bs: 3. 8S9, 50',
        null,
      ],
      [
        'Mont: BS: 8. S0S, 10',
        null,
      ],
      [
        'Moło Bs. 3,880, 50',
        null,
      ],
    ] as const;

    for (
      const [
        text,
        expected,
      ]
      of cases
    ) {
      const result =
        extractStructuredFields(
          text,
          [
            {
              lineNumber: 1,
              text,
            },
          ],
        );

      assert.equal(
        result.fields.length,
        1,
      );

      assert.equal(
        result.fields[0]?.fieldType,
        'AMOUNT',
      );

      assert.equal(
        result.fields[0]?.resolved,
        expected,
      );
    }
  },
);


test(
  'acepta aliases Fecha observados sin expandir año',
  () => {
    for (
      const text
      of [
        'Tiecha: 06/10/26',
        'Techa : 06 /20/25',
      ]
    ) {
      const result =
        extractStructuredFields(
          text,
          [
            {
              lineNumber: 1,
              text,
            },
          ],
        );

      assert.equal(
        result.fields.length,
        1,
      );

      assert.equal(
        result.fields[0]?.fieldType,
        'DATE',
      );

      assert.equal(
        result.fields[0]?.resolved,
        null,
      );
    }
  },
);
