export type OcrMode =
  | 'printed'
  | 'handwritten';


export class InvalidOcrModeError
  extends Error {
  constructor(
    readonly input: unknown,
  ) {
    super(
      'El modo OCR debe ser "printed" o "handwritten".',
    );

    this.name =
      'InvalidOcrModeError';
  }
}


export function resolveOcrMode(
  raw: unknown,
): OcrMode {
  if (
    raw === undefined ||
    raw === null ||
    raw === ''
  ) {
    return 'printed';
  }

  if (
    raw === 'printed' ||
    raw === 'handwritten'
  ) {
    return raw;
  }

  throw new InvalidOcrModeError(
    raw,
  );
}
