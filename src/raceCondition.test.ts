/**
 * Reproduction attempts for issue #283: "Setting changes are not being processed".
 *
 * The user reports that the charging-mode control command was published by
 * hm2mqtt but the device did not apply it. Every ~60s a "heavy" poll cycle
 * fires four back-to-back data requests (cd=1, cd=16, cd=13, cd=21), and a
 * control message arriving in that window appears to be occasionally dropped.
 *
 * These tests exercise the hm2mqtt side of that interaction to determine
 * whether hm2mqtt itself (a) publishes the command and (b) publishes it in the
 * expected order. If any of these tests fail, there's a pure hm2mqtt bug.
 */

import { DEFAULT_TOPIC_PREFIX } from './constants';

jest.mock('mqtt', () => {
  const mockClient = {
    on: jest.fn(),
    publish: jest.fn((topic, message, options, callback) => {
      if (callback) callback(null);
      return { messageId: '123' };
    }),
    subscribe: jest.fn((topic, callback) => {
      if (callback) callback(null);
    }),
    end: jest.fn(),
    connected: true,
    __noCallThru: true,
  };

  const handlers: Record<string, Array<(...args: any[]) => void>> = {
    message: [],
    connect: [],
    error: [],
    close: [],
  };

  mockClient.on.mockImplementation((event, handler) => {
    if (handlers[event]) handlers[event].push(handler);
    return mockClient;
  });

  (mockClient as any).triggerEvent = (event: string, ...args: any[]) => {
    if (handlers[event]) handlers[event].forEach(handler => handler(...args));
  };

  return {
    connect: jest.fn(() => mockClient),
    __mockClient: mockClient,
    __handlers: handlers,
  };
});

jest.mock('dotenv', () => ({
  config: jest.fn(() => {
    process.env.MQTT_BROKER_URL = 'mqtt://test-broker:1883';
    process.env.MQTT_CLIENT_ID = 'test-client';
    process.env.DEVICE_1 = 'HMJ-2:b42f0398916c';
    // 20s polling to mirror the configuration from the issue.
    process.env.MQTT_POLLING_INTERVAL = '20000';
    process.env.MQTT_TOPIC_PREFIX = DEFAULT_TOPIC_PREFIX;
    // Enable all heavy polls so cd=1, cd=16, cd=13, cd=21 all fire every 60s
    // (same as enableCellData/enableCalibrationData/enableExtraBatteryData).
    process.env.POLL_CELL_DATA = 'true';
    process.env.POLL_CALIBRATION_DATA = 'true';
    process.env.POLL_EXTRA_BATTERY_DATA = 'true';
    process.env.MQTT_PROXY_ENABLED = 'false';
  }),
}));

type PublishRecord = { topic: string; payload: string };

function recordedCommandPublishes(mockClient: any, deviceId: string): PublishRecord[] {
  return mockClient.publish.mock.calls
    .filter((c: any[]) => typeof c[0] === 'string' && c[0].includes(`/App/`) && c[0].includes(deviceId))
    .map((c: any[]) => ({ topic: c[0], payload: String(c[1]) }));
}

function recordedCommandPublishesAny(mockClient: any): PublishRecord[] {
  return mockClient.publish.mock.calls
    .filter((c: any[]) => typeof c[0] === 'string' && c[0].includes(`/App/`))
    .map((c: any[]) => ({ topic: c[0], payload: String(c[1]) }));
}

describe('Race condition between poll cycle and control commands (issue #283)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('control command sent between scheduled poll setTimeouts is still published', () => {
    jest.useFakeTimers();
    require('./index');
    const mqttMock = require('mqtt');
    const mockClient = mqttMock.__mockClient;

    // Trigger connect; this issues an initial requestDeviceData which schedules
    // a burst of setTimeouts at idx*100ms for cd=1, cd=16, cd=13, cd=21.
    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    // Fire setTimeout for idx=0 (cd=1 - runtime data).
    jest.advanceTimersByTime(0);

    // At this point cd=1 has been published to old + new topics. The cd=16
    // setTimeout is pending at t+100ms, cd=13 at t+200ms, cd=21 at t+300ms.
    // Simulate a control message arriving from the broker *now*.
    const controlTopic = `${DEFAULT_TOPIC_PREFIX}/HMJ-2/control/b42f0398916c/charging-mode`;
    mockClient.triggerEvent(
      'message',
      controlTopic,
      Buffer.from('chargeDischargeSimultaneously'),
    );

    // Drain remaining poll setTimeouts.
    jest.advanceTimersByTime(1000);

    const publishes = recordedCommandPublishesAny(mockClient);
    const payloads = publishes.map(p => p.payload);

    // The user's command must be present.
    expect(payloads).toEqual(expect.arrayContaining(['cd=17,md=0']));

    // And all four poll commands must be present as well.
    for (const expected of ['cd=1', 'cd=16', 'cd=13', 'cd=21']) {
      expect(payloads).toEqual(expect.arrayContaining([expected]));
    }
  });

  test('order of publishes: poll -> command -> remaining polls is preserved', () => {
    jest.useFakeTimers();
    require('./index');
    const mqttMock = require('mqtt');
    const mockClient = mqttMock.__mockClient;

    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    // Fire cd=1 (idx=0).
    jest.advanceTimersByTime(0);
    // Fire cd=16 (idx=1).
    jest.advanceTimersByTime(100);

    // User command arrives between cd=16 and cd=13.
    const controlTopic = `${DEFAULT_TOPIC_PREFIX}/HMJ-2/control/b42f0398916c/charging-mode`;
    mockClient.triggerEvent(
      'message',
      controlTopic,
      Buffer.from('chargeDischargeSimultaneously'),
    );

    // Drain cd=13 (idx=2) and cd=21 (idx=3).
    jest.advanceTimersByTime(500);

    // Look at publishes on the *old* topic only, to get a clean per-topic
    // ordering (each command/poll is published twice: old and new).
    const oldPublishes = mockClient.publish.mock.calls
      .filter(
        (c: any[]) =>
          typeof c[0] === 'string' &&
          c[0] === 'hame_energy/HMJ-2/App/b42f0398916c/ctrl',
      )
      .map((c: any[]) => String(c[1]));

    // Expected hm2mqtt-side order:
    //   cd=1, cd=16, (user command) cd=17,md=0, cd=13, cd=21
    const commandIdx = oldPublishes.indexOf('cd=17,md=0');
    const cd1Idx = oldPublishes.indexOf('cd=1');
    const cd16Idx = oldPublishes.indexOf('cd=16');
    const cd13Idx = oldPublishes.indexOf('cd=13');
    const cd21Idx = oldPublishes.indexOf('cd=21');

    expect(cd1Idx).toBeGreaterThanOrEqual(0);
    expect(cd16Idx).toBeGreaterThan(cd1Idx);
    expect(commandIdx).toBeGreaterThan(cd16Idx);
    expect(cd13Idx).toBeGreaterThan(commandIdx);
    expect(cd21Idx).toBeGreaterThan(cd13Idx);
  });

  test('two rapid control commands are both published (no drop)', () => {
    jest.useFakeTimers();
    require('./index');
    const mqttMock = require('mqtt');
    const mockClient = mqttMock.__mockClient;

    mockClient.triggerEvent('connect');
    mockClient.publish.mockClear();

    const controlTopic = `${DEFAULT_TOPIC_PREFIX}/HMJ-2/control/b42f0398916c/charging-mode`;
    mockClient.triggerEvent(
      'message',
      controlTopic,
      Buffer.from('chargeDischargeSimultaneously'),
    );
    mockClient.triggerEvent('message', controlTopic, Buffer.from('chargeThenDischarge'));

    jest.advanceTimersByTime(1000);

    const oldPublishes = mockClient.publish.mock.calls
      .filter(
        (c: any[]) =>
          typeof c[0] === 'string' &&
          c[0] === 'hame_energy/HMJ-2/App/b42f0398916c/ctrl',
      )
      .map((c: any[]) => String(c[1]));

    expect(oldPublishes).toEqual(expect.arrayContaining(['cd=17,md=0', 'cd=17,md=1']));
  });

  test('device data response arriving before control command does not clobber upcoming command', () => {
    jest.useFakeTimers();
    require('./index');
    const mqttMock = require('mqtt');
    const mockClient = mqttMock.__mockClient;

    mockClient.triggerEvent('connect');
    // Drain the initial poll burst.
    jest.advanceTimersByTime(500);
    mockClient.publish.mockClear();

    // Device responds to cd=1 with "chargeThenDischarge" (cs=1) -- state that
    // the user is about to override.
    const deviceTopic = 'hame_energy/HMJ-2/device/b42f0398916c/ctrl';
    const runtimeResponse =
      'p1=0,p2=0,w1=0,w2=0,pe=92,vv=116,sv=6,cs=1,cd=0,am=0,o1=0,o2=0,do=100,lv=0,cj=1,kn=2060,g1=0,g2=0,b1=0,b2=0,md=0,d1=0,e1=0:0,f1=23:59,h1=80,d2=0,e2=0:0,f2=23:59,h2=80,d3=0,e3=0:0,f3=23:59,h3=80,sg=0,sp=80,st=0,tl=15,th=16,tc=0,tf=0,fc=202409090159,id=5,a0=92,a1=0,a2=0,l0=0,l1=0,c0=255,c1=0,bc=1235,bs=0,pt=1408,it=0,m0=0,m1=0,m2=0,m3=0,d4=0,e4=0:0,f4=23:59,h4=80,d5=0,e5=0:0,f5=23:59,h5=80,lmo=1736,lmi=282,lmf=1,uv=107,sm=0,bn=0,ct_t=3,tc_dis=0,ws=-81,fktc=0';
    mockClient.triggerEvent('message', deviceTopic, Buffer.from(runtimeResponse));

    // Immediately afterwards, user sends the control message.
    const controlTopic = `${DEFAULT_TOPIC_PREFIX}/HMJ-2/control/b42f0398916c/charging-mode`;
    mockClient.triggerEvent(
      'message',
      controlTopic,
      Buffer.from('chargeDischargeSimultaneously'),
    );

    jest.advanceTimersByTime(1000);

    const commandPublishes = mockClient.publish.mock.calls
      .filter(
        (c: any[]) =>
          typeof c[0] === 'string' && c[0].includes('/App/b42f0398916c/ctrl'),
      )
      .map((c: any[]) => String(c[1]));

    // cd=17,md=0 must be published despite the poll response landing first.
    expect(commandPublishes).toEqual(expect.arrayContaining(['cd=17,md=0']));
  });
});
