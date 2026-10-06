const fs =
  require('node:fs');

function escapePdfText(
  value,
) {
  return value
    .replaceAll(
      '\\',
      '\\\\',
    )
    .replaceAll(
      '(',
      '\\(',
    )
    .replaceAll(
      ')',
      '\\)',
    );
}

function createStream(
  lines,
) {
  const commands = [
    'BT',
    '/F1 22 Tf',
    '72 760 Td',
  ];

  lines.forEach(
    (line, index) => {
      if (index > 0) {
        commands.push(
          '0 -45 Td',
        );
      }

      commands.push(
        `(${escapePdfText(line)}) Tj`,
      );
    },
  );

  commands.push(
    'ET',
    '',
  );

  return commands.join('\n');
}

function buildPdf(
  pages,
) {
  const pageCount =
    pages.length;

  const fontId =
    3 + pageCount * 2;

  const objects =
    new Array(
      fontId + 1,
    );

  objects[1] = [
    '<<',
    '/Type /Catalog',
    '/Pages 2 0 R',
    '>>',
  ].join('\n');

  const pageIds =
    Array.from(
      {
        length:
          pageCount,
      },
      (
        _,
        index,
      ) =>
        3 + index,
    );

  objects[2] = [
    '<<',
    '/Type /Pages',
    `/Kids [${pageIds.map(
      (id) =>
        `${id} 0 R`,
    ).join(' ')}]`,
    `/Count ${pageCount}`,
    '>>',
  ].join('\n');

  pages.forEach(
    (
      lines,
      index,
    ) => {
      const pageId =
        3 + index;

      const contentId =
        3 +
        pageCount +
        index;

      const stream =
        createStream(
          lines,
        );

      objects[pageId] = [
        '<<',
        '/Type /Page',
        '/Parent 2 0 R',
        '/MediaBox [0 0 595 842]',
        '/Resources <<',
        '  /Font <<',
        `    /F1 ${fontId} 0 R`,
        '  >>',
        '>>',
        `/Contents ${contentId} 0 R`,
        '>>',
      ].join('\n');

      objects[contentId] = [
        `<< /Length ${Buffer.byteLength(
          stream,
          'binary',
        )} >>`,
        'stream',
        stream,
        'endstream',
      ].join('\n');
    },
  );

  objects[fontId] = [
    '<<',
    '/Type /Font',
    '/Subtype /Type1',
    '/BaseFont /Helvetica',
    '>>',
  ].join('\n');

  let pdf =
    '%PDF-1.4\n';

  const offsets = [0];

  for (
    let id = 1;
    id < objects.length;
    id += 1
  ) {
    offsets[id] =
      Buffer.byteLength(
        pdf,
        'binary',
      );

    pdf +=
      `${id} 0 obj\n` +
      `${objects[id]}\n` +
      'endobj\n';
  }

  const xrefOffset =
    Buffer.byteLength(
      pdf,
      'binary',
    );

  pdf +=
    `xref\n` +
    `0 ${objects.length}\n` +
    '0000000000 65535 f \n';

  for (
    let id = 1;
    id < objects.length;
    id += 1
  ) {
    pdf +=
      `${String(
        offsets[id],
      ).padStart(
        10,
        '0',
      )} 00000 n \n`;
  }

  pdf += [
    'trailer',
    `<< /Size ${objects.length} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n');

  return Buffer.from(
    pdf,
    'binary',
  );
}

function writePdf(
  filename,
  pages,
) {
  fs.writeFileSync(
    filename,
    buildPdf(pages),
  );

  console.log(
    `OK: ${filename}`,
  );
}

writePdf(
  'tests/fixtures/printed/printed-clean.pdf',
  [
    [
      'SERVICIO DE IMPUESTOS NACIONALES',
      'Referencia: Reclamo tributario 2026',
      'NIT: 1020304050',
      'Codigo: TEVI-001-2026',
    ],
  ],
);

writePdf(
  'tests/fixtures/printed/printed-two-pages.pdf',
  [
    [
      'SERVICIO DE IMPUESTOS NACIONALES',
      'PAGINA UNO',
      'NIT: 1020304050',
    ],
    [
      'SEGUNDA PAGINA DEL DOCUMENTO',
      'PAGINA DOS',
      'Codigo: TEVI-002-2026',
    ],
  ],
);

writePdf(
  'tests/fixtures/printed/printed-four-pages.pdf',
  [
    ['PAGINA UNO'],
    ['PAGINA DOS'],
    ['PAGINA TRES'],
    ['PAGINA CUATRO'],
  ],
);
