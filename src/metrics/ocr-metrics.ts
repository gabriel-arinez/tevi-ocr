import {
  levenshtein,
} from './levenshtein.js';

import {
  normalizeBenchmarkText,
} from './normalize-text.js';

export interface OcrMetrics {
  characterDistance: number;
  wordDistance: number;

  referenceCharacters: number;
  referenceWords: number;

  cer: number;
  wer: number;
}

export function calculateOcrMetrics(
  expectedRaw: string,
  obtainedRaw: string,
): OcrMetrics {
  const expected =
    normalizeBenchmarkText(expectedRaw);

  const obtained =
    normalizeBenchmarkText(obtainedRaw);

  const expectedCharacters =
    Array.from(expected);

  const obtainedCharacters =
    Array.from(obtained);

  const expectedWords =
    expected
      ? expected.split(/\s+/u)
      : [];

  const obtainedWords =
    obtained
      ? obtained.split(/\s+/u)
      : [];

  const characterDistance =
    levenshtein(
      expectedCharacters,
      obtainedCharacters,
    );

  const wordDistance =
    levenshtein(
      expectedWords,
      obtainedWords,
    );

  return {
    characterDistance,
    wordDistance,

    referenceCharacters:
      expectedCharacters.length,

    referenceWords:
      expectedWords.length,

    cer:
      expectedCharacters.length === 0
        ? obtainedCharacters.length === 0
          ? 0
          : 1
        : characterDistance /
          expectedCharacters.length,

    wer:
      expectedWords.length === 0
        ? obtainedWords.length === 0
          ? 0
          : 1
        : wordDistance /
          expectedWords.length,
  };
}
