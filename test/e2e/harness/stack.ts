const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * A teardown stack.
 *
 * Every process and connection an end-to-end scenario starts is registered
 * here, and `stopAll` shuts them down in reverse order — including when the
 * scenario failed halfway through. A stray broker or Home Assistant process
 * would otherwise poison every later run, which is the classic way end-to-end
 * suites become unreliable.
 */
export class Stack {
  private entries: Array<{ name: string; stop: () => Promise<void> | void }> = [];

  add<T extends { stop: () => Promise<void> | void }>(name: string, resource: T): T {
    this.entries.push({ name, stop: () => resource.stop() });
    return resource;
  }

  /** Stop everything, newest first. Reports every failure, hides none. */
  async stopAll(): Promise<void> {
    const failures: string[] = [];
    for (const entry of [...this.entries].reverse()) {
      try {
        await entry.stop();
      } catch (error) {
        failures.push(`${entry.name}: ${describeError(error)}`);
      }
    }
    this.entries = [];
    if (failures.length > 0) {
      throw new Error(`Teardown failed:\n${failures.join('\n')}`);
    }
  }
}

/**
 * Stop a process whose start failed, then rethrow the start failure.
 *
 * A process that failed to start is never added to a Stack, so this is its only
 * teardown. If stopping it fails as well, both failures are reported: the start
 * failure explains the run, and the process left behind explains whatever goes
 * wrong in the next scenario.
 */
export async function abandonStart(startError: unknown, stop: () => Promise<void>): Promise<never> {
  try {
    await stop();
  } catch (stopError) {
    throw new Error(
      `${describeError(startError)}\nStopping the process afterwards failed too: ${describeError(stopError)}`,
    );
  }
  throw startError;
}
