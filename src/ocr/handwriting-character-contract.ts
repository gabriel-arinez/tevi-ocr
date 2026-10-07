export interface HandwritingPoint {
  x: number;
  y: number;
}

export interface HandwritingCharacterBbox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type HandwritingCharacterCut = readonly [
  HandwritingPoint,
  HandwritingPoint,
  HandwritingPoint,
  HandwritingPoint,
];

export interface HandwritingCharacterResult {
  lineNumber: number;
  characterIndex: number;
  char: string;
  cut: HandwritingCharacterCut;
  bbox: HandwritingCharacterBbox;
  confidence: number;
}

export interface HandwritingCharacterLine {
  lineNumber: number;
  prediction: string;
  characters: HandwritingCharacterResult[];
}

export function bboxFromHandwritingCut(
  cut: HandwritingCharacterCut,
): HandwritingCharacterBbox {
  const xs =
    cut.map(
      (point) => point.x,
    );

  const ys =
    cut.map(
      (point) => point.y,
    );

  return {
    x1:
      Math.min(...xs),
    y1:
      Math.min(...ys),
    x2:
      Math.max(...xs),
    y2:
      Math.max(...ys),
  };
}

export function reconstructHandwritingText(
  characters:
    readonly HandwritingCharacterResult[],
): string {
  return characters
    .map(
      (item) => item.char,
    )
    .join('');
}

export function validateHandwritingCharacter(
  item: HandwritingCharacterResult,
): boolean {
  if (
    !Number.isInteger(
      item.lineNumber,
    ) ||
    item.lineNumber < 1 ||
    !Number.isInteger(
      item.characterIndex,
    ) ||
    item.characterIndex < 0
  ) {
    return false;
  }

  if (
    typeof item.char !==
      'string' ||
    Array.from(
      item.char,
    ).length !== 1
  ) {
    return false;
  }

  if (
    !Number.isFinite(
      item.confidence,
    ) ||
    item.confidence < 0 ||
    item.confidence > 1
  ) {
    return false;
  }

  if (
    !Array.isArray(
      item.cut,
    ) ||
    item.cut.length !== 4
  ) {
    return false;
  }

  for (
    const point
    of item.cut
  ) {
    if (
      !Number.isInteger(
        point.x,
      ) ||
      !Number.isInteger(
        point.y,
      )
    ) {
      return false;
    }
  }

  const expected =
    bboxFromHandwritingCut(
      item.cut,
    );

  return (
    item.bbox.x1 ===
      expected.x1 &&
    item.bbox.y1 ===
      expected.y1 &&
    item.bbox.x2 ===
      expected.x2 &&
    item.bbox.y2 ===
      expected.y2
  );
}

export function validateHandwritingLine(
  line: HandwritingCharacterLine,
): boolean {
  if (
    !Number.isInteger(
      line.lineNumber,
    ) ||
    line.lineNumber < 1
  ) {
    return false;
  }

  for (
    let index = 0;
    index <
      line.characters.length;
    index += 1
  ) {
    const item =
      line.characters[index];

    if (
      !item ||
      !validateHandwritingCharacter(
        item,
      ) ||
      item.lineNumber !==
        line.lineNumber ||
      item.characterIndex !==
        index
    ) {
      return false;
    }
  }

  return (
    reconstructHandwritingText(
      line.characters,
    ) === line.prediction
  );
}
