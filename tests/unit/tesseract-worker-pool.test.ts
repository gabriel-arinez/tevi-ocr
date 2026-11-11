import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  TesseractWorkerPool,
  resolveSpanishLangPath,
} from '../../src/ocr/tesseract-worker-pool.js';

describe('TesseractWorkerPool', () => {
  let pool: TesseractWorkerPool | null = null;

  afterEach(async () => {
    if (pool) {
      await pool.terminate();
      pool = null;
    }
  });

  it('resuelve ruta de lenguaje español sin error', () => {
    const langPath = resolveSpanishLangPath();
    assert.match(langPath, /spa/);
  });

  it('reutiliza trabajadores dentro del límite maxWorkers', async () => {
    pool = new TesseractWorkerPool({ maxWorkers: 1 });
    const statsBefore = pool.stats;
    assert.equal(statsBefore.totalWorkers, 0);
    assert.equal(statsBefore.busyWorkers, 0);

    const result1 = await pool.runWithWorker(async (worker) => {
      assert.ok(worker);
      return 'job1';
    });
    assert.equal(result1, 'job1');
    assert.equal(pool.stats.totalWorkers, 1);
    assert.equal(pool.stats.busyWorkers, 0);

    const result2 = await pool.runWithWorker(async (worker) => {
      assert.ok(worker);
      return 'job2';
    });
    assert.equal(result2, 'job2');
    assert.equal(pool.stats.totalWorkers, 1);
  });

  it('recupera ante error en acción y recicla el trabajador dañado', async () => {
    pool = new TesseractWorkerPool({ maxWorkers: 1 });

    await assert.rejects(
      pool.runWithWorker(async () => {
        throw new Error('worker failed intentional');
      }),
      /worker failed intentional/,
    );

    // El trabajador con fallo debe haber sido removido/reciclado
    assert.equal(pool.stats.totalWorkers, 0);

    // El siguiente trabajo debe poder instanciar uno nuevo sanamente
    const nextResult = await pool.runWithWorker(async () => 'recovered');
    assert.equal(nextResult, 'recovered');
    assert.equal(pool.stats.totalWorkers, 1);
  });

  it('recicla trabajador cuando alcanza maxJobsPerWorker', async () => {
    pool = new TesseractWorkerPool({ maxWorkers: 1, maxJobsPerWorker: 2 });
    await pool.runWithWorker(async () => 'run1');
    assert.equal(pool.stats.totalWorkers, 1);

    await pool.runWithWorker(async () => 'run2');
    // Al finalizar el trabajo 2, se recicla (totalWorkers = 0)
    assert.equal(pool.stats.totalWorkers, 0);
  });

  it('rechaza nuevos trabajos cuando la piscina está terminada', async () => {
    pool = new TesseractWorkerPool({ maxWorkers: 1 });
    await pool.terminate();

    await assert.rejects(
      pool.runWithWorker(async () => 'fail'),
      /terminated/,
    );
  });
});
