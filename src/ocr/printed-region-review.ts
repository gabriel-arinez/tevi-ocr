import sharp from 'sharp';
import type { PrintedSpatialWord } from './printed-spatial-evidence.js';

export interface PrintedRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function chooseReviewRegion(word: PrintedSpatialWord, imageWidth: number, imageHeight: number): PrintedRegion | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null;
  const box = word.bbox;
  if (![box.left, box.top, box.width, box.height].every(Number.isFinite)) return null;
  if (box.width <= 0 || box.height <= 0) return null;
  const padX = Math.max(16, Math.round(box.height * 2));
  const padY = Math.max(12, Math.round(box.height * 1.5));
  const left = Math.max(0, Math.floor(box.left - padX));
  const top = Math.max(0, Math.floor(box.top - padY));
  const right = Math.min(imageWidth, Math.ceil(box.left + box.width + padX));
  const bottom = Math.min(imageHeight, Math.ceil(box.top + box.height + padY));
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** Explicit second-pass evidence; never replaces or overrides the original OCR reading. */
export async function prepareRegionForSecondReading(image: Buffer, word: PrintedSpatialWord): Promise<{
  region: PrintedRegion;
  original: Buffer;
  contrast: Buffer;
} | null> {
  const oriented = await sharp(image).rotate().png().toBuffer();
  const meta = await sharp(oriented).metadata();
  const region = chooseReviewRegion(word, meta.width ?? 0, meta.height ?? 0);
  if (!region) return null;
  const original = await sharp(oriented).extract(region).png().toBuffer();
  const contrast = await sharp(original).normalize().png().toBuffer();
  return { region, original, contrast };
}
