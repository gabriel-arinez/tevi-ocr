import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrintedTsv, summarizePrintedSpatialEvidence } from '../../src/ocr/printed-spatial-evidence.js';

test('TSV: extrae palabras con caja y confianza sin borrar texto', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '5\t1\t1\t1\t1\t1\t10\t20\t24\t9\t22\tX',
    '5\t1\t2\t1\t1\t1\t40\t75\t90\t20\t95\tLa Paz',
  ].join('\n');
  const words = parsePrintedTsv(tsv);
  assert.equal(words.length, 2);
  assert.equal(words[0]?.bbox.top, 20);
  const summary = summarizePrintedSpatialEvidence(words);
  assert.equal(summary.lowConfidenceWordCount, 1);
  assert.equal(summary.removedWordCount, 0);
  assert.equal(words[1]?.text, 'La Paz');
});

test('TSV: falla cerradamente ante formato inválido', () => {
  assert.throws(() => parsePrintedTsv('no es TSV'), /TSV/);
  assert.deepEqual(parsePrintedTsv(''), []);
});

test('TSV sin encabezado: acepta formato real Tesseract.js 7', () => {
  const tsv = [
    '1\t1\t0\t0\t0\t0\t0\t0\t1200\t1600\t-1\t',
    '5\t1\t1\t1\t1\t1\t19\t0\t15\t13\t44.270439\tLa"',
    '5\t1\t1\t1\t4\t1\t808\t375\t28\t21\t96.975433\tLa',
  ].join('\n');
  const words = parsePrintedTsv(tsv);
  assert.equal(words.length, 2);
  assert.equal(words[0]?.text, 'La"');
  assert.equal(words[0]?.bbox.top, 0);
  assert.equal(words[1]?.bbox.left, 808);
  assert.equal(summarizePrintedSpatialEvidence(words).lowConfidenceWordCount, 1);
});

test('TSV con encabezado y sin encabezado producen igual salida', () => {
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const row = '5\t1\t1\t1\t1\t1\t2\t3\t10\t12\t90\tFecha';
  assert.deepEqual(parsePrintedTsv(header + '\n' + row), parsePrintedTsv(row));
});

test('TSV incompleto no se interpreta silenciosamente como cero palabras', () => {
  assert.throws(() => parsePrintedTsv('5\t1\t1'), /TSV/);
});
