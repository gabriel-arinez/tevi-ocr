export type OcrStructuredFieldType =
  | 'NIT'
  | 'TV_CORRELATIVO';

export type OcrFieldNormalizationStatus =
  | 'UNCHANGED'
  | 'NORMALIZED'
  | 'INVALID';

export interface OcrFieldNormalizationResult {
  fieldType: OcrStructuredFieldType;
  input: string;
  value: string | null;
  status: OcrFieldNormalizationStatus;
}

const NUMERIC_OCR_CONFUSIONS:
  Readonly<Record<string, string>> = {
    O: '0',
    o: '0',

    I: '1',
    i: '1',
    l: '1',
    L: '1',

    S: '5',
    s: '5',

    B: '8',

    Z: '2',
    z: '2',
  };

function normalizeNumericOcrCharacters(
  value: string,
): string {
  return [...value]
    .map(
      (character) =>
        NUMERIC_OCR_CONFUSIONS[
          character
        ] ?? character,
    )
    .join('');
}

function invalidResult(
  fieldType: OcrStructuredFieldType,
  input: string,
): OcrFieldNormalizationResult {
  return {
    fieldType,
    input,
    value: null,
    status: 'INVALID',
  };
}

function validResult(
  fieldType: OcrStructuredFieldType,
  input: string,
  value: string,
): OcrFieldNormalizationResult {
  return {
    fieldType,
    input,
    value,
    status:
      value === input
        ? 'UNCHANGED'
        : 'NORMALIZED',
  };
}

/**
 * Normaliza únicamente un campo que el consumidor
 * ya identificó inequívocamente como NIT.
 *
 * Contrato MVP-TEVI:
 * - exclusivamente numérico;
 * - entre 1 y 20 dígitos.
 *
 * No elimina puntuación ni texto arbitrario.
 */
export function normalizeNitOcrField(
  raw: string,
): OcrFieldNormalizationResult {
  const fieldType:
    OcrStructuredFieldType =
      'NIT';

  const input =
    String(raw ?? '').trim();

  const candidate =
    normalizeNumericOcrCharacters(
      input,
    );

  if (
    !/^\d{1,20}$/.test(
      candidate,
    )
  ) {
    return invalidResult(
      fieldType,
      input,
    );
  }

  return validResult(
    fieldType,
    input,
    candidate,
  );
}

/**
 * Normaliza únicamente un correlativo que el
 * consumidor ya identificó como correlativo
 * automático TV.
 *
 * Contrato MVP-TEVI:
 *   TV-<mínimo 3 dígitos>-<año de 4 dígitos>
 *
 * El prefijo TV debe estar reconocido correctamente.
 * Nunca se corrige/adivina un prefijo ambiguo.
 */
export function normalizeTvCorrelativoOcrField(
  raw: string,
): OcrFieldNormalizationResult {
  const fieldType:
    OcrStructuredFieldType =
      'TV_CORRELATIVO';

  const input =
    String(raw ?? '')
      .trim()
      .toUpperCase();

  const match =
    /^([A-Z0-9]{2})-([A-Z0-9]+)-([A-Z0-9]{4})$/
      .exec(
        input,
      );

  if (!match) {
    return invalidResult(
      fieldType,
      input,
    );
  }

  const [
    ,
    prefix,
    sequenceRaw,
    yearRaw,
  ] = match;

  if (
    !prefix ||
    !sequenceRaw ||
    !yearRaw
  ) {
    return invalidResult(
      fieldType,
      input,
    );
  }

  /*
   * El prefijo no se adivina.
   * Por ejemplo "7V" permanece inválido.
   */
  if (prefix !== 'TV') {
    return invalidResult(
      fieldType,
      input,
    );
  }

  const sequence =
    normalizeNumericOcrCharacters(
      sequenceRaw,
    );

  const year =
    normalizeNumericOcrCharacters(
      yearRaw,
    );

  const candidate =
    `TV-${sequence}-${year}`;

  if (
    !/^TV-\d{3,}-\d{4}$/.test(
      candidate,
    )
  ) {
    return invalidResult(
      fieldType,
      input,
    );
  }

  return validResult(
    fieldType,
    input,
    candidate,
  );
}

export function normalizeOcrField(
  fieldType: OcrStructuredFieldType,
  raw: string,
): OcrFieldNormalizationResult {
  switch (fieldType) {
    case 'NIT':
      return normalizeNitOcrField(
        raw,
      );

    case 'TV_CORRELATIVO':
      return normalizeTvCorrelativoOcrField(
        raw,
      );
  }
}
