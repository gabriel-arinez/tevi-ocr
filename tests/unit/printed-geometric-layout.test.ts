import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometricPrintedLayout, buildGeometricReadingView } from '../../src/ocr/printed-geometric-layout.js';
import type { PrintedSpatialWord } from '../../src/ocr/printed-spatial-evidence.js';

const word = (text: string, left: number, top: number, block: number, paragraph: number, line: number, confidence = 95): PrintedSpatialWord =>
  ({ text, bbox: { left, top, width: 30, height: 12 }, confidence, block, paragraph, line, page: 1 });

test('separates headings and field paragraphs instead of flattening all text', () => {
  const words = [
    word('DATOS', 10, 10, 1, 1, 1),
    word('DEL', 50, 10, 1, 1, 1),
    word('PASANTE', 90, 10, 1, 1, 1),
    word('Nombre:', 10, 40, 2, 1, 1),
    word('Fidel', 95, 40, 2, 1, 1),
    word('Carrera:', 10, 70, 2, 2, 1),
    word('Ingeniería', 95, 70, 2, 2, 1),
  ];
  const result = buildGeometricReadingView(words);
  assert.equal(result.blocks.length, 3);
  assert.equal(result.text, 'DATOS DEL PASANTE\n\nNombre: Fidel\n\nCarrera: Ingeniería');
});

test('line words are ordered using x coordinates; lines are grouped with original words', () => {
  const words = [
    word('mundo', 100, 20, 1, 1, 2),
    word('Hola', 10, 20, 1, 1, 2),
    word('continuación', 10, 40, 1, 1, 3),
  ];
  assert.equal(buildGeometricPrintedLayout(words)[0]?.text, 'Hola mundo continuación');
});

test('uncertain words are not silently deleted', () => {
  const words = [word('6', 5, 10, 1, 1, 1, 30), word('Atentamente,', 45, 10, 1, 1, 1, 91)];
  const result = buildGeometricReadingView(words);
  assert.equal(result.text, '6 Atentamente,');
  assert.equal(result.needsReview, false);
});

test('physical lines split a whole-page TSV paragraph into title, body and fields', () => {
  const oneParagraph = [
    word('AUTORIZACIÓN', 20, 5, 1, 1, 1),
    word('DE', 170, 5, 1, 1, 1),
    word('PERMISO', 205, 5, 1, 1, 1),
    word('Por', 20, 70, 1, 1, 2),
    word('medio', 65, 70, 1, 1, 2),
    word('de', 120, 70, 1, 1, 2),
    word('la', 20, 90, 1, 1, 3),
    word('presente', 55, 90, 1, 1, 3),
    word('Nombre:', 20, 140, 1, 1, 4),
    word('Fidel', 135, 140, 1, 1, 4),
    word('Carrera:', 20, 162, 1, 1, 5),
    word('Sistemas', 135, 162, 1, 1, 5),
  ];
  const result = buildGeometricReadingView(oneParagraph);
  assert.deepEqual(result.blocks.map(b => b.text), [
    'AUTORIZACIÓN DE PERMISO',
    'Por medio de la presente',
    'Nombre: Fidel',
    'Carrera: Sistemas',
  ]);
});

test('a time in the middle of a paragraph does not create a false field boundary', () => {
  const tokens = [
    word('El', 20, 10, 1, 1, 1),
    word('horario', 60, 10, 1, 1, 1),
    word('es', 135, 10, 1, 1, 1),
    word('08:30', 170, 10, 1, 1, 1),
    word('a', 260, 10, 1, 1, 1),
    word('13:30,', 290, 10, 1, 1, 1),
    word('durante', 20, 32, 1, 1, 2),
    word('la', 120, 32, 1, 1, 2),
    word('mañana.', 150, 32, 1, 1, 2),
  ];
  const result = buildGeometricReadingView(tokens);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.text, 'El horario es 08:30 a 13:30, durante la mañana.');
});
