import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OllamaClient,
  OllamaTimeoutError,
  OllamaUnavailableError,
  OllamaCircuitBreakerOpenError,
  OllamaInvalidResponseError,
} from '../../src/ai/ollama-client.js';

describe('OllamaClient', () => {
  it('ejecuta chat con parseo JSON y telemetría estructurada', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          model: 'llama3.2:latest',
          message: { role: 'assistant', content: '{"status":"ok","value":42}' },
          total_duration: 1_200_000_000,
          load_duration: 50_000_000,
          prompt_eval_duration: 150_000_000,
          eval_duration: 1_000_000_000,
          prompt_eval_count: 20,
          eval_count: 15,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      fetchFn: mockFetch,
    });

    const result = await client.chat<{ status: string; value: number }>([
      { role: 'user', content: 'ping' },
    ]);

    assert.equal(result.message.content, '{"status":"ok","value":42}');
    assert.deepEqual(result.parsed, { status: 'ok', value: 42 });
    assert.equal(result.telemetry.promptEvalCount, 20);
    assert.equal(result.telemetry.evalCount, 15);
    assert.equal(result.telemetry.totalDurationMs, 1200);
    assert.equal(result.telemetry.loadDurationMs, 50);
    assert.equal(result.telemetry.tokensPerSecond, 15);
  });

  it('lanza OllamaTimeoutError cuando el tiempo excede timeoutMs', async () => {
    const mockFetch: typeof fetch = async (_url, options) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const client = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      timeoutMs: 50,
      fetchFn: mockFetch,
    });

    await assert.rejects(
      client.chat([{ role: 'user', content: 'slow' }]),
      (err: unknown) => {
        assert.ok(err instanceof OllamaTimeoutError);
        assert.equal(err.code, 'OLLAMA_TIMEOUT');
        return true;
      },
    );
  });

  it('lanza OllamaUnavailableError ante fallo de conexión de red', async () => {
    const mockFetch: typeof fetch = async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    };

    const client = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      fetchFn: mockFetch,
    });

    await assert.rejects(
      client.chat([{ role: 'user', content: 'down' }]),
      (err: unknown) => {
        assert.ok(err instanceof OllamaUnavailableError);
        assert.equal(err.code, 'OLLAMA_UNAVAILABLE');
        return true;
      },
    );
  });

  it('lanza OllamaInvalidResponseError cuando el servidor responde HTTP no-200', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('model not found', { status: 404 });
    };

    const client = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      fetchFn: mockFetch,
    });

    await assert.rejects(
      client.chat([{ role: 'user', content: 'missing-model' }]),
      (err: unknown) => {
        assert.ok(err instanceof OllamaInvalidResponseError);
        assert.equal(err.code, 'OLLAMA_INVALID_RESPONSE');
        return true;
      },
    );
  });

  it('activa el circuit breaker tras fallos consecutivos y rechaza inmediatamente', async () => {
    const mockFetch: typeof fetch = async () => {
      throw new Error('connection refused');
    };

    const client = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      circuitBreakerFailures: 2,
      circuitBreakerCooldownMs: 1000,
      fetchFn: mockFetch,
    });

    assert.equal(client.state, 'CLOSED');

    // Fallo 1
    await assert.rejects(client.chat([{ role: 'user', content: '1' }]));
    assert.equal(client.state, 'CLOSED');

    // Fallo 2 -> dispara el breaker
    await assert.rejects(client.chat([{ role: 'user', content: '2' }]));
    assert.equal(client.state, 'OPEN');

    // Siguiente llamada debe ser rechazada inmediatamente por circuit breaker sin llamar al fetch
    let fetchCalled = false;
    const clientWithSpy = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      circuitBreakerFailures: 1,
      circuitBreakerCooldownMs: 5000,
      fetchFn: async () => {
        fetchCalled = true;
        throw new Error('fail');
      },
    });

    await assert.rejects(clientWithSpy.chat([{ role: 'user', content: 'trip' }]));
    assert.equal(clientWithSpy.state, 'OPEN');

    fetchCalled = false;
    await assert.rejects(
      clientWithSpy.chat([{ role: 'user', content: 'blocked' }]),
      (err: unknown) => {
        assert.ok(err instanceof OllamaCircuitBreakerOpenError);
        assert.equal(err.code, 'OLLAMA_CIRCUIT_BREAKER_OPEN');
        return true;
      },
    );
    assert.equal(fetchCalled, false, 'No debió invocar fetch mientras el circuit breaker estaba OPEN');
  });

  it('checkHealth reporta modelo disponible e info de estado', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          models: [
            { name: 'llama3.2:latest', size: 2019393189 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      model: 'llama3.2:latest',
      fetchFn: mockFetch,
    });

    const health = await client.checkHealth();
    assert.equal(health.ok, true);
    assert.equal(health.available, true);
    assert.equal(health.modelAvailable, true);
    assert.equal(health.circuitBreaker, 'CLOSED');
  });

  it('serializa llamadas respetando maxConcurrent = 1', async () => {
    let activeInFlight = 0;
    let maxObservedInFlight = 0;

    const mockFetch: typeof fetch = async () => {
      activeInFlight += 1;
      maxObservedInFlight = Math.max(maxObservedInFlight, activeInFlight);
      await new Promise(r => setTimeout(r, 20));
      activeInFlight -= 1;
      return new Response(
        JSON.stringify({ response: 'ok', eval_count: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new OllamaClient({
      baseUrl: 'http://mock-ollama:11434',
      maxConcurrent: 1,
      fetchFn: mockFetch,
    });

    await Promise.all([
      client.generate('req1'),
      client.generate('req2'),
      client.generate('req3'),
    ]);

    assert.equal(maxObservedInFlight, 1, 'maxConcurrent = 1 debió serializar todas las llamadas');
  });
});
