import { SHUTDOWN_STEP_TIMEOUT_MS } from './constants.js';
import logger from './logger.js';

/**
 * Run one shutdown step, swallowing both a rejection and a step that never
 * settles. Always resolves, so the caller can continue to the next step and to
 * `process.exit()` regardless of what happened here.
 *
 * The timeout is the point: `MqttProxy.stop()` waits for its TCP server to
 * close, and a TCP server does not close while a client still holds a
 * connection open. A device that is still connected would otherwise block the
 * exit until the runtime killed the container.
 */
export async function runShutdownStep(
  what: string,
  step: () => Promise<void>,
  timeoutMs: number = SHUTDOWN_STEP_TIMEOUT_MS,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      step(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
        // Never hold the event loop open on our own account.
        timer.unref();
      }),
    ]);
  } catch (error) {
    logger.error(`Error during shutdown while ${what}:`, error);
  } finally {
    clearTimeout(timer);
  }
}
