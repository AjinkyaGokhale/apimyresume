import PQueue from "p-queue";
import { config } from "../config.ts";
import { log } from "../lib/log.ts";
import { renderTimeout } from "../lib/errors.ts";
import { RenderWorker, type RenderInput, type RenderOutput } from "./worker.ts";

/**
 * Typst worker pool (spec §9). Holds RENDER_WORKERS isolated NodeCompiler
 * instances behind a p-queue whose concurrency equals the worker count, so
 * concurrent requests are queued — never dropped. Each job is assigned exactly
 * one worker via round-robin; the worker returns to the pool after its
 * evictCache completes.
 *
 * Note: the napi `pdf()` call is synchronous, so this pool serialises CPU work
 * on the JS thread. The p-queue/round-robin structure matches the spec and is
 * the seam where worker_threads could later add true multi-core parallelism.
 */
export interface HealthStats {
  workers_total: number;
  workers_busy: number;
  queue_depth: number;
  status: "ok" | "degraded";
}

class WorkerPool {
  private workers: RenderWorker[] = [];
  private available: RenderWorker[] = [];
  private queue: PQueue;
  private busy = 0;
  private started = false;

  constructor() {
    this.queue = new PQueue({ concurrency: 1 });
  }

  /** Initialise the pool at API startup. Idempotent. */
  init(): void {
    if (this.started) return;
    const count = Math.max(config.renderWorkers, 1);

    // The compiler reads the vendored package cache path from the environment;
    // ensure it's set before any NodeCompiler is created (spec §10).
    process.env.TYPST_PACKAGE_CACHE_PATH ??= config.typstCachePath;

    for (let i = 0; i < count; i++) {
      const w = new RenderWorker(i);
      this.workers.push(w);
      this.available.push(w);
    }
    this.queue = new PQueue({ concurrency: count });
    this.started = true;
    log.info("Typst worker pool initialised", { workers: count, cache: config.typstCachePath });
  }

  /**
   * Enqueue a render job. Resolves with the PDF buffer; rejects with an
   * AppError on compilation failure or timeout. The worker is always returned
   * to the pool (evictCache already ran inside RenderWorker.render).
   */
  async render(input: RenderInput): Promise<RenderOutput> {
    if (!this.started) this.init();

    const result = await this.queue.add(() => this.runOnWorker(input));
    // p-queue's add() can resolve to void when the queue is cleared; guard it.
    if (!result) throw renderTimeout();
    return result;
  }

  private async runOnWorker(input: RenderInput): Promise<RenderOutput> {
    const worker = this.available.pop();
    if (!worker) {
      // Should never happen: concurrency === worker count.
      throw new Error("No available render worker");
    }
    this.busy++;
    try {
      return await this.withTimeout(worker, input);
    } finally {
      this.busy--;
      this.available.push(worker);
    }
  }

  /**
   * Run a render with a wall-clock timeout (spec §19). The synchronous compile
   * cannot be interrupted mid-flight, but the timeout still bounds how long a
   * caller waits and frees the slot deterministically.
   */
  private withTimeout(worker: RenderWorker, input: RenderInput): Promise<RenderOutput> {
    return new Promise<RenderOutput>((resolve, reject) => {
      const timer = setTimeout(() => reject(renderTimeout()), config.renderTimeoutMs);
      // Defer to a microtask so the timer is armed before the sync render runs.
      queueMicrotask(() => {
        try {
          const out = worker.render(input);
          resolve(out);
        } catch (err) {
          reject(err);
        } finally {
          clearTimeout(timer);
        }
      });
    });
  }

  health(): HealthStats {
    const total = this.workers.length;
    const available = total - this.busy;
    return {
      workers_total: total,
      workers_busy: this.busy,
      queue_depth: this.queue.size,
      status: available * 2 >= total ? "ok" : "degraded",
    };
  }
}

export const workerPool = new WorkerPool();
