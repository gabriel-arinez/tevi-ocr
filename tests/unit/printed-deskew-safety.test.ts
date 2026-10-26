import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldVerifyPrintedDeskew,
  preferOriginalPrintedRecognition,
} from '../../src/ocr/printed-deskew-safety.js';

test('verifica un extremo de deskew en fotografías pero no PDFs', () => {
  assert.equal(shouldVerifyPrintedDeskew('jpeg', 10), true);
  assert.equal(shouldVerifyPrintedDeskew('png', -10), true);
  assert.equal(shouldVerifyPrintedDeskew('jpeg', -8), false);
  assert.equal(shouldVerifyPrintedDeskew('pdf', 10), false);
  assert.equal(shouldVerifyPrintedDeskew('jpeg', Number.NaN), false);
});

test('prefiere imagen original si evita una gran pérdida de confianza', () => {
  assert.equal(preferOriginalPrintedRecognition(
    { text: 'L AUTORRACIÓN', confidence: 48 },
    { text: 'AUTORIZACIÓN DE PERMISO', confidence: 89 },
  ), true);
});

test('no reemplaza la lectura procesada sin evidencia suficiente', () => {
  assert.equal(preferOriginalPrintedRecognition(
    { text: 'Texto corregido', confidence: 90 },
    { text: 'Texto original', confidence: 70 },
  ), false);
  assert.equal(preferOriginalPrintedRecognition(
    { text: 'Texto', confidence: 85 },
    { text: 'Texto', confidence: 89 },
  ), false);
  assert.equal(preferOriginalPrintedRecognition(
    { text: 'Texto', confidence: 48 },
    { text: ' ', confidence: 98 },
  ), false);
});
