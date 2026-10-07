import {
  normalizeOcrField,
  type OcrFieldNormalizationReason,
  type OcrFieldNormalizationStatus,
  type OcrStructuredFieldType,
} from './contextual-normalizer.js';


export interface OcrStructuredSourceLine {
  lineNumber: number;
  text: string;
}


export interface OcrStructuredFieldExtraction {
  fieldType: OcrStructuredFieldType;

  rawLine: string;
  raw: string;

  resolved: string | null;

  status:
    OcrFieldNormalizationStatus;

  reason:
    OcrFieldNormalizationReason;

  lineNumber: number;
}


export interface OcrStructuredExtractionResult {
  rawText: string;

  fields:
    OcrStructuredFieldExtraction[];
}


interface FieldLabelRule {
  fieldType:
    OcrStructuredFieldType;

  pattern:
    RegExp;
}


/*
 * Aliases explícitos observados en el corpus Kraken F11.
 *
 * No hay fuzzy matching ni distancia de edición general.
 * Cada variante debe estar documentada y cubierta por tests.
 */
const FIELD_LABEL_RULES:
  readonly FieldLabelRule[] = [
    {
      fieldType: 'NIT',

      /*
       * Observados:
       * NIT / VIT / Nιt / νιt
       *
       * "N:" permanece deliberadamente fuera:
       * es demasiado ambiguo.
       */
      pattern:
        /^(?:nit|vit|nιt|νιt)(?:\s*:\s*|\s+)(.+)$/iu,
    },
    {
      fieldType:
        'TV_CORRELATIVO',

      /*
       * Variantes observadas de "Código":
       * Código, Codio, Cohigoν, Codlgo,
       * Cadig0 y Codig.
       *
       * Solo identifican el tipo de campo.
       * El valor TV sigue sujeto al contrato
       * estricto del normalizador.
       */
      pattern:
        /^(?:c(?:ó|o\p{M}*)digo|c(?:ó|o\p{M}*)dio|c(?:ó|o\p{M}*)higoν|c(?:ó|o\p{M}*)dlgo|c(?:á|a\p{M}*)dig0|c(?:ó|o\p{M}*)dig)(?:\s*:\s*|\s+)(.+)$/iu,
    },
    {
      fieldType: 'DATE',

      /*
       * Observados:
       * Fecha / Tiecha / Techa.
       */
      pattern:
        /^(?:fecha|tiecha|techa)(?:\s*:\s*|\s+)(.+)$/iu,
    },
    {
      fieldType: 'AMOUNT',

      /*
       * Observados:
       * Monto / Monts / Monte / Mont / Moło.
       *
       * El candidato todavía debe cumplir
       * estrictamente el contrato de monto.
       */
      pattern:
        /^(?:monto|monts|monte|mont|moło)(?:\s*:\s*|\s+)(.+)$/iu,
    },
  ];


function extractSameLineCandidate(
  line: string,
  pattern: RegExp,
): string | null {
  const match =
    pattern.exec(line);

  const candidate =
    match?.[1]?.trim();

  return candidate
    && candidate.length > 0
      ? candidate
      : null;
}


export function extractStructuredFields(
  rawText: string,
  lines:
    readonly OcrStructuredSourceLine[],
): OcrStructuredExtractionResult {
  const fields:
    OcrStructuredFieldExtraction[] =
      [];

  for (const line of lines) {
    for (
      const rule
      of FIELD_LABEL_RULES
    ) {
      const raw =
        extractSameLineCandidate(
          line.text,
          rule.pattern,
        );

      if (raw === null) {
        continue;
      }

      const normalized =
        normalizeOcrField(
          rule.fieldType,
          raw,
        );

      fields.push({
        fieldType:
          rule.fieldType,

        rawLine:
          line.text,

        raw,

        resolved:
          normalized.value,

        status:
          normalized.status,

        reason:
          normalized.reason,

        lineNumber:
          line.lineNumber,
      });
    }
  }

  return {
    rawText,
    fields,
  };
}
