import {
  normalizeOcrField,
  type OcrStructuredFieldType,
} from '../src/ocr/contextual-normalizer.js';

interface TestCase {
  id: string;
  type:
    OcrStructuredFieldType;
  input: string;
  expected:
    string | null;
}

const cases:
  readonly TestCase[] = [
    {
      id: 'nit-correcto',
      type: 'NIT',
      input: '1020304050',
      expected: '1020304050',
    },
    {
      id: 'nit-o-cero',
      type: 'NIT',
      input: '1O2O3O4O5O',
      expected: '1020304050',
    },
    {
      id: 'nit-i-uno',
      type: 'NIT',
      input: 'I020304050',
      expected: '1020304050',
    },
    {
      id: 'nit-l-uno',
      type: 'NIT',
      input: 'l020304050',
      expected: '1020304050',
    },
    {
      id: 'nit-s-cinco',
      type: 'NIT',
      input: '10203040S0',
      expected: '1020304050',
    },
    {
      id: 'nit-z-dos',
      type: 'NIT',
      input: '10Z0304050',
      expected: '1020304050',
    },
    {
      id: 'nit-invalido-puntuacion',
      type: 'NIT',
      input: '1020-304050',
      expected: null,
    },
    {
      id: 'nit-invalido-texto',
      type: 'NIT',
      input: 'ABC',
      expected: null,
    },
    {
      id: 'tv-correcto',
      type: 'TV_CORRELATIVO',
      input: 'TV-001-2026',
      expected: 'TV-001-2026',
    },
    {
      id: 'tv-o-cero-secuencia',
      type: 'TV_CORRELATIVO',
      input: 'TV-OO1-2026',
      expected: 'TV-001-2026',
    },
    {
      id: 'tv-o-cero-anio',
      type: 'TV_CORRELATIVO',
      input: 'TV-001-2O26',
      expected: 'TV-001-2026',
    },
    {
      id: 'tv-multiples-confusiones',
      type: 'TV_CORRELATIVO',
      input: 'TV-O0I-2O26',
      expected: 'TV-001-2026',
    },
    {
      id: 'tv-mayor-999',
      type: 'TV_CORRELATIVO',
      input: 'TV-1000-2026',
      expected: 'TV-1000-2026',
    },
    {
      id: 'tv-mayor-999-confusion',
      type: 'TV_CORRELATIVO',
      input: 'TV-I000-2O26',
      expected: 'TV-1000-2026',
    },
    {
      id: 'no-normalizar-tevi-historico',
      type: 'TV_CORRELATIVO',
      input: 'TEVI-001-2026',
      expected: null,
    },
    {
      id: 'no-normalizar-sac',
      type: 'TV_CORRELATIVO',
      input: 'SAC-000001',
      expected: null,
    },
    {
      id: 'no-normalizar-den',
      type: 'TV_CORRELATIVO',
      input: 'DEN-001',
      expected: null,
    },
    {
      id: 'no-normalizar-prefijo-ocr',
      type: 'TV_CORRELATIVO',
      input: '7V-001-2026',
      expected: null,
    },
    {
      id: 'tv-secuencia-corta',
      type: 'TV_CORRELATIVO',
      input: 'TV-01-2026',
      expected: null,
    },
  ];

let failures = 0;

console.log(
  'TEVI OCR — F6 CONTEXTUAL NORMALIZATION',
);

console.log(
  '========================================',
);

for (
  const item
  of cases
) {
  const result =
    normalizeOcrField(
      item.type,
      item.input,
    );

  const pass =
    result.value ===
    item.expected;

  if (!pass) {
    failures += 1;
  }

  console.log();
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${item.id}`,
  );

  console.log(
    `  type:     ${item.type}`,
  );

  console.log(
    `  input:    ${JSON.stringify(item.input)}`,
  );

  console.log(
    `  output:   ${JSON.stringify(result.value)}`,
  );

  console.log(
    `  expected: ${JSON.stringify(item.expected)}`,
  );

  console.log(
    `  status:   ${result.status}`,
  );
}

console.log();
console.log(
  '========================================',
);

console.log(
  `TOTAL=${cases.length}`,
);

console.log(
  `PASS=${cases.length - failures}`,
);

console.log(
  `FAIL=${failures}`,
);

if (failures > 0) {
  process.exitCode = 1;
}
