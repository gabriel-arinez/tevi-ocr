import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const BASE_TEXT = [
  'SERVICIO DE IMPUESTOS NACIONALES',
  '',
  'Referencia: Reclamo tributario gestión 2026',
  '',
  'El contribuyente solicita la revisión de un cobro duplicado.',
  'El importe observado es de Bs 3.850,50.',
  'NIT: 1020304050',
  'Código de trámite: TEVI-001-2026',
  'Fecha: 06/10/2026',
  '',
  'Se adjunta documentación de respaldo para su evaluación.',
].join('\n');

const CONFUSING_TEXT = [
  'PRUEBA DE CARACTERES SIMILARES',
  '',
  'O0O0  I1I1  l1l1  S5S5  B8B8  Z2Z2',
  'NIT: 1010010101',
  'Código: OI1L-05S8-Z220',
  'Monto: Bs 8.505,10',
  'Gestión: 2026',
].join('\n');

function escapeXml(
  value: string,
): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textToSvg(
  text: string,
  options: {
    foreground?: string;
    background?: string;
  } = {},
): Buffer {
  const foreground =
    options.foreground ?? '#111111';

  const background =
    options.background ?? '#ffffff';

  const lines =
    text.split('\n');

  const lineHeight = 58;
  const startY = 120;

  const tspans =
    lines
      .map((line, index) => {
        const y =
          startY + index * lineHeight;

        return line
          ? `<text x="100" y="${y}" font-family="DejaVu Sans" font-size="38" fill="${foreground}">${escapeXml(line)}</text>`
          : '';
      })
      .join('\n');

  return Buffer.from(`
    <svg
      width="1800"
      height="1000"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        width="100%"
        height="100%"
        fill="${background}"
      />
      ${tspans}
    </svg>
  `);
}

async function ensureDirectories(): Promise<void> {
  await Promise.all([
    fs.mkdir(
      'tests/fixtures/printed',
      { recursive: true },
    ),
    fs.mkdir(
      'tests/fixtures/degraded',
      { recursive: true },
    ),
    fs.mkdir(
      'benchmark/ground-truth',
      { recursive: true },
    ),
  ]);
}

async function generateClean(
  text: string,
): Promise<Buffer> {
  return sharp(
    textToSvg(text),
    {
      density: 144,
    },
  )
    .png()
    .toBuffer();
}

async function addDeterministicNoise(
  input: Buffer,
): Promise<Buffer> {
  const {
    data,
    info,
  } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });

  let state = 0x1a2b3c4d;

  const random = (): number => {
    state =
      (Math.imul(state, 1664525) +
        1013904223) >>> 0;

    return state / 0xffffffff;
  };

  for (
    let i = 0;
    i < data.length;
    i += info.channels
  ) {
    if (random() < 0.018) {
      const value =
        random() < 0.5
          ? 35
          : 220;

      for (
        let channel = 0;
        channel < info.channels;
        channel += 1
      ) {
        data[i + channel] = value;
      }
    }
  }

  return sharp(
    data,
    {
      raw: info,
    },
  )
    .withMetadata({
      density: 144,
    })
    .png()
    .toBuffer();
}

async function main(): Promise<void> {
  await ensureDirectories();

  const clean =
    await generateClean(BASE_TEXT);

  const confusing =
    await generateClean(
      CONFUSING_TEXT,
    );

  await fs.writeFile(
    'tests/fixtures/printed/printed-clean.png',
    clean,
  );

  await fs.writeFile(
    'tests/fixtures/printed/confusing-characters.png',
    confusing,
  );

  const lowContrast =
    await sharp(
      textToSvg(
        BASE_TEXT,
        {
          foreground: '#aaaaaa',
          background: '#f5f5f5',
        },
      ),
      {
        density: 144,
      },
    )
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/low-contrast.png',
    lowContrast,
  );

  const noisy =
    await addDeterministicNoise(clean);

  await fs.writeFile(
    'tests/fixtures/degraded/noisy.png',
    noisy,
  );

  const lowResolution =
    await sharp(clean)
      .resize({
        width: 480,
      })
      .resize({
        width: 1800,
      })
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/low-resolution.png',
    lowResolution,
  );

  const rotated =
    await sharp(clean)
      .rotate(
        4,
        {
          background: '#ffffff',
        },
      )
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/rotated.png',
    rotated,
  );

  const gaussianBlur =
    await sharp(clean)
      .blur(2.2)
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/gaussian-blur.png',
    gaussianBlur,
  );

  const jpegArtifacts =
    await sharp(clean)
      .jpeg({
        quality: 28,
        chromaSubsampling: '4:2:0',
      })
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/jpeg-artifacts.png',
    jpegArtifacts,
  );

  const strongLowResolution =
    await sharp(clean)
      .resize({
        width: 260,
      })
      .resize({
        width: 1800,
      })
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/strong-low-resolution.png',
    strongLowResolution,
  );

  const rotation8 =
    await sharp(clean)
      .rotate(
        8,
        {
          background: '#ffffff',
        },
      )
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/rotation-8deg.png',
    rotation8,
  );

  const unevenSvg = Buffer.from(`
    <svg
      width="1800"
      height="1000"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="light"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop
            offset="0%"
            stop-color="#ffffff"
            stop-opacity="0"
          />
          <stop
            offset="100%"
            stop-color="#000000"
            stop-opacity="0.45"
          />
        </linearGradient>
      </defs>

      <image
        href="data:image/png;base64,${clean.toString('base64')}"
        width="1800"
        height="1000"
      />

      <rect
        width="100%"
        height="100%"
        fill="url(#light)"
      />
    </svg>
  `);

  const unevenLight =
    await sharp(
      unevenSvg,
      {
        density: 144,
      },
    )
      .png()
      .toBuffer();

  await fs.writeFile(
    'tests/fixtures/degraded/uneven-light.png',
    unevenLight,
  );

  const mixedNoiseBase =
    await sharp(clean)
      .blur(0.7)
      .jpeg({
        quality: 45,
      })
      .png()
      .toBuffer();

  const mixedNoise =
    await addDeterministicNoise(
      mixedNoiseBase,
    );

  await fs.writeFile(
    'tests/fixtures/degraded/mixed-noise.png',
    mixedNoise,
  );

  const baseCases = [
    'printed-clean',
    'low-contrast',
    'noisy',
    'low-resolution',
    'rotated',
    'gaussian-blur',
    'jpeg-artifacts',
    'strong-low-resolution',
    'rotation-8deg',
    'uneven-light',
    'mixed-noise',
  ];

  await Promise.all(
    baseCases.map(
      (id) =>
        fs.writeFile(
          path.join(
            'benchmark/ground-truth',
            `${id}.txt`,
          ),
          `${BASE_TEXT}\n`,
          'utf8',
        ),
    ),
  );

  await fs.writeFile(
    'benchmark/ground-truth/confusing-characters.txt',
    `${CONFUSING_TEXT}\n`,
    'utf8',
  );

  console.log(
    'Corpus baseline generado correctamente.',
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
