import { config } from '../core/config.js';

export class OllamaClientError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'OllamaClientError';
    this.code = code;
  }
}

export class OllamaUnavailableError extends OllamaClientError {
  constructor(message = 'Ollama server unavailable') {
    super(message, 'OLLAMA_UNAVAILABLE');
    this.name = 'OllamaUnavailableError';
  }
}

export class OllamaTimeoutError extends OllamaClientError {
  constructor(timeoutMs: number) {
    super(`Ollama request timed out after ${timeoutMs}ms`, 'OLLAMA_TIMEOUT');
    this.name = 'OllamaTimeoutError';
  }
}

export class OllamaCircuitBreakerOpenError extends OllamaClientError {
  readonly cooldownRemainingMs: number;
  constructor(cooldownRemainingMs: number) {
    super(`Ollama circuit breaker is OPEN (${Math.round(cooldownRemainingMs / 1000)}s remaining)`, 'OLLAMA_CIRCUIT_BREAKER_OPEN');
    this.name = 'OllamaCircuitBreakerOpenError';
    this.cooldownRemainingMs = cooldownRemainingMs;
  }
}

export class OllamaInvalidResponseError extends OllamaClientError {
  constructor(message: string) {
    super(message, 'OLLAMA_INVALID_RESPONSE');
    this.name = 'OllamaInvalidResponseError';
  }
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface OllamaTelemetry {
  totalDurationMs: number;
  loadDurationMs: number;
  promptEvalDurationMs: number;
  evalDurationMs: number;
  promptEvalCount: number;
  evalCount: number;
  tokensPerSecond: number;
  httpDurationMs: number;
  queueWaitMs: number;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResult<T = unknown> {
  message: OllamaChatMessage;
  parsed?: T;
  telemetry: OllamaTelemetry;
  rawResponse: Record<string, unknown>;
}

export interface OllamaGenerateResult<T = unknown> {
  response: string;
  parsed?: T;
  telemetry: OllamaTelemetry;
  rawResponse: Record<string, unknown>;
}

export interface OllamaHealthStatus {
  ok: boolean;
  available: boolean;
  modelAvailable: boolean;
  model: string;
  circuitBreaker: CircuitBreakerState;
  consecutiveFailures: number;
  latencyMs?: number;
  error?: string;
}

export interface OllamaClientOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  keepAlive?: string;
  temperature?: number;
  numCtx?: number;
  numPredict?: number;
  maxConcurrent?: number;
  circuitBreakerFailures?: number;
  circuitBreakerCooldownMs?: number;
  fetchFn?: typeof fetch;
}

export class OllamaClient {
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly keepAlive: string;
  readonly temperature: number;
  readonly numCtx: number;
  readonly numPredict: number;
  readonly maxConcurrent: number;
  readonly circuitBreakerFailures: number;
  readonly circuitBreakerCooldownMs: number;
  private readonly fetch: typeof fetch;

  private circuitState: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private circuitOpenedAt = 0;
  private inFlightRequests = 0;
  private readonly queue: Array<() => void> = [];

  constructor(options: OllamaClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? config.ollama.baseUrl).replace(/\/+$/, '');
    this.model = options.model ?? config.ollama.model;
    this.timeoutMs = options.timeoutMs ?? config.ollama.timeoutMs;
    this.keepAlive = options.keepAlive ?? config.ollama.keepAlive;
    this.temperature = options.temperature ?? config.ollama.temperature;
    this.numCtx = options.numCtx ?? config.ollama.numCtx;
    this.numPredict = options.numPredict ?? config.ollama.numPredict;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? config.ollama.maxConcurrent);
    this.circuitBreakerFailures = Math.max(1, options.circuitBreakerFailures ?? config.ollama.circuitBreakerFailures);
    this.circuitBreakerCooldownMs = Math.max(1000, options.circuitBreakerCooldownMs ?? config.ollama.circuitBreakerCooldownMs);
    this.fetch = options.fetchFn ?? globalThis.fetch;
  }

  get state(): CircuitBreakerState {
    if (this.circuitState === 'OPEN') {
      const elapsed = Date.now() - this.circuitOpenedAt;
      if (elapsed >= this.circuitBreakerCooldownMs) {
        this.circuitState = 'HALF_OPEN';
      }
    }
    return this.circuitState;
  }

  resetCircuitBreaker(): void {
    this.circuitState = 'CLOSED';
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = 0;
  }

  private recordSuccess(): void {
    this.circuitState = 'CLOSED';
    this.consecutiveFailures = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.circuitState === 'HALF_OPEN' || this.consecutiveFailures >= this.circuitBreakerFailures) {
      this.circuitState = 'OPEN';
      this.circuitOpenedAt = Date.now();
    }
  }

  private async acquireSlot(): Promise<number> {
    const queueStartTime = Date.now();
    if (this.inFlightRequests < this.maxConcurrent) {
      this.inFlightRequests += 1;
      return 0;
    }

    return new Promise<number>((resolve) => {
      this.queue.push(() => {
        this.inFlightRequests += 1;
        resolve(Date.now() - queueStartTime);
      });
    });
  }

  private releaseSlot(): void {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  private checkCircuit(): void {
    const current = this.state;
    if (current === 'OPEN') {
      const remaining = Math.max(0, this.circuitBreakerCooldownMs - (Date.now() - this.circuitOpenedAt));
      throw new OllamaCircuitBreakerOpenError(remaining);
    }
  }

  private buildTelemetry(data: Record<string, unknown>, httpDurationMs: number, queueWaitMs: number): OllamaTelemetry {
    const totalDurationNs = Number(data.total_duration ?? 0);
    const loadDurationNs = Number(data.load_duration ?? 0);
    const promptEvalDurationNs = Number(data.prompt_eval_duration ?? 0);
    const evalDurationNs = Number(data.eval_duration ?? 0);
    const promptEvalCount = Number(data.prompt_eval_count ?? 0);
    const evalCount = Number(data.eval_count ?? 0);

    const evalDurationMs = evalDurationNs / 1_000_000;
    const tokensPerSecond = evalDurationMs > 0 ? Number((evalCount / (evalDurationMs / 1000)).toFixed(2)) : 0;

    return {
      totalDurationMs: Number((totalDurationNs / 1_000_000).toFixed(2)),
      loadDurationMs: Number((loadDurationNs / 1_000_000).toFixed(2)),
      promptEvalDurationMs: Number((promptEvalDurationNs / 1_000_000).toFixed(2)),
      evalDurationMs: Number(evalDurationMs.toFixed(2)),
      promptEvalCount,
      evalCount,
      tokensPerSecond,
      httpDurationMs: Number(httpDurationMs.toFixed(2)),
      queueWaitMs,
    };
  }

  async checkHealth(): Promise<OllamaHealthStatus> {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Math.min(2000, this.timeoutMs));

      const response = await this.fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        return {
          ok: false,
          available: false,
          modelAvailable: false,
          model: this.model,
          circuitBreaker: this.state,
          consecutiveFailures: this.consecutiveFailures,
          latencyMs,
          error: `HTTP ${response.status}`,
        };
      }

      const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
      const modelList = body.models ?? [];
      const modelAvailable = modelList.some(
        m => m.name === this.model || m.model === this.model || m.name?.startsWith(this.model.split(':')[0] ?? ''),
      );

      return {
        ok: true,
        available: true,
        modelAvailable,
        model: this.model,
        circuitBreaker: this.state,
        consecutiveFailures: this.consecutiveFailures,
        latencyMs,
      };
    } catch (err) {
      return {
        ok: false,
        available: false,
        modelAvailable: false,
        model: this.model,
        circuitBreaker: this.state,
        consecutiveFailures: this.consecutiveFailures,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async chat<T = unknown>(
    messages: OllamaChatMessage[],
    options: {
      format?: 'json' | Record<string, unknown>;
      temperature?: number;
      numPredict?: number;
      numCtx?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<OllamaChatResult<T>> {
    this.checkCircuit();
    const queueWaitMs = await this.acquireSlot();

    const requestTimeout = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), requestTimeout);
    const httpStart = process.hrtime.bigint();

    try {
    const format = options.format ?? 'json';
    const payload = {
      model: this.model,
      messages,
      format,
      stream: false,
      keep_alive: this.keepAlive,
      options: {
        temperature: options.temperature ?? this.temperature,
        num_predict: options.numPredict ?? this.numPredict,
        num_ctx: options.numCtx ?? this.numCtx,
      },
    };

    const response = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const httpDurationMs = Number(process.hrtime.bigint() - httpStart) / 1_000_000;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new OllamaInvalidResponseError(`Ollama HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      message?: { role?: string; content?: string };
      [key: string]: unknown;
    };

    const content = data.message?.content ?? '';
    let parsed: T | undefined;
    if (format) {
      try {
        parsed = JSON.parse(content) as T;
      } catch {
        // Keep content as raw, validation will catch schema mismatch
      }
    }

      this.recordSuccess();

      return {
        message: {
          role: (data.message?.role as OllamaChatMessage['role']) ?? 'assistant',
          content,
        },
        parsed,
        telemetry: this.buildTelemetry(data, httpDurationMs, queueWaitMs),
        rawResponse: data,
      };
    } catch (err: unknown) {
      this.recordFailure();

      if (err instanceof OllamaClientError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OllamaTimeoutError(requestTimeout);
      }
      throw new OllamaUnavailableError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeoutTimer);
      this.releaseSlot();
    }
  }

  async generate<T = unknown>(
    prompt: string,
    options: {
      system?: string;
      format?: 'json' | Record<string, unknown>;
      temperature?: number;
      numPredict?: number;
      numCtx?: number;
      timeoutMs?: number;
    } = {},
  ): Promise<OllamaGenerateResult<T>> {
    this.checkCircuit();
    const queueWaitMs = await this.acquireSlot();

    const requestTimeout = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), requestTimeout);
    const httpStart = process.hrtime.bigint();

    try {
    const format = options.format ?? 'json';
    const payload = {
      model: this.model,
      prompt,
      system: options.system,
      format,
      stream: false,
      keep_alive: this.keepAlive,
      options: {
        temperature: options.temperature ?? this.temperature,
        num_predict: options.numPredict ?? this.numPredict,
        num_ctx: options.numCtx ?? this.numCtx,
      },
    };

    const response = await this.fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const httpDurationMs = Number(process.hrtime.bigint() - httpStart) / 1_000_000;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new OllamaInvalidResponseError(`Ollama HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      response?: string;
      [key: string]: unknown;
    };

    const content = data.response ?? '';
    let parsed: T | undefined;
    if (format) {
      try {
        parsed = JSON.parse(content) as T;
      } catch {
        // Ignore parse error here
      }
    }

      this.recordSuccess();

      return {
        response: content,
        parsed,
        telemetry: this.buildTelemetry(data, httpDurationMs, queueWaitMs),
        rawResponse: data,
      };
    } catch (err: unknown) {
      this.recordFailure();

      if (err instanceof OllamaClientError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OllamaTimeoutError(requestTimeout);
      }
      throw new OllamaUnavailableError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeoutTimer);
      this.releaseSlot();
    }
  }
}

// Global shared client instance
let defaultOllamaClient: OllamaClient | null = null;

export function getDefaultOllamaClient(): OllamaClient {
  if (!defaultOllamaClient) {
    defaultOllamaClient = new OllamaClient();
  }
  return defaultOllamaClient;
}
