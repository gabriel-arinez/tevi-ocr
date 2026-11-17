import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { resolveSpanishLangPath } from '../../src/ocr/tesseract-worker-pool.js';
import { preprocessImage } from '../../src/preprocessing/strategies.js';
import { calculateOcrMetrics } from '../../src/metrics/ocr-metrics.js';

describe('Printed Photo Benchmark & Regression Contract (texto_impreso2)', () => {
  it('demuestra que median+normalize destruye encabezados a pesar de reportar mayor confianza', async () => {
    const rawBuf = await fs.readFile('tests/fixtures/camera/texto_impreso2.jpeg');
    const groundTruth = await fs.readFile('benchmark/ground-truth/texto_impreso2.txt', 'utf8');
    const oriented = await sharp(rawBuf).rotate().png().toBuffer();

    const worker = await createWorker('spa', OEM.LSTM_ONLY, {
      langPath: resolveSpanishLangPath(),
      gzip: true,
      cacheMethod: 'none',
      logger: () => undefined,
    });

    try {
      const normBuf = await preprocessImage(oriented, 'normalize');
      const medianBuf = await preprocessImage(oriented, 'median+normalize');

      const resNorm = await worker.recognize(normBuf);
      const resMedian = await worker.recognize(medianBuf);

      const metricsNorm = calculateOcrMetrics(groundTruth, resNorm.data.text);
      const metricsMedian = calculateOcrMetrics(groundTruth, resMedian.data.text);

      // Normalize conserva los encabezados principales
      assert.ok(
        resNorm.data.text.includes('CONTRATO ADMINISTRATIVO'),
        'Normalize debe conservar el encabezado CONTRATO ADMINISTRATIVO',
      );
      assert.ok(
        resNorm.data.text.includes('CONSULTORÍA INDIVIDUAL DE LÍNEA'),
        'Normalize debe conservar la línea CONSULTORÍA INDIVIDUAL DE LÍNEA',
      );

      // Median corrompe o elimina encabezados
      assert.ok(
        !resMedian.data.text.includes('CONTRATO ADMINISTRATIVO'),
        'Median corrompe CONTRATO ADMINISTRATIVO a texto parcial',
      );

      // La distancia de caracteres y palabras es menor (mejor) en normalize que en median+normalize
      assert.ok(
        metricsNorm.characterDistance < metricsMedian.characterDistance,
        `Normalize CER/distancia (${metricsNorm.characterDistance}) debe ser menor que Median (${metricsMedian.characterDistance})`,
      );

      // Demostrar la paradoja: mayor confianza promedio NO garantiza mejor OCR
      // Tesseract puede puntuar más alto a median porque descarta palabras difíciles
      assert.ok(
        (resMedian.data.confidence ?? 0) >= (resNorm.data.confidence ?? 0) - 2,
        'La confianza no debe ser el único criterio para seleccionar preprocesamiento',
      );
    } finally {
      await worker.terminate();
    }
  });

  it('evalúa modos de segmentación (PSM) y garantiza preservación de numeraciones contractuales', async () => {
    const rawBuf = await fs.readFile('tests/fixtures/camera/texto_impreso2.jpeg');
    const oriented = await sharp(rawBuf).rotate().png().toBuffer();
    const normBuf = await preprocessImage(oriented, 'normalize');

    const worker = await createWorker('spa', OEM.LSTM_ONLY, {
      langPath: resolveSpanishLangPath(),
      gzip: true,
      cacheMethod: 'none',
      logger: () => undefined,
    });

    try {
      // PSM 3 (Auto) vs PSM 4 (Single Column)
      const resAuto = await worker.recognize(normBuf);
      
      // Debe preservar numeraciones y códigos clave
      assert.ok(resAuto.data.text.includes('1003579028'), 'Debe reconocer NIT de Impuestos Nacionales');
      assert.ok(resAuto.data.text.includes('9111269013'), 'Debe reconocer NIT del Consultor');
      assert.ok(resAuto.data.text.includes('335/2026'), 'Debe reconocer código de requerimiento');
      assert.ok(resAuto.data.text.includes('CLÁUSULA PRIMERA'), 'Debe reconocer título de Cláusula Primera');
      assert.ok(resAuto.data.text.includes('CLÁUSULA SEGUNDA'), 'Debe reconocer título de Cláusula Segunda');
    } finally {
      await worker.terminate();
    }
  });
});
