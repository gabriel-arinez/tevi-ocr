import fs from 'node:fs/promises';

import {
  extractStructuredFields,
  type OcrStructuredFieldExtraction,
} from '../src/ocr/structured-field-extractor.js';

import {
  normalizeOcrField,
  type OcrStructuredFieldType,
} from '../src/ocr/contextual-normalizer.js';


interface ManifestRow {
  id: string;
  groundTruthPath: string;
}


interface KrakenLine {
  lineNumber: number;
  text: string;
}


interface KrakenDocument {
  id: string;
  category: string;
  lines: KrakenLine[];
  text: string;
}


interface KrakenArtifact {
  documents: KrakenDocument[];
}


interface ExtractedDocument {
  id: string;
  category: string;
  rawText: string;
  fields: OcrStructuredFieldExtraction[];
}


interface ExpectedField {
  fieldType: OcrStructuredFieldType;
  raw: string;
  resolved: string;
}


const EXPECTED_TYPES:
  readonly OcrStructuredFieldType[] = [
    'NIT',
    'TV_CORRELATIVO',
    'AMOUNT',
    'DATE',
  ];


function expectedFromGroundTruth(
  text: string,
): ExpectedField[] {
  const fields:
    ExpectedField[] = [];

  for (
    const rawLine
    of text.split(/\r?\n/)
  ) {
    const line =
      rawLine.trim();

    let fieldType:
      OcrStructuredFieldType
      | null = null;

    let raw:
      string | null = null;

    let match =
      /^NIT:\s*(.+)$/u.exec(
        line,
      );

    if (match?.[1]) {
      fieldType = 'NIT';
      raw = match[1].trim();
    }

    if (fieldType === null) {
      match =
        /^Código:\s*(.+)$/u.exec(
          line,
        );

      if (match?.[1]) {
        fieldType =
          'TV_CORRELATIVO';

        raw =
          match[1].trim();
      }
    }

    if (fieldType === null) {
      match =
        /^Monto:\s*(.+)$/u.exec(
          line,
        );

      if (match?.[1]) {
        fieldType = 'AMOUNT';
        raw = match[1].trim();
      }
    }

    if (fieldType === null) {
      match =
        /^Fecha:\s*(.+)$/u.exec(
          line,
        );

      if (match?.[1]) {
        fieldType = 'DATE';
        raw = match[1].trim();
      }
    }

    if (
      fieldType === null
      || raw === null
    ) {
      continue;
    }

    const normalized =
      normalizeOcrField(
        fieldType,
        raw,
      );

    if (
      normalized.value === null
    ) {
      throw new Error(
        `GT inválido para ${fieldType}: ${raw}`,
      );
    }

    fields.push({
      fieldType,
      raw,
      resolved:
        normalized.value,
    });
  }

  return fields;
}


async function main(): Promise<void> {
  const kraken =
    JSON.parse(
      await fs.readFile(
        'benchmark/results/'
          + 'handwriting-kraken/'
          + 'documents.json',
        'utf8',
      ),
    ) as KrakenArtifact;

  /*
   * Fase 1:
   * extracción sin usar ground truth.
   */
  const extractedDocuments:
    ExtractedDocument[] = [];

  for (
    const document
    of kraken.documents
  ) {
    const extraction =
      extractStructuredFields(
        document.text,
        document.lines.map(
          (line) => ({
            lineNumber:
              line.lineNumber,
            text:
              line.text,
          }),
        ),
      );

    if (
      extraction.rawText
      !== document.text
    ) {
      throw new Error(
        `rawText alterado: ${document.id}`,
      );
    }

    extractedDocuments.push({
      id:
        document.id,
      category:
        document.category,
      rawText:
        extraction.rawText,
      fields:
        extraction.fields,
    });
  }

  const outputDir =
    'benchmark/results/'
      + 'handwriting-structured-fields';

  await fs.mkdir(
    outputDir,
    {
      recursive: true,
    },
  );

  await fs.writeFile(
    `${outputDir}/extraction.json`,
    JSON.stringify(
      {
        methodology: {
          source:
            'Kraken OCR output',
          groundTruthUsed:
            false,
          fuzzyLabelMatching:
            false,
          rawTextMutation:
            false,
        },
        documents:
          extractedDocuments,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(
    '===== EXTRACTION WITHOUT GT =====',
  );

  let extractedCount = 0;

  for (
    const document
    of extractedDocuments
  ) {
    console.log();
    console.log(
      `DOCUMENT=${document.id}`,
    );

    for (
      const field
      of document.fields
    ) {
      extractedCount += 1;

      console.log(
        [
          field.fieldType,
          `line=${field.lineNumber}`,
          `raw=${JSON.stringify(field.raw)}`,
          `resolved=${JSON.stringify(field.resolved)}`,
          `status=${field.status}`,
          `reason=${field.reason}`,
        ].join(' | '),
      );
    }
  }

  console.log();
  console.log(
    'EXTRACTED_FIELDS=',
    extractedCount,
  );

  console.log(
    'GROUND_TRUTH_USED_DURING_EXTRACTION=0',
  );

  console.log(
    'RAW_TEXT_MUTATION=0',
  );

  /*
   * Fase 2:
   * solo después de congelar extraction.json
   * se carga el ground truth.
   */
  const manifest =
    JSON.parse(
      await fs.readFile(
        'benchmark/handwriting-manifest.json',
        'utf8',
      ),
    ) as ManifestRow[];

  const manifestById =
    new Map(
      manifest.map(
        (row) => [
          row.id,
          row,
        ]),
    );

  let expectedFields = 0;
  let coveredFields = 0;

  let exactResolved = 0;
  let ambiguousExtracted = 0;
  let invalidExtracted = 0;
  let wrongResolved = 0;
  let falsePositive = 0;

  let documentsWithAllFieldsCorrect = 0;

  const evaluation = [];

  for (
    const document
    of extractedDocuments
  ) {
    const manifestRow =
      manifestById.get(
        document.id,
      );

    if (!manifestRow) {
      throw new Error(
        `Manifest faltante: ${document.id}`,
      );
    }

    const groundTruth =
      await fs.readFile(
        manifestRow.groundTruthPath,
        'utf8',
      );

    const expected =
      expectedFromGroundTruth(
        groundTruth,
      );

    if (
      expected.length !== 4
    ) {
      throw new Error(
        `GT estructurado incompleto: ${document.id}`,
      );
    }

    expectedFields +=
      expected.length;

    const expectedByType =
      new Map(
        expected.map(
          (field) => [
            field.fieldType,
            field,
          ]),
      );

    const extractedByType =
      new Map<
        OcrStructuredFieldType,
        OcrStructuredFieldExtraction[]
      >();

    for (
      const field
      of document.fields
    ) {
      const current =
        extractedByType.get(
          field.fieldType,
        ) ?? [];

      current.push(field);

      extractedByType.set(
        field.fieldType,
        current,
      );
    }

    const rows = [];
    let documentCorrect = 0;

    for (
      const type
      of EXPECTED_TYPES
    ) {
      const expectedField =
        expectedByType.get(type);

      if (!expectedField) {
        throw new Error(
          `Campo esperado faltante ${type}: ${document.id}`,
        );
      }

      const candidates =
        extractedByType.get(type)
        ?? [];

      if (
        candidates.length > 1
      ) {
        throw new Error(
          `Extracción ambigua ${type}: ${document.id}`,
        );
      }

      const actual =
        candidates[0]
        ?? null;

      let verdict:
        | 'MISSING'
        | 'EXACT'
        | 'AMBIGUOUS'
        | 'INVALID'
        | 'WRONG';

      if (actual === null) {
        verdict = 'MISSING';
      } else {
        coveredFields += 1;

        if (
          actual.status ===
            'AMBIGUOUS'
        ) {
          verdict = 'AMBIGUOUS';
          ambiguousExtracted += 1;
        } else if (
          actual.resolved === null
        ) {
          verdict = 'INVALID';
          invalidExtracted += 1;
        } else if (
          actual.resolved
          === expectedField.resolved
        ) {
          verdict = 'EXACT';
          exactResolved += 1;
          documentCorrect += 1;
        } else {
          verdict = 'WRONG';
          wrongResolved += 1;
        }
      }

      rows.push({
        fieldType:
          type,

        expected:
          expectedField.resolved,

        actualRaw:
          actual?.raw ?? null,

        actualResolved:
          actual?.resolved ?? null,

        status:
          actual?.status ?? null,

        verdict,
      });
    }

    for (
      const [
        type,
        candidates,
      ]
      of extractedByType
    ) {
      if (
        !expectedByType.has(type)
      ) {
        falsePositive +=
          candidates.length;
      }
    }

    if (
      documentCorrect ===
      EXPECTED_TYPES.length
    ) {
      documentsWithAllFieldsCorrect += 1;
    }

    evaluation.push({
      id:
        document.id,
      category:
        document.category,
      rows,
    });

    console.log();
    console.log(
      `===== ${document.id} =====`,
    );

    for (
      const row
      of rows
    ) {
      console.log(
        [
          row.fieldType,
          `expected=${JSON.stringify(row.expected)}`,
          `raw=${JSON.stringify(row.actualRaw)}`,
          `resolved=${JSON.stringify(row.actualResolved)}`,
          row.verdict,
        ].join(' | '),
      );
    }
  }

  const missingFields =
    expectedFields
    - coveredFields;

  const coverage =
    expectedFields === 0
      ? 0
      : coveredFields
        / expectedFields;

  const exactAccuracy =
    expectedFields === 0
      ? 0
      : exactResolved
        / expectedFields;

  const accuracyAmongExtracted =
    coveredFields === 0
      ? 0
      : exactResolved
        / coveredFields;

  await fs.writeFile(
    `${outputDir}/evaluation.json`,
    JSON.stringify(
      {
        methodology: {
          groundTruthUsedDuringExtraction:
            false,
          groundTruthUsedDuringEvaluation:
            true,
          fuzzyLabelMatching:
            false,
          rawTextMutation:
            false,
        },

        totals: {
          documents:
            extractedDocuments.length,
          expectedFields,
          extractedFields:
            extractedCount,
          coveredFields,
          missingFields,
          exactResolved,
          ambiguousExtracted,
          invalidExtracted,
          wrongResolved,
          falsePositive,
          documentsWithAllFieldsCorrect,
          coverage,
          exactAccuracy,
          accuracyAmongExtracted,
        },

        documents:
          evaluation,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log();
  console.log(
    '===== STRUCTURED FIELD EVALUATION =====',
  );

  console.log(
    'DOCUMENTS=',
    extractedDocuments.length,
  );

  console.log(
    'EXPECTED_FIELDS=',
    expectedFields,
  );

  console.log(
    'EXTRACTED_FIELDS=',
    extractedCount,
  );

  console.log(
    'COVERED_FIELDS=',
    coveredFields,
  );

  console.log(
    'MISSING_FIELDS=',
    missingFields,
  );

  console.log(
    'EXACT_RESOLVED=',
    exactResolved,
  );

  console.log(
    'AMBIGUOUS_EXTRACTED=',
    ambiguousExtracted,
  );

  console.log(
    'INVALID_EXTRACTED=',
    invalidExtracted,
  );

  console.log(
    'WRONG_RESOLVED=',
    wrongResolved,
  );

  console.log(
    'FALSE_POSITIVE=',
    falsePositive,
  );

  console.log(
    'COVERAGE=',
    `${(
      coverage * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'EXACT_ACCURACY=',
    `${(
      exactAccuracy * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'ACCURACY_AMONG_EXTRACTED=',
    `${(
      accuracyAmongExtracted * 100
    ).toFixed(2)}%`,
  );

  console.log(
    'DOCUMENTS_ALL_FIELDS_CORRECT=',
    documentsWithAllFieldsCorrect,
  );

  console.log(
    'GROUND_TRUTH_USED_DURING_EXTRACTION=0',
  );

  console.log(
    'GROUND_TRUTH_USED_DURING_EVALUATION=1',
  );

  console.log(
    'RAW_TEXT_MUTATION=0',
  );

  const integrityGate =
    extractedDocuments.length === 8
    && expectedFields === 32
    && (
      exactResolved
      + ambiguousExtracted
      + invalidExtracted
      + wrongResolved
      + missingFields
    ) === expectedFields
    && falsePositive === 0;

  console.log(
    'F11_7_STRUCTURED_INTEGRITY_GATE=',
    Number(
      integrityGate,
    ),
  );

  if (!integrityGate) {
    process.exitCode = 1;
  }
}


main().catch(
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
