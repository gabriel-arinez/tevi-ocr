import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import {
  validateHandwritingLine,
  type HandwritingCharacterResult,
} from './handwriting-character-contract.js';


export interface KrakenRuntimeLine {
  lineNumber: number;
  text: string;
  prediction: string;

  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };

  recognitionSeconds: number;

  characters:
    HandwritingCharacterResult[];
}


export interface KrakenRuntimeResult {
  engine: string;
  model: string;
  modelLoadSeconds: number;
  recognitionSeconds: number;
  lineCount: number;
  characterCount: number;
  text: string;
  lines: KrakenRuntimeLine[];
  characters:
    HandwritingCharacterResult[];

  runtime: {
    persistent: true;
    threads: number;
    interopThreads: number;
    requestCount: number;
  };
}


interface RuntimeReadyMessage {
  type: 'ready';
  ok: true;
  engine: string;
  model: string;
  modelLoadSeconds: number;
  threads: number;
  interopThreads: number;
}


interface RuntimeResultMessage
  extends KrakenRuntimeResult {
  type: 'result';
  id: string;
  ok: true;
}


interface RuntimeFailureMessage {
  type: 'result';
  id: string | null;
  ok: false;
  error: string;
}


interface RuntimeFatalMessage {
  type: 'fatal';
  ok: false;
  error: string;
}


type RuntimeMessage =
  | RuntimeReadyMessage
  | RuntimeResultMessage
  | RuntimeFailureMessage
  | RuntimeFatalMessage;


export class KrakenRuntimeClientError
  extends Error {
  constructor(
    readonly code:
      | 'KRAKEN_RUNTIME_UNAVAILABLE'
      | 'KRAKEN_RUNTIME_PROTOCOL_ERROR'
      | 'KRAKEN_RUNTIME_PROCESSING_ERROR'
      | 'KRAKEN_RUNTIME_TIMEOUT',
    message: string,
  ) {
    super(message);

    this.name =
      'KrakenRuntimeClientError';
  }
}


function defaultPython(): string {
  return (
    process.env
      .TEVI_OCR_KRAKEN_PYTHON ??
    path.join(
      os.homedir(),
      '.cache',
      'tevi-ocr-venvs',
      'kraken',
      'bin',
      'python',
    )
  );
}


function runtimeScript(): string {
  return path.resolve(
    process.env
      .TEVI_OCR_KRAKEN_RUNTIME ??
    'scripts/handwriting-kraken-runtime.py',
  );
}


function parseMessage(
  raw: string,
): RuntimeMessage {
  let parsed: unknown;

  try {
    parsed =
      JSON.parse(raw);
  } catch {
    throw new KrakenRuntimeClientError(
      'KRAKEN_RUNTIME_PROTOCOL_ERROR',
      'El runtime Kraken devolvió JSON inválido.',
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null
  ) {
    throw new KrakenRuntimeClientError(
      'KRAKEN_RUNTIME_PROTOCOL_ERROR',
      'El runtime Kraken devolvió una respuesta inválida.',
    );
  }

  return parsed as RuntimeMessage;
}


function validateResult(
  message: RuntimeResultMessage,
): KrakenRuntimeResult {
  if (
    typeof message.engine !==
      'string' ||
    message.engine.length === 0 ||
    typeof message.model !==
      'string' ||
    message.model.length === 0 ||
    !Number.isFinite(
      message.modelLoadSeconds,
    ) ||
    message.modelLoadSeconds < 0 ||
    !Number.isFinite(
      message.recognitionSeconds,
    ) ||
    message.recognitionSeconds < 0 ||
    !Number.isInteger(
      message.lineCount,
    ) ||
    message.lineCount < 0 ||
    !Number.isInteger(
      message.characterCount,
    ) ||
    message.characterCount < 0 ||
    typeof message.text !==
      'string' ||
    !Array.isArray(
      message.lines,
    ) ||
    !Array.isArray(
      message.characters,
    ) ||
    message.lines.length !==
      message.lineCount ||
    message.characters.length !==
      message.characterCount
  ) {
    throw new KrakenRuntimeClientError(
      'KRAKEN_RUNTIME_PROTOCOL_ERROR',
      'El runtime Kraken devolvió un contrato inválido.',
    );
  }

  const reconstructedText =
    message.lines
      .map(
        (line) =>
          line.text,
      )
      .join('\n')
      .trim();

  if (
    reconstructedText !==
    message.text
  ) {
    throw new KrakenRuntimeClientError(
      'KRAKEN_RUNTIME_PROTOCOL_ERROR',
      'El texto Kraken no coincide con sus líneas.',
    );
  }

  const flattenedCharacters:
    HandwritingCharacterResult[] = [];

  for (
    const line
    of message.lines
  ) {
    if (
      !Number.isInteger(
        line.lineNumber,
      ) ||
      line.lineNumber < 1 ||
      typeof line.text !==
        'string' ||
      line.prediction !==
        line.text ||
      !Number.isFinite(
        line.recognitionSeconds,
      ) ||
      line.recognitionSeconds < 0 ||
      !Array.isArray(
        line.characters,
      ) ||
      !validateHandwritingLine({
        lineNumber:
          line.lineNumber,
        prediction:
          line.prediction,
        characters:
          line.characters,
      })
    ) {
      throw new KrakenRuntimeClientError(
        'KRAKEN_RUNTIME_PROTOCOL_ERROR',
        'Una línea Kraken no cumple el contrato.',
      );
    }

    flattenedCharacters.push(
      ...line.characters,
    );
  }

  if (
    JSON.stringify(
      flattenedCharacters,
    ) !==
    JSON.stringify(
      message.characters,
    )
  ) {
    throw new KrakenRuntimeClientError(
      'KRAKEN_RUNTIME_PROTOCOL_ERROR',
      'Los caracteres Kraken no coinciden con las líneas.',
    );
  }

  if (
    typeof message.runtime !==
      'object' ||
    message.runtime === null ||
    message.runtime.persistent !==
      true ||
    !Number.isInteger(
      message.runtime.threads,
    ) ||
    message.runtime.threads < 1 ||
    !Number.isInteger(
      message.runtime
        .interopThreads,
    ) ||
    message.runtime
      .interopThreads < 1 ||
    !Number.isInteger(
      message.runtime
        .requestCount,
    ) ||
    message.runtime
      .requestCount < 1
  ) {
    throw new KrakenRuntimeClientError(
      'KRAKEN_RUNTIME_PROTOCOL_ERROR',
      'La metadata del runtime Kraken es inválida.',
    );
  }

  return {
    engine:
      message.engine,
    model:
      message.model,
    modelLoadSeconds:
      message.modelLoadSeconds,
    recognitionSeconds:
      message.recognitionSeconds,
    lineCount:
      message.lineCount,
    characterCount:
      message.characterCount,
    text:
      message.text,
    lines:
      message.lines,
    characters:
      message.characters,
    runtime:
      message.runtime,
  };
}


export class KrakenRuntimeClient {
  private process:
    ChildProcessWithoutNullStreams
    | null = null;

  private ready:
    Promise<void> | null = null;

  private resolveReady:
    (() => void) | null = null;

  private rejectReady:
    ((error: Error) => void)
    | null = null;

  private queue:
    Promise<unknown> =
      Promise.resolve();

  private nextId = 1;

  private pending:
    {
      id: string;
      resolve:
        (
          value:
            KrakenRuntimeResult,
        ) => void;
      reject:
        (error: Error) => void;
      timer:
        NodeJS.Timeout;
    }
    | null = null;


  async recognize(
    detectionPath: string,
    timeoutMs = 30_000,
  ): Promise<KrakenRuntimeResult> {
    const operation =
      this.queue.then(
        () =>
          this.recognizeSerialized(
            detectionPath,
            timeoutMs,
          ),
      );

    this.queue =
      operation.catch(
        () => undefined,
      );

    return operation;
  }


  async close(): Promise<void> {
    const process =
      this.process;

    this.resetProcess();

    if (
      process &&
      !process.killed
    ) {
      process.kill('SIGTERM');
    }
  }


  private async ensureStarted():
    Promise<void> {
    if (
      this.process &&
      this.ready
    ) {
      await this.ready;
      return;
    }

    const python =
      defaultPython();

    const script =
      runtimeScript();

    try {
      await Promise.all([
        fs.access(
          python,
          fs.constants.X_OK,
        ),
        fs.access(
          script,
          fs.constants.R_OK,
        ),
      ]);
    } catch {
      throw new KrakenRuntimeClientError(
        'KRAKEN_RUNTIME_UNAVAILABLE',
        'Runtime Kraken no disponible.',
      );
    }

    this.ready =
      new Promise<void>(
        (
          resolve,
          reject,
        ) => {
          this.resolveReady =
            resolve;
          this.rejectReady =
            reject;
        },
      );

    const child =
      spawn(
        python,
        [
          '-u',
          script,
        ],
        {
          stdio: [
            'pipe',
            'pipe',
            'pipe',
          ],
          env: {
            ...process.env,
          },
        },
      );

    this.process =
      child;

    child.stderr.on(
      'data',
      () => {
        /*
         * Drenar stderr evita bloquear el proceso
         * persistente si Kraken escribe diagnósticos.
         * No se propagan detalles internos.
         */
      },
    );

    const output =
      readline.createInterface({
        input:
          child.stdout,
        crlfDelay:
          Infinity,
      });

    output.on(
      'line',
      (line) => {
        this.handleLine(line);
      },
    );

    child.once(
      'error',
      () => {
        const error =
          new KrakenRuntimeClientError(
            'KRAKEN_RUNTIME_UNAVAILABLE',
            'Runtime Kraken no disponible.',
          );

        this.failRuntime(
          error,
        );
      },
    );

    child.once(
      'exit',
      () => {
        const error =
          new KrakenRuntimeClientError(
            'KRAKEN_RUNTIME_PROCESSING_ERROR',
            'El runtime Kraken terminó inesperadamente.',
          );

        this.failRuntime(
          error,
        );
      },
    );

    const startupTimeout =
      setTimeout(
        () => {
          this.failRuntime(
            new KrakenRuntimeClientError(
              'KRAKEN_RUNTIME_TIMEOUT',
              'El runtime Kraken no inició a tiempo.',
            ),
          );
        },
        30_000,
      );

    try {
      await this.ready;
    } finally {
      clearTimeout(
        startupTimeout,
      );
    }
  }


  private async recognizeSerialized(
    detectionPath: string,
    timeoutMs: number,
  ): Promise<KrakenRuntimeResult> {
    await this.ensureStarted();

    const child =
      this.process;

    if (
      !child ||
      child.killed ||
      !child.stdin.writable
    ) {
      this.resetProcess();

      throw new KrakenRuntimeClientError(
        'KRAKEN_RUNTIME_PROCESSING_ERROR',
        'Runtime Kraken no disponible para procesar.',
      );
    }

    const id =
      `kraken-${this.nextId}`;

    this.nextId += 1;

    return new Promise<
      KrakenRuntimeResult
    >(
      (
        resolve,
        reject,
      ) => {
        const timer =
          setTimeout(
            () => {
              this.pending =
                null;

              const process =
                this.process;

              this.resetProcess();

              if (
                process &&
                !process.killed
              ) {
                process.kill(
                  'SIGKILL',
                );
              }

              reject(
                new KrakenRuntimeClientError(
                  'KRAKEN_RUNTIME_TIMEOUT',
                  'El runtime Kraken excedió el tiempo permitido.',
                ),
              );
            },
            timeoutMs,
          );

        this.pending = {
          id,
          resolve,
          reject,
          timer,
        };

        child.stdin.write(
          JSON.stringify({
            id,
            detectionPath,
          })
          + '\n',
          (error) => {
            if (!error) {
              return;
            }

            clearTimeout(
              timer,
            );

            this.pending =
              null;

            reject(
              new KrakenRuntimeClientError(
                'KRAKEN_RUNTIME_PROCESSING_ERROR',
                'No fue posible enviar la solicitud a Kraken.',
              ),
            );
          },
        );
      },
    );
  }


  private handleLine(
    raw: string,
  ): void {
    let message:
      RuntimeMessage;

    try {
      message =
        parseMessage(raw);
    } catch (error) {
      this.failRuntime(
        error instanceof Error
          ? error
          : new Error(
              'Respuesta Kraken inválida.',
            ),
      );

      return;
    }

    if (
      message.type ===
        'ready'
    ) {
      if (
        message.ok !== true ||
        !Number.isFinite(
          message
            .modelLoadSeconds,
        ) ||
        message
          .modelLoadSeconds < 0 ||
        message.threads !== 4 ||
        message
          .interopThreads !== 2
      ) {
        this.failRuntime(
          new KrakenRuntimeClientError(
            'KRAKEN_RUNTIME_PROTOCOL_ERROR',
            'Handshake Kraken inválido.',
          ),
        );

        return;
      }

      this.resolveReady?.();

      this.resolveReady =
        null;

      this.rejectReady =
        null;

      return;
    }

    if (
      message.type ===
        'fatal'
    ) {
      this.failRuntime(
        new KrakenRuntimeClientError(
          'KRAKEN_RUNTIME_PROCESSING_ERROR',
          'Kraken no pudo inicializarse.',
        ),
      );

      return;
    }

    const pending =
      this.pending;

    if (!pending) {
      this.failRuntime(
        new KrakenRuntimeClientError(
          'KRAKEN_RUNTIME_PROTOCOL_ERROR',
          'Kraken respondió sin solicitud pendiente.',
        ),
      );

      return;
    }

    if (
      message.id !==
        pending.id
    ) {
      this.failRuntime(
        new KrakenRuntimeClientError(
          'KRAKEN_RUNTIME_PROTOCOL_ERROR',
          'Kraken respondió con un identificador inesperado.',
        ),
      );

      return;
    }

    clearTimeout(
      pending.timer,
    );

    this.pending =
      null;

    if (
      message.ok !== true
    ) {
      pending.reject(
        new KrakenRuntimeClientError(
          'KRAKEN_RUNTIME_PROCESSING_ERROR',
          'Kraken no pudo procesar la solicitud.',
        ),
      );

      return;
    }

    try {
      pending.resolve(
        validateResult(
          message,
        ),
      );
    } catch (error) {
      pending.reject(
        error instanceof Error
          ? error
          : new KrakenRuntimeClientError(
              'KRAKEN_RUNTIME_PROTOCOL_ERROR',
              'Respuesta Kraken inválida.',
            ),
      );
    }
  }


  private failRuntime(
    error: Error,
  ): void {
    this.rejectReady?.(
      error,
    );

    this.resolveReady =
      null;

    this.rejectReady =
      null;

    if (this.pending) {
      clearTimeout(
        this.pending.timer,
      );

      this.pending.reject(
        error,
      );

      this.pending =
        null;
    }

    const process =
      this.process;

    this.resetProcess();

    if (
      process &&
      !process.killed
    ) {
      process.kill(
        'SIGKILL',
      );
    }
  }


  private resetProcess(): void {
    this.process =
      null;

    this.ready =
      null;
  }
}


export const handwritingKrakenClient =
  new KrakenRuntimeClient();
