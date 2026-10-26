export type PrintedImageKind = 'jpeg' | 'png' | 'pdf';

export function shouldVerifyPrintedDeskew(
  kind: PrintedImageKind,
  angle: number,
): boolean {
  return (
    kind !== 'pdf' &&
    Number.isFinite(angle) &&
    Math.abs(angle) >= 9.5
  );
}

export function preferOriginalPrintedRecognition(
  preprocessed: { text: string; confidence: number | null },
  original: { text: string; confidence: number | null },
): boolean {
  return (
    original.text.trim().length > 0 &&
    original.confidence !== null &&
    Number.isFinite(original.confidence) &&
    (
      preprocessed.confidence === null ||
      original.confidence >= preprocessed.confidence + 10
    )
  );
}
