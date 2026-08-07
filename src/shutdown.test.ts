import { runShutdownStep } from './shutdown.js';

describe('runShutdownStep', () => {
  test('awaits a step that resolves', async () => {
    let finished = false;
    await runShutdownStep('doing the thing', async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      finished = true;
    });
    expect(finished).toBe(true);
  });

  test('survives a step that rejects', async () => {
    await expect(
      runShutdownStep('doing the thing', async () => {
        throw new Error('nope');
      }),
    ).resolves.toBeUndefined();
  });

  test('survives a step that throws synchronously', async () => {
    await expect(
      runShutdownStep('doing the thing', () => {
        throw new Error('nope');
      }),
    ).resolves.toBeUndefined();
  });

  test('gives up on a step that never settles (regression: proxy stop blocked the exit)', async () => {
    // MqttProxy.stop() resolves only once its TCP server closes, which never
    // happens while a device still holds a connection open. Without the
    // timeout the shutdown handler awaits forever and process.exit() is never
    // reached, so the container is killed after the grace period instead.
    const start = Date.now();
    await expect(runShutdownStep('hanging', () => new Promise<void>(() => {}), 20)).resolves.toBe(
      undefined,
    );
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('does not wait out the timeout when the step finishes early', async () => {
    const start = Date.now();
    await runShutdownStep('quick', async () => {}, 60000);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
