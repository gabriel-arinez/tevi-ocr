import { extractStructuredFields } from '../ocr/structured-field-extractor.js';
import {
  isNoisyHeaderOrBorderLine,
  type SemanticAnomaly,
  type SemanticExtractedField,
  type DocumentRestorationChange,
} from './semantic-analyzer.js';

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
export interface DocumentSynthesisInput {
  baseStructuredText: string;
  restoredText?: string;
  changes?: DocumentRestorationChange[];
  anomalies?: SemanticAnomaly[];
  extractedFields?: SemanticExtractedField[];
  mode?: 'conventional' | 'assisted' | 'deep';
}

/**
 * Synthesizes the final polished document and builds the interactive annotated view
 * with explicit technological attribution.
 */
export function synthesizeDocumentView(input: DocumentSynthesisInput): DocumentSynthesisResult {
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

  // Also detect C.I. numbers to protect with security shield
  const ciMatches = input.baseStructuredText.matchAll(/\b(?:C\.?I\.?|Cédula(?:\s+de\s+identidad)?)\s*(?:N[°º.e]+)?\s*([0-9]{5,9}(?:\s+[A-Z]{1,3}\.?)?)/gi);
  for (const m of ciMatches) {
    const rawVal = m[1]?.trim();
    if (rawVal && rawVal.length >= 4 && !interventions.some(i => i.original === rawVal)) {
      interventions.push({
        id: `int-shield-${counter++}`,
        original: rawVal,
        replacement: rawVal,
        author: 'SECURITY_SHIELD',
        authorLabel: 'Blindaje de Seguridad',
        category: 'PROTECTED_FIELD',
        categoryLabel: 'Campo Sensible Protegido',
        reason: 'Cédula de identidad preservada sin modificación',
        details: 'El sistema previene alteraciones en datos de identificación personal.',
      });
    }
  }

  // 2. Incorporate explicit changes from restoration pass (rules or LLM)
  if (input.changes && input.changes.length > 0) {
    const isConventional = input.mode === 'conventional';
    const author: InterventionAuthor = isConventional ? 'DETERMINISTIC_RULES' : 'LLAMA_3_2';
    const authorLabel = isConventional ? 'Reglas Deterministas' : 'Llama 3.2 (IA)';
    const categoryLabel = isConventional ? 'Regla Determinista' : 'Corrección Ortográfica/OCR';

    for (const ch of input.changes) {
      if (!ch.original) continue;
      const isNoise = !ch.corrected || ch.corrected.trim() === '';
      const intervention: DocumentIntervention = {
        id: `int-${isConventional ? 'rule' : 'llama'}-${counter++}`,
        original: ch.original,
        replacement: ch.corrected,
        author,
        authorLabel,
        category: isNoise ? 'NOISE_REMOVAL' : (isConventional ? 'FORMAT_NORMALIZATION' : 'TYPO_CORRECTION'),
        categoryLabel: isNoise ? 'Eliminación de Ruido' : categoryLabel,
        reason: ch.reason || (isNoise ? 'Artefacto de escáner eliminado' : 'Normalización determinista'),
        details: isNoise ? 'Línea o fragmento inconexo depurado del resultado final.' : (isConventional ? 'Palabra corregida por reglas fijas sin IA.' : 'Palabra restaurada fielmente al original.'),
      };
      interventions.push(intervention);
      if (!isNoise) {
        appliedReplacements.push({
          target: ch.original,
          replacement: ch.corrected,
          intervention,
        });
      }
    }
  }

  // 3. Incorporate Llama 3.2 Contextual Corrections from anomalies list (if not already recorded)
  if (input.mode !== 'conventional' && input.anomalies && input.anomalies.length > 0) {
    for (const anom of input.anomalies) {
      const alreadyPresent = interventions.some(i => i.original === anom.originalText);
      if (alreadyPresent) continue;

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

  // 4. Determine Polished Final Text
  let finalText: string;
  if (input.restoredText && input.restoredText.trim().length > 0) {
    // Filter any stray residual noise lines
    finalText = input.restoredText
      .split(/\r?\n/)
      .filter(l => !isNoisyHeaderOrBorderLine(l))
      .join('\n')
      .trim();
  } else {
    finalText = input.baseStructuredText;
    for (const rep of appliedReplacements) {
      if (rep.target && rep.replacement && rep.target !== rep.replacement) {
        const regex = new RegExp(`(?<=\\b|\\s|^)${escapeRegex(rep.target)}(?=\\b|\\s|[.,;:]|$)`, 'g');
        finalText = finalText.replace(regex, rep.replacement);
      }
    }
    // Also clean border noise lines if conventional or fallback
    finalText = finalText
      .split(/\r?\n/)
      .filter(l => !isNoisyHeaderOrBorderLine(l))
      .join('\n')
      .trim();
  }

  // Detect any border noise line from original text that was removed
  const originalLines = input.baseStructuredText.split(/\r?\n/);
  for (const line of originalLines) {
    const trimmed = line.trim();
    if (trimmed && isNoisyHeaderOrBorderLine(trimmed)) {
      if (!interventions.some(i => i.original === trimmed)) {
        interventions.unshift({
          id: `int-noise-${counter++}`,
          original: trimmed,
          replacement: '',
          author: 'LLAMA_3_2',
          authorLabel: 'Llama 3.2 (IA)',
          category: 'NOISE_REMOVAL',
          categoryLabel: 'Eliminación de Ruido',
          reason: 'Ruido visual de escaneo depurado',
          details: 'Línea de borde o artefacto descartado del resultado final.',
        });
      }
    }
  }

  // 5. Build the Interactive Annotated HTML for the Review View
  let annotatedHtml = escapeHtml(finalText);

  // Group noise removals to show in a header notice if present
  const noiseRemovals = interventions.filter(i => i.category === 'NOISE_REMOVAL' && i.original.trim().length > 0);
  let noiseHeaderHtml = '';
  if (noiseRemovals.length > 0) {
    const noiseBadges = noiseRemovals
      .map(n => `<del class="audit-mark-noise" title="Eliminado por ruido de escáner: ${escapeHtml(n.original)}">${escapeHtml(n.original)}</del>`)
      .join(' ');
    noiseHeaderHtml = `<div class="audit-removed-block"><span class="audit-removed-label">🗑️ Ruido de escaneo eliminado:</span> ${noiseBadges}</div>\n\n`;
  }

  // Sort interventions by word length descending so longer phrases match first
  const activeInterventions = interventions.filter(i => i.category !== 'NOISE_REMOVAL');
  activeInterventions.sort((a, b) => {
    const lenA = (a.replacement || a.original).length;
    const lenB = (b.replacement || b.original).length;
    return lenB - lenA;
  });

  for (const intv of activeInterventions) {
    const wordToHighlight = (intv.replacement && intv.replacement.trim()) ? intv.replacement.trim() : intv.original.trim();
    if (!wordToHighlight || wordToHighlight.length < 2) continue;

    const escapedWord = escapeHtml(wordToHighlight);
    // Matches word outside already existing HTML tags
    const regex = new RegExp(`(?<!<[^>]*)(?<=[\\s,.:;()"]|^)${escapeRegex(escapedWord)}(?=[\\s,.:;()"]|$)(?![^<]*>)`, 'g');

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
    const fullTooltip = `${authorTooltip} • ${reasonTooltip}`;

    annotatedHtml = annotatedHtml.replace(regex, (match) => {
      return `<mark class="audit-mark ${badgeClass}" data-author="${escapeHtml(intv.author)}" data-original="${escapeHtml(intv.original)}" data-replacement="${escapeHtml(intv.replacement)}" data-title="${authorTooltip}" data-reason="${reasonTooltip}" title="${fullTooltip}" tabindex="0">${match}</mark>`;
    });
  }

  annotatedHtml = noiseHeaderHtml + annotatedHtml;

  return {
    finalText,
    annotatedHtml,
    interventions,
    stats: {
      llamaCorrections: interventions.filter(i => i.author === 'LLAMA_3_2' && i.category !== 'NOISE_REMOVAL').length,
      ruleNormalizations: interventions.filter(i => i.author === 'DETERMINISTIC_RULES').length,
      protectedShields: interventions.filter(i => i.author === 'SECURITY_SHIELD').length,
      noiseRemovals: interventions.filter(i => i.category === 'NOISE_REMOVAL').length,
      total: interventions.length,
    },
  };
}
