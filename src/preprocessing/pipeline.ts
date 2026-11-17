import sharp from 'sharp';

import {
  preprocessImage,
} from './strategies.js';

import {
  deskewImage,
} from './deskew.js';

export interface OcrPreprocessingResult {
  buffer: Buffer;
  detectedAngle: number;
  durationMs: number;
}

export async function preprocessForOcr(
  input: Buffer,
): Promise<OcrPreprocessingResult> {
  const startedAt =
    process.hrtime.bigint();

  /*
   * Normalización inicial:
   * - aplica orientación EXIF cuando exista;
   * - convierte a PNG estable antes de los filtros.
   */
  const oriented =
    await sharp(input)
      .rotate()
      .png()
      .toBuffer();

  /*
   * Normalización adaptativa:
   * 'normalize' maximiza el rango dinámico sin erosionar tipografías finas ni encabezados.
   * El filtro de mediana degrada fotografías reales de contratos y no debe ser obligatorio.
   */
  const filtered =
    await preprocessImage(
      oriented,
      'normalize',
    );

  /*
   * Deskew adaptativo.
   * Si el ángulo estimado es irrelevante,
   * deskewImage conserva el buffer recibido.
   */
  const deskewed =
    await deskewImage(
      filtered,
    );

  const finishedAt =
    process.hrtime.bigint();

  return {
    buffer:
      deskewed.buffer,

    detectedAngle:
      deskewed.detectedAngle,

    durationMs:
      Number(
        finishedAt -
        startedAt,
      ) /
      1_000_000,
  };
}
