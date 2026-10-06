export interface BenchmarkMeasuredCase {
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  durationMs: number;
}

export interface AggregateMetrics {
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  cer: number;
  wer: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

export function aggregateBenchmark(
  cases: readonly BenchmarkMeasuredCase[],
): AggregateMetrics {
  const totals =
    cases.reduce(
      (accumulator, current) => ({
        characterDistance:
          accumulator.characterDistance +
          current.characterDistance,

        wordDistance:
          accumulator.wordDistance +
          current.wordDistance,

        referenceCharacters:
          accumulator.referenceCharacters +
          current.referenceCharacters,

        referenceWords:
          accumulator.referenceWords +
          current.referenceWords,

        totalDurationMs:
          accumulator.totalDurationMs +
          current.durationMs,
      }),
      {
        characterDistance: 0,
        wordDistance: 0,
        referenceCharacters: 0,
        referenceWords: 0,
        totalDurationMs: 0,
      },
    );

  return {
    ...totals,

    cer:
      totals.referenceCharacters === 0
        ? 0
        : totals.characterDistance /
          totals.referenceCharacters,

    wer:
      totals.referenceWords === 0
        ? 0
        : totals.wordDistance /
          totals.referenceWords,

    averageDurationMs:
      cases.length === 0
        ? 0
        : totals.totalDurationMs /
          cases.length,
  };
}
