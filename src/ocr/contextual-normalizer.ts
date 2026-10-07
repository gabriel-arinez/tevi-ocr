export type OcrStructuredFieldType =
  | 'NIT'
  | 'TV_CORRELATIVO'
  | 'DATE'
  | 'AMOUNT';

export type OcrFieldNormalizationStatus =
  | 'UNCHANGED'
  | 'NORMALIZED'
  | 'AMBIGUOUS'
  | 'INVALID';

export type OcrFieldNormalizationReason =
  | 'NO_CHANGE'
  | 'NUMERIC_CONTEXT'
  | 'FORMAT_NORMALIZATION'
  | 'SHORT_YEAR'
  | 'INVALID_FORMAT'
  | 'INVALID_DATE';

export interface OcrFieldNormalizationResult {
  fieldType: OcrStructuredFieldType;
  input: string;
  value: string | null;
  status: OcrFieldNormalizationStatus;
  reason: OcrFieldNormalizationReason;
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
    reason: 'INVALID_FORMAT',
  };
}

function validResult(
  fieldType: OcrStructuredFieldType,
  input: string,
  value: string,
  reason:
    OcrFieldNormalizationReason =
      value === input
        ? 'NO_CHANGE'
        : 'FORMAT_NORMALIZATION',
): OcrFieldNormalizationResult {
  return {
    fieldType,
    input,
    value,
    status:
      value === input
        ? 'UNCHANGED'
        : 'NORMALIZED',
    reason:
      value === input
        ? 'NO_CHANGE'
        : reason,
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
    candidate === input
      ? 'NO_CHANGE'
      : 'NUMERIC_CONTEXT',
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

  /*
   * Los espacios alrededor de "-" son
   * únicamente presentación. Se eliminan
   * antes de validar el contrato TV.
   */
  const compact =
    input.replace(
      /\s*-\s*/g,
      '-',
    );

  const match =
    /^([A-Z0-9]{2})-([A-Z0-9]+)-([A-Z0-9]{4})$/
      .exec(
        compact,
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

  const numericChanged =
    sequence !== sequenceRaw
    || year !== yearRaw;

  return validResult(
    fieldType,
    input,
    candidate,
    candidate === input
      ? 'NO_CHANGE'
      : numericChanged
        ? 'NUMERIC_CONTEXT'
        : 'FORMAT_NORMALIZATION',
  );
}

function ambiguousShortYearResult(
  input: string,
): OcrFieldNormalizationResult {
  return {
    fieldType: 'DATE',
    input,
    value: null,
    status: 'AMBIGUOUS',
    reason: 'SHORT_YEAR',
  };
}


function invalidDateResult(
  input: string,
): OcrFieldNormalizationResult {
  return {
    fieldType: 'DATE',
    input,
    value: null,
    status: 'INVALID',
    reason: 'INVALID_DATE',
  };
}

/**
 * Contrato F11.7:
 * - DD/MM/YYYY exclusivamente;
 * - no expande años de dos dígitos;
 * - solo corrige confusiones OCR en componentes numéricos;
 * - valida fecha calendario real.
 */
export function normalizeDateOcrField(
  raw: string,
): OcrFieldNormalizationResult {
  const input =
    String(raw ?? '').trim();

  const compact =
    input.replace(
      /\s+/g,
      '',
    );

  const shortYearMatch =
    /^([A-Za-z0-9]{2})\/([A-Za-z0-9]{2})\/([A-Za-z0-9]{2})$/
      .exec(compact);

  if (shortYearMatch) {
    const [
      ,
      shortDayRaw,
      shortMonthRaw,
      shortYearRaw,
    ] = shortYearMatch;

    if (
      shortDayRaw
      && shortMonthRaw
      && shortYearRaw
    ) {
      const shortDay =
        normalizeNumericOcrCharacters(
          shortDayRaw,
        );

      const shortMonth =
        normalizeNumericOcrCharacters(
          shortMonthRaw,
        );

      const shortYear =
        normalizeNumericOcrCharacters(
          shortYearRaw,
        );

      if (
        /^\d{2}$/.test(shortDay)
        && /^\d{2}$/.test(shortMonth)
        && /^\d{2}$/.test(shortYear)
      ) {
        const day =
          Number(shortDay);

        const month =
          Number(shortMonth);

        /*
         * Se valida únicamente día/mes.
         * El siglo no se infiere.
         */
        const probe =
          new Date(
            Date.UTC(
              2000,
              month - 1,
              day,
            ),
          );

        if (
          probe.getUTCMonth() ===
            month - 1
          && probe.getUTCDate() === day
        ) {
          return ambiguousShortYearResult(
            input,
          );
        }
      }
    }
  }

  const match =
    /^([A-Za-z0-9]{2})\/([A-Za-z0-9]{2})\/([A-Za-z0-9]{4})$/
      .exec(compact);

  if (!match) {
    return invalidDateResult(
      input,
    );
  }

  const dayRaw = match[1];
  const monthRaw = match[2];
  const yearRaw = match[3];

  if (
    !dayRaw
    || !monthRaw
    || !yearRaw
  ) {
    return invalidDateResult(
      input,
    );
  }

  const dayText =
    normalizeNumericOcrCharacters(
      dayRaw,
    );

  const monthText =
    normalizeNumericOcrCharacters(
      monthRaw,
    );

  const yearText =
    normalizeNumericOcrCharacters(
      yearRaw,
    );

  if (
    !/^\d{2}$/.test(dayText)
    || !/^\d{2}$/.test(monthText)
    || !/^\d{4}$/.test(yearText)
  ) {
    return invalidDateResult(
      input,
    );
  }

  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !==
      month - 1
    || date.getUTCDate() !== day
  ) {
    return invalidDateResult(
      input,
    );
  }

  const candidate =
    `${dayText}/${monthText}/${yearText}`;

  const numericChanged =
    dayText !== dayRaw
    || monthText !== monthRaw
    || yearText !== yearRaw;

  return validResult(
    'DATE',
    input,
    candidate,
    candidate === input
      ? 'NO_CHANGE'
      : numericChanged
        ? 'NUMERIC_CONTEXT'
        : 'FORMAT_NORMALIZATION',
  );
}

/**
 * Contrato monetario MVP:
 *   Bs X.XXX,XX
 *
 * También acepta cantidades < 1000:
 *   Bs 850,10
 *
 * Reglas:
 * - Bs/Bs. debe existir;
 * - exactamente dos decimales;
 * - miles con grupos de tres;
 * - no reordena ni inventa separadores;
 * - solo normaliza espacios y confusiones OCR
 *   dentro del componente numérico.
 */
export function normalizeAmountOcrField(
  raw: string,
): OcrFieldNormalizationResult {
  const input =
    String(raw ?? '').trim();

  const match =
    /^Bs\.?\s+(.+)$/i.exec(
      input,
    );

  if (!match?.[1]) {
    return invalidResult(
      'AMOUNT',
      input,
    );
  }

  const numericRaw =
    match[1]
      .trim()
      .replace(
        /\s+/g,
        '',
      );

  const numeric =
    normalizeNumericOcrCharacters(
      numericRaw,
    );

  if (
    !/^\d{1,3}(?:\.\d{3})*,\d{2}$/
      .test(numeric)
  ) {
    return invalidResult(
      'AMOUNT',
      input,
    );
  }

  const candidate =
    `Bs ${numeric}`;

  return validResult(
    'AMOUNT',
    input,
    candidate,
    candidate === input
      ? 'NO_CHANGE'
      : numeric !== numericRaw
        ? 'NUMERIC_CONTEXT'
        : 'FORMAT_NORMALIZATION',
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

    case 'DATE':
      return normalizeDateOcrField(
        raw,
      );

    case 'AMOUNT':
      return normalizeAmountOcrField(
        raw,
      );
  }
}
