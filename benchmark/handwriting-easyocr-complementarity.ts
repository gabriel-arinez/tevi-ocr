import fs from 'node:fs/promises';

import {
  calculateOcrMetrics,
} from '../src/metrics/ocr-metrics.js';


interface ManifestRow {
  id: string;
  category: string;
  groundTruthPath: string;
}


interface LineRow {
  lineNumber: number;
  text: string;
}


interface DocumentRow {
  id: string;
  category: string;
  lines: LineRow[];
  text: string;
}


interface RecognitionArtifact {
  documents: DocumentRow[];
  totalRecognitionSeconds: number;
}


function documentText(
  lines: readonly LineRow[],
): string {
  return lines
    .map(
      (line) =>
        line.text,
    )
    .join('\n')
    .trim();
}


async function main(): Promise<void> {
  const manifest =
    JSON.parse(
      await fs.readFile(
        'benchmark/handwriting-manifest.json',
        'utf8',
      ),
    ) as ManifestRow[];

  const kraken =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-kraken/'
          + 'documents.json',
        'utf8',
      ),
    ) as RecognitionArtifact;

  const easyocr =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-easyocr/'
          + 'documents.json',
        'utf8',
      ),
    ) as RecognitionArtifact;

  const calibration =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-confidence-calibration/'
          + 'calibration.json',
        'utf8',
      ),
    ) as {
      documents: Array<{
        id: string;
        rows: Array<{
          confidence: number | null;
          prediction: string | null;
          syntheticWhitespace: boolean;
          sources?: Array<{
            lineNumber: number;
          }>;
        }>;
      }>;
    };

  const manifestById =
    new Map(
      manifest.map(
        (row) => [
          row.id,
          row,
        ],
      ),
    );

  const easyById =
    new Map(
      easyocr.documents.map(
        (document) => [
          document.id,
          document,
        ],
      ),
    );

  const calibrationById =
    new Map(
      calibration.documents.map(
        (document) => [
          document.id,
          document,
        ],
      ),
    );

  const results = [];

  let improvedLines = 0;
  let worsenedLines = 0;
  let unchangedLines = 0;

  let fallbackCandidateLines = 0;
  let improvedFallbackLines = 0;

  let baselineCharacterDistance = 0;
  let oracleCharacterDistance = 0;

  let baselineWordDistance = 0;
  let oracleWordDistance = 0;

  let referenceCharacters = 0;
  let referenceWords = 0;

  for (
    const krakenDocument
    of kraken.documents
  ) {
    const manifestRow =
      manifestById.get(
        krakenDocument.id,
      );

    const easyDocument =
      easyById.get(
        krakenDocument.id,
      );

    const calibrationDocument =
      calibrationById.get(
        krakenDocument.id,
      );

    if (
      !manifestRow
      || !easyDocument
      || !calibrationDocument
    ) {
      throw new Error(
        `Datos incompletos para ${krakenDocument.id}`,
      );
    }

    if (
      krakenDocument.lines.length
      !== easyDocument.lines.length
    ) {
      throw new Error(
        `Line count incompatible: ${krakenDocument.id}`,
      );
    }

    const expected =
      await fs.readFile(
        manifestRow.groundTruthPath,
        'utf8',
      );

    const baseline =
      calculateOcrMetrics(
        expected,
        krakenDocument.text,
      );

    baselineCharacterDistance +=
      baseline.characterDistance;

    baselineWordDistance +=
      baseline.wordDistance;

    referenceCharacters +=
      baseline.referenceCharacters;

    referenceWords +=
      baseline.referenceWords;

    const fallbackLines =
      new Set<number>();

    for (
      const row
      of calibrationDocument.rows
    ) {
      if (
        row.confidence === null
        || row.prediction === null
        || row.syntheticWhitespace
        || row.confidence >= 0.70
      ) {
        continue;
      }

      for (
        const source
        of row.sources ?? []
      ) {
        fallbackLines.add(
          source.lineNumber,
        );
      }
    }

    const lineResults = [];

    const oracleLines =
      krakenDocument.lines.map(
        (line) => ({
          ...line,
        }),
      );

    for (
      let index = 0;
      index <
      krakenDocument.lines.length;
      index += 1
    ) {
      const krakenLine =
        krakenDocument.lines[index];

      const easyLine =
        easyDocument.lines[index];

      if (
        !krakenLine
        || !easyLine
        || krakenLine.lineNumber
          !== easyLine.lineNumber
      ) {
        throw new Error(
          `Línea desalineada: ${krakenDocument.id}`,
        );
      }

      const candidateLines =
        krakenDocument.lines.map(
          (line) => ({
            ...line,
          }),
        );

      candidateLines[index] = {
        ...candidateLines[index]!,
        text:
          easyLine.text,
      };

      const candidateText =
        documentText(
          candidateLines,
        );

      const candidate =
        calculateOcrMetrics(
          expected,
          candidateText,
        );

      const characterDelta =
        candidate.characterDistance
        - baseline.characterDistance;

      const wordDelta =
        candidate.wordDistance
        - baseline.wordDistance;

      const isFallbackCandidate =
        fallbackLines.has(
          krakenLine.lineNumber,
        );

      let verdict:
        | 'IMPROVES'
        | 'WORSENS'
        | 'UNCHANGED';

      if (
        characterDelta < 0
      ) {
        verdict = 'IMPROVES';
        improvedLines += 1;

        oracleLines[index] = {
          ...oracleLines[index]!,
          text:
            easyLine.text,
        };

        if (
          isFallbackCandidate
        ) {
          improvedFallbackLines += 1;
        }
      } else if (
        characterDelta > 0
      ) {
        verdict = 'WORSENS';
        worsenedLines += 1;
      } else {
        verdict = 'UNCHANGED';
        unchangedLines += 1;
      }

      if (
        isFallbackCandidate
      ) {
        fallbackCandidateLines += 1;
      }

      lineResults.push({
        lineNumber:
          krakenLine.lineNumber,

        krakenText:
          krakenLine.text,

        easyocrText:
          easyLine.text,

        fallbackCandidate:
          isFallbackCandidate,

        characterDistanceDelta:
          characterDelta,

        wordDistanceDelta:
          wordDelta,

        verdict,
      });

      console.log(
        [
          krakenDocument.id,
          `line=${krakenLine.lineNumber}`,
          `fallback=${
            Number(
              isFallbackCandidate,
            )
          }`,
          `charDelta=${characterDelta}`,
          `wordDelta=${wordDelta}`,
          verdict,
        ].join(' | '),
      );
    }

    const oracleText =
      documentText(
        oracleLines,
      );

    const oracleMetrics =
      calculateOcrMetrics(
        expected,
        oracleText,
      );

    oracleCharacterDistance +=
      oracleMetrics.characterDistance;

    oracleWordDistance +=
      oracleMetrics.wordDistance;

    results.push({
      id:
        krakenDocument.id,

      category:
        krakenDocument.category,

      baseline: {
        cer:
          baseline.cer,
        wer:
          baseline.wer,
        characterDistance:
          baseline.characterDistance,
        wordDistance:
          baseline.wordDistance,
      },

      oracleLineReplacement: {
        cer:
          oracleMetrics.cer,
        wer:
          oracleMetrics.wer,
        characterDistance:
          oracleMetrics.characterDistance,
        wordDistance:
          oracleMetrics.wordDistance,
      },

      lineResults,
    });
  }

  const baselineCer =
    baselineCharacterDistance
    / referenceCharacters;

  const oracleCer =
    oracleCharacterDistance
    / referenceCharacters;

  const baselineWer =
    baselineWordDistance
    / referenceWords;

  const oracleWer =
    oracleWordDistance
    / referenceWords;

  const output = {
    methodology: {
      selector:
        'post-recognition oracle evaluation only',

      automaticPolicy:
        false,

      replacementUnit:
        'whole frozen CRAFT line',

      groundTruthUsedForSelection:
        true,

      purpose:
        'measure upper-bound complementarity only',
    },

    totals: {
      lines:
        improvedLines
        + worsenedLines
        + unchangedLines,

      improvedLines,
      worsenedLines,
      unchangedLines,

      fallbackCandidateLines,
      improvedFallbackLines,

      baselineCer,
      oracleCer,

      baselineWer,
      oracleWer,

      cerAbsoluteImprovement:
        baselineCer - oracleCer,

      werAbsoluteImprovement:
        baselineWer - oracleWer,

      krakenRecognitionSeconds:
        kraken.totalRecognitionSeconds,

      easyocrFullRecognitionSeconds:
        easyocr.totalRecognitionSeconds,
    },

    documents:
      results,
  };

  await fs.mkdir(
    'benchmark/results/'
      + 'handwriting-easyocr-complementarity',
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    'benchmark/results/'
      + 'handwriting-easyocr-complementarity/'
      + 'analysis.json',
    JSON.stringify(
      output,
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log();
  console.log(
    '===== COMPLEMENTARITY =====',
  );

  console.log(
    'LINES=',
    output.totals.lines,
  );

  console.log(
    'IMPROVED_LINES=',
    improvedLines,
  );

  console.log(
    'WORSENED_LINES=',
    worsenedLines,
  );

  console.log(
    'UNCHANGED_LINES=',
    unchangedLines,
  );

  console.log(
    'FALLBACK_CANDIDATE_LINES=',
    fallbackCandidateLines,
  );

  console.log(
    'IMPROVED_FALLBACK_LINES=',
    improvedFallbackLines,
  );

  console.log(
    'BASELINE_CER=',
    `${(
      baselineCer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'ORACLE_CER=',
    `${(
      oracleCer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'BASELINE_WER=',
    `${(
      baselineWer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'ORACLE_WER=',
    `${(
      oracleWer * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'CER_ABSOLUTE_IMPROVEMENT=',
    `${(
      (
        baselineCer
        - oracleCer
      ) * 100
    ).toFixed(2)}pp`,
  );

  console.log(
    'WER_ABSOLUTE_IMPROVEMENT=',
    `${(
      (
        baselineWer
        - oracleWer
      ) * 100
    ).toFixed(2)}pp`,
  );

  /*
   * Este gate NO aprueba integración.
   * Solo valida que el análisis oracle
   * sea completo y coherente.
   */
  const gate =
    output.totals.lines === 61
    && fallbackCandidateLines === 60
    && Number.isFinite(
      oracleCer,
    )
    && Number.isFinite(
      oracleWer,
    );

  console.log(
    'F11_6_COMPLEMENTARITY_GATE=',
    Number(gate),
  );

  if (!gate) {
    process.exitCode = 1;
  }
}


main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
