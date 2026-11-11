import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SemanticAnalyzer } from '../../src/ai/semantic-analyzer.js';
import { OllamaClient } from '../../src/ai/ollama-client.js';

describe('SemanticAnalyzer', () => {
  it('modo convencional no invoca cliente LLM', async () => {
    let clientCalled = false;
    const client = new OllamaClient({
      fetchFn: async () => {
        clientCalled = true;
        throw new Error('should not be called');
      },
    });

    const analyzer = new SemanticAnalyzer(client);
    const result = await analyzer.analyze({
      rawText: 'Texto de prueba',
      mode: 'conventional',
    });

    assert.equal(clientCalled, false);
    assert.equal(result.enabled, false);
    assert.equal(result.executionMode, 'conventional');
  });

  it('valida sugerencias legítimas y rechaza alucinaciones', async () => {
    const rawText = 'El contribuyente solicita la revlsión de un cobro duplicado.\nNIT: 1020304050';

    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: JSON.stringify({
              documentType: 'RECLAMO_TRIBUTARIO',
              documentIntent: 'Solicitud de revisión de cobro',
              suggestions: [
                // 1. Corrección legítima (distancia 1)
                {
                  id: 'w1',
                  original: 'revlsión',
                  suggested: 'revisión',
                  reason: 'Error tipográfico común OCR l por i',
                },
                // 2. Palabra inexistente en el OCR (alucinación)
                {
                  id: 'w2',
                  original: 'inexistente',
                  suggested: 'existente',
                  reason: 'Alucinación',
                },
                // 3. Intento de modificar NIT no autorizado (protegido)
                {
                  id: 'w3',
                  original: '1020304050',
                  suggested: '9999999999',
                  reason: 'Cambio de NIT',
                },
                // 4. Distancia de edición excesiva (reemplazo drástico)
                {
                  id: 'w4',
                  original: 'cobro',
                  suggested: 'reestructuración',
                  reason: 'Cambio de concepto',
                },
              ],
              fields: [
                // Campo legítimo con evidencia literal
                {
                  fieldName: 'NIT',
                  value: '1020304050',
                  evidence: 'NIT: 1020304050',
                },
                // Campo inventado cuya evidencia no existe en el texto
                {
                  fieldName: 'TELEFONO',
                  value: '77788899',
                  evidence: 'Tel: 77788899',
                },
              ],
            }),
          },
          total_duration: 100_000_000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OllamaClient({ fetchFn: mockFetch });
    const analyzer = new SemanticAnalyzer(client);

    const result = await analyzer.analyze({
      rawText,
      mode: 'assisted',
      lowConfidenceWords: [
        { id: 'w1', text: 'revlsión', confidence: 60, lineText: 'solicita la revlsión' },
      ],
    });

    assert.equal(result.enabled, true);
    assert.equal(result.classification.documentType, 'RECLAMO_TRIBUTARIO');

    // 1. revlsión -> revisión aceptada
    const w1 = result.anomalies.find(a => a.id === 'w1');
    assert.ok(w1);
    assert.equal(w1.status, 'SUGGESTED');
    assert.equal(w1.charDistance, 1);

    // 2. inexistente -> rechazada por no encontrarse en OCR
    const w2 = result.anomalies.find(a => a.id === 'w2');
    assert.ok(w2);
    assert.equal(w2.status, 'REJECTED');
    assert.equal(w2.rejectionReason, 'ORIGINAL_TEXT_NOT_FOUND_IN_OCR');

    // 3. NIT alterado -> rechazada por campo contractual protegido
    const w3 = result.anomalies.find(a => a.id === 'w3');
    assert.ok(w3);
    assert.equal(w3.status, 'REJECTED');
    assert.equal(w3.rejectionReason, 'PROTECTED_FIELD_RESTRICTED_MANUAL_REVIEW_ONLY');

    // 4. Distancia excesiva -> rechazada
    const w4 = result.anomalies.find(a => a.id === 'w4');
    assert.ok(w4);
    assert.equal(w4.status, 'REJECTED');
    assert.equal(w4.rejectionReason, 'EDIT_DISTANCE_THRESHOLD_EXCEEDED');

    // Campos extraídos
    const nitField = result.extractedFields.find(f => f.fieldName === 'NIT');
    assert.ok(nitField);
    assert.equal(nitField.verified, true);
    assert.equal(nitField.status, 'VERIFIED');

    const telField = result.extractedFields.find(f => f.fieldName === 'TELEFONO');
    assert.ok(telField);
    assert.equal(telField.verified, false);
    assert.equal(telField.status, 'HALLUCINATION_REJECTED');
  });

  it('aplica fallback seguro y no lanza excepción si Ollama falla', async () => {
    const client = new OllamaClient({
      fetchFn: async () => {
        throw new Error('Connection refused to Ollama');
      },
    });

    const analyzer = new SemanticAnalyzer(client);
    const result = await analyzer.analyze({
      rawText: 'Cualquier texto OCR',
      mode: 'assisted',
    });

    assert.equal(result.enabled, false);
    assert.equal(result.available, false);
    assert.deepEqual(result.anomalies, []);
    assert.ok(result.error);
    assert.match(result.error, /Connection refused/);
  });
});
