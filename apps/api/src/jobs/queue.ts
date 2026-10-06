/**
 * In-process FIFO job queue with concurrency 1.
 *
 * Cloning and analysing a large repository takes minutes; running one job at a
 * time keeps DB writes and disk I/O predictable while the UI polls job status.
 */
export interface JobQueue {
  enqueue(task: () => Promise<void>): void;
  /** Number of tasks waiting or running (test/introspection helper). */
  size(): number;
  /** Resolves when the queue is drained (test helper). */
  idle(): Promise<void>;
}

export function createQueue(): JobQueue {
  const pending: Array<() => Promise<void>> = [];
  let running = false;
  const idleWaiters: Array<() => void> = [];

  function runNext(): void {
    if (running) return;
    const task = pending.shift();
    if (!task) {
      while (idleWaiters.length) idleWaiters.shift()!();
      return;
    }
    running = true;
    void task()
      .catch(() => {
        // Pipeline tasks handle and persist their own errors; never let one
        // rejection break the queue.
      })
      .finally(() => {
        running = false;
        runNext();
      });
  }

  return {
    enqueue(task: () => Promise<void>): void {
      pending.push(task);
      runNext();
    },

    size(): number {
      return pending.length + (running ? 1 : 0);
    },

    idle(): Promise<void> {
      if (!running && pending.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}
