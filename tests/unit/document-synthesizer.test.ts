import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeDocumentView } from '../../src/ai/document-synthesizer.js';

describe('DocumentSynthesizer', () => {
  it('aplica normalizaciones deterministas y correcciones de Llama con atribución explícita', () => {
    const baseText = [
      'La Paz, 25 de agosto de 2026',
      'AUTORIZACIÓN DE PERMISO',
      'Por medio de la presente, se solicita la revlsión de funciones.',
      'NIT: 1020304050',
      'Fecha: 25-08-2026',
      'Monto: Bs 14500',
    ].join('\n');

    const result = synthesizeDocumentView({
      baseStructuredText: baseText,
      anomalies: [
        {
          id: 'w1',
          originalText: 'revlsión',
          suggestedAlternative: 'revisión',
          reason: 'error OCR',
          charDistance: 1,
          isProtectedField: false,
          status: 'SUGGESTED',
          decision: 'CORRECTION',
        },
        {
          id: 'w2',
          originalText: '1020304050',
          suggestedAlternative: '9999999999',
          reason: 'cambio no autorizado',
          charDistance: 5,
          isProtectedField: true,
          status: 'REJECTED',
          rejectionReason: 'PROTECTED_FIELD_RESTRICTED_MANUAL_REVIEW_ONLY',
        },
      ],
      mode: 'assisted',
    });

    // 1. Final polished text has substitutions applied
    assert.ok(result.finalText.includes('revisión'), 'revlsión debe haber sido sustituida por revisión en el texto pulido');
    assert.ok(!result.finalText.includes('revlsión'), 'revlsión original no debe figurar en el texto pulido');

    // 2. Sensitive field NIT was shielded, not changed
    assert.ok(result.finalText.includes('1020304050'));
    assert.ok(!result.finalText.includes('9999999999'));

    // 3. Interventions list records technological attribution
    const llamaIntervention = result.interventions.find(i => i.author === 'LLAMA_3_2');
    assert.ok(llamaIntervention, 'Debe registrar intervención de Llama 3.2');
    assert.equal(llamaIntervention.original, 'revlsión');
    assert.equal(llamaIntervention.replacement, 'revisión');

    const shieldIntervention = result.interventions.find(i => i.author === 'SECURITY_SHIELD');
    assert.ok(shieldIntervention, 'Debe registrar blindaje de seguridad en campo sensible');

    // 4. Annotated HTML contains visual mark spans with data attributes
    assert.ok(result.annotatedHtml.includes('audit-mark-llama'), 'Debe incluir clase audit-mark-llama');
    assert.ok(result.annotatedHtml.includes('data-author="LLAMA_3_2"'));
    assert.ok(result.annotatedHtml.includes('revisión'));
  });

  it('en modo convencional omite intervenciones de Llama y conserva reglas y blindajes', () => {
    const baseText = 'NIT: 1020304050\nSolicita revlsión.';

    const result = synthesizeDocumentView({
      baseStructuredText: baseText,
      anomalies: [
        {
          id: 'w1',
          originalText: 'revlsión',
          suggestedAlternative: 'revisión',
          reason: 'error OCR',
          charDistance: 1,
          isProtectedField: false,
          status: 'SUGGESTED',
          decision: 'CORRECTION',
        },
      ],
      mode: 'conventional',
    });

    // Conventional mode should not have any LLAMA_3_2 interventions
    const llamaInterventions = result.interventions.filter(i => i.author === 'LLAMA_3_2');
    assert.equal(llamaInterventions.length, 0);
    assert.ok(result.finalText.includes('revlsión'), 'revlsión no debe modificarse en modo convencional');
  });
});
