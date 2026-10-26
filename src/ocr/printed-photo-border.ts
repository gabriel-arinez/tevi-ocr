import sharp from 'sharp';

export interface PrintedOcrCandidate {
  text: string;
  confidence: number | null;
}

export function preferBorderCropCandidate(
  baseline: PrintedOcrCandidate,
  candidate: PrintedOcrCandidate,
): boolean {
  const baseLength = baseline.text.trim().length;
  const candidateLength = candidate.text.trim().length;

  // Never choose a "better" confidence obtained by simply
  // throwing away the majority of the document.
  return (
    baseLength >= 100 &&
    candidateLength >= baseLength * 0.90 &&
    candidate.confidence !== null &&
    Number.isFinite(candidate.confidence) &&
    baseline.confidence !== null &&
    Number.isFinite(baseline.confidence) &&
    candidate.confidence >= baseline.confidence + 3
  );
}

/**
 * Conservative candidate only. Its selection depends on a
 * separate OCR quality comparison; no destructive cropping
 * is applied to the original input.
 */
export async function createUpperBorderCropCandidate(
  input: Buffer,
): Promise<Buffer | null> {
  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.autoOrient?.width ?? meta.width ?? 0;
  const height = meta.autoOrient?.height ?? meta.height ?? 0;

  if (width < 300 || height < 400) {
    return null;
  }

  const removeRows = Math.round(height * 0.12);
  if (removeRows < 1 || height - removeRows < 300) {
    return null;
  }

  return image
    .extract({
      left: 0,
      top: removeRows,
      width,
      height: height - removeRows,
    })
    .png()
    .toBuffer();
}
