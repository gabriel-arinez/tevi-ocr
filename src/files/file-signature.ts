import type {
  DocumentKind,
} from '../core/document-input.js';

export interface DetectedFileType {
  kind: DocumentKind;
  mimeType: string;
}

function startsWith(
  buffer: Buffer,
  signature: readonly number[],
): boolean {
  if (buffer.length < signature.length) {
    return false;
  }

  return signature.every(
    (value, index) =>
      buffer[index] === value,
  );
}

export function detectFileType(
  buffer: Buffer,
): DetectedFileType | null {
  if (
    startsWith(
      buffer,
      [
        0x25,
        0x50,
        0x44,
        0x46,
        0x2d,
      ],
    )
  ) {
    return {
      kind: 'pdf',
      mimeType: 'application/pdf',
    };
  }

  if (
    startsWith(
      buffer,
      [
        0xff,
        0xd8,
        0xff,
      ],
    )
  ) {
    return {
      kind: 'jpeg',
      mimeType: 'image/jpeg',
    };
  }

  if (
    startsWith(
      buffer,
      [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ],
    )
  ) {
    return {
      kind: 'png',
      mimeType: 'image/png',
    };
  }

  return null;
}
