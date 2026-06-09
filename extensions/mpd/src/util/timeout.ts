// Bounded-time wrapper for promises that talk to MPD.
//
// Background: MPD's protocol thread can block briefly during stream
// transitions (closing one curl input, opening another). When a UI action
// awaits such a command and MPD does not respond, the whole view freezes
// until the OS-level socket timeout — which is far too long to be usable.
//
// `withTimeout` races a promise against a timer; if the timer fires first,
// the promise is rejected with a TimeoutError. The underlying operation is
// NOT cancelled (Promise has no cancellation primitive in standard JS); we
// rely on callers to drop the result and on `withClient` to disconnect its
// socket so the orphan request doesn't keep state in flight.

export class TimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = ms;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function isTimeoutError(e: unknown): e is TimeoutError {
  return e instanceof TimeoutError;
}
