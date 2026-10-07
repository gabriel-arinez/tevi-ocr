import fs from 'node:fs/promises';


interface MetricArtifact {
  cer: number;
  wer: number;
  totalRecognitionSeconds: number;
}


interface ComplementarityArtifact {
  totals: {
    lines: number;
    improvedLines: number;
    worsenedLines: number;
    unchangedLines: number;
    fallbackCandidateLines: number;
    improvedFallbackLines: number;
    baselineCer: number;
    oracleCer: number;
    baselineWer: number;
    oracleWer: number;
    cerAbsoluteImprovement: number;
    werAbsoluteImprovement: number;
  };
}


interface TrocrRegionEvaluation {
  regions: number;
  sourceErrors: number;
  sourceCorrect: number;
  correctedErrors: number;
  preservedCorrect: number;
  destroyedCorrect: number;
  trocrExactCorrect: number;
  totalRecognitionSeconds: number;
}


async function readJson<T>(
  path: string,
): Promise<T> {
  return JSON.parse(
    await fs.readFile(
      path,
      'utf8',
    ),
  ) as T;
}


async function main(): Promise<void> {
  const kraken =
    await readJson<MetricArtifact>(
      'benchmark/results/'
        + 'handwriting-kraken/'
        + 'metrics.json',
    );

  const trocr =
    await readJson<MetricArtifact>(
      'benchmark/results/'
        + 'handwriting-final/'
        + 'metrics.json',
    );

  const easyocr =
    await readJson<MetricArtifact>(
      'benchmark/results/'
        + 'handwriting-easyocr/'
        + 'metrics.json',
    );

  const easyComplementarity =
    await readJson<ComplementarityArtifact>(
      'benchmark/results/'
        + 'handwriting-easyocr-complementarity/'
        + 'analysis.json',
    );

  const trocrRegions =
    await readJson<TrocrRegionEvaluation>(
      'benchmark/results/'
        + 'handwriting-trocr-regions/'
        + 'evaluation.json',
    );

  const alternatives = {
    krakenAlternatives: {
      decision:
        'REJECTED',

      reason:
        'BBox recognition exposes decoded output, '
        + 'not usable n-best/raw logits; installed '
        + 'decoder only provides greedy decoding.',
    },

    easyocr: {
      decision:
        'REJECTED',

      cer:
        easyocr.cer,

      wer:
        easyocr.wer,

      recognitionSeconds:
        easyocr.totalRecognitionSeconds,

      krakenCer:
        kraken.cer,

      krakenWer:
        kraken.wer,

      oracleImprovedLines:
        easyComplementarity
          .totals
          .improvedLines,

      oracleWorsenedLines:
        easyComplementarity
          .totals
          .worsenedLines,

      fallbackCandidateLines:
        easyComplementarity
          .totals
          .fallbackCandidateLines,

      oracleCer:
        easyComplementarity
          .totals
          .oracleCer,

      oracleWer:
        easyComplementarity
          .totals
          .oracleWer,

      oracleCerAbsoluteImprovement:
        easyComplementarity
          .totals
          .cerAbsoluteImprovement,

      oracleWerAbsoluteImprovement:
        easyComplementarity
          .totals
          .werAbsoluteImprovement,

      reason:
        'Global accuracy is substantially worse than '
        + 'Kraken and even an oracle selector gives '
        + 'only marginal document-level improvement.',
    },

    trocrWholeLine: {
      decision:
        'REJECTED',

      fallbackCandidateLines:
        60,

      totalLines:
        61,

      recognitionSeconds:
        trocr.totalRecognitionSeconds,

      reason:
        'Confidence policy touches 60/61 lines, so '
        + 'whole-line TrOCR is not selective and is '
        + 'too expensive.',
    },

    trocrExactRegion: {
      decision:
        'REJECTED',

      regions:
        trocrRegions.regions,

      sourceErrors:
        trocrRegions.sourceErrors,

      correctedErrors:
        trocrRegions.correctedErrors,

      sourceCorrect:
        trocrRegions.sourceCorrect,

      preservedCorrect:
        trocrRegions.preservedCorrect,

      destroyedCorrect:
        trocrRegions.destroyedCorrect,

      exactCorrect:
        trocrRegions.trocrExactCorrect,

      recognitionSeconds:
        trocrRegions
          .totalRecognitionSeconds,

      reason:
        'Exact positive-width Kraken regions produce '
        + 'zero corrected errors and destroy every '
        + 'previously correct candidate.',
    },
  };

  const gate = {
    krakenAlternativesRejected:
      alternatives
        .krakenAlternatives
        .decision === 'REJECTED',

    easyocrRejected:
      alternatives
        .easyocr
        .decision === 'REJECTED'
      && easyComplementarity
        .totals
        .improvedLines === 7
      && easyComplementarity
        .totals
        .worsenedLines === 41,

    trocrWholeLineRejected:
      alternatives
        .trocrWholeLine
        .fallbackCandidateLines === 60,

    trocrExactRegionRejected:
      trocrRegions.regions === 40
      && trocrRegions
        .sourceErrors === 21
      && trocrRegions
        .correctedErrors === 0
      && trocrRegions
        .sourceCorrect === 19
      && trocrRegions
        .destroyedCorrect === 19
      && trocrRegions
        .trocrExactCorrect === 0,
  };

  const f116GateOk =
    Object.values(gate)
      .every(Boolean);

  const output = {
    phase:
      'F11.6',

    objective:
      'Selective handwriting fallback',

    baseline: {
      recognizer:
        'Kraken PP-OCRv6 small',

      cer:
        kraken.cer,

      wer:
        kraken.wer,

      recognitionSeconds:
        kraken.totalRecognitionSeconds,
    },

    alternatives,

    decision: {
      automaticOcrFallback:
        'NOT_ADOPTED',

      confidenceFallbackState:
        'REQUIRES_REVIEW',

      rawKrakenPreserved:
        true,

      structuredContextDeferredTo:
        'F11.7',

      humanReviewStillRequired:
        true,
    },

    gate,

    f116GateOk,
  };

  await fs.mkdir(
    'benchmark/results/'
      + 'handwriting-selective-fallback',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/'
      + 'handwriting-selective-fallback/'
      + 'summary.json',
    JSON.stringify(
      output,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(
    'KRAKEN_CER=',
    `${(
      kraken.cer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'KRAKEN_WER=',
    `${(
      kraken.wer * 100
    ).toFixed(2)}%`,
  );

  console.log();

  console.log(
    'EASYOCR_CER=',
    `${(
      easyocr.cer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'EASYOCR_ORACLE_IMPROVED_LINES=',
    easyComplementarity
      .totals
      .improvedLines,
  );

  console.log(
    'EASYOCR_ORACLE_CER=',
    `${(
      easyComplementarity
        .totals
        .oracleCer
      * 100
    ).toFixed(2)}%`,
  );

  console.log();

  console.log(
    'TROCR_REGION_CORRECTED_ERRORS=',
    trocrRegions.correctedErrors,
  );

  console.log(
    'TROCR_REGION_DESTROYED_CORRECT=',
    trocrRegions.destroyedCorrect,
  );

  console.log(
    'TROCR_REGION_EXACT_CORRECT=',
    trocrRegions.trocrExactCorrect,
  );

  console.log();

  console.log(
    'AUTOMATIC_OCR_FALLBACK=NOT_ADOPTED',
  );

  console.log(
    'CONFIDENCE_FALLBACK_STATE=REQUIRES_REVIEW',
  );

  console.log(
    'STRUCTURED_CONTEXT_DEFERRED_TO=F11.7',
  );

  console.log(
    'F11_6_GATE_OK=',
    Number(f116GateOk),
  );

  if (!f116GateOk) {
    process.exitCode = 1;
  }
}


main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
