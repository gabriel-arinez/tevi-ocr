import {
  execFile,
} from 'node:child_process';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';

import {
  config,
} from '../core/config.js';

import {
  handwritingKrakenClient,
  KrakenRuntimeClientError,
  type KrakenRuntimeLine,
} from './handwriting-kraken-client.js';

import {
  assessHandwritingConfidence,
  type HandwritingConfidenceDecision,
} from './handwriting-confidence-policy.js';

import {
  type HandwritingCharacterResult,
} from './handwriting-character-contract.js';

import {
  extractStructuredFields,
  type OcrStructuredExtractionResult,
} from './structured-field-extractor.js';


const execFileAsync =
  promisify(execFile);


export interface HandwritingLineResult
  extends KrakenRuntimeLine {
  confidenceDecisions:
    HandwritingConfidenceDecision[];
}


export interface HandwritingQualityResult {
  status: 'REVIEW';
  requiresReview: true;

  characterCount: number;
  fallbackCharacterCount: number;
  reviewCharacterCount: number;

  fallbackThreshold: number;

  automaticAcceptEnabled: false;
}


export interface HandwritingRecognitionResult {
  text: string;
  confidence: null;

  durationMs: number;
  detectionDurationMs: number;
  recognitionDurationMs: number;
  modelLoadDurationMs: number;

  lineCount: number;
  characterCount: number;

  lines: HandwritingLineResult[];

  characters:
    HandwritingCharacterResult[];

  quality:
    HandwritingQualityResult;

  structuredFields:
    OcrStructuredExtractionResult;

  engine: string;
  model: string;

  runtime: {
    persistent: true;
    threads: number;
    interopThreads: number;
    requestCount: number;
  };
}


export class HandwritingOcrError
  extends Error {
  constructor(
    readonly code:
      | 'HANDWRITING_RUNTIME_UNAVAILABLE'
      | 'HANDWRITING_INVALID_IMAGE'
      | 'HANDWRITING_PROCESSING_ERROR',
    message: string,
  ) {
    super(message);
    this.name =
      'HandwritingOcrError';
  }
}


interface DetectionOutput {
  ok: boolean;
  detectionSeconds: number;
  lineCount: number;
}



function detectorPython(): string {
  return (
    process.env
      .TEVI_OCR_DETECTOR_PYTHON ??
    path.join(
      os.homedir(),
      '.cache',
      'tevi-ocr-venvs',
      'text-detector',
      'bin',
      'python',
    )
  );
}



async function requireExecutable(
  executable: string,
): Promise<void> {
  try {
    await fs.access(
      executable,
      fs.constants.X_OK,
    );
  } catch {
    throw new HandwritingOcrError(
      'HANDWRITING_RUNTIME_UNAVAILABLE',
      'Runtime OCR manuscrito no disponible.',
    );
  }
}


export class HandwritingOcrEngine {
  async recognize(
    input: Buffer,
  ): Promise<HandwritingRecognitionResult> {
    let metadata;

    try {
      metadata =
        await sharp(input)
          .metadata();
    } catch {
      throw new HandwritingOcrError(
        'HANDWRITING_INVALID_IMAGE',
        'La imagen manuscrita no pudo ser decodificada.',
      );
    }

    const width =
      metadata.width ?? 0;

    const height =
      metadata.height ?? 0;

    if (
      width <= 0 ||
      height <= 0
    ) {
      throw new HandwritingOcrError(
        'HANDWRITING_INVALID_IMAGE',
        'La imagen manuscrita no tiene dimensiones válidas.',
      );
    }

    if (
      width * height >
      config.ocr.maxImagePixels
    ) {
      throw new HandwritingOcrError(
        'HANDWRITING_INVALID_IMAGE',
        'La imagen manuscrita supera el límite de píxeles permitido.',
      );
    }

    const detector =
      detectorPython();

    await requireExecutable(
      detector,
    );

    const tempDirectory =
      await fs.mkdtemp(
        path.join(
          os.tmpdir(),
          'tevi-ocr-handwriting-',
        ),
      );

    const inputPath =
      path.join(
        tempDirectory,
        'input.png',
      );

    const linesDirectory =
      path.join(
        tempDirectory,
        'lines',
      );

    const detectionPath =
      path.join(
        tempDirectory,
        'detection.json',
      );

    try {
      await fs.mkdir(
        linesDirectory,
        {
          recursive: true,
        },
      );

      await sharp(input)
        .rotate()
        .png()
        .toFile(
          inputPath,
        );

      const startedAt =
        process.hrtime.bigint();

      await execFileAsync(
        detector,
        [
          '-u',
          'scripts/handwriting-detect-runtime.py',
          '--input',
          inputPath,
          '--output-dir',
          linesDirectory,
          '--json',
          detectionPath,
        ],
        {
          timeout:
            90_000,

          maxBuffer:
            4 * 1024 * 1024,

          env: {
            ...process.env,

            TEVI_OCR_EASYOCR_CACHE:
              process.env
                .TEVI_OCR_EASYOCR_CACHE ??
              path.join(
                os.homedir(),
                '.cache',
                'tevi-ocr-easyocr',
              ),
          },
        },
      );

      const detection =
        JSON.parse(
          await fs.readFile(
            detectionPath,
            'utf8',
          ),
        ) as DetectionOutput;

      if (
        detection.ok !== true ||
        !Number.isFinite(
          detection.detectionSeconds,
        ) ||
        detection.detectionSeconds < 0 ||
        !Number.isInteger(
          detection.lineCount,
        ) ||
        detection.lineCount < 0
      ) {
        throw new HandwritingOcrError(
          'HANDWRITING_PROCESSING_ERROR',
          'El detector manuscrito devolvió una respuesta inválida.',
        );
      }

      let recognition;

      try {
        recognition =
          await handwritingKrakenClient
            .recognize(
              detectionPath,
              180_000,
            );
      } catch (error) {
        if (
          error instanceof
            KrakenRuntimeClientError &&
          error.code ===
            'KRAKEN_RUNTIME_UNAVAILABLE'
        ) {
          throw new HandwritingOcrError(
            'HANDWRITING_RUNTIME_UNAVAILABLE',
            'Runtime OCR manuscrito no disponible.',
          );
        }

        throw new HandwritingOcrError(
          'HANDWRITING_PROCESSING_ERROR',
          'No fue posible procesar el documento manuscrito.',
        );
      }

      if (
        recognition.lineCount !==
          detection.lineCount
      ) {
        throw new HandwritingOcrError(
          'HANDWRITING_PROCESSING_ERROR',
          'El recognizer manuscrito devolvió una respuesta inválida.',
        );
      }

      const lines:
        HandwritingLineResult[] =
          recognition.lines.map(
            (line) => ({
              ...line,

              confidenceDecisions:
                line.characters.map(
                  (character) =>
                    assessHandwritingConfidence(
                      character.confidence,
                    ),
                ),
            }),
          );

      const fallbackCharacterCount =
        lines.reduce(
          (total, line) =>
            total +
            line.confidenceDecisions
              .filter(
                (decision) =>
                  decision
                    .requiresFallback,
              )
              .length,
          0,
        );

      const reviewCharacterCount =
        lines.reduce(
          (total, line) =>
            total +
            line.confidenceDecisions
              .filter(
                (decision) =>
                  decision
                    .requiresReview,
              )
              .length,
          0,
        );

      /*
       * F11.5:
       * ACCEPT manuscrito permanece
       * deliberadamente deshabilitado.
       */
      const quality:
        HandwritingQualityResult = {
          status: 'REVIEW',
          requiresReview: true,

          characterCount:
            recognition
              .characterCount,

          fallbackCharacterCount,

          reviewCharacterCount,

          fallbackThreshold:
            0.70,

          automaticAcceptEnabled:
            false,
        };

      const structuredFields =
        extractStructuredFields(
          recognition.text,
          lines.map(
            (line) => ({
              lineNumber:
                line.lineNumber,
              text:
                line.text,
            }),
          ),
        );

      const finishedAt =
        process.hrtime.bigint();

      return {
        text:
          recognition.text,

        confidence:
          null,

        durationMs:
          Number(
            finishedAt -
            startedAt,
          ) /
          1_000_000,

        detectionDurationMs:
          detection.detectionSeconds *
          1000,

        recognitionDurationMs:
          recognition.recognitionSeconds *
          1000,

        modelLoadDurationMs:
          recognition.modelLoadSeconds *
          1000,

        lineCount:
          recognition.lineCount,

        characterCount:
          recognition.characterCount,

        lines,

        characters:
          recognition.characters,

        quality,

        structuredFields,

        engine:
          recognition.engine,

        model:
          recognition.model,

        runtime:
          recognition.runtime,
      };
    } catch (error) {
      if (
        error instanceof
        HandwritingOcrError
      ) {
        throw error;
      }

      throw new HandwritingOcrError(
        'HANDWRITING_PROCESSING_ERROR',
        'No fue posible procesar el documento manuscrito.',
      );
    } finally {
      await fs.rm(
        tempDirectory,
        {
          recursive: true,
          force: true,
        },
      );
    }
  }
}
