import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SemanticAnalyzer,
  scoreWordAnomaly,
} from '../../src/ai/semantic-analyzer.js';
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

  it('selecciona las anomalías más relevantes de todo el documento respetando diversidad espacial', () => {
    const analyzer = new SemanticAnalyzer();
    const docText = `
      LÍNEA 1: Documento oficial sin errores aquí.
      LÍNEA 2: Solicitud de revlsión con f1ebre y c0digo y trbutario.
      LÍNEA 3: Texto intermedio completamente limpio y legible.
      LÍNEA 4: Encontramos otro artefacto extrañ0_~ en el centro.
      LÍNEA 5: Párrafo de cierre con impuesfos al final del documento.
    `;

    const selected = analyzer.selectRelevantAnomalies({
      rawText: docText,
      maxCandidates: 4,
    });

    assert.equal(selected.length, 4);

    // Verify it doesn't take all 4 from line 2 only (diversity across lines)
    const lineTexts = selected.map(s => s.lineText);
    const uniqueLines = new Set(lineTexts);
    assert.ok(uniqueLines.size >= 3, 'Debe incluir candidatos de al menos 3 líneas distintas del documento');

    // Scores check
    assert.ok(scoreWordAnomaly('revlsión') > scoreWordAnomaly('oficial'));
    assert.ok(scoreWordAnomaly('f1ebre') > scoreWordAnomaly('limpio'));
    assert.ok(scoreWordAnomaly('extrañ0_~') > scoreWordAnomaly('cierre'));
  });

  it('valida sugerencias y clasificaciones especializadas con decisiones verificables', async () => {
    const rawText = 'El contribuyente solicita la revlsión de un cobro duplicado.\nNIT: 1020304050\nPalabra trbutario correcta.';

    const mockFetch: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const promptText = JSON.stringify(body.messages ?? []);

      // Specialized Pass 1: Anomaly Evaluation
      if (promptText.includes('candidatos OCR')) {
        return new Response(
          JSON.stringify({
            message: {
              role: 'assistant',
              content: JSON.stringify({
                evaluations: [
                  // 1. Corrección legítima (distancia 1)
                  {
                    id: 'w1',
                    decision: 'CORRECTION',
                    original: 'revlsión',
                    suggested: 'revisión',
                    reason: 'error OCR',
                  },
                  // 2. Palabra inexistente en el OCR (alucinación)
                  {
                    id: 'w2',
                    decision: 'CORRECTION',
                    original: 'inexistente',
                    suggested: 'existente',
                    reason: 'palabra inventada',
                  },
                  // 3. Intento de modificar NIT no autorizado (protegido)
                  {
                    id: 'w3',
                    decision: 'CORRECTION',
                    original: '1020304050',
                    suggested: '9999999999',
                    reason: 'cambio número',
                  },
                  // 4. Distancia de edición excesiva (reemplazo drástico)
                  {
                    id: 'w4',
                    decision: 'CORRECTION',
                    original: 'cobro',
                    suggested: 'reestructuración',
                    reason: 'reemplazo drástico',
                  },
                  // 5. Verificada correcta sin cambio
                  {
                    id: 'w5',
                    decision: 'VERIFIED_CORRECT',
                    original: 'trbutario',
                    suggested: 'trbutario',
                    reason: 'palabra válida',
                  },
                ],
              }),
            },
            eval_count: 180,
            total_duration: 120_000_000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Specialized Pass 2: Classification and Fields
      return new Response(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: JSON.stringify({
              documentType: 'RECLAMO_TRIBUTARIO',
              documentIntent: 'Solicitud de revisión de cobro',
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
          eval_count: 150,
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
        { id: 'w5', text: 'trbutario', confidence: 55, lineText: 'Palabra trbutario correcta.' },
      ],
    });

    assert.equal(result.enabled, true);
    assert.equal(result.classification.documentType, 'RECLAMO_TRIBUTARIO');

    // 1. revlsión -> revisión aceptada
    const w1 = result.anomalies.find(a => a.id === 'w1');
    assert.ok(w1);
    assert.equal(w1.status, 'SUGGESTED');
    assert.equal(w1.decision, 'CORRECTION');
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

    // 5. trbutario -> verificada correcta, preservada
    const w5 = result.anomalies.find(a => a.id === 'w5');
    assert.ok(w5);
    assert.equal(w5.decision, 'VERIFIED_CORRECT');
    assert.equal(w5.status, 'REJECTED'); // preserved without modification
    assert.equal(w5.rejectionReason, 'VERIFIED_CORRECT_NO_MODIFICATION_NEEDED');

    // Campos extraídos
    const nitField = result.extractedFields.find(f => f.fieldName === 'NIT');
    assert.ok(nitField);
    assert.equal(nitField.verified, true);
    assert.equal(nitField.status, 'VERIFIED');

    const telField = result.extractedFields.find(f => f.fieldName === 'TELEFONO');
    assert.ok(telField);
    assert.equal(telField.verified, false);
    assert.equal(telField.status, 'HALLUCINATION_REJECTED');

    // Telemetría agregada
    assert.ok(result.telemetry);
    assert.equal(result.telemetry.evalCount, 330);
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
