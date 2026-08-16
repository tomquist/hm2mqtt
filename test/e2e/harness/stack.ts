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
        failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.entries = [];
    if (failures.length > 0) {
      throw new Error(`Teardown failed:\n${failures.join('\n')}`);
    }
  }
}
