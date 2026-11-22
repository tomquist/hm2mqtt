import {
  DEFAULT_EMULATED_DEVICES,
  MISSING_EMULATOR,
  Rig,
  canRunScenarios,
  emulatorSetup,
  entitySlug,
  startRig,
  waitFor,
} from '../harness/index.js';

/**
 * The smoke test again, against real firmware: each device runs its own
 * firmware in marsemu, so hm2mqtt sees what the firmware actually reports —
 * a fresh device's unset timers, fields only some versions send — rather than
 * a fixture someone wrote. Opt-in, because the images are not redistributable:
 * set `MARSEMU` and `MARSEMU_FIRMWARE` (see `harness/emulator.ts`).
 */
const setup = emulatorSetup();
const runnable = setup ? canRunScenarios() : (console.warn(MISSING_EMULATOR), false);
const describeFirmware = runnable ? describe : describe.skip;
const specs = setup?.devices ?? DEFAULT_EMULATED_DEVICES;

/**
 * Known findings, not noise; delete an entry with its fix. Anything new still
 * fails the assertion below.
 *
 * - *WiFi Signal Strength* on the B2500 (see the smoke test).
 * - The Venus time periods after a restart: the firmware reports the slots it
 *   has not initialised as times like `0:100` and `255:255`, hm2mqtt publishes
 *   them as they are, and Home Assistant rejects them against the time text
 *   entities' pattern on every message. hm2mqtt should drop a time outside
 *   0:00–23:59 (`parseTimePeriod` in `src/device/venus.ts`).
 */
const KNOWN_FINDINGS = [
  /has no attribute 'wifiSignalStrength'/,
  /Value error while updating state of text\.\S+_time_period_\d+_time_(from|to)\b/,
];

/**
 * Devices whose Restart marsemu has been seen to carry out end to end: the
 * firmware resets, reconnects and subscribes again. Not (yet) the others: the
 * Venus E Mini comes back half-booted (its Wi-Fi module model is not reset
 * with the MCU), and a whole-device B2500 ignores the restart command although
 * the same image resets on it under `marsemu run`.
 */
const restartsCleanly = (deviceType: string) => /^(VNSE3|VNSA|VNSD|HMG)-/.test(deviceType);

/** Booting firmware at real time: up to a few minutes per device, in parallel. */
const BOOT_TIMEOUT_MS = 20 * 60_000;

describeFirmware('hm2mqtt against real firmware', () => {
  let rig: Rig;
  let identities: Array<{ deviceType: string; deviceId: string }>;

  beforeAll(async () => {
    rig = await startRig({
      name: 'firmware',
      fixtures: [],
      emulator: setup!,
      // a real device answers in its own time; polling every 2 s only queues up
      pollingIntervalSeconds: 10,
    });
    identities = await rig.emulatedIdentities();
    await rig.startHm2mqtt();
    for (const identity of identities) {
      await rig.waitForEntity(entitySlug(identity.deviceType, identity.deviceId));
    }
  }, BOOT_TIMEOUT_MS);

  afterAll(async () => {
    await rig?.stop();
  });

  test.each(
    specs.map((spec, index) => [`${spec.command} ${spec.images.join(',')}`, index] as const),
  )('%s announces entities that reach a real state', async (_label, index) => {
    const { deviceType, deviceId } = identities[index];
    const slug = entitySlug(deviceType, deviceId);
    const entities = await waitFor(
      `${deviceType} entities to report a state`,
      () => {
        const settled = rig
          .entityIds()
          .filter(entityId => entityId.includes(slug))
          .filter(entityId => {
            const state = rig.entityState(entityId);
            return state !== undefined && state !== 'unknown' && state !== 'unavailable';
          });
        return settled.length >= 5 ? settled : undefined;
      },
      {
        timeoutMs: 240_000,
        diagnose: () =>
          `Entities:\n${rig.entityIds().join('\n')}\n\nmarsemu output:\n` +
          rig.emulated[index].output().split('\n').slice(-20).join('\n'),
      },
    );
    expect(entities.length).toBeGreaterThanOrEqual(5);
  });

  test(
    'every Venus comes back from a restart',
    async () => {
      // What a device reports right after booting is where firmware surprises
      // live: settings it has not loaded yet, slots it never initialised.
      for (const [index, { deviceType, deviceId }] of identities.entries()) {
        if (!restartsCleanly(deviceType)) {
          continue;
        }
        const dataTopic = `hm2mqtt/${deviceType}/device/${deviceId}/data`;
        const diagnose = () =>
          `marsemu output:\n${rig.emulated[index].output().split('\n').slice(-20).join('\n')}`;
        if (deviceType.startsWith('HMG-')) {
          // hm2mqtt offers Restart on the Venus C/E from control firmware 151,
          // and only once it knows the version: wait for it before deciding.
          const version = await waitFor(
            `${deviceType} to report its firmware version`,
            () => rig.probe.latestJson<{ deviceVersion?: number }>(dataTopic)?.deviceVersion,
            { timeoutMs: 120_000, diagnose },
          );
          if (version < 151) {
            continue;
          }
        }
        // Discovery can trail the first data message; a supported device
        // without its button is a failure, not a reason to skip it.
        const button = await waitFor(
          `${deviceType} to announce its Restart button`,
          () =>
            rig.probe.latestJson<{ command_topic: string; payload_press?: string }>(
              `homeassistant/button/${deviceType}_${deviceId}/restart/config`,
            ),
          { timeoutMs: 60_000, diagnose },
        );
        const commandTopic = `/App/${deviceId}/ctrl`;
        const subscriptions = () =>
          rig.broker.subscribed.filter(filter => filter.includes(commandTopic)).length;
        const before = subscriptions();
        await rig.probe.publish(button.command_topic, button.payload_press ?? 'PRESS');
        await waitFor(
          `${deviceType} to reboot and subscribe again`,
          () => subscriptions() > before,
          // a Venus C/E emulates at about a sixth of real time and needs ~40
          // emulated seconds to reach MQTT again
          { timeoutMs: 600_000, diagnose },
        );
        const mark = rig.probe.messages().length;
        await waitFor(
          `${deviceType} to report twice after its restart`,
          () =>
            rig.probe
              .messages()
              .slice(mark)
              .filter(message => message.topic === dataTopic).length >= 2,
          { timeoutMs: 300_000, diagnose },
        );
      }
    },
    BOOT_TIMEOUT_MS,
  );

  test('Home Assistant logs no complaint about anything hm2mqtt published', () => {
    rig.homeAssistant.assertNoProblems(KNOWN_FINDINGS);
  });
});
