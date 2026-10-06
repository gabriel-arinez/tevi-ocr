import {
  config,
} from '../core/config.js';

import type {
  DocumentInput,
  DocumentSource,
} from '../core/document-input.js';

import {
  detectFileType,
} from './file-signature.js';

export class InvalidDocumentError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocumentError';
  }
}

export function createDocumentInput(
  file: Express.Multer.File,
  source: DocumentSource = 'file',
): DocumentInput {
  if (
    file.size <= 0 ||
    file.buffer.length <= 0
  ) {
    throw new InvalidDocumentError(
      'El archivo está vacío.',
    );
  }

  if (
    file.size > config.upload.maxBytes
  ) {
    throw new InvalidDocumentError(
      'El archivo excede el tamaño máximo permitido.',
    );
  }

  const detected =
    detectFileType(file.buffer);

  if (!detected) {
    throw new InvalidDocumentError(
      'El contenido del archivo no corresponde a PDF, JPEG o PNG.',
    );
  }

  if (
    !config.upload.allowedMimeTypes.has(
      file.mimetype,
    )
  ) {
    throw new InvalidDocumentError(
      'El tipo MIME declarado no está permitido.',
    );
  }

  if (
    detected.mimeType !== file.mimetype
  ) {
    throw new InvalidDocumentError(
      'El tipo MIME declarado no coincide con el contenido real del archivo.',
    );
  }

  if (
    source === 'camera' &&
    detected.kind === 'pdf'
  ) {
    throw new InvalidDocumentError(
      'Una captura de cámara debe ser una imagen JPEG o PNG.',
    );
  }

  return {
    source,
    kind: detected.kind,
    mimeType: detected.mimeType,
    originalName: file.originalname,
    buffer: file.buffer,
  };
}
