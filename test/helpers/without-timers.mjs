/**
 * Run a test body with `setTimeout` replaced by a timer that never fires.
 *
 * toast() keeps a timer that a fake page cannot end, and a test that leaves one pending keeps Node
 * waiting for it after the last assertion. A zero timer is what a promise or `settle()` never waits on.
 */
export async function withoutTimers(run) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    return await run();
  } finally {
    globalThis.setTimeout = real;
  }
}
