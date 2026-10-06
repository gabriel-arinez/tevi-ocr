import sharp from 'sharp';

export interface DeskewAnalysis {
  angle: number;
  score: number;
}

interface SearchRange {
  minAngle: number;
  maxAngle: number;
  step: number;
}

async function createAnalysisImage(
  input: Buffer,
): Promise<Buffer> {
  return sharp(input)
    .grayscale()
    .resize({
      width: 700,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

async function projectionScore(
  analysisImage: Buffer,
  angle: number,
): Promise<number> {
  const {
    data,
    info,
  } =
    await sharp(analysisImage)
      .rotate(
        angle,
        {
          background: '#ffffff',
        },
      )
      .raw()
      .toBuffer({
        resolveWithObject: true,
      });

  const rowInk =
    new Float64Array(
      info.height,
    );

  for (
    let y = 0;
    y < info.height;
    y += 1
  ) {
    let ink = 0;

    const rowOffset =
      y *
      info.width *
      info.channels;

    for (
      let x = 0;
      x < info.width;
      x += 1
    ) {
      const value =
        data[
          rowOffset +
          x * info.channels
        ] ?? 255;

      ink +=
        255 - value;
    }

    rowInk[y] = ink;
  }

  const mean =
    rowInk.reduce(
      (total, value) =>
        total + value,
      0,
    ) /
    rowInk.length;

  let variance = 0;

  for (
    const value
    of rowInk
  ) {
    const delta =
      value - mean;

    variance +=
      delta * delta;
  }

  return (
    variance /
    rowInk.length
  );
}

async function searchBestAngle(
  analysisImage: Buffer,
  range: SearchRange,
): Promise<DeskewAnalysis> {
  let bestAngle = 0;

  let bestScore =
    Number.NEGATIVE_INFINITY;

  for (
    let angle =
      range.minAngle;
    angle <=
      range.maxAngle +
      1e-9;
    angle +=
      range.step
  ) {
    const candidate =
      Number(
        angle.toFixed(3),
      );

    const score =
      await projectionScore(
        analysisImage,
        candidate,
      );

    if (
      score >
      bestScore
    ) {
      bestScore = score;
      bestAngle = candidate;
    }
  }

  return {
    angle:
      bestAngle,
    score:
      bestScore,
  };
}

export async function detectSkewAngle(
  input: Buffer,
  options: {
    minAngle?: number;
    maxAngle?: number;
    coarseStep?: number;
    fineStep?: number;
  } = {},
): Promise<DeskewAnalysis> {
  const minAngle =
    options.minAngle ?? -10;

  const maxAngle =
    options.maxAngle ?? 10;

  const coarseStep =
    options.coarseStep ?? 1;

  const fineStep =
    options.fineStep ?? 0.25;

  const analysisImage =
    await createAnalysisImage(
      input,
    );

  const coarse =
    await searchBestAngle(
      analysisImage,
      {
        minAngle,
        maxAngle,
        step:
          coarseStep,
      },
    );

  const fineMin =
    Math.max(
      minAngle,
      coarse.angle -
        coarseStep,
    );

  const fineMax =
    Math.min(
      maxAngle,
      coarse.angle +
        coarseStep,
    );

  return searchBestAngle(
    analysisImage,
    {
      minAngle:
        fineMin,

      maxAngle:
        fineMax,

      step:
        fineStep,
    },
  );
}

export async function deskewImage(
  input: Buffer,
): Promise<{
  buffer: Buffer;
  detectedAngle: number;
}> {
  const analysis =
    await detectSkewAngle(
      input,
    );

  if (
    Math.abs(
      analysis.angle,
    ) < 0.5
  ) {
    return {
      buffer: input,

      detectedAngle:
        analysis.angle,
    };
  }

  const buffer =
    await sharp(input)
      .rotate(
        analysis.angle,
        {
          background:
            '#ffffff',
        },
      )
      .png()
      .toBuffer();

  return {
    buffer,

    detectedAngle:
      analysis.angle,
  };
}
