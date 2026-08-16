export interface WaitOptions {
  /** How long to keep trying. */
  timeoutMs?: number;
  /** How long to pause between attempts. */
  intervalMs?: number;
  /**
   * Extra context appended to the timeout message, e.g. the tail of a log.
   * A timeout without this is nearly useless in CI.
   */
  diagnose?: () => string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll until `probe` returns something other than undefined/false.
 *
 * Scenarios never sleep for a fixed time: they wait for the condition they
 * actually depend on, so a slow CI runner is slow rather than flaky.
 */
export async function waitFor<T>(
  description: string,
  probe: () => T | undefined | false | Promise<T | undefined | false>,
  { timeoutMs = 60_000, intervalMs = 250, diagnose }: WaitOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      const result = await probe();
      if (result !== undefined && result !== false) {
        return result;
      }
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      const cause = lastError instanceof Error ? `\nLast error: ${lastError.message}` : '';
      const context = diagnose ? `\n${diagnose()}` : '';
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${description}.${cause}${context}`,
      );
    }
    await sleep(intervalMs);
  }
}

/** The last `count` lines of `text`, for timeout diagnostics. */
export function tail(text: string, count = 25): string {
  const lines = text.trimEnd().split('\n');
  return lines.slice(-count).join('\n');
}
