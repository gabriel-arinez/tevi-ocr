import fs from 'node:fs/promises';

import sharp from 'sharp';

interface HandwritingSample {
  id: string;
  category: string;
  fixturePath: string;
  groundTruthPath: string;
  writerId: string;
  capture: string;
}

async function exists(
  filename: string,
): Promise<boolean> {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const manifest =
    JSON.parse(
      await fs.readFile(
        'benchmark/handwriting-manifest.json',
        'utf8',
      ),
    ) as HandwritingSample[];

  let failures = 0;
  let complete = 0;

  for (const sample of manifest) {
    const fixtureExists =
      await exists(sample.fixturePath);

    const groundTruthExists =
      await exists(sample.groundTruthPath);

    console.log();
    console.log(`===== ${sample.id} =====`);

    if (!fixtureExists) {
      console.log(
        `MISSING_FIXTURE ${sample.fixturePath}`,
      );
    }

    if (!groundTruthExists) {
      console.log(
        `MISSING_GROUND_TRUTH ${sample.groundTruthPath}`,
      );
    }

    if (
      !fixtureExists ||
      !groundTruthExists
    ) {
      continue;
    }

    try {
      const metadata =
        await sharp(
          sample.fixturePath,
        ).metadata();

      if (
        !metadata.width ||
        !metadata.height
      ) {
        throw new Error(
          'La imagen no tiene dimensiones válidas.',
        );
      }

      const groundTruth =
        await fs.readFile(
          sample.groundTruthPath,
          'utf8',
        );

      if (!groundTruth.trim()) {
        throw new Error(
          'Ground truth vacío.',
        );
      }

      console.log(
        `OK image=${metadata.width}x${metadata.height}`,
      );

      console.log(
        `OK groundTruthChars=${groundTruth.trim().length}`,
      );

      complete += 1;
    } catch (error) {
      failures += 1;

      console.log(
        'INVALID',
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  console.log();
  console.log('==============================');
  console.log(`TOTAL=${manifest.length}`);
  console.log(`COMPLETE=${complete}`);
  console.log(
    `PENDING=${manifest.length - complete}`,
  );
  console.log(`INVALID=${failures}`);

  const pending =
    manifest.length - complete;

  if (
    failures > 0 ||
    pending > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
