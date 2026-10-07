import fs from 'node:fs/promises';


interface MetricRow {
  id: string;
  category: string;
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  cer: number;
  wer: number;
}


interface MetricsArtifact {
  samples: number;
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  cer: number;
  wer: number;
  totalRecognitionSeconds: number;
  rows: MetricRow[];
}


interface CategoryAggregate {
  category: string;
  samples: number;
  characterDistance: number;
  wordDistance: number;
  referenceCharacters: number;
  referenceWords: number;
  cer: number;
  wer: number;
}


async function readJson<T>(
  filePath: string,
): Promise<T> {
  return JSON.parse(
    await fs.readFile(
      filePath,
      'utf8',
    ),
  ) as T;
}


function aggregateCategories(
  rows: readonly MetricRow[],
): CategoryAggregate[] {
  const buckets =
    new Map<
      string,
      Omit<
        CategoryAggregate,
        'cer' | 'wer'
      >
    >();

  for (const row of rows) {
    const current =
      buckets.get(
        row.category,
      ) ?? {
        category:
          row.category,
        samples:
          0,
        characterDistance:
          0,
        wordDistance:
          0,
        referenceCharacters:
          0,
        referenceWords:
          0,
      };

    current.samples += 1;

    current.characterDistance +=
      row.characterDistance;

    current.wordDistance +=
      row.wordDistance;

    current.referenceCharacters +=
      row.referenceCharacters;

    current.referenceWords +=
      row.referenceWords;

    buckets.set(
      row.category,
      current,
    );
  }

  return Array.from(
    buckets.values(),
  )
    .map(
      (item) => ({
        ...item,

        cer:
          item.referenceCharacters > 0
            ? item.characterDistance
              / item.referenceCharacters
            : 0,

        wer:
          item.referenceWords > 0
            ? item.wordDistance
              / item.referenceWords
            : 0,
      }),
    )
    .sort(
      (left, right) =>
        left.category.localeCompare(
          right.category,
        ),
    );
}


function percentage(
  value: number,
): string {
  return `${(
    value * 100
  ).toFixed(2)}%`;
}


async function main(): Promise<void> {
  const trocr =
    await readJson<MetricsArtifact>(
      'benchmark/results/'
        + 'handwriting-final/'
        + 'metrics.json',
    );

  const kraken =
    await readJson<MetricsArtifact>(
      'benchmark/results/'
        + 'handwriting-kraken/'
        + 'metrics.json',
    );

  const preprocessing =
    await readJson<any>(
      'benchmark/results/'
        + 'handwriting-kraken-preprocessing/'
        + 'matrix.json',
    );

  const fallback =
    await readJson<any>(
      'benchmark/results/'
        + 'handwriting-selective-fallback/'
        + 'summary.json',
    );

  const calibration =
    await readJson<any>(
      'benchmark/results/'
        + 'handwriting-confidence-calibration/'
        + 'calibration.json',
    );

  const policy =
    await readJson<any>(
      'benchmark/results/'
        + 'handwriting-confidence-policy/'
        + 'policy.json',
    );

  const structured =
    await readJson<any>(
      'benchmark/results/'
        + 'handwriting-structured-fields/'
        + 'evaluation.json',
    );

  const performance =
    await readJson<any>(
      'benchmark/results/'
        + 'handwriting-performance/'
        + 'performance.json',
    );

  const preprocessingWinner =
    preprocessing.rows.find(
      (row: any) =>
        row.strategy ===
        preprocessing.winner,
    );

  if (!preprocessingWinner) {
    throw new Error(
      'No se encontró el ganador de preprocessing.',
    );
  }

  const krakenCategories =
    aggregateCategories(
      kraken.rows,
    );

  const trocrCategories =
    aggregateCategories(
      trocr.rows,
    );

  const categoryComparison =
    krakenCategories.map(
      (krakenCategory) => {
        const trocrCategory =
          trocrCategories.find(
            (item) =>
              item.category ===
              krakenCategory.category,
          );

        if (!trocrCategory) {
          throw new Error(
            `Categoría F7 ausente: ${krakenCategory.category}`,
          );
        }

        return {
          category:
            krakenCategory.category,

          samples:
            krakenCategory.samples,

          trocr: {
            cer:
              trocrCategory.cer,
            wer:
              trocrCategory.wer,
          },

          kraken: {
            cer:
              krakenCategory.cer,
            wer:
              krakenCategory.wer,
          },

          delta: {
            cer:
              krakenCategory.cer
              - trocrCategory.cer,

            wer:
              krakenCategory.wer
              - trocrCategory.wer,
          },
        };
      },
    );

  const cerRelativeImprovement =
    (
      trocr.cer
      - kraken.cer
    )
    / trocr.cer;

  const werRelativeImprovement =
    (
      trocr.wer
      - kraken.wer
    )
    / trocr.wer;

  const frozenRecognitionSpeedup =
    trocr.totalRecognitionSeconds
    / kraken.totalRecognitionSeconds;

  const report = {
    phase:
      'F11.11',

    title:
      'Benchmark final manuscrito v2',

    methodology: {
      documents:
        kraken.samples,

      detector:
        'CRAFT horizontal+free',

      recognizer:
        'Kraken 7.1.1 / PP-OCRv6 small',

      preprocessingWinner:
        preprocessing.winner,

      automaticFallbackAdopted:
        fallback.decision
          .automaticOcrFallback
          === 'ADOPTED',

      rawKrakenPreserved:
        fallback.decision
          .rawKrakenPreserved,

      groundTruthPolicy:
        'Ground truth only for evaluation; never for OCR output decisions.',

      performanceScope:
        'Recognizer on frozen F7 CRAFT line crops; not HTTP end-to-end.',

      limitations: [
        '8 authentic documents',
        '2 writers',
        'Small corpus: suitable for internal comparative evaluation, not population-level validation',
      ],
    },

    comparison: {
      f7Trocr: {
        cer:
          trocr.cer,
        wer:
          trocr.wer,
        recognitionSeconds:
          trocr.totalRecognitionSeconds,
      },

      krakenFinal: {
        cer:
          kraken.cer,
        wer:
          kraken.wer,
        recognitionSecondsFrozenRun:
          kraken.totalRecognitionSeconds,
      },

      improvementVsF7: {
        cerAbsolute:
          kraken.cer
          - trocr.cer,

        cerRelative:
          cerRelativeImprovement,

        werAbsolute:
          kraken.wer
          - trocr.wer,

        werRelative:
          werRelativeImprovement,

        frozenRecognitionSpeedup,
      },

      preprocessing: {
        winner:
          preprocessing.winner,

        winnerCer:
          preprocessingWinner.cer,

        winnerWer:
          preprocessingWinner.wer,

        winnerTotalMeasuredSeconds:
          preprocessingWinner
            .totalMeasuredSeconds,

        changedPredictions:
          false,

        interpretation:
          'RGB original remained the best strategy; no preprocessing transformation was adopted.',
      },

      fallback: {
        adopted:
          false,

        state:
          fallback.decision
            .confidenceFallbackState,

        easyOcr: {
          decision:
            fallback.alternatives
              .easyocr
              .decision,

          cer:
            fallback.alternatives
              .easyocr
              .cer,

          wer:
            fallback.alternatives
              .easyocr
              .wer,

          oracleCer:
            fallback.alternatives
              .easyocr
              .oracleCer,

          oracleWer:
            fallback.alternatives
              .easyocr
              .oracleWer,
        },

        trocrWholeLineDecision:
          fallback.alternatives
            .trocrWholeLine
            .decision,

        trocrExactRegionDecision:
          fallback.alternatives
            .trocrExactRegion
            .decision,

        finalOutputMetricsSameAsKraken:
          true,
      },
    },

    characterQuality: {
      predictedCharacterAccuracy:
        calibration.totals
          .predictedCharacterAccuracy,

      scoredPredictedCharacters:
        calibration.totals
          .scoredPredictedCharacters,

      correctPredictedCharacters:
        calibration.totals
          .correctPredictedCharacters,

      erroneousPredictedCharacters:
        calibration.totals
          .erroneousPredictedCharacters,

      deletions:
        calibration.totals
          .deletions,

      brierScore:
        calibration.brierScore,
    },

    confidencePolicy: {
      automaticAcceptEnabled:
        policy.policy
          .acceptEnabled,

      automaticAcceptCoverage:
        policy.actions
          .accept
          .coverage,

      fallbackThreshold:
        policy.policy
          .fallbackThreshold,

      lowConfidenceCandidateShare:
        policy.actions
          .fallback
          .coverage,

      reviewBandShare:
        policy.actions
          .review
          .coverage,

      humanReviewRequiredShare:
        1,

      fallbackPrecision:
        policy.effectiveness
          .fallbackPrecision,

      lowConfidenceErrorRecall:
        policy.effectiveness
          .errorRecall,

      reviewBandErrorRate:
        policy.effectiveness
          .reviewErrorRate,

      highConfidenceAutoTrustSafe:
        false,
    },

    structuredFields: {
      expectedFields:
        structured.totals
          .expectedFields,

      extractedFields:
        structured.totals
          .extractedFields,

      coverage:
        structured.totals
          .coverage,

      exactResolved:
        structured.totals
          .exactResolved,

      exactAccuracy:
        structured.totals
          .exactAccuracy,

      accuracyAmongExtracted:
        structured.totals
          .accuracyAmongExtracted,

      ambiguousExtracted:
        structured.totals
          .ambiguousExtracted,

      invalidExtracted:
        structured.totals
          .invalidExtracted,

      wrongResolved:
        structured.totals
          .wrongResolved,

      falsePositive:
        structured.totals
          .falsePositive,

      documentsWithAllFieldsCorrect:
        structured.totals
          .documentsWithAllFieldsCorrect,

      rawTextMutation:
        structured.methodology
          .rawTextMutation,
    },

    performance: {
      configuration:
        performance.configuration,

      modelLoadSeconds:
        performance.measurements
          .modelLoadSeconds,

      warmMeanRecognitionSeconds:
        performance.measurements
          .warmMeanRecognitionSeconds,

      warmAverageLineMs:
        performance.measurements
          .warmAverageLineMs,

      maxObservedRssMiB:
        performance.measurements
          .maxObservedRssMiB,

      finalRssMiB:
        performance.measurements
          .finalRssMiB,

      mismatchCount:
        performance.validation
          .mismatchCount,

      predictionsMatchFrozenBaseline:
        performance.validation
          .predictionsMatchBaseline,
    },

    categories:
      categoryComparison,

    decisionInputsForF1112: {
      recognitionImprovedVsF7:
        kraken.cer < trocr.cer
        && kraken.wer < trocr.wer,

      runtimeSubstantiallyFasterVsF7:
        frozenRecognitionSpeedup >= 10,

      automaticAcceptSafe:
        false,

      humanReviewRequired:
        true,

      structuredFieldsProductionReliable:
        structured.totals
          .exactAccuracy >= 0.95
        && structured.totals
          .wrongResolved === 0,

      corpusLargeEnoughForPopulationClaim:
        false,
    },
  };

  const gate = {
    samplesMatch:
      trocr.samples === 8
      && kraken.samples === 8,

    krakenImprovesCer:
      kraken.cer < trocr.cer,

    preprocessingWinnerIsRgb:
      preprocessing.winner
      === 'rgb-original',

    automaticFallbackNotAdopted:
      fallback.decision
        .automaticOcrFallback
      === 'NOT_ADOPTED',

    automaticAcceptDisabled:
      policy.policy
        .acceptEnabled
      === false,

    rawKrakenPreserved:
      fallback.decision
        .rawKrakenPreserved
      === true,

    performancePredictionsStable:
      performance.validation
        .mismatchCount === 0
      && performance.validation
        .predictionsMatchBaseline
        === true,

    structuredRawTextPreserved:
      structured.methodology
        .rawTextMutation
      === false,
  };

  const gateOk =
    Object.values(
      gate,
    ).every(Boolean);

  const finalReport = {
    ...report,

    validation: {
      ...gate,
      f1111GateOk:
        gateOk,
    },
  };

  const outputDir =
    'benchmark/results/'
    + 'handwriting-v2-final';

  await fs.mkdir(
    outputDir,
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    `${outputDir}/report.json`,
    JSON.stringify(
      finalReport,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(
    '===== F11.11 FINAL HANDWRITING V2 =====',
  );

  console.log(
    `F7_CER=${percentage(trocr.cer)}`,
  );

  console.log(
    `KRAKEN_CER=${percentage(kraken.cer)}`,
  );

  console.log(
    `F7_WER=${percentage(trocr.wer)}`,
  );

  console.log(
    `KRAKEN_WER=${percentage(kraken.wer)}`,
  );

  console.log(
    `CER_RELATIVE_IMPROVEMENT=${percentage(cerRelativeImprovement)}`,
  );

  console.log(
    `WER_RELATIVE_IMPROVEMENT=${percentage(werRelativeImprovement)}`,
  );

  console.log(
    `CHARACTER_ACCURACY=${percentage(
      calibration.totals
        .predictedCharacterAccuracy,
    )}`,
  );

  console.log(
    `AUTO_ACCEPT_COVERAGE=${percentage(
      policy.actions.accept.coverage,
    )}`,
  );

  console.log(
    `LOW_CONFIDENCE_SHARE=${percentage(
      policy.actions.fallback.coverage,
    )}`,
  );

  console.log(
    'HUMAN_REVIEW_REQUIRED=100.00%',
  );

  console.log(
    `STRUCTURED_COVERAGE=${percentage(
      structured.totals.coverage,
    )}`,
  );

  console.log(
    `STRUCTURED_EXACT_ACCURACY=${percentage(
      structured.totals.exactAccuracy,
    )}`,
  );

  console.log(
    `STRUCTURED_WRONG_RESOLVED=${
      structured.totals.wrongResolved
    }`,
  );

  console.log(
    `WARM_RECOGNITION_SECONDS=${
      performance.measurements
        .warmMeanRecognitionSeconds
        .toFixed(3)
    }`,
  );

  console.log(
    `WARM_LINE_MS=${
      performance.measurements
        .warmAverageLineMs
        .toFixed(2)
    }`,
  );

  console.log(
    `MAX_RSS_MIB=${
      performance.measurements
        .maxObservedRssMiB
        .toFixed(2)
    }`,
  );

  console.log();
  console.log(
    '===== CATEGORY COMPARISON =====',
  );

  for (
    const row
    of categoryComparison
  ) {
    console.log(
      [
        row.category,
        `F7_CER=${percentage(row.trocr.cer)}`,
        `KRAKEN_CER=${percentage(row.kraken.cer)}`,
        `F7_WER=${percentage(row.trocr.wer)}`,
        `KRAKEN_WER=${percentage(row.kraken.wer)}`,
      ].join(' | '),
    );
  }

  console.log();
  console.log(
    `F11_11_FINAL_GATE=${
      gateOk ? 1 : 0
    }`,
  );

  if (!gateOk) {
    process.exitCode = 1;
  }
}


main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
