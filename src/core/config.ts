export const config = Object.freeze({
  port: Number(process.env.PORT ?? 4100),

  upload: {
    maxBytes: 20 * 1024 * 1024,
    allowedMimeTypes: new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
    ]),
  },

  ocr: {
    language: 'spa',
    pdfDpi: 200,
    maxPdfPages: 3,
    maxImagePixels: 40_000_000,
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://10.1.1.229:11434',
    model: process.env.OLLAMA_MODEL ?? 'llama3.2:latest',
    enabled: process.env.OLLAMA_ENABLED !== 'false',
    timeoutMs: Math.max(500, Number(process.env.OLLAMA_TIMEOUT_MS ?? 60000)),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? '20m',
    temperature: Math.max(0, Math.min(1, Number(process.env.OLLAMA_TEMPERATURE ?? 0))),
    numCtx: Math.max(512, Number(process.env.OLLAMA_NUM_CTX ?? 2048)),
    numPredict: Math.max(16, Number(process.env.OLLAMA_NUM_PREDICT ?? 80)),
    maxConcurrent: Math.max(1, Number(process.env.OLLAMA_MAX_CONCURRENT ?? 1)),
    circuitBreakerFailures: Math.max(1, Number(process.env.OLLAMA_CIRCUIT_BREAKER_FAILURES ?? 3)),
    circuitBreakerCooldownMs: Math.max(1000, Number(process.env.OLLAMA_CIRCUIT_BREAKER_COOLDOWN_MS ?? 30000)),
  },
});
