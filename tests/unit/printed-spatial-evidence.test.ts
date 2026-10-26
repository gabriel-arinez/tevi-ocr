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
