import test from 'node:test';
import assert from 'node:assert/strict';
import { applySafeSemanticSuggestions } from '../../src/ai/semantic-correction-application.js';
import { synthesizeDocumentView } from '../../src/ai/document-synthesizer.js';
import type { SemanticAnomaly } from '../../src/ai/semantic-analyzer.js';

function proposal(original: string, corrected: string, options: Partial<SemanticAnomaly> = {}): SemanticAnomaly {
  return {
    id: original, originalText: original, suggestedAlternative: corrected,
    reason: 'Posible error OCR', charDistance: 1, isProtectedField: false,
    status: 'SUGGESTED', decision: 'CORRECTION',
    lineContext: `Se solicita revlsión del documento ${original}`,
    ...options,
  };
}

test('la síntesis aplica la corrección léxica validada aunque exista restoredText determinista', () => {
  const original = 'Se solicita revlsión del documento.';
  const result = synthesizeDocumentView({
    baseStructuredText: original,
    restoredText: original,
    mode: 'assisted',
    anomalies: [proposal('revlsión', 'revisión')],
  });
  assert.equal(result.finalText, 'Se solicita revisión del documento.');
  assert.equal(original, 'Se solicita revlsión del documento.');
  assert.equal(result.stats.llamaCorrections, 1);
  assert.equal(result.reviewSuggestions.length, 0);
  assert.ok(result.annotatedHtml.includes('audit-mark-llama'));
});

test('convencional mantiene la lectura sin aplicar propuestas de IA', () => {
  const original = 'Se solicita revlsión del documento.';
  const result = synthesizeDocumentView({
    baseStructuredText: original, restoredText: original, mode: 'conventional',
    anomalies: [proposal('revlsión', 'revisión')],
  });
  assert.equal(result.finalText, original);
  assert.equal(result.stats.llamaCorrections, 0);
});

test('preserva NIT, numeraciones, nombres propios y palabras repetidas', () => {
  const original = 'NIT 1003579028. 1.1. El Consultor dijo revlsión y revlsión. Gabriel firmó.';
  const applied = applySafeSemanticSuggestions(original, [
    proposal('1003579028', '1003579029', { isProtectedField: true }),
    proposal('Gabriel', 'Gabriela', { lineContext: 'Gabriel firmó.' }),
    proposal('revlsión', 'revisión'),
  ]);
  assert.equal(applied.text, original);
  assert.equal(applied.applied.length, 0);
  assert.equal(applied.reviewOnly.length, 3);
});

test('no modifica propuestas no aprobadas, sin ubicación o con cambios extensos', () => {
  const input = 'CONSULTORÍA DE LÍNEA. Se solicita revlsión.';
  const applied = applySafeSemanticSuggestions(input, [
    proposal('CONSULTORÍA', 'CONTRATO', {charDistance: 5}),
    proposal('revlsión', 'revisión', {status: 'REJECTED'}),
    proposal('Se', 'No', {lineContext: undefined}),
  ]);
  assert.equal(applied.text, input);
  assert.equal(applied.applied.length, 0);
});

test('no aplica sugerencias a palabras inexistentes aunque el modelo las proponga', () => {
  const result = applySafeSemanticSuggestions('Texto original inalterado', [
    proposal('revlsión', 'revisión'),
  ]);
  assert.equal(result.text, 'Texto original inalterado');
  assert.equal(result.reviewOnly.length, 1);
});
