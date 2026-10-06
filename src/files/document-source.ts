import type {
  DocumentSource,
} from '../core/document-input.js';

export function resolveDocumentSource(
  value: unknown,
): DocumentSource {
  return value === 'camera'
    ? 'camera'
    : 'file';
}
