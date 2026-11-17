import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrintedTsv, summarizePrintedSpatialEvidence, contextualizeLowConfidenceWords } from '../../src/ocr/printed-spatial-evidence.js';

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

test('contextualiza detecciones repetidas usando su línea TSV exacta', () => {
  const words = [
    {text: 'DE', confidence: 25, bbox: {left: 30, top: 10, width: 20, height: 10}, block: 1, paragraph: 1, line: 1, page: 1},
    {text: 'CONTRATO', confidence: 91, bbox: {left: 60, top: 10, width: 50, height: 10}, block: 1, paragraph: 1, line: 1, page: 1},
    {text: 'DE', confidence: 21, bbox: {left: 30, top: 90, width: 20, height: 10}, block: 2, paragraph: 1, line: 1, page: 1},
    {text: 'SERVICIOS', confidence: 95, bbox: {left: 60, top: 90, width: 60, height: 10}, block: 2, paragraph: 1, line: 1, page: 1},
  ];
  const result = contextualizeLowConfidenceWords(words, 1);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.lineText, 'DE CONTRATO');
  assert.equal(result[1]?.lineText, 'DE SERVICIOS');
  assert.notEqual(result[0]?.id, result[1]?.id);
});
