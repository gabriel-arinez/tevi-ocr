export type DocumentSource =
  | 'file'
  | 'camera';

export type DocumentKind =
  | 'pdf'
  | 'jpeg'
  | 'png';

export interface DocumentInput {
  source: DocumentSource;
  kind: DocumentKind;
  mimeType: string;
  originalName: string;
  buffer: Buffer;
}
