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


const execFileAsync =
  promisify(execFile);


export interface HandwritingLineResult {
  lineNumber: number;
  text: string;

  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };

  recognitionSeconds: number;
}


export interface HandwritingRecognitionResult {
  text: string;
  confidence: null;
  durationMs: number;
  detectionDurationMs: number;
  recognitionDurationMs: number;
  modelLoadDurationMs: number;
  lineCount: number;
  lines: HandwritingLineResult[];
  engine: string;
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


interface RecognitionOutput {
  ok: boolean;
  engine: string;
  confidence: null;
  modelLoadSeconds: number;
  recognitionSeconds: number;
  lineCount: number;
  lines: HandwritingLineResult[];
  text: string;
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


function trocrPython(): string {
  return (
    process.env
      .TEVI_OCR_TROCR_PYTHON ??
    path.resolve(
      '.venv-handwriting',
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

    const trocr =
      trocrPython();

    await Promise.all([
      requireExecutable(detector),
      requireExecutable(trocr),
    ]);

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

    const resultPath =
      path.join(
        tempDirectory,
        'result.json',
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

      await execFileAsync(
        trocr,
        [
          '-u',
          'scripts/handwriting-recognize-runtime.py',
          '--input-json',
          detectionPath,
          '--output-json',
          resultPath,
        ],
        {
          timeout:
            180_000,

          maxBuffer:
            4 * 1024 * 1024,

          env: {
            ...process.env,

            HF_HOME:
              process.env
                .TEVI_OCR_HF_CACHE ??
              path.join(
                os.homedir(),
                '.cache',
                'tevi-ocr-huggingface',
              ),
          },
        },
      );

      const recognition =
        JSON.parse(
          await fs.readFile(
            resultPath,
            'utf8',
          ),
        ) as RecognitionOutput;

      if (
        recognition.ok !== true ||
        typeof recognition.engine !==
          'string' ||
        recognition.engine.length === 0 ||
        recognition.confidence !== null ||
        typeof recognition.text !==
          'string' ||
        !Number.isFinite(
          recognition.modelLoadSeconds,
        ) ||
        recognition.modelLoadSeconds < 0 ||
        !Number.isFinite(
          recognition.recognitionSeconds,
        ) ||
        recognition.recognitionSeconds < 0 ||
        !Number.isInteger(
          recognition.lineCount,
        ) ||
        recognition.lineCount < 0 ||
        !Array.isArray(
          recognition.lines,
        ) ||
        recognition.lines.length !==
          recognition.lineCount ||
        recognition.lineCount !==
          detection.lineCount
      ) {
        throw new HandwritingOcrError(
          'HANDWRITING_PROCESSING_ERROR',
          'El recognizer manuscrito devolvió una respuesta inválida.',
        );
      }

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

        lines:
          recognition.lines,

        engine:
          recognition.engine,
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
