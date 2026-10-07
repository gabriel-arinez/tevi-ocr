export type OcrQualityStatus =
  | 'ACCEPTABLE'
  | 'REVIEW'
  | 'INSUFFICIENT';

export type OcrQualityReason =
  | 'CONFIDENCE_ACCEPTABLE'
  | 'CONFIDENCE_REVIEW'
  | 'CONFIDENCE_INSUFFICIENT'
  | 'CONFIDENCE_UNAVAILABLE'
  | 'EMPTY_TEXT';

export interface OcrQualityAssessment {
  status: OcrQualityStatus;
  requiresReview: boolean;
  reasons: OcrQualityReason[];
}

export interface OcrQualityInput {
  text: string;
  confidence: number | null;
}

export const OCR_QUALITY_THRESHOLDS = {
  acceptableConfidence: 90,
  insufficientConfidence: 70,
} as const;

const QUALITY_RANK:
  Readonly<Record<OcrQualityStatus, number>> = {
    ACCEPTABLE: 0,
    REVIEW: 1,
    INSUFFICIENT: 2,
  };

export function assessOcrQuality(
  input: OcrQualityInput,
): OcrQualityAssessment {
  if (!input.text.trim()) {
    return {
      status: 'INSUFFICIENT',
      requiresReview: true,
      reasons: [
        'EMPTY_TEXT',
      ],
    };
  }

  if (input.confidence === null) {
    return {
      status: 'REVIEW',
      requiresReview: true,
      reasons: [
        'CONFIDENCE_UNAVAILABLE',
      ],
    };
  }

  if (
    input.confidence <
    OCR_QUALITY_THRESHOLDS.insufficientConfidence
  ) {
    return {
      status: 'INSUFFICIENT',
      requiresReview: true,
      reasons: [
        'CONFIDENCE_INSUFFICIENT',
      ],
    };
  }

  if (
    input.confidence <
    OCR_QUALITY_THRESHOLDS.acceptableConfidence
  ) {
    return {
      status: 'REVIEW',
      requiresReview: true,
      reasons: [
        'CONFIDENCE_REVIEW',
      ],
    };
  }

  return {
    status: 'ACCEPTABLE',
    requiresReview: false,
    reasons: [
      'CONFIDENCE_ACCEPTABLE',
    ],
  };
}

export function aggregateOcrQuality(
  pages: readonly OcrQualityAssessment[],
): OcrQualityAssessment {
  if (pages.length === 0) {
    return {
      status: 'INSUFFICIENT',
      requiresReview: true,
      reasons: [
        'EMPTY_TEXT',
      ],
    };
  }

  const worst =
    pages.reduce(
      (current, candidate) =>
        QUALITY_RANK[candidate.status] >
        QUALITY_RANK[current.status]
          ? candidate
          : current,
    );

  return {
    status: worst.status,
    requiresReview:
      worst.status !== 'ACCEPTABLE',
    reasons: [
      ...new Set(
        pages.flatMap(
          (page) => page.reasons,
        ),
      ),
    ],
  };
}
