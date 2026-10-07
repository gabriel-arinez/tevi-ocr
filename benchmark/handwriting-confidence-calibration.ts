import fs from 'node:fs/promises';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';

import {
  normalizeBenchmarkText,
} from '../src/metrics/normalize-text.js';


interface RawCharacter {
  lineNumber: number;
  characterIndex: number;
  char: string;
  confidence: number;
}

interface CharacterLine {
  lineNumber: number;
  prediction: string;
  characters: RawCharacter[];
}

interface CharacterDocument {
  id: string;
  category: string;
  lines: CharacterLine[];
  rawText: string;
}

interface ManifestRow {
  id: string;
  category: string;
  groundTruthPath: string;
}

interface SourceReference {
  lineNumber: number;
  characterIndices: number[];
  rawChars: string[];
  rawConfidences: number[];
}

interface EvaluationToken {
  value: string;
  confidence: number | null;
  sources: SourceReference[];
  syntheticWhitespace: boolean;
}

type AlignmentKind =
  | 'match'
  | 'substitution'
  | 'insertion'
  | 'deletion';

interface AlignmentRow {
  kind: AlignmentKind;
  groundTruth: string | null;
  prediction: string | null;
  confidence: number | null;
  syntheticWhitespace: boolean;
  sources: SourceReference[];
}


const graphemeSegmenter =
  new Intl.Segmenter(
    'es',
    {
      granularity:
        'grapheme',
    },
  );


function minimum(
  values: readonly number[],
): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.min(...values);
}


function lineToTokens(
  line: CharacterLine,
): EvaluationToken[] {
  const rawCodepoints =
    Array.from(
      line.prediction,
    );

  if (
    rawCodepoints.length !==
      line.characters.length
  ) {
    throw new Error(
      `Desalineamiento raw en línea ${line.lineNumber}`,
    );
  }

  const offsets = [];

  let utf16Offset = 0;

  for (
    let index = 0;
    index < rawCodepoints.length;
    index += 1
  ) {
    const value =
      rawCodepoints[index] ?? '';

    offsets.push({
      index,
      start:
        utf16Offset,
      end:
        utf16Offset +
        value.length,
    });

    utf16Offset +=
      value.length;
  }

  const tokens:
    EvaluationToken[] = [];

  for (
    const segment
    of graphemeSegmenter.segment(
      line.prediction,
    )
  ) {
    const segmentStart =
      segment.index;

    const segmentEnd =
      segmentStart +
      segment.segment.length;

    const included =
      offsets.filter(
        (item) =>
          item.start >=
            segmentStart &&
          item.start <
            segmentEnd,
      );

    if (
      included.length === 0
    ) {
      throw new Error(
        'Grafema sin code points origen.',
      );
    }

    const sourceCharacters =
      included.map(
        (item) => {
          const source =
            line.characters[
              item.index
            ];

          if (!source) {
            throw new Error(
              'Carácter fuente ausente.',
            );
          }

          return source;
        },
      );

    const normalized =
      segment.segment.normalize(
        'NFC',
      );

    const normalizedCodepoints =
      Array.from(
        normalized,
      );

    const source: SourceReference = {
      lineNumber:
        line.lineNumber,

      characterIndices:
        sourceCharacters.map(
          (item) =>
            item.characterIndex,
        ),

      rawChars:
        sourceCharacters.map(
          (item) =>
            item.char,
        ),

      rawConfidences:
        sourceCharacters.map(
          (item) =>
            item.confidence,
        ),
    };

    const confidence =
      minimum(
        source.rawConfidences,
      );

    for (
      const value
      of normalizedCodepoints
    ) {
      tokens.push({
        value,
        confidence,
        sources: [
          source,
        ],
        syntheticWhitespace:
          false,
      });
    }
  }

  return tokens;
}


function normalizePredictionTokens(
  document: CharacterDocument,
): EvaluationToken[] {
  const rawTokens:
    EvaluationToken[] = [];

  document.lines.forEach(
    (
      line,
      lineIndex,
    ) => {
      rawTokens.push(
        ...lineToTokens(
          line,
        ),
      );

      if (
        lineIndex <
        document.lines.length - 1
      ) {
        rawTokens.push({
          value:
            '\n',
          confidence:
            null,
          sources:
            [],
          syntheticWhitespace:
            true,
        });
      }
    },
  );

  const collapsed:
    EvaluationToken[] = [];

  for (
    const token
    of rawTokens
  ) {
    if (
      /^\s$/u.test(
        token.value,
      )
    ) {
      const previous =
        collapsed.at(-1);

      if (
        previous &&
        previous.value === ' '
      ) {
        previous.sources.push(
          ...token.sources,
        );

        const confidences =
          previous.sources.flatMap(
            (source) =>
              source.rawConfidences,
          );

        previous.confidence =
          minimum(
            confidences,
          );

        previous.syntheticWhitespace =
          previous.sources.length === 0;

        continue;
      }

      collapsed.push({
        value:
          ' ',
        confidence:
          token.confidence,
        sources:
          [
            ...token.sources,
          ],
        syntheticWhitespace:
          token.sources.length === 0,
      });

      continue;
    }

    collapsed.push({
      ...token,
      sources: [
        ...token.sources,
      ],
    });
  }

  while (
    collapsed[0]?.value === ' '
  ) {
    collapsed.shift();
  }

  while (
    collapsed.at(-1)?.value === ' '
  ) {
    collapsed.pop();
  }

  return collapsed;
}


function align(
  reference: readonly string[],
  hypothesis:
    readonly EvaluationToken[],
): {
  distance: number;
  rows: AlignmentRow[];
} {
  const height =
    reference.length + 1;

  const width =
    hypothesis.length + 1;

  const matrix =
    Array.from(
      {
        length:
          height,
      },
      () =>
        new Array<number>(
          width,
        ).fill(0),
    );

  for (
    let i = 0;
    i < height;
    i += 1
  ) {
    matrix[i]![0] = i;
  }

  for (
    let j = 0;
    j < width;
    j += 1
  ) {
    matrix[0]![j] = j;
  }

  for (
    let i = 1;
    i < height;
    i += 1
  ) {
    for (
      let j = 1;
      j < width;
      j += 1
    ) {
      const ref =
        reference[i - 1];

      const hyp =
        hypothesis[j - 1]
          ?.value;

      const substitution =
        ref === hyp
          ? 0
          : 1;

      matrix[i]![j] =
        Math.min(
          matrix[i - 1]![j]! +
            1,

          matrix[i]![j - 1]! +
            1,

          matrix[i - 1]![j - 1]! +
            substitution,
        );
    }
  }

  const rows:
    AlignmentRow[] = [];

  let i =
    reference.length;

  let j =
    hypothesis.length;

  while (
    i > 0 ||
    j > 0
  ) {
    const current =
      matrix[i]![j]!;

    const ref =
      i > 0
        ? reference[i - 1]!
        : null;

    const hyp =
      j > 0
        ? hypothesis[j - 1]!
        : null;

    if (
      i > 0 &&
      j > 0 &&
      ref === hyp!.value &&
      matrix[i - 1]![j - 1] ===
        current
    ) {
      rows.push({
        kind:
          'match',
        groundTruth:
          ref,
        prediction:
          hyp!.value,
        confidence:
          hyp!.confidence,
        syntheticWhitespace:
          hyp!.syntheticWhitespace,
        sources:
          hyp!.sources,
      });

      i -= 1;
      j -= 1;

      continue;
    }

    /*
     * Tie-break determinista:
     * sustitución > inserción > deleción.
     *
     * No altera la distancia Levenshtein,
     * pero hace reproducible la etiqueta
     * de cada predicción.
     */
    if (
      i > 0 &&
      j > 0 &&
      matrix[i - 1]![j - 1]! +
        1 ===
        current
    ) {
      rows.push({
        kind:
          'substitution',
        groundTruth:
          ref,
        prediction:
          hyp!.value,
        confidence:
          hyp!.confidence,
        syntheticWhitespace:
          hyp!.syntheticWhitespace,
        sources:
          hyp!.sources,
      });

      i -= 1;
      j -= 1;

      continue;
    }

    if (
      j > 0 &&
      matrix[i]![j - 1]! +
        1 ===
        current
    ) {
      rows.push({
        kind:
          'insertion',
        groundTruth:
          null,
        prediction:
          hyp!.value,
        confidence:
          hyp!.confidence,
        syntheticWhitespace:
          hyp!.syntheticWhitespace,
        sources:
          hyp!.sources,
      });

      j -= 1;

      continue;
    }

    if (
      i > 0 &&
      matrix[i - 1]![j]! +
        1 ===
        current
    ) {
      rows.push({
        kind:
          'deletion',
        groundTruth:
          ref,
        prediction:
          null,
        confidence:
          null,
        syntheticWhitespace:
          false,
        sources:
          [],
      });

      i -= 1;

      continue;
    }

    throw new Error(
      'Backtrace Levenshtein inválido.',
    );
  }

  rows.reverse();

  return {
    distance:
      matrix[
        reference.length
      ]![
        hypothesis.length
      ]!,

    rows,
  };
}


function quantile(
  values: readonly number[],
  probability: number,
): number | null {
  if (
    values.length === 0
  ) {
    return null;
  }

  const sorted =
    [...values]
      .sort(
        (a, b) =>
          a - b,
      );

  const index =
    (
      sorted.length - 1
    ) * probability;

  const lower =
    Math.floor(
      index,
    );

  const upper =
    Math.ceil(
      index,
    );

  const lowerValue =
    sorted[lower] ?? 0;

  const upperValue =
    sorted[upper] ??
    lowerValue;

  if (
    lower === upper
  ) {
    return lowerValue;
  }

  const weight =
    index - lower;

  return (
    lowerValue *
      (1 - weight) +
    upperValue *
      weight
  );
}


function distribution(
  values: readonly number[],
) {
  const mean =
    values.length === 0
      ? null
      : values.reduce(
          (
            sum,
            value,
          ) =>
            sum + value,
          0,
        ) /
        values.length;

  return {
    count:
      values.length,
    mean,
    min:
      values.length === 0
        ? null
        : Math.min(
            ...values,
          ),
    p10:
      quantile(
        values,
        0.10,
      ),
    p25:
      quantile(
        values,
        0.25,
      ),
    median:
      quantile(
        values,
        0.50,
      ),
    p75:
      quantile(
        values,
        0.75,
      ),
    p90:
      quantile(
        values,
        0.90,
      ),
    max:
      values.length === 0
        ? null
        : Math.max(
            ...values,
          ),
  };
}


function thresholdDiagnostic(
  rows: readonly AlignmentRow[],
  threshold: number,
) {
  const scored =
    rows.filter(
      (row) =>
        row.confidence !== null &&
        !row.syntheticWhitespace &&
        row.prediction !== null,
    );

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;

  for (
    const row
    of scored
  ) {
    const actualError =
      row.kind !== 'match';

    const flaggedError =
      (
        row.confidence ??
        0
      ) < threshold;

    if (
      actualError &&
      flaggedError
    ) {
      truePositive += 1;
    } else if (
      !actualError &&
      flaggedError
    ) {
      falsePositive += 1;
    } else if (
      actualError &&
      !flaggedError
    ) {
      falseNegative += 1;
    } else {
      trueNegative += 1;
    }
  }

  const precision =
    truePositive +
      falsePositive ===
    0
      ? null
      : truePositive /
        (
          truePositive +
          falsePositive
        );

  const recall =
    truePositive +
      falseNegative ===
    0
      ? null
      : truePositive /
        (
          truePositive +
          falseNegative
        );

  const trusted =
    trueNegative +
    falseNegative;

  return {
    threshold,
    precision,
    recall,
    coverage:
      scored.length === 0
        ? 0
        : trusted /
          scored.length,
    falseTrustedRate:
      trusted === 0
        ? 0
        : falseNegative /
          trusted,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
  };
}


async function main():
  Promise<void> {
  const manifest =
    JSON.parse(
      await fs.readFile(
        'benchmark/'
        + 'handwriting-manifest.json',
        'utf8',
      ),
    ) as ManifestRow[];

  const characters =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
        + 'handwriting-kraken-characters/'
        + 'characters.json',
        'utf8',
      ),
    ) as {
      documents:
        CharacterDocument[];
    };

  const documentById =
    new Map(
      characters.documents.map(
        (document) => [
          document.id,
          document,
        ],
      ),
    );

  const allRows:
    AlignmentRow[] = [];

  const documents = [];

  let officialDistance = 0;
  let alignmentDistance = 0;

  for (
    const manifestRow
    of manifest
  ) {
    const document =
      documentById.get(
        manifestRow.id,
      );

    if (!document) {
      throw new Error(
        `Documento ausente: ${manifestRow.id}`,
      );
    }

    const expectedRaw =
      await fs.readFile(
        manifestRow.groundTruthPath,
        'utf8',
      );

    const official =
      calculateOcrMetrics(
        expectedRaw,
        document.rawText,
      );

    const expected =
      Array.from(
        normalizeBenchmarkText(
          expectedRaw,
        ),
      );

    const hypothesis =
      normalizePredictionTokens(
        document,
      );

    const normalizedPrediction =
      hypothesis
        .map(
          (token) =>
            token.value,
        )
        .join('');

    const officialPrediction =
      normalizeBenchmarkText(
        document.rawText,
      );

    if (
      normalizedPrediction !==
      officialPrediction
    ) {
      throw new Error(
        `Normalización no reproduce benchmark: ${document.id}`,
      );
    }

    const alignment =
      align(
        expected,
        hypothesis,
      );

    if (
      alignment.distance !==
      official.characterDistance
    ) {
      throw new Error(
        `Distancia distinta al benchmark: ${document.id}`,
      );
    }

    officialDistance +=
      official.characterDistance;

    alignmentDistance +=
      alignment.distance;

    const scored =
      alignment.rows.filter(
        (row) =>
          row.confidence !== null &&
          !row.syntheticWhitespace &&
          row.prediction !== null,
      );

    const correct =
      scored.filter(
        (row) =>
          row.kind === 'match',
      );

    const errors =
      scored.filter(
        (row) =>
          row.kind !== 'match',
      );

    const deletions =
      alignment.rows.filter(
        (row) =>
          row.kind === 'deletion',
      );

    const synthetic =
      alignment.rows.filter(
        (row) =>
          row.syntheticWhitespace,
      );

    documents.push({
      id:
        document.id,
      category:
        document.category,
      officialCharacterDistance:
        official.characterDistance,
      alignmentDistance:
        alignment.distance,
      referenceCharacters:
        official.referenceCharacters,
      predictedScoredCharacters:
        scored.length,
      correctPredictedCharacters:
        correct.length,
      erroneousPredictedCharacters:
        errors.length,
      deletions:
        deletions.length,
      syntheticWhitespaceEvents:
        synthetic.length,
      predictedCharacterAccuracy:
        scored.length === 0
          ? 0
          : correct.length /
            scored.length,
      rows:
        alignment.rows,
    });

    allRows.push(
      ...alignment.rows,
    );
  }

  const scored =
    allRows.filter(
      (row) =>
        row.confidence !== null &&
        !row.syntheticWhitespace &&
        row.prediction !== null,
    );

  const correct =
    scored.filter(
      (row) =>
        row.kind === 'match',
    );

  const errors =
    scored.filter(
      (row) =>
        row.kind !== 'match',
    );

  const deletions =
    allRows.filter(
      (row) =>
        row.kind === 'deletion',
    );

  const correctConfidences =
    correct.map(
      (row) =>
        row.confidence!,
    );

  const errorConfidences =
    errors.map(
      (row) =>
        row.confidence!,
    );

  const bins =
    [
      [0.00, 0.50],
      [0.50, 0.70],
      [0.70, 0.80],
      [0.80, 0.90],
      [0.90, 0.95],
      [0.95, 0.98],
      [0.98, 0.99],
      [0.99, 1.0000001],
    ].map(
      ([min, max]) => {
        const bucket =
          scored.filter(
            (row) =>
              row.confidence! >=
                min! &&
              row.confidence! <
                max!,
          );

        const bucketErrors =
          bucket.filter(
            (row) =>
              row.kind !==
              'match',
          );

        return {
          min,
          max:
            Math.min(
              max!,
              1,
            ),
          count:
            bucket.length,
          errors:
            bucketErrors.length,
          errorRate:
            bucket.length === 0
              ? null
              : bucketErrors.length /
                bucket.length,
        };
      },
    );

  const thresholds =
    [
      0.50,
      0.60,
      0.70,
      0.80,
      0.85,
      0.90,
      0.95,
      0.98,
      0.99,
    ].map(
      (threshold) =>
        thresholdDiagnostic(
          scored,
          threshold,
        ),
    );

  const brier =
    scored.length === 0
      ? null
      : scored.reduce(
          (
            sum,
            row,
          ) => {
            const target =
              row.kind === 'match'
                ? 1
                : 0;

            return (
              sum +
              (
                row.confidence! -
                target
              ) ** 2
            );
          },
          0,
        ) /
        scored.length;

  const output = {
    methodology: {
      evaluationNormalization:
        'NFC + whitespace collapse, identical to normalizeBenchmarkText',
      rawOcrModified:
        false,
      evaluationUnit:
        'NFC code point derived from raw grapheme cluster',
      multiCodepointConfidenceAggregation:
        'minimum',
      alignment:
        'Levenshtein backtrace',
      tieBreak:
        'exact-match > substitution > insertion > deletion',
      syntheticLineWhitespaceIncludedInAlignment:
        true,
      syntheticLineWhitespaceIncludedInCalibration:
        false,
      thresholdsArePolicy:
        false,
    },

    validation: {
      officialDistance,
      alignmentDistance,
      distanceMatchesOfficial:
        officialDistance ===
        alignmentDistance,
    },

    totals: {
      documents:
        documents.length,
      scoredPredictedCharacters:
        scored.length,
      correctPredictedCharacters:
        correct.length,
      erroneousPredictedCharacters:
        errors.length,
      deletions:
        deletions.length,
      predictedCharacterAccuracy:
        scored.length === 0
          ? 0
          : correct.length /
            scored.length,
    },

    confidence: {
      correct:
        distribution(
          correctConfidences,
        ),
      errors:
        distribution(
          errorConfidences,
        ),
    },

    bins,
    thresholdDiagnostics:
      thresholds,

    brierScore:
      brier,

    documents,
  };

  await fs.mkdir(
    'benchmark/results/'
    + 'handwriting-confidence-calibration',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/'
    + 'handwriting-confidence-calibration/'
    + 'calibration.json',
    JSON.stringify(
      output,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(
    'OFFICIAL_DISTANCE=',
    officialDistance,
  );

  console.log(
    'ALIGNMENT_DISTANCE=',
    alignmentDistance,
  );

  console.log(
    'DISTANCE_MATCH=',
    Number(
      officialDistance ===
      alignmentDistance,
    ),
  );

  console.log(
    'SCORED_CHARACTERS=',
    scored.length,
  );

  console.log(
    'CORRECT_CHARACTERS=',
    correct.length,
  );

  console.log(
    'ERROR_CHARACTERS=',
    errors.length,
  );

  console.log(
    'DELETIONS=',
    deletions.length,
  );

  console.log(
    'CHAR_ACCURACY=',
    scored.length === 0
      ? '0.00%'
      : (
          correct.length /
          scored.length *
          100
        ).toFixed(2) + '%',
  );

  console.log(
    'CORRECT_CONF_MEAN=',
    output.confidence.correct.mean,
  );

  console.log(
    'ERROR_CONF_MEAN=',
    output.confidence.errors.mean,
  );

  console.log(
    'CORRECT_CONF_MEDIAN=',
    output.confidence.correct.median,
  );

  console.log(
    'ERROR_CONF_MEDIAN=',
    output.confidence.errors.median,
  );

  console.log(
    'BRIER_SCORE=',
    brier,
  );

  console.log();
  console.log(
    '===== RANGOS =====',
  );

  for (
    const bin
    of bins
  ) {
    console.log(
      [
        `[${bin.min!.toFixed(2)}, ${bin.max.toFixed(2)}]`,
        `n=${bin.count}`,
        `errors=${bin.errors}`,
        `errorRate=${
          bin.errorRate === null
            ? 'N/A'
            : (
                bin.errorRate *
                100
              ).toFixed(2) + '%'
        }`,
      ].join(' | '),
    );
  }

  console.log();
  console.log(
    '===== THRESHOLD DIAGNOSTICS =====',
  );

  for (
    const row
    of thresholds
  ) {
    console.log(
      [
        `t=${row.threshold.toFixed(2)}`,
        `precision=${
          row.precision === null
            ? 'N/A'
            : (
                row.precision *
                100
              ).toFixed(2) + '%'
        }`,
        `recall=${
          row.recall === null
            ? 'N/A'
            : (
                row.recall *
                100
              ).toFixed(2) + '%'
        }`,
        `coverage=${(
          row.coverage *
          100
        ).toFixed(2)}%`,
        `falseTrusted=${(
          row.falseTrustedRate *
          100
        ).toFixed(2)}%`,
      ].join(' | '),
    );
  }

  console.log();
  console.log(
    'F11_4_CALIBRATION_OK=',
    Number(
      officialDistance ===
      alignmentDistance,
    ),
  );
}


main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
