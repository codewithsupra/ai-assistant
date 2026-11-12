// Runs conversation turns in the background.
// - Turns for the same conversation run one at a time, in arrival order (a second message waits for the first answer).
// - Different conversations run in parallel, up to `maxConcurrent`, so one busy user cannot starve the rest.
// - `drain()` lets a shutting-down server finish what is already running.
export const createTurnQueue = ({ maxConcurrent = 4 }: { maxConcurrent?: number } = {}) => {
  const tails = new Map<string, Promise<void>>();
  const inflight = new Set<Promise<void>>();
  const waiting: Array<() => void> = [];
  let running = 0;

  const acquire = () =>
    new Promise<void>((resolve) => {
      if (running < maxConcurrent) {
        running++;
        resolve();
      } else {
        waiting.push(() => {
          running++;
          resolve();
        });
      }
    });

  const release = () => {
    running--;
    waiting.shift()?.();
  };

  const enqueue = (conversationKey: string, job: () => Promise<void>) => {
    const previous = tails.get(conversationKey) ?? Promise.resolve();
    const run = previous.then(async () => {
      await acquire();
      try {
        await job();
      } catch (err) {
        console.error("Turn failed:", err instanceof Error ? err.message : "unknown");
      } finally {
        release();
      }
    });
    tails.set(conversationKey, run);
    inflight.add(run);
    void run.finally(() => {
      inflight.delete(run);
      if (tails.get(conversationKey) === run) tails.delete(conversationKey);
    });
  };

  return {
    enqueue,
    pending: () => inflight.size,
    drain: async () => {
      await Promise.allSettled([...inflight]);
    },
  };
};

export type TurnQueue = ReturnType<typeof createTurnQueue>;
