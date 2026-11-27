import { e2eFixtures } from '../../fixtures/devices.js';
import {
  generateCommunicationDiscovery,
  communicationStateTopic,
} from '../../../src/communicationDiscovery.js';
import type { CommunicationStats } from '../../../src/communicationDiagnostics.js';
import { canRunScenarios, entitySlug, startRig, waitFor } from '../harness/index.js';
import type { Rig } from '../harness/index.js';

const describeE2e = canRunScenarios() ? describe : describe.skip;

describeE2e('communication diagnostics', () => {
  let rig: Rig;

  afterAll(async () => {
    await rig?.stop();
  });

  test('reports communication loss and recovery through MQTT and Home Assistant', async () => {
    const fixture = e2eFixtures[0];

    rig = await startRig({
      name: 'communication',
      fixtures: [fixture],
      communicationDiagnostics: true,
      pollingIntervalSeconds: 15,
    });

    const device = rig.devices[0];
    const identity = {
      deviceType: device.deviceType,
      deviceId: device.deviceId,
    };

    const publishTopic = `hm2mqtt/${device.deviceType}/device/${device.deviceId}`;

    const stateTopic = communicationStateTopic(publishTopic);

    const configs = generateCommunicationDiscovery(
      identity,
      publishTopic,
      'hm2mqtt',
      'homeassistant',
      true,
    );

    expect(configs).toHaveLength(5);

    // Simulate a user who has enabled the diagnostic entities.
    // Seed enabled configs before the runtime advertises its
    // default-disabled configs. Existing entities should keep
    // their enabled registry state.
    for (const { topic, config } of configs) {
      expect(config).not.toBeNull();

      await rig.probe.publish(
        topic,
        JSON.stringify({
          ...config,
          enabled_by_default: true,
        }),
        true,
      );
    }

    const slug = entitySlug(device.deviceType, device.deviceId);

    await rig.waitForEntity(`${slug}_communication_timeouts`);

    await rig.startHm2mqtt();

    await waitFor(
      'all runtime communication discovery configs received by the probe',
      () =>
        configs.every(({ topic }) => {
          const payload = rig.probe.latestJson<{
            entity_category: string;
            enabled_by_default: boolean;
            state_topic: string;
          }>(topic);

          return (
            payload?.entity_category === 'diagnostic' &&
            payload.enabled_by_default === false &&
            payload.state_topic === stateTopic
          );
        }),
      { timeoutMs: 30000 },
    );

    for (const { topic } of configs) {
      const payload = rig.probe.latestJson<{
        entity_category: string;
        enabled_by_default: boolean;
        state_topic: string;
      }>(topic);

      expect(payload).toMatchObject({
        entity_category: 'diagnostic',
        enabled_by_default: false,
        state_topic: stateTopic,
      });
    }

    const stats = () => rig.probe.latestJson<CommunicationStats>(stateTopic);

    const healthy = await waitFor(
      'initial device messages',
      () => {
        const value = stats();
        return value && value.receivedMessages > 0 ? value : undefined;
      },
      { timeoutMs: 60000 },
    );

    expect(healthy.consecutiveTimeouts).toBe(0);
    expect(healthy.lastMessageAt).not.toBeNull();

    const timeoutEntity = await rig.waitForEntity(`${slug}_communication_timeouts`);

    const messageEntity = await rig.waitForEntity(`${slug}_received_device_messages`);

    await waitFor(
      'Home Assistant message counter',
      () => Number(rig.entityState(messageEntity)) > 0,
      { timeoutMs: 30000 },
    );

    // Stop only the simulated device, never a real storage device.
    await device.stop();

    const timedOut = await waitFor(
      'communication timeout after simulated device stops',
      () => {
        const value = stats();
        return value && value.totalTimeouts > healthy.totalTimeouts && value.consecutiveTimeouts > 0
          ? value
          : undefined;
      },
      {
        timeoutMs: 90000,
        diagnose: () => JSON.stringify(stats()),
      },
    );

    expect(timedOut.lastTimeoutAt).not.toBeNull();

    await waitFor(
      'Home Assistant timeout counter increased',
      () => Number(rig.entityState(timeoutEntity)) > healthy.totalTimeouts,
      { timeoutMs: 30000 },
    );

    // Simulate a device message arriving after communication loss.
    const response = fixture.responses[1];
    expect(response).toBeDefined();

    await rig.probe.publish(
      `hame_energy/${device.deviceType}/device/${device.deviceId}/ctrl`,
      response!,
    );

    const recovered = await waitFor(
      'communication recovery',
      () => {
        const value = stats();
        return value &&
          value.receivedMessages > timedOut.receivedMessages &&
          value.consecutiveTimeouts === 0
          ? value
          : undefined;
      },
      {
        timeoutMs: 30000,
        diagnose: () => JSON.stringify(stats()),
      },
    );

    expect(recovered.totalTimeouts).toBeGreaterThanOrEqual(timedOut.totalTimeouts);

    expect(recovered.lastTimeoutAt).not.toBeNull();

    rig.homeAssistant.assertNoProblems();
  });
});
