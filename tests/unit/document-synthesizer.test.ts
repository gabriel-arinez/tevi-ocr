import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeDocumentView } from '../../src/ai/document-synthesizer.js';
import {
  restoreDocumentDeterministically,
  computeWordDiffChanges,
} from '../../src/ai/semantic-analyzer.js';

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

  it('restaura texto completo, depura ruido de bordes y resalta cambios con tipografía idéntica', () => {
    const rawOcr = [
      'e y j XA A YN / N ON /',
      '/ - - RDA — o];',
      'La Paz, 25 de agosto de 2026',
      'AUTORIZACIÓN DE PERMISO',
      'Por medio de la presente con CI. N.e 13497224 L.P.',
      'el día miercoles 26 de agosto.',
      'Nombre: Fidel Eliseo Reyes Ramirez',
      '6 Atentamente,',
    ].join('\n');

    const restoredOcr = [
      'La Paz, 25 de agosto de 2026',
      'AUTORIZACIÓN DE PERMISO',
      'Por medio de la presente con C.I. N° 13497224 L.P.',
      'el día miércoles 26 de agosto.',
      'Nombre: Fidel Eliseo Reyes Ramírez',
      'Atentamente,',
    ].join('\n');

    const result = synthesizeDocumentView({
      baseStructuredText: rawOcr,
      restoredText: restoredOcr,
      changes: [
        { original: 'e y j XA A YN / N ON /', corrected: '', reason: 'Eliminación de ruido de escáner' },
        { original: '/ - - RDA — o];', corrected: '', reason: 'Eliminación de ruido de escáner' },
        { original: 'CI. N.e', corrected: 'C.I. N°', reason: 'Corrección de símbolo OCR' },
        { original: 'miercoles', corrected: 'miércoles', reason: 'Falta de tilde' },
        { original: 'Ramirez', corrected: 'Ramírez', reason: 'Falta de tilde' },
        { original: '6 Atentamente,', corrected: 'Atentamente,', reason: 'Limpieza de artefacto numérico' },
      ],
      mode: 'assisted',
    });

    // 1. Final text is clean, with noise headers and "6 " removed
    assert.ok(!result.finalText.includes('e y j XA A YN'));
    assert.ok(!result.finalText.includes('RDA — o];'));
    assert.ok(!result.finalText.includes('6 Atentamente'));
    assert.ok(result.finalText.includes('miércoles'));
    assert.ok(result.finalText.includes('Ramírez'));
    assert.ok(result.finalText.includes('13497224 L.P.'));

    // 2. Interventions record all changes
    assert.ok(result.interventions.some(i => i.original === 'miercoles' && i.replacement === 'miércoles'));
    assert.ok(result.interventions.some(i => i.category === 'NOISE_REMOVAL'));

    // 3. Annotated HTML has noise deletion header and underlines for corrected words
    assert.ok(result.annotatedHtml.includes('audit-removed-block'));
    assert.ok(result.annotatedHtml.includes('audit-mark-llama'));
    assert.ok(result.annotatedHtml.includes('audit-orig-deleted'));
    assert.ok(result.annotatedHtml.includes('miercoles'));
    assert.ok(result.annotatedHtml.includes('miércoles'));
  });

  it('en modo convencional aplica reglas deterministas y las resalta en azul (audit-mark-rules)', () => {
    const rawOcr = 'Con CI. N.e 13497224 L.P. el día miercoles.\n6 Atentamente,';
    const detRestored = 'Con C.I. N° 13497224 L.P. el día miércoles.\nAtentamente,';

    const result = synthesizeDocumentView({
      baseStructuredText: rawOcr,
      restoredText: detRestored,
      changes: [
        { original: 'CI. N.e', corrected: 'C.I. N°', reason: 'Corrección de símbolo OCR' },
        { original: 'miercoles', corrected: 'miércoles', reason: 'Falta de tilde' },
        { original: '6 Atentamente,', corrected: 'Atentamente,', reason: 'Limpieza de artefacto numérico' },
      ],
      mode: 'conventional',
    });

    // 1. All interventions must be attributed to DETERMINISTIC_RULES, none to LLAMA_3_2
    const llamaInterventions = result.interventions.filter(i => i.author === 'LLAMA_3_2');
    assert.equal(llamaInterventions.length, 0);

    const ruleInterventions = result.interventions.filter(i => i.author === 'DETERMINISTIC_RULES');
    assert.ok(ruleInterventions.length >= 3);

    // 2. Final text contains the rule corrections
    assert.ok(result.finalText.includes('C.I. N°'));
    assert.ok(result.finalText.includes('miércoles'));
    assert.ok(result.finalText.includes('Atentamente,'));

    // 3. Annotated HTML marks them with audit-mark-rules (blue) and red strikethrough for previous values
    assert.ok(result.annotatedHtml.includes('audit-mark-rules'));
    assert.ok(!result.annotatedHtml.includes('audit-mark-llama'));
    assert.ok(result.annotatedHtml.includes('audit-orig-deleted'));
    assert.ok(result.annotatedHtml.includes('data-author="DETERMINISTIC_RULES"'));
  });

  it('normaliza homógrafos, etiquetas, montos y fechas OCR en manuscrito sin pintar blindaje en campos sin cambios', () => {
    const rawHandwritten = [
      'Solicito vcripicar la documentacioń presentada',
      'Nıt: 4587123014',
      'Códiо: TV-125-2026',
      'Monto Bs. 8. S05, 10',
      'Fecha: 1S/09/26',
    ].join('\n');

    const det = restoreDocumentDeterministically(rawHandwritten);
    assert.ok(det.restoredText.includes('documentación'));
    assert.ok(det.restoredText.includes('NIT: 4587123014'));
    assert.ok(det.restoredText.includes('Código: TV-125-2026'));
    assert.ok(det.restoredText.includes('Monto Bs. 8.505,10'));
    assert.ok(det.restoredText.includes('Fecha: 15/09/26'));

    const llmText = det.restoredText.replace('vcripicar', 'verificar');
    const llmChanges = computeWordDiffChanges(det.restoredText, llmText);
    assert.equal(llmChanges.length, 1);
    assert.equal(llmChanges[0]?.original, 'vcripicar');
    assert.equal(llmChanges[0]?.corrected, 'verificar');

    const syn = synthesizeDocumentView({
      baseStructuredText: rawHandwritten,
      restoredText: llmText,
      changes: [...det.changes, ...llmChanges],
      mode: 'assisted',
    });

    assert.ok(syn.annotatedHtml.includes('audit-mark-rules'));
    assert.ok(syn.annotatedHtml.includes('audit-mark-llama'));
    assert.ok(!syn.annotatedHtml.includes('audit-mark-shield'), 'Campos no alterados no deben pintarse como blindaje');
  });
});
