import { jest } from '@jest/globals';
import './registry.js';
import { ControlHandler, type ControlPublishOptions } from '../controlHandler.js';
import { DataHandler } from '../dataHandler.js';
import { DeviceManager } from '../deviceManager.js';
import { generateDiscoveryConfigs } from '../generateDiscoveryConfigs.js';
import type {
  Device,
  VenusMiniDeviceData,
  VenusMiniScheduleData,
  VenusMiniTimePeriod,
} from '../types.js';
import { miniRuntimePayload } from '../test/venusMiniSchedule.js';
import {
  MINI_SCHEDULE_COOLDOWN,
  MINI_SCHEDULE_MAX_AGE,
  MINI_SCHEDULE_FRESH_AGE,
  MINI_SCHEDULE_ACK_TIMEOUT,
  MINI_SCHEDULE_TELEMETRY_TIMEOUT,
  buildMiniScheduleCommand,
} from './venusMiniSchedule.js';

const configured = (update: Partial<VenusMiniTimePeriod> = {}): VenusMiniTimePeriod => ({
  enabled: false,
  power: 100,
  direction: 'charge',
  startTime: '10:00',
  endTime: '11:00',
  repeatRaw: 127,
  ...update,
});

describe('Venus E Mini guarded schedules', () => {
  const device: Device = { deviceType: 'VNSEMINI-0', deviceId: 'mini-a' };
  let manager: DeviceManager;
  let controls: ControlHandler;
  let data: DataHandler;
  let publish: jest.Mock<
    (
      device: Device,
      payload: string,
      index: number,
      options?: ControlPublishOptions,
    ) => Promise<void>
  >;
  let periods: VenusMiniTimePeriod[];

  const state = () => manager.getDeviceState(device) as VenusMiniDeviceData & VenusMiniScheduleData;
  const command = (path: string, value = 'PRESS', retained = false, target = device) =>
    controls.handleControlTopic(
      target,
      `hm2mqtt/${target.deviceType}/control/${target.deviceId}/${path}`,
      value,
      retained,
    );
  function runtime(
    overrides: Record<string, string> = {},
    namespace: 'hame_energy' | 'marstek_energy' = 'hame_energy',
    retained = false,
    target = device,
  ) {
    const payload = miniRuntimePayload(periods, new Date(), overrides);
    data.handleDeviceData(target, payload);
    controls.handleDeviceMessage(
      target,
      `${namespace}/${target.deviceType}/device/${target.deviceId}/ctrl`,
      payload,
      retained,
    );
  }
  const advanceRuntime = (overrides: Record<string, string> = {}) => {
    jest.advanceTimersByTime(1000);
    runtime(overrides);
  };
  function healthy() {
    for (let sample = 0; sample < 3; sample++) {
      advanceRuntime();
    }
  }
  function enable() {
    healthy();
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(true);
  }
  function start(slot = 1) {
    command(`schedule/${slot}/power`, '90');
    command(`schedule/${slot}/apply`);
    advanceRuntime();
  }
  function ack(payload = 'cd47=ok', namespace = 'hame_energy', retained = false) {
    controls.handleDeviceMessage(
      device,
      `${namespace}/${device.deviceType}/device/${device.deviceId}/ctrl`,
      payload,
      retained,
    );
  }
  const writes = () => publish.mock.calls.filter(([, payload]) => payload !== 'cd=01');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-04T10:00:00Z'));
    manager = new DeviceManager(
      {
        devices: [device, { ...device, deviceId: 'mini-b' }],
        brokerUrl: 'mqtt://localhost',
        clientId: 'test',
        topicPrefix: 'hm2mqtt',
        autodiscoveryTopicPrefix: 'homeassistant',
        responseTimeout: 15000,
      },
      () => {},
    );
    publish = jest.fn(async () => {});
    controls = new ControlHandler(manager, publish);
    data = new DataHandler(manager);
    periods = [configured()];
  });
  afterEach(() => {
    controls.disconnect();
    jest.useRealTimers();
  });

  test('stages all fields without publishing or replacing device-reported values', () => {
    runtime();
    command('schedule/1/enabled', 'true');
    command('schedule/1/power', '90');
    command('schedule/1/direction', 'discharge');
    command('schedule/1/start-time', '8:05');
    command('schedule/1/end-time', '09:00');
    command('schedule/1/weekday', '01234');
    expect(publish).not.toHaveBeenCalled();
    expect(state().drafts[0]).toMatchObject({
      enabled: true,
      power: 90,
      direction: 'discharge',
      startTime: '08:05',
      endTime: '09:00',
      repeatRaw: 31,
    });
    expect(state().timePeriods?.[0].power).toBe(100);
    advanceRuntime();
    expect(state().drafts[0].power).toBe(90);
  });

  test('allows creating a complete draft for an empty slot', () => {
    periods = [];
    enable();
    command('schedule/1/start-time', '10:00');
    command('schedule/1/end-time', '11:00');
    command('schedule/1/weekday', '0123456');
    command('schedule/1/power', '100');
    command('schedule/1/apply');
    advanceRuntime();
    expect(writes()[0]?.[1]).toBe('cd=47,m1=0,mp1=100,ms1=1,st1=10:00,et1=11:00,re1=127');
  });

  test('requires explicit opt-in and three advancing samples', () => {
    command('schedule/1/apply');
    expect(state().lastError).toMatch(/disabled/);
    runtime();
    runtime();
    runtime();
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(false);
    advanceRuntime();
    advanceRuntime();
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });

  test('refreshes first, sends one complete write on one namespace, then verifies after ack', () => {
    enable();
    start();
    expect(publish.mock.calls.map(([, payload]) => payload)).toEqual([
      'cd=01',
      'cd=47,m1=0,mp1=90,ms1=1,st1=10:00,et1=11:00,re1=127',
    ]);
    expect(
      publish.mock.calls.every(
        ([, , , options]) =>
          options?.namespace === 'hame_energy' && options.automaticRefresh === false,
      ),
    ).toBe(true);
    expect(state().timePeriods?.[0].power).toBe(100);
    expect(state().status).toMatch(/acknowledgement/);
    periods[0] = configured({ power: 90 });
    advanceRuntime();
    expect(state().status).toMatch(/acknowledgement/);
    ack();
    expect(publish.mock.calls.at(-1)?.[1]).toBe('cd=01');
    advanceRuntime();
    expect(state().status).toMatch(/verified/);
    command('schedule/1/apply');
    expect(state().lastError).toMatch(/cooldown/);
    expect(writes()).toHaveLength(1);
    jest.advanceTimersByTime(MINI_SCHEDULE_COOLDOWN);
    command('schedule/1/apply');
    advanceRuntime();
    expect(writes()).toHaveLength(2);
  });

  test('uses the namespace of live runtime telemetry rather than publishing twice', () => {
    healthy();
    jest.advanceTimersByTime(1000);
    runtime({}, 'marstek_energy');
    command('schedule/controls-enabled', 'true');
    command('schedule/1/apply');
    jest.advanceTimersByTime(1000);
    runtime({}, 'marstek_energy');
    expect(writes()).toHaveLength(1);
    expect(writes()[0][3]?.namespace).toBe('marstek_energy');
    ack('cd47=ok', 'hame_energy');
    expect(state().status).toMatch(/acknowledgement/);
  });

  test('rejects concurrent Apply and draft edits instead of queuing them', () => {
    enable();
    start();
    command('schedule/2/apply');
    command('schedule/1/power', '80');
    command('working-mode', 'automatic');
    expect(state().drafts[0].power).toBe(90);
    expect(writes()).toHaveLength(1);
    expect(state().lastError).toMatch(/pending/);
  });

  test('ignores wrong, retained, early and duplicate acknowledgements', () => {
    enable();
    ack();
    start();
    ack('cd48=ok');
    ack('cd47=ok', 'hame_energy', true);
    expect(state().status).toMatch(/acknowledgement/);
    ack();
    const count = publish.mock.calls.length;
    ack();
    expect(publish.mock.calls.length).toBe(count);
  });

  test.each(['preflight', 'acknowledgement', 'verification'])(
    '%s timeout locks writes without retry',
    phase => {
      enable();
      command('schedule/1/apply');
      if (phase !== 'preflight') {
        advanceRuntime();
      }
      if (phase === 'verification') {
        ack();
      }
      const count = publish.mock.calls.length;
      const timeout =
        phase === 'acknowledgement' ? MINI_SCHEDULE_ACK_TIMEOUT : MINI_SCHEDULE_TELEMETRY_TIMEOUT;
      jest.advanceTimersByTime(timeout - 1);
      expect(state().controlsEnabled).toBe(true);
      jest.advanceTimersByTime(1);
      expect(state().controlsEnabled).toBe(false);
      expect(state().status).toMatch(/Locked/);
      command('schedule/1/apply');
      expect(publish.mock.calls.length).toBe(count);
    },
  );

  test('preflight and read-back succeed with 60-second relay telemetry', () => {
    runtime();
    jest.advanceTimersByTime(60000);
    runtime();
    jest.advanceTimersByTime(60000);
    runtime();
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(true);

    command('schedule/1/power', '90');
    command('schedule/1/apply');
    jest.advanceTimersByTime(15000);
    expect(state().controlsEnabled).toBe(true);
    expect(writes()).toHaveLength(0);
    jest.advanceTimersByTime(45000);
    runtime();
    expect(writes()).toHaveLength(1);
    ack();

    periods[0] = configured({ power: 90 });
    jest.advanceTimersByTime(15000);
    expect(state().controlsEnabled).toBe(true);
    expect(state().status).toMatch(/Verifying/);
    jest.advanceTimersByTime(45000);
    runtime();
    expect(state().controlsEnabled).toBe(true);
    expect(state().status).toMatch(/verified/);
    expect(writes()).toHaveLength(1);
  });

  test('a negative acknowledgement locks writes', () => {
    enable();
    start();
    ack('cd47=error');
    expect(state().controlsEnabled).toBe(false);
    expect(state().lastError).toMatch(/rejected/);
  });

  test('read-back mismatch stays unconfirmed until a matching newer snapshot arrives', () => {
    enable();
    start();
    ack();
    advanceRuntime();
    expect(state().controlsEnabled).toBe(true);
    expect(state().drafts[0].power).toBe(90);
    expect(state().status).toMatch(/Waiting.*read-back/);
    expect(state().lastError).toBe('');
    const count = publish.mock.calls.length;
    periods[0] = configured({ power: 90 });
    advanceRuntime();
    expect(state().status).toMatch(/verified/);
    expect(publish.mock.calls.length).toBe(count);
    expect(writes()).toHaveLength(1);
  });

  test('a mismatched read-back does not extend its deadline or cause a retry', () => {
    enable();
    start();
    ack();
    const count = publish.mock.calls.length;
    const startedAt = Date.now();
    while (Date.now() - startedAt < MINI_SCHEDULE_TELEMETRY_TIMEOUT - 1000) {
      advanceRuntime();
    }
    expect(state().controlsEnabled).toBe(true);
    expect(state().drafts[0].power).toBe(90);
    jest.advanceTimersByTime(1000);
    expect(state().controlsEnabled).toBe(false);
    expect(state().lastError).toMatch(/read-back timed out/);
    expect(publish.mock.calls.length).toBe(count);
  });

  test('unconfirmed read-back preserves an unedited draft until its deadline', () => {
    enable();
    command('schedule/1/apply');
    advanceRuntime();
    ack();
    periods[0] = configured({ power: 80 });
    advanceRuntime();
    expect(state().controlsEnabled).toBe(true);
    expect(state().drafts[0].power).toBe(100);
    expect(state().status).toMatch(/Waiting.*read-back/);
  });

  test('verification requires an advancing device clock', () => {
    enable();
    start();
    ack();
    periods[0] = configured({ power: 90 });
    runtime();
    expect(state().status).toMatch(/Verifying/);
    advanceRuntime();
    expect(state().status).toMatch(/verified/);
  });

  test('an app change while editing requires resetting the draft', () => {
    enable();
    command('schedule/1/power', '90');
    periods[0] = configured({ power: 80 });
    advanceRuntime();
    command('schedule/1/apply');
    expect(publish).not.toHaveBeenCalled();
    expect(state().lastError).toMatch(/reset/);
    command('schedule/1/reset');
    expect(state().drafts[0].power).toBe(80);
  });

  test('an app change during preflight aborts before writing', () => {
    enable();
    command('schedule/1/apply');
    periods[0] = configured({ power: 80 });
    advanceRuntime();
    expect(writes()).toHaveLength(0);
    expect(state().controlsEnabled).toBe(false);
  });

  test('changes to another slot or working mode during Apply lock writes', () => {
    enable();
    start();
    periods[1] = configured({ startTime: '12:00', endTime: '13:00' });
    advanceRuntime();
    expect(state().lastError).toMatch(/configuration changed/);
    expect(state().controlsEnabled).toBe(false);
  });

  test('a mode change during Apply locks writes', () => {
    enable();
    start();
    advanceRuntime({ cm: '0' });
    expect(state().controlsEnabled).toBe(false);
  });

  test('retained runtime and control messages cannot enable or apply schedules', () => {
    for (let sample = 0; sample < 3; sample++) {
      jest.advanceTimersByTime(1000);
      runtime({}, 'hame_energy', true);
    }
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(false);
    healthy();
    command('schedule/controls-enabled', 'true', true);
    expect(state().controlsEnabled).toBe(false);
    command('schedule/controls-enabled', 'true');
    command('schedule/1/apply', 'PRESS', true);
    command('schedule/1/power', '80', true);
    expect(publish).not.toHaveBeenCalled();
    expect(state().drafts[0].power).toBe(100);
  });

  test('frozen device time locks writes even while runtime payloads keep arriving', () => {
    enable();
    const frozen = miniRuntimePayload(periods);
    for (let elapsed = 0; elapsed <= MINI_SCHEDULE_MAX_AGE; elapsed += 1000) {
      jest.advanceTimersByTime(1000);
      controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', frozen);
    }
    expect(state().controlsEnabled).toBe(false);
    expect(state().status).toMatch(/Locked/);
  });

  test('cached packets do not make the next normal clock advance look like a clock jump', () => {
    enable();
    for (let cycle = 0; cycle < 3; cycle++) {
      const cached = miniRuntimePayload(periods);
      jest.advanceTimersByTime(55000);
      controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', cached);
      jest.advanceTimersByTime(5000);
      runtime();
      expect(state().controlsEnabled).toBe(true);
      expect(state().lastError).toBe('');
    }
  });

  test('a delayed device clock can catch up within the bounded relay allowance', () => {
    for (let sample = 0; sample < 3; sample++) {
      jest.advanceTimersByTime(1000);
      const delayed = miniRuntimePayload(periods, new Date(Date.now() - 60000));
      controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', delayed);
    }
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(true);
    jest.advanceTimersByTime(60000);
    runtime();
    expect(state().controlsEnabled).toBe(true);
    expect(state().status).toBe('Ready');
  });

  test('missing telemetry locks writes without needing another incoming message', () => {
    enable();
    jest.advanceTimersByTime(MINI_SCHEDULE_MAX_AGE);
    expect(state().controlsEnabled).toBe(false);
  });

  test('temporary staleness pauses writes without clearing opt-in or resending commands', () => {
    enable();
    jest.advanceTimersByTime(MINI_SCHEDULE_FRESH_AGE);
    expect(state().controlsEnabled).toBe(true);
    expect(state().status).toBe('Waiting for fresh telemetry');
    command('schedule/1/apply');
    expect(publish).not.toHaveBeenCalled();
    expect(state().controlsEnabled).toBe(true);
    jest.advanceTimersByTime(30000);
    runtime();
    expect(state().status).toBe('Ready');
    expect(state().controlsEnabled).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });

  test('preflight tolerates one skipped synchronization without writing from a cached response', () => {
    enable();
    const cached = miniRuntimePayload(periods);
    command('schedule/1/apply');
    jest.advanceTimersByTime(60000);
    controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', cached);
    expect(writes()).toHaveLength(0);
    jest.advanceTimersByTime(60000);
    expect(state().controlsEnabled).toBe(true);
    runtime();
    expect(writes()).toHaveLength(1);
  });

  test('an older snapshot cannot roll back schedule decisions or abort a pending write', () => {
    enable();
    const old = miniRuntimePayload([configured({ power: 50 })], new Date(Date.now() - 60000));
    start();
    controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', old);
    expect(state().controlsEnabled).toBe(true);
    expect(state().drafts[0].power).toBe(90);
    expect(state().status).toMatch(/acknowledgement/);
    ack();
    periods[0] = configured({ power: 90 });
    advanceRuntime();
    expect(state().status).toMatch(/verified/);
    expect(writes()).toHaveLength(1);
  });

  test('cached and older packets cannot satisfy the startup sample requirement', () => {
    runtime();
    const cached = miniRuntimePayload(periods);
    const old = miniRuntimePayload(periods, new Date(Date.now() - 60000));
    for (let sample = 0; sample < 3; sample++) {
      controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', cached);
      controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', old);
    }
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(false);
    advanceRuntime();
    advanceRuntime();
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(true);
  });

  test('fresh telemetry after a prolonged gap does not automatically unlock controls', () => {
    enable();
    jest.advanceTimersByTime(MINI_SCHEDULE_MAX_AGE);
    healthy();
    expect(state().controlsEnabled).toBe(false);
    command('schedule/1/apply');
    expect(writes()).toHaveLength(0);
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(true);
  });

  test.each([
    { soc: '1001' },
    { time: 'invalid' },
    { time: '2026-2-31 10:00:00' },
    { mp2: 'garbage' },
    { re3: '128' },
    { st4: '24:00' },
    { m5: '2' },
    { ms6: '9' },
    { mq_s: '0' },
    { cm: '99' },
    { dev_sta: '5' },
  ])('invalid telemetry locks writes: %j', overrides => {
    enable();
    advanceRuntime(overrides);
    expect(state().controlsEnabled).toBe(false);
    expect(state().lastError).toMatch(/invalid/);
  });

  test('implausibly advancing device clock locks writes', () => {
    enable();
    const future = miniRuntimePayload(periods, new Date(Date.now() + 3600000));
    controls.handleDeviceMessage(device, 'hame_energy/VNSEMINI-0/device/mini-a/ctrl', future);
    expect(state().controlsEnabled).toBe(false);
  });

  test('disconnect clears pending transactions and requires fresh samples plus explicit opt-in', () => {
    enable();
    start();
    controls.disconnect();
    ack();
    expect(writes()).toHaveLength(1);
    healthy();
    command('schedule/1/apply');
    expect(writes()).toHaveLength(1);
    command('schedule/controls-enabled', 'true');
    expect(state().controlsEnabled).toBe(true);
  });

  test('a publish failure locks the session', async () => {
    enable();
    command('schedule/1/apply');
    publish.mockRejectedValueOnce(new Error('broker unavailable'));
    advanceRuntime();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(state().controlsEnabled).toBe(false);
    expect(state().lastError).toMatch(/publish failed/);
  });

  test.each(['preflight', 'verification'])(
    '%s refresh publish failure locks the session',
    async phase => {
      enable();
      if (phase === 'verification') {
        start();
      }
      publish.mockRejectedValueOnce(new Error('broker unavailable'));
      if (phase === 'preflight') {
        command('schedule/1/apply');
      } else {
        ack();
      }
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(state().controlsEnabled).toBe(false);
      expect(state().lastError).toMatch(/refresh failed/);
    },
  );

  test('incomplete runtime cannot reuse fields from a previous complete sample', () => {
    enable();
    controls.handleDeviceMessage(
      device,
      'hame_energy/VNSEMINI-0/device/mini-a/ctrl',
      'soc=500,time=2026-10-4 10:00:05',
    );
    expect(state().controlsEnabled).toBe(false);
    expect(state().lastError).toMatch(/Incomplete/);
  });

  test('restart cancels pending Apply and sends the app MQTT payload once on the live namespace', () => {
    enable();
    command('schedule/1/apply');
    command('restart');
    expect(state().controlsEnabled).toBe(false);
    expect(publish.mock.calls.at(-1)?.[1]).toBe('cd=61,rst=1');
    expect(publish.mock.calls.at(-1)?.[3]).toEqual({
      namespace: 'hame_energy',
      automaticRefresh: false,
    });
    advanceRuntime();
    expect(publish.mock.calls.filter(([, payload]) => payload.startsWith('cd=47'))).toHaveLength(0);
  });

  test('restart uses the latest live Marstek namespace and ignores retained or invalid requests', () => {
    healthy();
    jest.advanceTimersByTime(1000);
    runtime({}, 'marstek_energy');
    command('restart', 'PRESS', true);
    command('restart', 'invalid');
    expect(publish).not.toHaveBeenCalled();
    command('restart');
    expect(publish.mock.calls).toHaveLength(1);
    expect(publish.mock.calls[0][1]).toBe('cd=61,rst=1');
    expect(publish.mock.calls[0][3]?.namespace).toBe('marstek_energy');
  });

  test('restart is not broadcast if there is no live device MQTT namespace', () => {
    command('restart');
    expect(publish).not.toHaveBeenCalled();
    expect(state().controlsEnabled).toBe(false);
    expect(state().lastError).toMatch(/no live device MQTT namespace/);
  });

  test('turning off controls during preflight cancels the write', () => {
    enable();
    command('schedule/1/apply');
    command('schedule/controls-enabled', 'false');
    advanceRuntime();
    expect(writes()).toHaveLength(0);
    expect(state().controlsEnabled).toBe(false);
  });

  test('drafts and transactions are isolated per device', () => {
    enable();
    const other = { ...device, deviceId: 'mini-b' };
    command('schedule/1/power', '80', false, other);
    start();
    expect((manager.getDeviceState(other) as VenusMiniScheduleData).controlsEnabled).toBe(false);
    expect((manager.getDeviceState(other) as VenusMiniScheduleData).drafts[0].power).toBe(80);
    expect(state().drafts[0].power).toBe(90);
  });

  test('subscribes to session controls alongside ordinary device commands', () => {
    expect(manager.getControlTopics(device)).toContain(
      'hm2mqtt/VNSEMINI-0/control/mini-a/schedule/#',
    );
    expect(manager.getControlTopics(device)).toContain(
      'hm2mqtt/VNSEMINI-0/control/mini-a/working-mode',
    );
    expect(manager.getControlTopics({ ...device, deviceId: 'mini-b' })).toContain(
      'hm2mqtt/VNSEMINI-0/control/mini-b/schedule/#',
    );
  });
  test('Apply rejects gaps and disabled-slot overlaps but permits adjacency and different weekdays', () => {
    periods = [configured(), {}, configured({ startTime: '12:00', endTime: '13:00' })];
    enable();
    command('schedule/3/apply');
    expect(state().lastError).toMatch(/before slot 2/);
    periods[1] = configured({ startTime: '10:30', endTime: '12:00' });
    advanceRuntime();
    command('schedule/2/apply');
    expect(state().lastError).toMatch(/overlaps/);
    periods[1] = configured({ startTime: '11:00', endTime: '12:00' });
    advanceRuntime();
    command('schedule/2/apply');
    advanceRuntime();
    expect(writes()).toHaveLength(1);
  });

  test.each([
    ['power', '1501'],
    ['power', ''],
    ['power', '1.5'],
    ['power', '0x10'],
    ['direction', 'toString'],
    ['direction', 'unknown'],
    ['start-time', '24:00'],
    ['weekday', '210'],
  ])('rejects invalid draft %s=%s', (field, value) => {
    runtime();
    command(`schedule/1/${field}`, value);
    expect(state().lastError).toMatch(/Invalid/);
    expect(publish).not.toHaveBeenCalled();
  });

  test.each([
    { startTime: '11:00', endTime: '10:00' },
    { startTime: '10:00', endTime: '10:00' },
    { repeatRaw: 0 },
  ])('rejects empty and overnight configurations on Apply: %j', period => {
    periods = [configured(period)];
    enable();
    command('schedule/1/apply');
    expect(publish).not.toHaveBeenCalled();
    expect(state().lastError).toMatch(/same-day/);
  });

  test('manual mode is required and supported power limit remains 1500 W', () => {
    enable();
    advanceRuntime({ cm: '0' });
    command('schedule/1/apply');
    expect(state().lastError).toMatch(/Manual/);
    expect(buildMiniScheduleCommand(1, configured({ power: 1500 }))).toContain('mp1=1500');
    expect(buildMiniScheduleCommand(1, configured({ power: 1501 }))).toBeUndefined();
  });

  test('preserves reported sensors alongside disabled draft controls and Apply/reset', () => {
    runtime();
    const topics = manager.getDeviceTopics(device)!;
    const configs = generateDiscoveryConfigs(
      device,
      topics,
      {},
      'hm2mqtt',
      'homeassistant',
      state(),
    );
    const draft = configs.find(entry => entry.config?.name === 'Schedule Slot 1 Draft Power');
    expect(draft?.config).toMatchObject({
      enabled_by_default: false,
      state_topic: 'hm2mqtt/VNSEMINI-0/device/mini-a/schedule',
      command_topic: 'hm2mqtt/VNSEMINI-0/control/mini-a/schedule/1/power',
    });
    expect(
      configs.find(entry => entry.config?.name === 'Schedule Slot 1 Power')?.config?.command_topic,
    ).toBeUndefined();
    expect(
      configs.find(entry => entry.config?.name === 'Schedule Slot 1 Apply')?.config
        ?.enabled_by_default,
    ).toBe(false);
    expect(
      configs.find(entry => entry.config?.name === 'Schedule Slot 1 Power')?.config,
    ).toMatchObject({
      state_class: 'measurement',
    });
    expect(
      configs.find(entry => entry.config?.name === 'Schedule Slot 1 Repeat (Raw)')?.config,
    ).toMatchObject({
      enabled_by_default: false,
    });
    expect(configs.filter(entry => entry.config == null)).toHaveLength(0);
  });
});
