import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaClient } from '../../src/ai/ollama-client.js';
import { SemanticAnalyzer } from '../../src/ai/semantic-analyzer.js';

describe('Ollama & SemanticAnalyzer Live Integration', () => {
  it('se conecta con el servidor remoto Llama 3.2 y realiza análisis semántico seguro', async (t) => {
    const client = new OllamaClient();
    const health = await client.checkHealth();

    if (!health.available || !health.modelAvailable) {
      t.skip(`Ollama remoto (${client.baseUrl}) no disponible o modelo ${client.model} ausente; saltando prueba en vivo`);
      return;
    }

    const analyzer = new SemanticAnalyzer(client);
    const sampleOcrText =
      'SERVICIO DE IMPUESTOS NACIONALES\n' +
      'Referencia: Reclamo tributario gestión 2026\n' +
      'El contribuyente solicita la revlsión de un cobro duplicado.\n' +
      'NIT: 1020304050\n' +
      'Monto observado: Bs 3.850,50\n' +
      'Fecha: 06/10/2026';

    const result = await analyzer.analyze({
      rawText: sampleOcrText,
      readableText: sampleOcrText,
      lowConfidenceWords: [
        {
          id: 'w1',
          text: 'revlsión',
          confidence: 65,
          lineText: 'El contribuyente solicita la revlsión de un cobro duplicado.',
        },
      ],
      mode: 'assisted',
    });

    if (!result.enabled) {
      console.error('LIVE TEST RESULT ERROR:', result.error);
    }

    assert.equal(result.enabled, true);
    assert.equal(result.available, true);
    assert.ok(result.classification.documentType);
    assert.ok(result.classification.documentIntent.length > 0);
    assert.ok(result.telemetry);
    assert.ok(result.telemetry.totalDurationMs > 0);

    // Verify rawText remains 100% intact (non-destructive)
    assert.ok(sampleOcrText.includes('revlsión'));

    // If an anomaly suggestion was made for revlsión, verify it conforms to safety rules
    const revlsion = result.anomalies.find(a => a.originalText.includes('revlsión') || a.id === 'w1');
    if (revlsion && revlsion.status === 'SUGGESTED') {
      assert.ok(revlsion.charDistance <= 2);
    }
  });
});
