/**
 * Global API concurrency limiter.
 * Caps simultaneous catalogApi requests and adds a delay between launches
 * to avoid backend ThrottlerException, particularly under CGNAT where many
 * users share one IP and their request bursts overlap server-side.
 */
function makeLimiter(maxConcurrent: number, delayMs: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            if (queue.length > 0) {
              const next = queue.shift()!;
              if (delayMs > 0) setTimeout(next, delayMs);
              else next();
            }
          });
      };
      if (active < maxConcurrent) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

// 2 concurrent requests, 150 ms between each launch.
// 10 similar-product detail fetches → completes in ~5 × 150 ms + network time,
// spreading the burst rather than firing everything as fast as possible.
export const apiLimiter = makeLimiter(2, 150);
