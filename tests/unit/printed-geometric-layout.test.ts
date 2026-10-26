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
