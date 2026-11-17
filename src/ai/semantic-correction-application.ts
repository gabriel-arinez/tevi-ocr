import type { SemanticAnomaly } from './semantic-analyzer.js';

export interface AppliedSemanticChange {
  id: string;
  original: string;
  corrected: string;
  reason: string;
}

export interface SemanticApplicationResult {
  text: string;
  applied: AppliedSemanticChange[];
  reviewOnly: Array<{ id: string; original: string; suggestion: string; reason: string }>;
}

/**
 * Only apply bounded, single-occurrence lexical changes; never change
 * numbers, identifiers, names, capitalized proper nouns, or whole paragraphs.
 * Other LLM proposals remain visible as suggestions for human review.
 */
export function applySafeSemanticSuggestions(
  input: string,
  anomalies: readonly SemanticAnomaly[],
): SemanticApplicationResult {
  let text = input;
  const applied: AppliedSemanticChange[] = [];
  const reviewOnly: SemanticApplicationResult['reviewOnly'] = [];
  const lettersOnly = /^[\p{Ll}\p{M}]+$/u;

  for (const candidate of anomalies) {
    if (candidate.status !== 'SUGGESTED' ||
        candidate.decision !== 'CORRECTION' ||
        candidate.originalText === candidate.suggestedAlternative) {
      continue;
    }

    const original = candidate.originalText.trim();
    const suggested = candidate.suggestedAlternative.trim();
    const safeCharacters = lettersOnly.test(original) && lettersOnly.test(suggested);
    const distinct = original.length >= 4 && suggested.length >= 4;
    const hasSourceContext = Boolean(candidate.lineContext?.includes(original));
    const permitted = safeCharacters && distinct && hasSourceContext &&
      !candidate.isProtectedField && candidate.charDistance > 0 &&
      candidate.charDistance <= 2;

    // Never change a repeated token globally; need a specific located occurrence.
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordPattern = new RegExp('(?<![\\p{L}\\p{N}])' + escaped +
      '(?![\\p{L}\\p{N}])', 'gu');
    const occurrences = [...text.matchAll(wordPattern)];

    if (!permitted || occurrences.length !== 1) {
      reviewOnly.push({ id: candidate.id, original, suggestion: suggested,
        reason: !permitted ? 'Se requiere confirmación del fragmento' :
          'El fragmento aparece más de una vez' });
      continue;
    }

    text = text.replace(wordPattern, suggested);
    applied.push({
      id: candidate.id, original, corrected: suggested, reason: candidate.reason,
    });
  }

  return { text, applied, reviewOnly };
}
