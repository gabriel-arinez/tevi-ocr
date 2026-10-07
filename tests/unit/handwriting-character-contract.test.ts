import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bboxFromHandwritingCut,
  reconstructHandwritingText,
  validateHandwritingCharacter,
  validateHandwritingLine,
  type HandwritingCharacterCut,
  type HandwritingCharacterResult,
} from '../../src/ocr/handwriting-character-contract.js';


const cut =
  [
    {
      x: 10,
      y: 2,
    },
    {
      x: 10,
      y: 40,
    },
    {
      x: 25,
      y: 40,
    },
    {
      x: 25,
      y: 2,
    },
  ] as const satisfies
    HandwritingCharacterCut;


function character(
  overrides:
    Partial<HandwritingCharacterResult> = {},
): HandwritingCharacterResult {
  return {
    lineNumber:
      1,
    characterIndex:
      0,
    char:
      'A',
    cut,
    bbox: {
      x1: 10,
      y1: 2,
      x2: 25,
      y2: 40,
    },
    confidence:
      0.93,
    ...overrides,
  };
}


test(
  'deriva bbox exactamente del cut Kraken',
  () => {
    assert.deepEqual(
      bboxFromHandwritingCut(
        cut,
      ),
      {
        x1: 10,
        y1: 2,
        x2: 25,
        y2: 40,
      },
    );
  },
);


test(
  'acepta cut Kraken de ancho cero',
  () => {
    const zeroWidth =
      [
        {
          x: 39,
          y: 0,
        },
        {
          x: 39,
          y: 228,
        },
        {
          x: 39,
          y: 228,
        },
        {
          x: 39,
          y: 0,
        },
      ] as const satisfies
        HandwritingCharacterCut;

    const item =
      character({
        cut:
          zeroWidth,
        bbox: {
          x1: 39,
          y1: 0,
          x2: 39,
          y2: 228,
        },
      });

    assert.equal(
      validateHandwritingCharacter(
        item,
      ),
      true,
    );
  },
);


test(
  'preserva carácter Unicode combinante',
  () => {
    const accent =
      character({
        char:
          '\u0301',
      });

    assert.equal(
      Array.from(
        accent.char,
      ).length,
      1,
    );

    assert.equal(
      validateHandwritingCharacter(
        accent,
      ),
      true,
    );
  },
);


test(
  'rechaza confidence fuera de rango',
  () => {
    assert.equal(
      validateHandwritingCharacter(
        character({
          confidence:
            1.01,
        }),
      ),
      false,
    );

    assert.equal(
      validateHandwritingCharacter(
        character({
          confidence:
            -0.01,
        }),
      ),
      false,
    );
  },
);


test(
  'rechaza bbox que no corresponde al cut',
  () => {
    assert.equal(
      validateHandwritingCharacter(
        character({
          bbox: {
            x1: 10,
            y1: 2,
            x2: 26,
            y2: 40,
          },
        }),
      ),
      false,
    );
  },
);


test(
  'reconstruye prediction sin normalizar Unicode',
  () => {
    const chars = [
      character({
        characterIndex:
          0,
        char:
          'o',
      }),
      character({
        characterIndex:
          1,
        char:
          '\u0301',
      }),
    ];

    const reconstructed =
      reconstructHandwritingText(
        chars,
      );

    assert.equal(
      reconstructed,
      'o\u0301',
    );

    assert.notEqual(
      reconstructed,
      reconstructed.normalize(
        'NFC',
      ),
    );
  },
);


test(
  'valida alineamiento índice-línea-texto',
  () => {
    const chars = [
      character({
        characterIndex:
          0,
        char:
          'A',
      }),
      character({
        characterIndex:
          1,
        char:
          ' ',
      }),
      character({
        characterIndex:
          2,
        char:
          'B',
      }),
    ];

    assert.equal(
      validateHandwritingLine({
        lineNumber:
          1,
        prediction:
          'A B',
        characters:
          chars,
      }),
      true,
    );
  },
);


test(
  'rechaza línea si la reconstrucción difiere de prediction',
  () => {
    assert.equal(
      validateHandwritingLine({
        lineNumber:
          1,
        prediction:
          'AB',
        characters: [
          character({
            characterIndex:
              0,
            char:
              'A',
          }),
        ],
      }),
      false,
    );
  },
);


test(
  'rechaza índice de carácter desalineado',
  () => {
    assert.equal(
      validateHandwritingLine({
        lineNumber:
          1,
        prediction:
          'A',
        characters: [
          character({
            characterIndex:
              4,
          }),
        ],
      }),
      false,
    );
  },
);
