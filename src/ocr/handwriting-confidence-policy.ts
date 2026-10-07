export type HandwritingConfidenceAction =
  | 'ACCEPT'
  | 'REVIEW'
  | 'FALLBACK';

export interface HandwritingConfidencePolicy {
  acceptThreshold: null;
  fallbackThreshold: number;

  acceptEnabled: false;

  rationale: {
    accept:
      'DISABLED_HIGH_CONFIDENCE_ERRORS';
    fallback:
      'HIGHEST_BENCHMARK_THRESHOLD_WITH_ERROR_PRECISION_AT_LEAST_50_PERCENT';
  };
}

export interface HandwritingConfidenceDecision {
  action: HandwritingConfidenceAction;
  confidence: number;
  requiresReview: boolean;
  requiresFallback: boolean;
}

export const HANDWRITING_CONFIDENCE_POLICY:
  Readonly<HandwritingConfidencePolicy> = {
    acceptThreshold: null,

    fallbackThreshold: 0.70,

    acceptEnabled: false,

    rationale: {
      accept:
        'DISABLED_HIGH_CONFIDENCE_ERRORS',

      fallback:
        'HIGHEST_BENCHMARK_THRESHOLD_WITH_ERROR_PRECISION_AT_LEAST_50_PERCENT',
    },
  };

export function assessHandwritingConfidence(
  confidence: number,
): HandwritingConfidenceDecision {
  if (
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error(
      'Handwriting confidence must be a finite number between 0 and 1.',
    );
  }

  if (
    confidence <
    HANDWRITING_CONFIDENCE_POLICY
      .fallbackThreshold
  ) {
    return {
      action: 'FALLBACK',
      confidence,
      requiresReview: true,
      requiresFallback: true,
    };
  }

  /*
   * ACCEPT permanece deshabilitado.
   *
   * F11.4 demostró errores frecuentes incluso
   * con confidence >= 0.95 y >= 0.99.
   */
  return {
    action: 'REVIEW',
    confidence,
    requiresReview: true,
    requiresFallback: false,
  };
}
