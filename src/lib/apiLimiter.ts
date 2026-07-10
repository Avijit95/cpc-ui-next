/**
 * Global API concurrency limiter.
 * Caps simultaneous catalogApi requests to avoid backend ThrottlerException.
 */
function makeLimiter(maxConcurrent: number) {
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
            if (queue.length > 0) queue.shift()!();
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

export const apiLimiter = makeLimiter(3);
