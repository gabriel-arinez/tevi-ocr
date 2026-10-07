export const HANDWRITING_FALLBACK_THRESHOLD =
  0.70;


function finiteConfidence(
  value,
) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}


export function classifyHandwritingCharacter(
  character,
) {
  const confidence =
    character?.confidence;

  if (!finiteConfidence(confidence)) {
    return {
      level: 'invalid',
      requiresReview: true,
      requiresFallback: false,
      label: 'Confianza no disponible',
    };
  }

  if (
    confidence <
    HANDWRITING_FALLBACK_THRESHOLD
  ) {
    return {
      level: 'fallback',
      requiresReview: true,
      requiresFallback: true,
      label: 'Baja confianza',
    };
  }

  return {
    level: 'review',
    requiresReview: true,
    requiresFallback: false,
    label: 'Requiere revisión',
  };
}


export function buildHandwritingReviewModel(
  ocr,
) {
  if (
    !ocr ||
    ocr.mode !== 'handwritten'
  ) {
    return null;
  }

  const characters =
    Array.isArray(ocr.characters)
      ? ocr.characters
      : [];

  const sourceLines =
    Array.isArray(
      ocr.pages?.[0]?.lines,
    )
      ? ocr.pages[0].lines
      : [];

  const decorateCharacter =
    (character) => ({
      ...character,

      review:
        classifyHandwritingCharacter(
          character,
        ),
    });

  const decoratedCharacters =
    characters.map(
      decorateCharacter,
    );

  const lines =
    sourceLines.map(
      (line) => ({
        lineNumber:
          line.lineNumber,

        text:
          line.text ?? '',

        characters:
          Array.isArray(
            line.characters,
          )
            ? line.characters.map(
                decorateCharacter,
              )
            : [],
      }),
    );

  const fallbackCharacters =
    decoratedCharacters.filter(
      (character) =>
        character.review
          .requiresFallback,
    );

  const reviewCharacters =
    decoratedCharacters.filter(
      (character) =>
        character.review
          .requiresReview,
    );

  const structuredFields =
    Array.isArray(
      ocr.structuredFields?.fields,
    )
      ? ocr.structuredFields.fields
      : [];

  const rawText =
    typeof ocr.structuredFields
      ?.rawText === 'string'
      ? ocr.structuredFields.rawText
      : (
          typeof ocr.text === 'string'
            ? ocr.text
            : ''
        );

  return {
    engine:
      ocr.engine ?? 'N/D',

    model:
      ocr.model ?? 'N/D',

    rawText,

    qualityStatus:
      ocr.quality?.status ??
      'REVIEW',

    requiresReview:
      ocr.quality
        ?.requiresReview !== false,

    automaticAcceptEnabled:
      ocr.quality
        ?.automaticAcceptEnabled === true,

    fallbackThreshold:
      Number.isFinite(
        ocr.quality?.fallbackThreshold,
      )
        ? ocr.quality
            .fallbackThreshold
        : HANDWRITING_FALLBACK_THRESHOLD,

    characterCount:
      characters.length,

    reviewCharacterCount:
      reviewCharacters.length,

    fallbackCharacterCount:
      fallbackCharacters.length,

    characters:
      decoratedCharacters,

    lines,

    fallbackCharacters,

    structuredFields,

    runtime: {
      persistent:
        ocr.runtime?.persistent === true,

      requestCount:
        Number.isInteger(
          ocr.runtime?.requestCount,
        )
          ? ocr.runtime.requestCount
          : null,
    },
  };
}


export function formatConfidencePercent(
  confidence,
) {
  if (!finiteConfidence(confidence)) {
    return 'N/D';
  }

  return (
    `${(
      confidence * 100
    ).toFixed(1)}%`
  );
}


export function structuredFieldTypeLabel(
  fieldType,
) {
  const labels = {
    NIT:
      'NIT',

    TV_CORRELATIVO:
      'Correlativo TV',

    AMOUNT:
      'Monto',

    DATE:
      'Fecha',
  };

  return (
    labels[fieldType] ??
    fieldType ??
    'Campo'
  );
}


export function structuredFieldStatusLabel(
  status,
) {
  const labels = {
    UNCHANGED:
      'Sin cambios',

    NORMALIZED:
      'Normalizado',

    AMBIGUOUS:
      'Ambiguo',

    INVALID:
      'Inválido',

    CORRECTED:
      'Corregido',
  };

  return (
    labels[status] ??
    status ??
    'Desconocido'
  );
}


export function structuredFieldDisplayValue(
  field,
) {
  if (!field) {
    return {
      raw: '',
      resolved: null,
      changed: false,
      status: 'UNKNOWN',
    };
  }

  const raw =
    typeof field.raw === 'string'
      ? field.raw
      : '';

  const resolved =
    typeof field.resolved === 'string'
      ? field.resolved
      : null;

  return {
    raw,
    resolved,
    changed:
      resolved !== null &&
      resolved !== raw,

    status:
      field.status ?? 'UNKNOWN',
  };
}
