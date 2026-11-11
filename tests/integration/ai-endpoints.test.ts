import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { app } from '../../src/server.js';

async function withServer(
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');

    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe('AI Endpoints Integration', () => {
  it('GET /api/ai/health responde estado operativo y modelo configurado', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/health`);
      assert.equal(response.status, 200);

      const payload = (await response.json()) as {
        ok: boolean;
        ai: {
          enabled: boolean;
          model: string;
          baseUrl: string;
          circuitBreaker: string;
        };
      };

      assert.equal(payload.ok, true);
      assert.equal(payload.ai.model, 'llama3.2:latest');
      assert.ok(payload.ai.baseUrl.includes('10.1.1.229') || payload.ai.baseUrl.length > 0);
      assert.ok(['CLOSED', 'OPEN', 'HALF_OPEN'].includes(payload.ai.circuitBreaker));
    });
  });

  it('POST /api/ocr/analyze-semantics rechaza request sin texto', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ocr/analyze-semantics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 400);
      const payload = (await response.json()) as { ok: boolean; error: string };
      assert.equal(payload.ok, false);
      assert.equal(payload.error, 'TEXT_REQUIRED');
    });
  });

  it('POST /api/ocr/file con aiReview: conventional procesa OCR rápido sin tocar texto', async () => {
    await withServer(async (baseUrl) => {
      const png = await fs.readFile('tests/fixtures/printed/printed-clean.png');
      const form = new FormData();
      form.append('file', new Blob([png], { type: 'image/png' }), 'printed-clean.png');
      form.append('aiReview', 'conventional');

      const response = await fetch(`${baseUrl}/api/ocr/file`, {
        method: 'POST',
        body: form,
      });

      assert.equal(response.status, 200);
      const payload = (await response.json()) as {
        ok: boolean;
        ocr: {
          text: string;
          readableText: string;
          aiReview?: {
            enabled: boolean;
            executionMode: string;
          };
        };
      };

      assert.equal(payload.ok, true);
      assert.ok(payload.ocr.text.includes('SERVICIO DE IMPUESTOS NACIONALES'));
      assert.ok(payload.ocr.aiReview);
      assert.equal(payload.ocr.aiReview.executionMode, 'conventional');
      assert.equal(payload.ocr.aiReview.enabled, false);
    });
  });
});
