import { join } from 'node:path';
import { extractBaseType } from '../../../src/deviceDefinition.js';
import { instantiateBaseline } from '../../discovery/baseline.js';
import {
  RELEASED_BASELINE_DIR,
  latestReleasedVersion,
  readBaselines,
} from '../../discovery/paths.js';
import { deviceFixtures } from '../../fixtures/devices.js';
import { Rig, entitySlug, canRunScenarios, startRig, waitFor } from '../harness/index.js';

/**
 * An existing installation being upgraded.
 *
 * Home Assistant already has the entities the last release announced — its
 * retained discovery messages are still in the broker — and then the new build
 * starts and announces its own. Applying a changed discovery message to an
 * entity that already exists is a different code path in Home Assistant than
 * creating one, and it is where this has gone wrong before: an entity kept its
 * subscription but lost the template that went with it, and every device
 * message became an error.
 *
 * The scenario is only as good as the frozen baseline it replays, so the
 * release process has to add one per release.
 */
const describeE2e = canRunScenarios() ? describe : describe.skip;

/** See the note on KNOWN_FINDINGS in smoke.e2e.ts. */
const KNOWN_FINDINGS = [/has no attribute '(wifiSignalStrength|localApiEnabled|localApiPort)'/];

const releasedVersion = latestReleasedVersion();

describeE2e(`upgrading an installation that already ran ${releasedVersion}`, () => {
  let rig: Rig;

  beforeAll(async () => {
    rig = await startRig({ name: 'upgrade', fixtures: deviceFixtures });

    // What the previous release left in the broker, for the devices this
    // scenario runs. Baselines are stored per device definition, so each is
    // instantiated for the concrete device type and id in use here.
    const released = readBaselines(join(RELEASED_BASELINE_DIR, releasedVersion));
    const seeded = rig.devices.map(device => {
      const baseType = extractBaseType(device.deviceType);
      const baseline = released.find(entry => entry.deviceType === baseType);
      if (!baseline) {
        throw new Error(
          `No ${releasedVersion} baseline for ${baseType}; freeze one before using ${device.deviceType} here.`,
        );
      }
      return instantiateBaseline(baseline, device);
    });
    await rig.seedRetainedDiscovery(seeded);

    // Home Assistant adopts the old entities first...
    for (const device of rig.devices) {
      await rig.waitForEntity(entitySlug(device.deviceType, device.deviceId));
    }
    // ...and only then does the new build announce itself over the top. The
    // mark is taken before it starts, because the seeded messages already used
    // these very topics: only publishes after this point are the new build's.
    const beforeUpgrade = rig.publishMark();
    await rig.startHm2mqtt();
    await waitFor(
      'the new build to republish discovery for every device',
      () => {
        const republished = new Set(rig.discoveryPublishesSince(beforeUpgrade));
        return rig.devices.every(device =>
          [...republished].some(topic => topic.includes(`${device.deviceType}_${device.deviceId}`)),
        );
      },
      {
        timeoutMs: 90_000,
        diagnose: () =>
          `Discovery topics republished since the upgrade: ` +
          `${new Set(rig.discoveryPublishesSince(beforeUpgrade)).size}`,
      },
    );
  });

  afterAll(async () => {
    await rig?.stop();
  });

  test('devices keep reporting after the upgrade', async () => {
    for (const device of rig.devices) {
      await device.pushReading();
    }
    for (const device of rig.devices) {
      const slug = entitySlug(device.deviceType, device.deviceId);
      await waitFor(
        `${device.deviceType} entities to report a state after the upgrade`,
        () =>
          rig
            .entityIds()
            .filter(entityId => entityId.includes(slug))
            .some(entityId => {
              const state = rig.entityState(entityId);
              return state !== undefined && state !== 'unknown' && state !== 'unavailable';
            }),
        { timeoutMs: 90_000 },
      );
    }
  });

  test('Home Assistant logs no complaint about the changed entities', () => {
    rig.homeAssistant.assertNoProblems(KNOWN_FINDINGS);
  });
});
