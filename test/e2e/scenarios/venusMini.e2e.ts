import {
  instantiateBaseline,
  generateBaseline,
  type DiscoveryBaseline,
} from '../../discovery/baseline.js';
import { venusMiniFixture } from '../../fixtures/devices.js';
import { Rig, entitySlug, canRunScenarios, startRig, waitFor } from '../harness/index.js';
import type { VenusMiniScheduleData } from '../../../src/types.js';

const describeE2e = canRunScenarios() ? describe : describe.skip;

describeE2e('Venus E Mini scheduling with existing reported sensors', () => {
  let rig: Rig;
  let slug: string;
  let powerSensor: string;
  let draftPower: string;
  let controlsSwitch: string;
  let applyButton: string;
  let restartButton: string;
  let scheduleTopic: string;
  let controlsDiscoveryTopic: string;

  const scheduleState = () => rig.probe.latestJson<VenusMiniScheduleData>(scheduleTopic);
  const scheduleWrites = () =>
    rig.devices[0].requests.filter(request => /^cd=4[7-9]|^cd=5[0-2]/.test(request));
  const action = async (entityId: string, service: string, data: Record<string, unknown> = {}) => {
    await rig.probe.publish(
      'e2e/action',
      JSON.stringify({ entity_id: entityId, action: service, data }),
    );
  };

  beforeAll(async () => {
    rig = await startRig({
      name: 'venus-mini',
      fixtures: [venusMiniFixture],
      enableActionBridge: true,
    });
    const device = rig.devices[0];
    slug = entitySlug(device.deviceType, device.deviceId);
    scheduleTopic = `hm2mqtt/${device.deviceType}/device/${device.deviceId}/schedule`;
    const baseline = instantiateBaseline(generateBaseline('VNSEMINI'), device);
    const powerTopic = `homeassistant/sensor/${device.deviceType}_${device.deviceId}/schedule_1_power/config`;
    const powerConfig = baseline.components[powerTopic];
    if (powerConfig == null || typeof powerConfig !== 'object') {
      throw new Error('Missing reported Mini power sensor discovery');
    }
    const previous: DiscoveryBaseline = {
      ...baseline,
      state: 'Existing read-only Mini power sensor',
      components: {
        [powerTopic]: {
          ...powerConfig,
          name: 'Schedule Slot 1 Power',
          unique_id: `${device.deviceId}_schedule_1_power`,
          state_topic: `hm2mqtt/${device.deviceType}/device/${device.deviceId}/data`,
          value_template: '{{ value_json.timePeriods[0].power }}',
          state_class: 'measurement',
        },
      },
    };
    await rig.seedRetainedDiscovery([previous]);
    powerSensor = await rig.waitForEntity(`${slug}_schedule_slot_1_power`);

    // Bootstrap the registry as if the user enabled these experimental entities.
    const userEnabled: DiscoveryBaseline = {
      ...baseline,
      state: 'User-enabled experimental entities',
      components: {},
    };
    for (const [topic, config] of Object.entries(baseline.components)) {
      if (
        topic.endsWith('/schedule_controls_enabled/config') ||
        topic.endsWith('/schedule_1_draft_power/config') ||
        topic.endsWith('/schedule_1_apply/config') ||
        topic.endsWith('/restart/config')
      ) {
        if (config == null || typeof config !== 'object') {
          throw new Error(`Missing discovery config for ${topic}`);
        }
        userEnabled.components[topic] = { ...config, enabled_by_default: true };
        if (topic.endsWith('/schedule_controls_enabled/config')) {
          controlsDiscoveryTopic = topic;
        }
        if (topic.endsWith('/restart/config')) {
          userEnabled.components[topic] = { ...config, enabled_by_default: true };
        }
      }
    }
    await rig.seedRetainedDiscovery([userEnabled]);
    draftPower = await rig.waitForEntity(`${slug}_schedule_slot_1_draft_power`);
    controlsSwitch = await rig.waitForEntity(`${slug}_experimental_schedule_controls`);
    applyButton = await rig.waitForEntity(`${slug}_schedule_slot_1_apply`);
    restartButton = await rig.waitForEntity(`${slug}_restart`);
    await rig.startHm2mqtt();
    await waitFor(
      'Mini to report healthy telemetry with controls disabled',
      () => scheduleState()?.status === 'Healthy; controls disabled',
      { diagnose: () => JSON.stringify(scheduleState()) },
    );
  });

  afterAll(async () => {
    await rig?.stop();
  });

  test('uses padded polling and subscribes to schedule controls without enabling writes', async () => {
    expect(rig.devices[0].requests).toContain('cd=01');
    expect(rig.broker.subscribed).toContain(
      `hm2mqtt/${rig.devices[0].deviceType}/control/${rig.devices[0].deviceId}/schedule/#`,
    );
    expect(
      rig.probe.latestJson<{ enabled_by_default: boolean }>(controlsDiscoveryTopic)
        ?.enabled_by_default,
    ).toBe(false);
    expect(scheduleState()?.controlsEnabled).toBe(false);
    await action(applyButton, 'button.press');
    await waitFor('Apply to be rejected without opt-in', () =>
      scheduleState()?.lastError.includes('disabled'),
    );
    expect(scheduleWrites()).toHaveLength(0);
  });

  test('stages through Home Assistant then applies and verifies one complete command', async () => {
    await action(draftPower, 'number.set_value', { value: 90 });
    await waitFor(
      'HA draft power to change without changing reported power',
      () =>
        Number(rig.entityState(draftPower)) === 90 && Number(rig.entityState(powerSensor)) === 100,
      {
        diagnose: () =>
          JSON.stringify({
            draft: rig.entityState(draftPower),
            reported: rig.entityState(powerSensor),
            schedule: scheduleState(),
          }),
      },
    );
    expect(scheduleWrites()).toHaveLength(0);
    await action(controlsSwitch, 'switch.turn_on');
    await waitFor(
      'HA opt-in to reach the Mini session',
      () => scheduleState()?.controlsEnabled === true && rig.entityState(controlsSwitch) === 'on',
      { diagnose: () => JSON.stringify(scheduleState()) },
    );
    await action(applyButton, 'button.press');
    await waitFor(
      'Mini read-back to confirm the applied draft in HA',
      () =>
        scheduleState()?.status.includes('verified') && Number(rig.entityState(powerSensor)) === 90,
      {
        diagnose: () =>
          JSON.stringify({ schedule: scheduleState(), requests: rig.devices[0].requests }),
      },
    );
    expect(scheduleWrites()).toEqual(['cd=47,m1=0,mp1=90,ms1=1,st1=10:00,et1=11:00,re1=127']);
    expect(rig.entityIds().filter(entity => entity.startsWith(powerSensor))).toHaveLength(1);
    const topic = rig
      .discoveryTopics()
      .find(candidate => candidate.endsWith('/schedule_1_power/config'));
    expect(topic).toBeDefined();
    expect(rig.probe.latestJson<{ state_class: string }>(topic!)?.state_class).toBe('measurement');
  });

  test('Home Assistant logs no complaint about reported or draft schedule entities', () => {
    rig.homeAssistant.assertNoProblems();
    expect(rig.devices[0].failures).toHaveLength(0);
  });

  test('restart publishes the exact app-derived request once and disables schedule controls', async () => {
    expect(scheduleState()?.controlsEnabled).toBe(true);
    await action(restartButton, 'button.press');
    await waitFor(
      'app-derived restart request',
      () => rig.devices[0].requests.includes('cd=61,rst=1'),
      { diagnose: () => rig.devices[0].requests.join('\n') },
    );
    expect(rig.devices[0].requests.filter(request => request === 'cd=61,rst=1')).toHaveLength(1);
    expect(scheduleState()?.controlsEnabled).toBe(false);
  });
});
