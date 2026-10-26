import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrintedTextView, reconstructPrintedParagraphs } from '../../src/ocr/printed-document-layout.js';
import { parsePrintedTsv } from '../../src/ocr/printed-spatial-evidence.js';

test('une líneas envueltas dentro del mismo párrafo, preserva separaciones', () => {
  assert.equal(reconstructPrintedParagraphs('Primera línea\nsegunda línea\n\nOtro bloque\nsigue aquí'),
    'Primera línea segunda línea\n\nOtro bloque sigue aquí');
});

test('conserva todos los caracteres inciertos, números y encabezados en vista legible', () => {
  const raw = 'XA A\nYN /\n\nAUTORIZACIÓN\n\n6 Atentamente,';
  const view = buildPrintedTextView(raw);
  assert.equal(view.raw, raw);
  assert.equal(view.readable, 'XA A YN /\n\nAUTORIZACIÓN\n\n6 Atentamente,');
  assert.equal(view.rawPreserved, true);
});

test('respeta páginas y no une texto entre ellas', () => {
  assert.equal(reconstructPrintedParagraphs('A\nB\fC\nD'), 'A B\n\n\f\n\nC D');
});

test('interpreta TSV de tesseract.js sin encabezado y conserva las coordenadas', () => {
  const raw = [
    '1\t1\t0\t0\t0\t0\t0\t0\t1000\t1500\t-1\t',
    '5\t1\t1\t1\t1\t1\t19\t0\t15\t13\t44.270439\tLa"',
    '5\t1\t2\t1\t1\t1\t808\t375\t28\t21\t96.975433\tLa',
  ].join('\n');
  const words = parsePrintedTsv(raw);
  assert.equal(words.length, 2);
  assert.equal(words[0]?.bbox.top, 0);
  assert.equal(words[1]?.bbox.top, 375);
  assert.equal(words[1]?.confidence, 96.975433);
  assert.equal(words[1]?.page, 1);
});

test('no oculta TSV dañado como si no hubiese palabras', () => {
  assert.throws(() => parsePrintedTsv('5\t1\t1'), /TSV/);
});
