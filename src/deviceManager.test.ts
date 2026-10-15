import { jest } from '@jest/globals';
import './device/registry.js';
import { DeviceManager } from './deviceManager.js';
import { DataHandler } from './dataHandler.js';
import { registerDeviceDefinition } from './deviceDefinition.js';
import { MqttConfig } from './types.js';
import { DEFAULT_TOPIC_PREFIX } from './constants.js';
import { calculateNewVersionTopicId } from './utils/crypt.js';
import logger from './logger.js';

describe('DeviceManager', () => {
  const mockConfig: MqttConfig = {
    brokerUrl: 'mqtt://localhost',
    clientId: 'test-client',
    topicPrefix: DEFAULT_TOPIC_PREFIX,
    autodiscoveryTopicPrefix: 'homeassistant',
    devices: [
      {
        deviceType: 'HMA-1',
        deviceId: 'test123',
      },
    ],
  };

  const mockOnUpdateState = jest.fn();

  let deviceManager: DeviceManager;

  beforeEach(() => {
    deviceManager = new DeviceManager(mockConfig, mockOnUpdateState);
  });

  it('should initialize with correct topics', () => {
    const device = mockConfig.devices[0];
    const topics = deviceManager.getDeviceTopics(device);
    expect(topics).toBeDefined();
    expect(topics?.deviceTopicOld).toBe('hame_energy/HMA-1/device/test123/ctrl');
    expect(topics?.deviceTopicNew).toBe(
      `marstek_energy/HMA-1/device/${calculateNewVersionTopicId(device.deviceId)}/ctrl`,
    );
    expect(topics?.publishTopic).toBe(`${DEFAULT_TOPIC_PREFIX}/HMA-1/device/test123`);
    expect(topics?.deviceControlTopicOld).toBe('hame_energy/HMA-1/App/test123/ctrl');
    expect(topics?.deviceControlTopicNew).toBe(
      `marstek_energy/HMA-1/App/${calculateNewVersionTopicId(device.deviceId)}/ctrl`,
    );
    expect(topics?.controlSubscriptionTopic).toBe(`${DEFAULT_TOPIC_PREFIX}/HMA-1/control/test123`);
    expect(topics?.availabilityTopic).toBe(`${DEFAULT_TOPIC_PREFIX}/HMA-1/availability/test123`);
  });

  it('should use custom topic prefix', () => {
    const customConfig: MqttConfig = {
      ...mockConfig,
      topicPrefix: 'customPrefix',
    };
    const dm = new DeviceManager(customConfig, mockOnUpdateState);
    const device = customConfig.devices[0];
    const topics = dm.getDeviceTopics(device);
    expect(topics?.publishTopic).toBe('customPrefix/HMA-1/device/test123');
    expect(topics?.controlSubscriptionTopic).toBe('customPrefix/HMA-1/control/test123');
    expect(topics?.availabilityTopic).toBe('customPrefix/HMA-1/availability/test123');
  });

  it('should handle invalid device types gracefully', () => {
    const invalidConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        {
          deviceType: 'INVALID-TYPE',
          deviceId: 'test123',
        },
      ],
    };

    // DeviceManager constructor should throw an error for invalid devices
    expect(() => new DeviceManager(invalidConfig, mockOnUpdateState)).toThrow(
      'No valid devices configured. All configured devices have unknown device types.',
    );
  });

  it('should handle mix of valid and invalid device types', () => {
    const mixedConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        {
          deviceType: 'INVALID-TYPE',
          deviceId: 'invalid123',
        },
        {
          deviceType: 'HMA-1',
          deviceId: 'valid123',
        },
      ],
    };

    const dm = new DeviceManager(mixedConfig, mockOnUpdateState);

    // Invalid device should not have topics
    const invalidTopics = dm.getDeviceTopics(mixedConfig.devices[0]);
    expect(invalidTopics).toBeUndefined();

    // Valid device should have topics
    const validTopics = dm.getDeviceTopics(mixedConfig.devices[1]);
    expect(validTopics).toBeDefined();

    // getPollingInterval should work since there's at least one valid device
    expect(() => dm.getPollingInterval()).not.toThrow();
  });

  it('should log "Did you mean" for typo in device type', () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const typoConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        { deviceType: 'HWJ-2', deviceId: 'typo123' },
        { deviceType: 'HMA-1', deviceId: 'valid123' },
      ],
    };

    new DeviceManager(typoConfig, mockOnUpdateState);
    expect(warnSpy).toHaveBeenCalledWith(
      'Skipping unknown device type: HWJ-2. Did you mean "HMJ"?',
    );
    warnSpy.mockRestore();
  });

  it('warns that a beta device type is unverified', () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const betaConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [{ deviceType: 'VNSEMINI-0', deviceId: 'mini123' }],
    };

    new DeviceManager(betaConfig, mockOnUpdateState);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('VNSEMINI-0 is in beta'));
    warnSpy.mockRestore();
  });

  it('stays quiet about beta for a device type that is not marked beta', () => {
    const warnSpy = jest.spyOn(logger, 'warn');

    new DeviceManager(mockConfig, mockOnUpdateState);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('is in beta'));
    warnSpy.mockRestore();
  });

  it('should not suggest for completely unrelated device type', () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    const unrelatedConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        { deviceType: 'ZZZZZ-1', deviceId: 'bad123' },
        { deviceType: 'HMA-1', deviceId: 'valid123' },
      ],
    };

    new DeviceManager(unrelatedConfig, mockOnUpdateState);
    expect(warnSpy).toHaveBeenCalledWith('Skipping unknown device type: ZZZZZ-1');
    warnSpy.mockRestore();
  });

  it('should match device type case-insensitively', () => {
    const caseConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [{ deviceType: 'hma-1', deviceId: 'case123' }],
    };

    const dm = new DeviceManager(caseConfig, mockOnUpdateState);
    const topics = dm.getDeviceTopics(caseConfig.devices[0]);
    expect(topics).toBeDefined();
  });

  it('should not encrypt new topics for non-HMA/HMF/HMK/HMJ devices', () => {
    const nonEncryptedConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [
        {
          deviceType: 'HMB-1',
          deviceId: 'test123',
        },
      ],
    };

    const dm = new DeviceManager(nonEncryptedConfig, mockOnUpdateState);
    const device = nonEncryptedConfig.devices[0];
    const topics = dm.getDeviceTopics(device);
    expect(topics?.deviceTopicNew).toBe('marstek_energy/HMB-1/device/test123/ctrl');
    expect(topics?.deviceControlTopicNew).toBe('marstek_energy/HMB-1/App/test123/ctrl');
  });

  describe('monotonic counter guard', () => {
    const venusConfig: MqttConfig = {
      brokerUrl: 'mqtt://localhost',
      clientId: 'test-client',
      topicPrefix: DEFAULT_TOPIC_PREFIX,
      autodiscoveryTopicPrefix: 'homeassistant',
      devices: [{ deviceType: 'VNSE3-0', deviceId: 'venus123' }],
    };

    let dm: DeviceManager;
    const device = venusConfig.devices[0];

    beforeEach(() => {
      dm = new DeviceManager(venusConfig, jest.fn());
    });

    const setCharging = (totalChargingCapacity: number) =>
      dm.updateDeviceState(device, 'data', () => ({ totalChargingCapacity }));
    const setDaily = (dailyChargingCapacity: number) =>
      dm.updateDeviceState(device, 'data', () => ({ dailyChargingCapacity }));
    const charging = () => (dm.getDeviceState(device) as any).totalChargingCapacity;
    const daily = () => (dm.getDeviceState(device) as any).dailyChargingCapacity;

    it('accepts the first reading', () => {
      setCharging(339.93);
      expect(charging()).toBe(339.93);
    });

    it('accepts normal non-decreasing readings', () => {
      setCharging(339.93);
      setCharging(340.5);
      expect(charging()).toBe(340.5);
    });

    it('suppresses a single corrupt backward jump and recovers', () => {
      setCharging(339.93);
      setCharging(33.99); // dropped-digit corruption
      expect(charging()).toBe(339.93); // rejected, last good value kept
      setCharging(339.93); // next poll recovers
      expect(charging()).toBe(339.93);
    });

    it('accepts a genuine reset once a following reading confirms it', () => {
      setDaily(5.0);
      setDaily(0.1); // first drop -> rejected pending confirmation
      expect(daily()).toBe(5.0);
      setDaily(0.2); // second consecutive low reading -> confirmed reset
      expect(daily()).toBe(0.2);
    });

    it('clears the pending drop when the value recovers before confirmation', () => {
      setDaily(5.0);
      setDaily(0.5); // glitch -> rejected
      expect(daily()).toBe(5.0);
      setDaily(5.1); // recovery resets the confirmation counter
      expect(daily()).toBe(5.1);
      setDaily(0.5); // a later isolated glitch must again be rejected (count reset)
      expect(daily()).toBe(5.1);
    });

    it("accepts the monthly reset of the Venus month's PV energy once confirmed", () => {
      const vnsa = { deviceType: 'VNSA-0', deviceId: 'venusA123' };
      const venusA = new DeviceManager({ ...venusConfig, devices: [vnsa] }, jest.fn());
      const month = () => (venusA.getDeviceState(vnsa) as any).pvEnergyTotal;
      venusA.updateDeviceState(vnsa, 'data', () => ({ pvEnergyTotal: 9000 }));
      venusA.updateDeviceState(vnsa, 'data', () => ({ pvEnergyTotal: 0 })); // glitch
      expect(month()).toBe(9000);
      venusA.updateDeviceState(vnsa, 'data', () => ({ pvEnergyTotal: 9010 }));
      expect(month()).toBe(9010);
      venusA.updateDeviceState(vnsa, 'data', () => ({ pvEnergyTotal: 30 })); // new month
      expect(month()).toBe(9010);
      venusA.updateDeviceState(vnsa, 'data', () => ({ pvEnergyTotal: 40 })); // confirmed
      expect(month()).toBe(40);
    });

    describe('CT002 cd=32 energy counters', () => {
      const hme = { deviceType: 'HME-4', deviceId: 'meter123' };
      let meter: DeviceManager;
      beforeEach(() => {
        meter = new DeviceManager({ ...venusConfig, devices: [hme] }, jest.fn());
      });
      const setEnergy = (phase1PositiveEnergy: number) =>
        meter.updateDeviceState(hme, 'energy', () => ({ phase1PositiveEnergy }));
      const energy = () => (meter.getDeviceState(hme) as any).phase1PositiveEnergy;

      it('holds the previous value after the rollover glitch until the counter catches up', () => {
        setEnergy(5990);
        setEnergy(6990); // read right after the rollover: new kWh, old hundredths
        expect(energy()).toBe(6990);
        // The drops that follow are within the glitch, however often they repeat.
        setEnergy(6020);
        expect(energy()).toBe(6990);
        setEnergy(6500);
        expect(energy()).toBe(6990);
        setEnergy(7000);
        expect(energy()).toBe(7000);
      });

      it('accepts a meter reboot seen near 0 once a following reading confirms it', () => {
        setEnergy(7000);
        setEnergy(12); // pending confirmation
        expect(energy()).toBe(7000);
        setEnergy(30);
        expect(energy()).toBe(30);
      });

      it('accepts a meter reboot first seen above 1 kWh', () => {
        setEnergy(50000);
        setEnergy(1500); // pending confirmation
        expect(energy()).toBe(50000);
        setEnergy(1600);
        expect(energy()).toBe(1600);
      });

      it('holds a small drop that is not a reboot', () => {
        setEnergy(50000);
        setEnergy(49500);
        expect(energy()).toBe(50000);
        setEnergy(49800);
        expect(energy()).toBe(50000);
        setEnergy(50100);
        expect(energy()).toBe(50100);
      });

      it('accepts a reboot that follows a held glitch', () => {
        setEnergy(1990);
        setEnergy(1020); // after a glitch reading of 1990 -> held
        expect(energy()).toBe(1990);
        setEnergy(10);
        expect(energy()).toBe(1990);
        setEnergy(25);
        expect(energy()).toBe(25);
      });
    });

    it('guards nested cumulative paths without dropping sibling fields', () => {
      const b2500 = new DeviceManager(mockConfig, jest.fn());
      const hma = mockConfig.devices[0];
      b2500.updateDeviceState(hma, 'data', () => ({
        dailyStats: { batteryChargingPower: 100, batteryDischargePower: 50 },
      }));
      b2500.updateDeviceState(hma, 'data', () => ({
        dailyStats: { batteryChargingPower: 10, batteryDischargePower: 60 },
      }));
      const stats = (b2500.getDeviceState(hma) as any).dailyStats;
      expect(stats.batteryChargingPower).toBe(100); // corrupt drop rejected
      expect(stats.batteryDischargePower).toBe(60); // sibling increase preserved
    });
  });

  describe('derived messages', () => {
    const defineDerived = (deviceType: string, derive: any) => {
      registerDeviceDefinition({ deviceTypes: [deviceType] }, ({ message }) => {
        message(
          {
            refreshDataPayload: 'cd=1',
            isMessage: () => true,
            publishPath: 'data',
            defaultState: {},
            getAdditionalDeviceInfo: () => ({}),
            pollInterval: 60000,
            controlsDeviceAvailability: true,
          },
          () => {},
        );
        message(
          {
            refreshDataPayload: '',
            isMessage: () => false,
            publishPath: 'derived',
            defaultState: {},
            getAdditionalDeviceInfo: () => ({}),
            pollInterval: 60000,
            controlsDeviceAvailability: false,
            polled: false,
            derive,
          },
          () => {},
        );
      });
    };

    const managerFor = (deviceType: string, onUpdate: any) =>
      new DeviceManager({ ...mockConfig, devices: [{ deviceType, deviceId: 'd1' }] }, onUpdate);

    it('publishes derived state when the derivation returns a value', () => {
      defineDerived('TESTDERIVEA', ({ stateByPath }: any) => ({
        doubled: (stateByPath['data']?.raw ?? 0) * 2,
      }));
      const onUpdate = jest.fn();
      const dm = managerFor('TESTDERIVEA', onUpdate);
      const device = { deviceType: 'TESTDERIVEA', deviceId: 'd1' };

      dm.updateDeviceState(device, 'data', () => ({ raw: 21 }) as any);

      const paths = onUpdate.mock.calls.map((c: any[]) => c[1]);
      expect(paths).toEqual(['data', 'derived']);
      expect((onUpdate.mock.calls[1][2] as any).doubled).toBe(42);
    });

    it('publishes nothing when the derivation returns undefined', () => {
      // This is what keeps a Venus from emitting a derived state update per
      // inbound message — eight per poll cycle — for a value that never moved.
      defineDerived('TESTDERIVEB', () => undefined);
      const onUpdate = jest.fn();
      const dm = managerFor('TESTDERIVEB', onUpdate);
      const device = { deviceType: 'TESTDERIVEB', deviceId: 'd1' };

      dm.updateDeviceState(device, 'data', () => ({ raw: 1 }) as any);
      dm.updateDeviceState(device, 'data', () => ({ raw: 2 }) as any);

      const paths = onUpdate.mock.calls.map((c: any[]) => c[1]);
      expect(paths).toEqual(['data', 'data']);
    });

    it('does not let a derived write trigger another derivation', () => {
      let calls = 0;
      defineDerived('TESTDERIVEC', () => {
        calls += 1;
        return { tick: calls };
      });
      const onUpdate = jest.fn();
      const dm = managerFor('TESTDERIVEC', onUpdate);
      const device = { deviceType: 'TESTDERIVEC', deviceId: 'd1' };

      dm.updateDeviceState(device, 'data', () => ({ raw: 1 }) as any);
      expect(calls).toBe(1);
    });

    it('survives a derivation that throws', () => {
      defineDerived('TESTDERIVED', () => {
        throw new Error('boom');
      });
      const onUpdate = jest.fn();
      const dm = managerFor('TESTDERIVED', onUpdate);
      const device = { deviceType: 'TESTDERIVED', deviceId: 'd1' };

      expect(() => dm.updateDeviceState(device, 'data', () => ({ raw: 1 }) as any)).not.toThrow();
      expect(onUpdate.mock.calls.map((c: any[]) => c[1])).toEqual(['data']);
    });

    it('sees per-path state rather than the flattened merge', () => {
      // Every path carries its own `timestamp`, so the merged view cannot say
      // which message a timestamp belongs to. Derivations get the real thing.
      let seen: any;
      defineDerived('TESTDERIVEE', ({ stateByPath }: any) => {
        seen = stateByPath;
        return { ok: true };
      });
      const dm = managerFor('TESTDERIVEE', jest.fn());
      const device = { deviceType: 'TESTDERIVEE', deviceId: 'd1' };

      dm.updateDeviceState(device, 'data', () => ({ raw: 1 }) as any);
      expect(Object.keys(seen)).toContain('data');
      expect(seen['data'].raw).toBe(1);
    });
  });

  describe('Venus CT power readings', () => {
    const hmg = { deviceType: 'HMG-50', deviceId: 'venus123' };

    it('keeps the readings of the last press until the next one', () => {
      const dm = new DeviceManager({ ...mockConfig, devices: [hmg] }, jest.fn());
      const dataHandler = new DataHandler(dm);
      const reading = () => {
        const state = dm.getDeviceState(hmg) as any;
        return [state.ctPhaseAPower, state.ctTotalPower, state.ctOutputPower];
      };

      // Synthetic replies: no cd=19 reply has been captured yet
      dataHandler.handleDeviceData(hmg, 'get_power=120|-30|15|105|300');
      expect(reading()).toEqual([120, 105, 300]);

      // A regular poll and a malformed reply leave them alone
      dataHandler.handleDeviceData(
        hmg,
        'cel_p=138,cel_c=27,tot_i=1,tot_o=1,ele_d=1,ele_m=1,grd_d=1,grd_m=1,inc_d=0,inc_m=0,inc_a=0,grd_f=0,grd_o=50,grd_t=3,gct_s=1,cel_s=3,err_t=0,err_a=0,dev_n=150,grd_y=0,wor_m=1',
      );
      dataHandler.handleDeviceData(hmg, 'get_power=1|2|3');
      expect(reading()).toEqual([120, 105, 300]);

      dataHandler.handleDeviceData(hmg, 'get_power=0|0|0|0|-400');
      expect(reading()).toEqual([0, 0, -400]);
    });
  });

  describe('getPollingInterval', () => {
    // The shared polling timer runs at the GCD of every message's interval, so a
    // single badly chosen interval speeds up polling for every device in the
    // process. None of this was covered before.
    const defineType = (
      deviceType: string,
      messages: { pollInterval: number; enabled?: boolean; polled?: boolean }[],
    ) => {
      registerDeviceDefinition({ deviceTypes: [deviceType] }, ({ message }) => {
        messages.forEach((options, idx) => {
          message(
            {
              refreshDataPayload: `cd=${idx}`,
              isMessage: () => false,
              publishPath: `path${idx}`,
              defaultState: {},
              getAdditionalDeviceInfo: () => ({}),
              controlsDeviceAvailability: false,
              ...options,
            },
            () => {},
          );
        });
      });
    };

    const intervalFor = (deviceType: string) =>
      new DeviceManager(
        { ...mockConfig, devices: [{ deviceType, deviceId: 'gcd' }] },
        jest.fn(),
      ).getPollingInterval();

    it('returns the greatest common divisor of the polled intervals', () => {
      defineType('TESTGCDPLAIN', [{ pollInterval: 60000 }, { pollInterval: 300000 }]);
      expect(intervalFor('TESTGCDPLAIN')).toBe(60000);
    });

    it('ignores disabled messages', () => {
      // 7000 is deliberately not a divisor of 60000: were it counted, the tick
      // would collapse to 1000 ms for every device in the process.
      defineType('TESTGCDDISABLED', [
        { pollInterval: 60000 },
        { pollInterval: 7000, enabled: false },
      ]);
      expect(intervalFor('TESTGCDDISABLED')).toBe(60000);
    });

    it('ignores derived messages, which are never requested', () => {
      defineType('TESTGCDDERIVED', [
        { pollInterval: 60000 },
        { pollInterval: 5000, polled: false },
      ]);
      expect(intervalFor('TESTGCDDERIVED')).toBe(60000);
    });

    it('falls back to the unfiltered set rather than leaving the tick undefined', () => {
      defineType('TESTGCDNONE', [
        { pollInterval: 30000, enabled: false },
        { pollInterval: 45000, polled: false },
      ]);
      expect(intervalFor('TESTGCDNONE')).toBe(15000);
    });
  });
});
