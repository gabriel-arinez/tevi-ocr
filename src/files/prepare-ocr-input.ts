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

import type {
  DocumentInput,
} from '../core/document-input.js';

const execFileAsync =
  promisify(execFile);

export type DocumentPreparationErrorCode =
  | 'INVALID_IMAGE'
  | 'INVALID_PDF'
  | 'PDF_PAGE_LIMIT_EXCEEDED';

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
}

export interface PreparedOcrInput {
  pages: PreparedOcrPage[];
}

async function prepareImage(
  input: DocumentInput,
): Promise<PreparedOcrInput> {
  try {
    const image =
      await sharp(input.buffer)
        .rotate()
        .png()
        .toBuffer();

    return {
      pages: [
        {
          pageNumber: 1,
          buffer: image,
        },
      ],
    };
  } catch {
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
      Number(match[1]);

    if (
      !Number.isInteger(pages) ||
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
          String(pageCount),
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
        pages.push({
          pageNumber,
          buffer:
            await fs.readFile(
              renderedPath,
            ),
        });
      } catch {
        throw new DocumentPreparationError(
          'INVALID_PDF',
          `No fue posible obtener la página ${pageNumber} del PDF.`,
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
  switch (input.kind) {
    case 'jpeg':
    case 'png':
      return prepareImage(input);

    case 'pdf':
      return preparePdf(input);
  }
}
