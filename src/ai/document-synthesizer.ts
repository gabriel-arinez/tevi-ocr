import { extractStructuredFields } from '../ocr/structured-field-extractor.js';
import type { SemanticAnomaly, SemanticExtractedField } from './semantic-analyzer.js';

export type InterventionAuthor =
  | 'LLAMA_3_2'
  | 'DETERMINISTIC_RULES'
  | 'SECURITY_SHIELD'
  | 'GEOMETRIC_FILTER';

export type InterventionCategory =
  | 'TYPO_CORRECTION'
  | 'FORMAT_NORMALIZATION'
  | 'PROTECTED_FIELD'
  | 'NOISE_REMOVAL';

export interface DocumentIntervention {
  id: string;
  original: string;
  replacement: string;
  author: InterventionAuthor;
  authorLabel: string;
  category: InterventionCategory;
  categoryLabel: string;
  reason: string;
  details?: string;
  charDistance?: number;
}

export interface DocumentSynthesisResult {
  finalText: string;
  annotatedHtml: string;
  interventions: DocumentIntervention[];
  stats: {
    llamaCorrections: number;
    ruleNormalizations: number;
    protectedShields: number;
    noiseRemovals: number;
    total: number;
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes regex special characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Synthesizes the final polished document and builds the interactive annotated view
 * with explicit technological attribution.
 */
export function synthesizeDocumentView(input: {
  baseStructuredText: string;
  anomalies?: SemanticAnomaly[];
  extractedFields?: SemanticExtractedField[];
  mode?: 'conventional' | 'assisted' | 'deep';
}): DocumentSynthesisResult {
  const interventions: DocumentIntervention[] = [];
  let counter = 1;

  // 1. Collect Deterministic Structured Field Normalizations & Security Shields
  const lines = input.baseStructuredText.split('\n').map((text, idx) => ({
    lineNumber: idx + 1,
    text,
  }));
  const structured = extractStructuredFields(input.baseStructuredText, lines);

  const appliedReplacements: Array<{
    target: string;
    replacement: string;
    intervention: DocumentIntervention;
  }> = [];

  for (const f of structured.fields) {
    if (f.status === 'NORMALIZED' && f.resolved && f.resolved !== f.raw) {
      const intervention: DocumentIntervention = {
        id: `int-rule-${counter++}`,
        original: f.raw,
        replacement: f.resolved,
        author: 'DETERMINISTIC_RULES',
        authorLabel: 'Reglas Deterministas',
        category: 'FORMAT_NORMALIZATION',
        categoryLabel: 'Normalización de Formato',
        reason: `Normalización de ${f.fieldType} (${f.reason})`,
        details: `Transformado según estándar legal/tributario sin inferencia probabilística.`,
      };
      interventions.push(intervention);
      appliedReplacements.push({
        target: f.raw,
        replacement: f.resolved,
        intervention,
      });
    } else if (f.status === 'UNCHANGED' || f.status === 'AMBIGUOUS' || f.status === 'INVALID') {
      // Record security shield preserving sensitive field
      if (f.raw && f.raw.length >= 3) {
        interventions.push({
          id: `int-shield-${counter++}`,
          original: f.raw,
          replacement: f.raw,
          author: 'SECURITY_SHIELD',
          authorLabel: 'Blindaje de Seguridad',
          category: 'PROTECTED_FIELD',
          categoryLabel: 'Campo Sensible Protegido',
          reason: `Campo ${f.fieldType} reservado sin modificación (${f.status})`,
          details: `El sistema previene alteraciones no autorizadas en datos numéricos y contractuales.`,
        });
      }
    }
  }

  // 2. Collect Llama 3.2 Contextual Corrections and Shield Events (if not conventional)
  if (input.mode !== 'conventional' && input.anomalies && input.anomalies.length > 0) {
    for (const anom of input.anomalies) {
      if (anom.status === 'SUGGESTED' && anom.suggestedAlternative !== anom.originalText) {
        const intervention: DocumentIntervention = {
          id: `int-llama-${counter++}`,
          original: anom.originalText,
          replacement: anom.suggestedAlternative,
          author: 'LLAMA_3_2',
          authorLabel: 'Llama 3.2 (IA)',
          category: 'TYPO_CORRECTION',
          categoryLabel: 'Corrección Ortográfica/OCR',
          reason: anom.reason || 'Corrección contextual asistida',
          details: `Distancia Levenshtein: ${anom.charDistance}. Verificado contextualmente.`,
          charDistance: anom.charDistance,
        };
        interventions.push(intervention);
        appliedReplacements.push({
          target: anom.originalText,
          replacement: anom.suggestedAlternative,
          intervention,
        });
      } else if (anom.isProtectedField || anom.rejectionReason === 'PROTECTED_FIELD_RESTRICTED_MANUAL_REVIEW_ONLY') {
        interventions.push({
          id: `int-shield-${counter++}`,
          original: anom.originalText,
          replacement: anom.originalText,
          author: 'SECURITY_SHIELD',
          authorLabel: 'Blindaje de Seguridad',
          category: 'PROTECTED_FIELD',
          categoryLabel: 'Intento de Alteración Rechazado',
          reason: `Rechazado: ${anom.rejectionReason ?? 'Campo contractual protegido'}`,
          details: `La IA sugirió modificar este campo sensible, pero el validador de seguridad bloqueó el cambio.`,
        });
      }
    }
  }

  // 3. Build the Polished Final Text
  let finalText = input.baseStructuredText;
  for (const rep of appliedReplacements) {
    if (rep.target && rep.replacement && rep.target !== rep.replacement) {
      const regex = new RegExp(`(?<=\\b|\\s|^)${escapeRegex(rep.target)}(?=\\b|\\s|[.,;:]|$)`, 'g');
      finalText = finalText.replace(regex, rep.replacement);
    }
  }

  // 4. Build the Interactive Annotated HTML for the Audit View
  let annotatedHtml = escapeHtml(finalText);

  // Mark all interventions in the text
  for (const intv of interventions) {
    const wordToHighlight = (intv.replacement && intv.replacement.trim()) ? intv.replacement.trim() : intv.original.trim();
    if (!wordToHighlight || wordToHighlight.length < 2) continue;

    const escapedWord = escapeHtml(wordToHighlight);
    const regex = new RegExp(`(?<=\\b|\\s|^|>)${escapeRegex(escapedWord)}(?=\\b|\\s|[.,;:]|$|<)`, 'g');

    const badgeClass =
      intv.author === 'LLAMA_3_2'
        ? 'audit-mark-llama'
        : intv.author === 'DETERMINISTIC_RULES'
          ? 'audit-mark-rules'
          : intv.author === 'SECURITY_SHIELD'
            ? 'audit-mark-shield'
            : 'audit-mark-noise';

    const authorTooltip = escapeHtml(`${intv.authorLabel} [${intv.categoryLabel}]`);
    const reasonTooltip = escapeHtml(`Original: "${intv.original}" → Motivo: ${intv.reason}`);

    annotatedHtml = annotatedHtml.replace(regex, (match) => {
      return `<mark class="audit-mark ${badgeClass}" data-author="${escapeHtml(intv.author)}" data-original="${escapeHtml(intv.original)}" data-replacement="${escapeHtml(intv.replacement)}" data-title="${authorTooltip}" data-reason="${reasonTooltip}" tabindex="0">${match}</mark>`;
    });
  }

  return {
    finalText,
    annotatedHtml,
    interventions,
    stats: {
      llamaCorrections: interventions.filter(i => i.author === 'LLAMA_3_2').length,
      ruleNormalizations: interventions.filter(i => i.author === 'DETERMINISTIC_RULES').length,
      protectedShields: interventions.filter(i => i.author === 'SECURITY_SHIELD').length,
      noiseRemovals: interventions.filter(i => i.author === 'GEOMETRIC_FILTER').length,
      total: interventions.length,
    },
  };
}
