import path from 'node:path';
import { createRequire } from 'node:module';
import { createWorker, OEM, type Worker } from 'tesseract.js';

const require = createRequire(__filename);

export function resolveSpanishLangPath(): string {
  const modulePath = require.resolve('@tesseract.js-data/spa');
  return path.join(path.dirname(modulePath), '4.0.0');
}

export interface WorkerPoolOptions {
  maxWorkers?: number;
  maxJobsPerWorker?: number;
  acquireTimeoutMs?: number;
  idleTimeoutMs?: number;
}

interface PooledWorkerEntry {
  worker: Worker;
  jobCount: number;
  busy: boolean;
  createdAt: number;
  idleTimer?: NodeJS.Timeout;
}

export class TesseractWorkerPool {
  private readonly maxWorkers: number;
  private readonly maxJobsPerWorker: number;
  private readonly acquireTimeoutMs: number;
  private readonly idleTimeoutMs: number;
  private readonly workers: PooledWorkerEntry[] = [];
  private readonly waitQueue: Array<{
    resolve: (entry: PooledWorkerEntry) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private isTerminated = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.maxWorkers = Math.max(1, options.maxWorkers ?? 2);
    this.maxJobsPerWorker = Math.max(1, options.maxJobsPerWorker ?? 50);
    this.acquireTimeoutMs = Math.max(1000, options.acquireTimeoutMs ?? 30000);
    this.idleTimeoutMs = options.idleTimeoutMs ?? (process.env.NODE_ENV === 'test' ? 100 : 10000);
  }

  private async createNewWorker(): Promise<Worker> {
    return createWorker('spa', OEM.LSTM_ONLY, {
      langPath: resolveSpanishLangPath(),
      gzip: true,
      cacheMethod: 'none',
      logger: () => undefined,
    });
  }

  private async acquire(): Promise<PooledWorkerEntry> {
    if (this.isTerminated) {
      throw new Error('Worker pool is terminated');
    }

    // 1. Look for an idle worker
    const idleEntry = this.workers.find(w => !w.busy);
    if (idleEntry) {
      if (idleEntry.idleTimer) {
        clearTimeout(idleEntry.idleTimer);
        idleEntry.idleTimer = undefined;
      }
      idleEntry.busy = true;
      return idleEntry;
    }

    // 2. If under maxWorkers, spawn a new worker
    if (this.workers.length < this.maxWorkers) {
      const placeholder: PooledWorkerEntry = {
        worker: null as unknown as Worker,
        jobCount: 0,
        busy: true,
        createdAt: Date.now(),
      };
      this.workers.push(placeholder);

      try {
        const worker = await this.createNewWorker();
        placeholder.worker = worker;
        return placeholder;
      } catch (error) {
        const idx = this.workers.indexOf(placeholder);
        if (idx !== -1) {
          this.workers.splice(idx, 1);
        }
        throw error;
      }
    }

    // 3. Queue request until a worker becomes free
    return new Promise<PooledWorkerEntry>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex(q => q.resolve === resolve);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
          reject(new Error(`Timeout waiting for Tesseract worker (${this.acquireTimeoutMs}ms)`));
        }
      }, this.acquireTimeoutMs);

      this.waitQueue.push({ resolve, reject, timer });
    });
  }

  private async release(entry: PooledWorkerEntry, hasError = false): Promise<void> {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }

    entry.jobCount += 1;
    const shouldRecycle = hasError || entry.jobCount >= this.maxJobsPerWorker || this.isTerminated;

    if (shouldRecycle) {
      const idx = this.workers.indexOf(entry);
      if (idx !== -1) {
        this.workers.splice(idx, 1);
      }
      try {
        if (entry.worker) {
          await entry.worker.terminate();
        }
      } catch {
        // ignore termination errors during recycle
      }
    } else {
      entry.busy = false;
      if (this.idleTimeoutMs > 0) {
        entry.idleTimer = setTimeout(async () => {
          if (!entry.busy) {
            const idx = this.workers.indexOf(entry);
            if (idx !== -1) {
              this.workers.splice(idx, 1);
            }
            try {
              if (entry.worker) {
                await entry.worker.terminate();
              }
            } catch {
              // ignore
            }
          }
        }, this.idleTimeoutMs);
        entry.idleTimer.unref();
      }
    }

    // If there is work waiting in queue, fulfill it
    if (!this.isTerminated && this.waitQueue.length > 0) {
      const nextInQueue = this.waitQueue.shift();
      if (nextInQueue) {
        clearTimeout(nextInQueue.timer);
        this.acquire().then(nextInQueue.resolve).catch(nextInQueue.reject);
      }
    }
  }

  async runWithWorker<T>(action: (worker: Worker) => Promise<T>): Promise<T> {
    const entry = await this.acquire();
    let errorOccurred = false;
    try {
      return await action(entry.worker);
    } catch (err) {
      errorOccurred = true;
      throw err;
    } finally {
      await this.release(entry, errorOccurred);
    }
  }

  async terminate(): Promise<void> {
    this.isTerminated = true;

    while (this.waitQueue.length > 0) {
      const item = this.waitQueue.shift();
      if (item) {
        clearTimeout(item.timer);
        item.reject(new Error('Worker pool terminated'));
      }
    }

    const activeEntries = [...this.workers];
    this.workers.length = 0;

    await Promise.allSettled(
      activeEntries.map(e => (e.worker ? e.worker.terminate() : Promise.resolve())),
    );
  }

  get stats() {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queuedRequests: this.waitQueue.length,
      isTerminated: this.isTerminated,
    };
  }
}

// Global default pool instance for shared reuse
let defaultPool: TesseractWorkerPool | null = null;

export function getDefaultWorkerPool(): TesseractWorkerPool {
  if (!defaultPool || defaultPool.stats.isTerminated) {
    defaultPool = new TesseractWorkerPool({
      maxWorkers: process.env.NODE_ENV === 'test' ? 1 : 2,
      maxJobsPerWorker: 50,
    });
  }
  return defaultPool;
}

export async function shutdownDefaultWorkerPool(): Promise<void> {
  if (defaultPool) {
    const pool = defaultPool;
    defaultPool = null;
    await pool.terminate();
  }
}
