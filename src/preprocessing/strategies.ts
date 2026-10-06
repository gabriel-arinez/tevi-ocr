import sharp from 'sharp';

export type PreprocessingStrategy =
  | 'none'
  | 'grayscale'
  | 'normalize'
  | 'threshold-180'
  | 'threshold-200'
  | 'median'
  | 'sharpen'
  | 'grayscale+normalize'
  | 'median+normalize'
  | 'grayscale+normalize+sharpen';

export const preprocessingStrategies:
  readonly PreprocessingStrategy[] = [
    'none',
    'grayscale',
    'normalize',
    'threshold-180',
    'threshold-200',
    'median',
    'sharpen',
    'grayscale+normalize',
    'median+normalize',
    'grayscale+normalize+sharpen',
  ];

export async function preprocessImage(
  input: Buffer,
  strategy: PreprocessingStrategy,
): Promise<Buffer> {
  switch (strategy) {
    case 'none':
      return input;

    case 'grayscale':
      return sharp(input)
        .grayscale()
        .png()
        .toBuffer();

    case 'normalize':
      return sharp(input)
        .normalize()
        .png()
        .toBuffer();

    case 'threshold-180':
      return sharp(input)
        .grayscale()
        .threshold(180)
        .png()
        .toBuffer();

    case 'threshold-200':
      return sharp(input)
        .grayscale()
        .threshold(200)
        .png()
        .toBuffer();

    case 'median':
      return sharp(input)
        .median(3)
        .png()
        .toBuffer();

    case 'sharpen':
      return sharp(input)
        .sharpen()
        .png()
        .toBuffer();

    case 'grayscale+normalize':
      return sharp(input)
        .grayscale()
        .normalize()
        .png()
        .toBuffer();

    case 'median+normalize':
      return sharp(input)
        .median(3)
        .normalize()
        .png()
        .toBuffer();

    case 'grayscale+normalize+sharpen':
      return sharp(input)
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
  }
}
