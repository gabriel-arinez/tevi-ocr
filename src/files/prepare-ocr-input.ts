import {
  execFile,
} from 'node:child_process';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  config,
} from '../core/config.js';

import type {
  DocumentInput,
} from '../core/document-input.js';

import sharp from 'sharp';

import {
  preprocessForOcr,
} from '../preprocessing/pipeline.js';

const execFileAsync =
  promisify(execFile);

export type DocumentPreparationErrorCode =
  | 'INVALID_IMAGE'
  | 'INVALID_PDF'
  | 'PDF_PAGE_LIMIT_EXCEEDED'
  | 'IMAGE_PIXEL_LIMIT_EXCEEDED';

export class DocumentPreparationError
  extends Error {
  constructor(
    readonly code:
      DocumentPreparationErrorCode,
    message: string,
  ) {
    super(message);

    this.name =
      'DocumentPreparationError';
  }
}

export interface PreparedOcrPage {
  pageNumber: number;
  buffer: Buffer;
  detectedAngle: number;
  preprocessingDurationMs: number;
}

export interface PreparedOcrInput {
  pages: PreparedOcrPage[];
}

async function preparePage(
  buffer: Buffer,
  pageNumber: number,
): Promise<PreparedOcrPage> {
  const metadata =
    await sharp(buffer)
      .metadata();

  const width =
    metadata.width ?? 0;

  const height =
    metadata.height ?? 0;

  const pixels =
    width * height;

  if (
    width <= 0 ||
    height <= 0
  ) {
    throw new DocumentPreparationError(
      'INVALID_IMAGE',
      'La imagen no tiene dimensiones válidas.',
    );
  }

  if (
    pixels >
    config.ocr.maxImagePixels
  ) {
    throw new DocumentPreparationError(
      'IMAGE_PIXEL_LIMIT_EXCEEDED',
      `La imagen contiene ${pixels} píxeles; el máximo permitido es ${config.ocr.maxImagePixels}.`,
    );
  }

  const preprocessed =
    await preprocessForOcr(
      buffer,
    );

  return {
    pageNumber,

    buffer:
      preprocessed.buffer,

    detectedAngle:
      preprocessed.detectedAngle,

    preprocessingDurationMs:
      preprocessed.durationMs,
  };
}

async function prepareImage(
  input: DocumentInput,
): Promise<PreparedOcrInput> {
  try {
    return {
      pages: [
        await preparePage(
          input.buffer,
          1,
        ),
      ],
    };
  } catch (error) {
    if (
      error instanceof
      DocumentPreparationError
    ) {
      throw error;
    }

    throw new DocumentPreparationError(
      'INVALID_IMAGE',
      'La imagen está dañada o no puede ser decodificada.',
    );
  }
}

async function getPdfPageCount(
  pdfPath: string,
): Promise<number> {
  try {
    const {
      stdout,
    } =
      await execFileAsync(
        'pdfinfo',
        [
          pdfPath,
        ],
        {
          timeout: 10_000,

          maxBuffer:
            1024 * 1024,
        },
      );

    const match =
      stdout.match(
        /^Pages:\s+(\d+)\s*$/m,
      );

    if (!match?.[1]) {
      throw new Error(
        'No se encontró Pages.',
      );
    }

    const pages =
      Number(
        match[1],
      );

    if (
      !Number.isInteger(
        pages,
      ) ||
      pages <= 0
    ) {
      throw new Error(
        'Cantidad de páginas inválida.',
      );
    }

    return pages;
  } catch {
    throw new DocumentPreparationError(
      'INVALID_PDF',
      'El PDF está dañado o no puede ser interpretado.',
    );
  }
}

async function preparePdf(
  input: DocumentInput,
): Promise<PreparedOcrInput> {
  const tempDirectory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        'tevi-ocr-',
      ),
    );

  const pdfPath =
    path.join(
      tempDirectory,
      'input.pdf',
    );

  const outputPrefix =
    path.join(
      tempDirectory,
      'page',
    );

  try {
    await fs.writeFile(
      pdfPath,
      input.buffer,
    );

    const pageCount =
      await getPdfPageCount(
        pdfPath,
      );

    if (
      pageCount >
      config.ocr.maxPdfPages
    ) {
      throw new DocumentPreparationError(
        'PDF_PAGE_LIMIT_EXCEEDED',
        `El PDF contiene ${pageCount} páginas; el máximo permitido es ${config.ocr.maxPdfPages}.`,
      );
    }

    try {
      await execFileAsync(
        'pdftocairo',
        [
          '-png',
          '-f',
          '1',
          '-l',
          String(
            pageCount,
          ),
          '-r',
          String(
            config.ocr.pdfDpi,
          ),
          pdfPath,
          outputPrefix,
        ],
        {
          timeout: 30_000,

          maxBuffer:
            1024 * 1024,
        },
      );
    } catch {
      throw new DocumentPreparationError(
        'INVALID_PDF',
        'El PDF no pudo ser rasterizado.',
      );
    }

    const pages:
      PreparedOcrPage[] = [];

    for (
      let pageNumber = 1;
      pageNumber <= pageCount;
      pageNumber += 1
    ) {
      const renderedPath =
        `${outputPrefix}-${pageNumber}.png`;

      try {
        const rendered =
          await fs.readFile(
            renderedPath,
          );

        pages.push(
          await preparePage(
            rendered,
            pageNumber,
          ),
        );
      } catch (
        error
      ) {
        if (
          error instanceof
          DocumentPreparationError
        ) {
          throw error;
        }

        throw new DocumentPreparationError(
          'INVALID_PDF',
          `No fue posible preparar la página ${pageNumber} del PDF.`,
        );
      }
    }

    return {
      pages,
    };
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

export async function prepareOcrInput(
  input: DocumentInput,
): Promise<PreparedOcrInput> {
  switch (
    input.kind
  ) {
    case 'jpeg':
    case 'png':
      return prepareImage(
        input,
      );

    case 'pdf':
      return preparePdf(
        input,
      );
  }
}
