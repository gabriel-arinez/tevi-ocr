import type {
  DocumentKind,
} from '../core/document-input.js';

export function resolveDocumentKind(
  mimeType: string,
): DocumentKind | null {
  switch (mimeType) {
    case 'application/pdf':
      return 'pdf';

    case 'image/jpeg':
      return 'jpeg';

    case 'image/png':
      return 'png';

    default:
      return null;
  }
}
