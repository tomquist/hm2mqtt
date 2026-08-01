import { jest } from '@jest/globals';
import './device/registry.js';
import { parseMessage } from './parser.js';
import logger from './logger.js';
import {
  B2500CellData,
  B2500V2DeviceData,
  CT002DeviceData,
  CT002PhaseEnergyInfo,
  HmiInverterDeviceData,
  JupiterBMSInfo,
  JupiterDeviceData,
  JupiterNetworkInfo,
  SmrMeterDeviceData,
  VenusBMSInfo,
  VenusBMSPackInfo,
  VenusBMSPackDetail,
  VenusDeviceData,
  VenusNetworkInfo,
} from './types.js';

describe('MQTT Message Parser', () => {
  test('should parse comma-separated key-value pairs correctly', () => {
    // Sample message from the provided format
    const message =
      'p1=1,p2=2,w1=0,w2=0,pe=14,vv=224,sv=3,cs=0,cd=0,am=0,o1=0,o2=0,do=90,lv=800,g1=0,g2=0,kn=2000';
    const deviceType = 'HMA-1';
    const deviceId = '12345';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as B2500V2DeviceData;

    // Check the structure
    expect(result).toHaveProperty('deviceType', deviceType);
    expect(result).toHaveProperty('deviceId', deviceId);
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('values');

    // Check some values
    expect(result.values).toHaveProperty('p1', '1');
    expect(result.values).toHaveProperty('p2', '2');
    expect(result.values).toHaveProperty('pe', '14');
    expect(result.values).toHaveProperty('vv', '224');
    expect(result.values).toHaveProperty('lv', '800');

    // Check enhanced fields
    expect(result).toHaveProperty('batteryPercentage', 14);
    expect(result).toHaveProperty('solarInputStatus');
    expect(result.solarInputStatus).toHaveProperty('input1Charging', true);
    expect(result.solarInputStatus).toHaveProperty('input1PassThrough', false);
    expect(result.solarInputStatus).toHaveProperty('input2Charging', false);
    expect(result.solarInputStatus).toHaveProperty('input2PassThrough', true);
    expect(result).toHaveProperty('solarPower');
    expect(result.solarPower).toHaveProperty('input1', 0);
    expect(result.solarPower).toHaveProperty('input2', 0);
    expect(result.deviceInfo).toHaveProperty('deviceVersion', 224);

    // Test with sv (subversion) included
    const messageWithSv =
      'p1=0,p2=0,w1=0,w2=0,pe=14,vv=224,sv=3,cs=0,cd=0,lmo1=1377,lmi1=614,lmf=0,kn=313,do=90,o1=0,o2=0,am=0,g1=0,g2=0,b1=0,b2=0,md=0,d1=1,e1=0:0,f1=23:59,h1=800';
    const parsedWithSv = parseMessage(messageWithSv, deviceType, deviceId);
    expect(parsedWithSv).toHaveProperty('data');

    const resultWithSv = parsedWithSv['data'] as B2500V2DeviceData;
    expect(resultWithSv.deviceInfo).toHaveProperty('deviceSubversion', 3);
  });

  test('should handle malformed input gracefully', () => {
    const message = 'key1=123,malformed,key3=45.67';
    const result = parseMessage(message, 'TestDevice', '12345');

    expect(result).toEqual({});
    // The malformed part should be skipped
  });

  test('should parse a full device message correctly', () => {
    // Full message example from documentation
    const message =
      'p1=0,p2=0,w1=0,w2=0,pe=14,vv=224,sv=3,cs=0,cd=0,am=0,o1=0,o2=0,do=90,lv=800,cj=1,kn=313,g1=0,g2=0,b1=0,b2=0,md=0,d1=1,e1=0:0,f1=23:59,h1=800,d2=0,e2=0:0,f2=23:59,h2=200,d3=0,e3=0:0,f3=23:59,h3=800,sg=0,sp=80,st=0,tl=12,th=13,tc=0,tf=0,fc=202310231502,id=5,a0=14,a1=0,a2=0,l0=0,l1=0,c0=255,c1=4,bc=622,bs=512,pt=1552,it=1332,m0=0,m1=0,m2=0,m3=0,d4=0,e4=2:0,f4=23:59,h4=50,d5=0,e5=0:0,f5=23:59,h5=347,lmo=1377,lmi=614,lmf=0,uv=10';
    const deviceType = 'HMA-1';
    const deviceId = 'e88da6f35def';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as B2500V2DeviceData;

    // Check basic fields
    expect(result).toHaveProperty('batteryPercentage', 14);
    expect(result).toHaveProperty('batteryCapacity', 313);
    expect(result.deviceInfo).toHaveProperty('fc42dVersion', '202310231502');
    expect(result.deviceInfo).toHaveProperty('deviceIdNumber', 5);

    // Check temperature
    expect(result).toHaveProperty('temperature');
    expect(result.temperature).toHaveProperty('min', 12);
    expect(result.temperature).toHaveProperty('max', 13);

    // Check time periods
    expect(result).toHaveProperty('timePeriods');
    expect(result.timePeriods).toBeDefined();
    expect(Array.isArray(result.timePeriods)).toBe(true);
    if (result.timePeriods && result.timePeriods[0]) {
      expect(result.timePeriods[0]).toHaveProperty('enabled', true);
      expect(result.timePeriods[0]).toHaveProperty('startTime', '00:00');
      expect(result.timePeriods[0]).toHaveProperty('endTime', '23:59');
      expect(result.timePeriods[0]).toHaveProperty('outputValue', 800);
    }

    // Check daily stats
    expect(result).toHaveProperty('dailyStats');
    expect(result.dailyStats).toBeDefined();
    if (result.dailyStats) {
      expect(result.dailyStats).toHaveProperty('batteryChargingPower', 622);
      expect(result.dailyStats).toHaveProperty('batteryDischargePower', 512);
      expect(result.dailyStats).toHaveProperty('photovoltaicChargingPower', 1552);
      expect(result.dailyStats).toHaveProperty('microReverseOutputPower', 1332);
    }

    // Check battery packs
    expect(result).toHaveProperty('batteryPacks');
    expect(result.batteryPacks).toBeDefined();
    if (result.batteryPacks) {
      expect(result.batteryPacks).toHaveProperty('pack1Connected', false);
      expect(result.batteryPacks).toHaveProperty('pack2Connected', false);
    }

    // Check solar input status
    expect(result).toHaveProperty('solarInputStatus');
    expect(result.solarInputStatus).toBeDefined();
    if (result.solarInputStatus) {
      expect(result.solarInputStatus).toHaveProperty('input1Charging', false);
      expect(result.solarInputStatus).toHaveProperty('input1PassThrough', false);
      expect(result.solarInputStatus).toHaveProperty('input2Charging', false);
      expect(result.solarInputStatus).toHaveProperty('input2PassThrough', false);
    }

    // Check output state
    expect(result).toHaveProperty('outputState');
    expect(result.outputState).toBeDefined();
    if (result.outputState) {
      expect(result.outputState).toHaveProperty('output1', false);
      expect(result.outputState).toHaveProperty('output2', false);
    }

    // Check rated power
    expect(result).toHaveProperty('ratedPower');
    expect(result.ratedPower).toBeDefined();
    if (result.ratedPower) {
      expect(result.ratedPower).toHaveProperty('output', 1377);
      expect(result.ratedPower).toHaveProperty('input', 614);
      expect(result.ratedPower).toHaveProperty('isLimited', false);
    }
  });

  test('should read the WiFi signal as signed dBm and drop the sentinels', () => {
    const base = 'pe=75,kn=500,lv=300,e1=0:0,do=90,p1=0,p2=0,w1=0,w2=0,vv=224,o1=0,o2=0,g1=0,g2=0';
    const ws = (value: string) =>
      (parseMessage(`${base},ws=${value}`, 'HMA-1', '12345')['data'] as B2500V2DeviceData)
        .wifiSignalStrength;

    // The device already reports a signed dBm value.
    expect(ws('-79')).toBe(-79);
    expect(ws('-42')).toBe(-42);

    // Both "no reading" values are dropped: 0 (no Wi-Fi state yet) and
    // 32767 (association down).
    expect(ws('0')).toBeUndefined();
    expect(ws('32767')).toBeUndefined();

    // Absent on devices that do not report it
    const without = parseMessage(base, 'HMA-1', '12345');
    expect((without['data'] as B2500V2DeviceData).wifiSignalStrength).toBeUndefined();
  });

  test('should parse all 16 cell voltages per pack', () => {
    const cells = (prefix: string, mv: number) =>
      Array.from({ length: 16 }, (_, i) => `${prefix}${i.toString(16)}=${mv + i}`).join(',');
    const message = [cells('a', 3300), cells('b', 0), cells('c', 0)].join(',');

    const result = parseMessage(message, 'HMA-1', '12345')['cells'] as B2500CellData;
    expect(result.cellVoltage?.host?.cells).toHaveLength(16);
    // a0=3300 .. af=3315, scaled from mV to V
    expect(result.cellVoltage?.host?.cells[15]).toBeCloseTo(3.315, 5);
    expect(result.cellVoltage?.host?.min).toBeCloseTo(3.3, 5);
    expect(result.cellVoltage?.host?.max).toBeCloseTo(3.315, 5);
  });

  test('should ignore unused cell slots reported as 0 (issue #384)', () => {
    // A 14-cell pack fills the first 14 slots and reports the remaining two as
    // 0. Those must not drag the minimum to 0, blow up the difference or pull
    // the average down.
    const used = Array.from({ length: 14 }, (_, i) => `a${i.toString(16)}=${3300 + i}`);
    const unused = ['ae=0', 'af=0'];
    const message = [...used, ...unused].join(',');

    const result = parseMessage(message, 'HMA-1', '12345')['cells'] as B2500CellData;
    expect(result.cellVoltage?.host?.min).toBeCloseTo(3.3, 5);
    expect(result.cellVoltage?.host?.max).toBeCloseTo(3.313, 5);
    expect(result.cellVoltage?.host?.diff).toBeCloseTo(0.013, 5);
    // Average over the 14 populated cells only: 3300..3313 -> 3306.5, rounded
    // to 3307 mV before scaling.
    expect(result.cellVoltage?.host?.avg).toBeCloseTo(3.307, 5);
    // The empty slots are published as unknown, not as 0 V cells
    expect(result.cellVoltage?.host?.cells[13]).toBeCloseTo(3.313, 5);
    expect(result.cellVoltage?.host?.cells[14]).toBeUndefined();
    expect(result.cellVoltage?.host?.cells[15]).toBeUndefined();
  });

  test('should handle message definitions correctly', () => {
    // Create a simple test message
    const message =
      'pe=75,kn=500,lv=300,e1=0:0,do=90,p1=0,p2=0,w1=0,w2=0,vv=224,o1=0,o2=0,g1=0,g2=0';
    const parsed = parseMessage(message, 'HMA-1', '12345');
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as B2500V2DeviceData;

    // Check that the values were mapped correctly according to the definition
    expect(result).toHaveProperty('batteryPercentage', 75);
    expect(result).toHaveProperty('batteryCapacity', 500);
    expect(result).toHaveProperty('batteryOutputThreshold', 300);

    // Check time string transformation
    expect(result).toHaveProperty('timePeriods');
    expect(Array.isArray(result.timePeriods)).toBe(true);
    expect(result.timePeriods?.[0]).toHaveProperty('startTime', '00:00');
  });

  test('should transform scene values correctly', () => {
    // Test scene transformation for different values
    const requiredKeys =
      'pe=75,kn=500,lv=300,e1=0:0,do=90,p1=0,p2=0,w1=0,w2=0,vv=224,o1=0,o2=0,g1=0,g2=0';
    const { data: dayScene } = parseMessage(`${requiredKeys},cj=0`, 'HMA-1', '12345');
    expect(dayScene).toHaveProperty('scene', 'day');

    const { data: nightScene } = parseMessage(`${requiredKeys},cj=1`, 'HMA-1', '12345');
    expect(nightScene).toHaveProperty('scene', 'night');

    const { data: duskScene } = parseMessage(`${requiredKeys},cj=2`, 'HMA-1', '12345');
    expect(duskScene).toHaveProperty('scene', 'dusk');

    const { data: unknownScene } = parseMessage(`${requiredKeys},cj=3`, 'HMA-1', '12345');
    expect(unknownScene).toHaveProperty('scene', undefined);
  });

  test('should parse CT002 smart meter message', () => {
    const message =
      'pwr_a=119,pwr_b=15,pwr_c=-136,pwr_t=-1,ble_s=5,wif_r=-79,fc4_v=202409090159,ver_v=119,wif_s=2,slv_n=1,cur_d=0';
    const { data } = parseMessage(message, 'HME-4', 'abcd');

    expect(data).toBeDefined();
    const result = data as any;
    expect(result).toHaveProperty('phase1Power', 119);
    expect(result).toHaveProperty('phase2Power', 15);
    expect(result).toHaveProperty('phase3Power', -136);
    expect(result).toHaveProperty('totalPower', -1);
    expect(result).toHaveProperty('bluetoothSignal', 5);
    expect(result).toHaveProperty('wifiRssi', -79);
    expect(result).toHaveProperty('fc4Version', '202409090159');
    expect(result).toHaveProperty('firmwareVersion', 119);
    expect(result).toHaveProperty('wifiStatus', 2);
    expect(result).toHaveProperty('slaveCount', 1);
    // cur_d=0: no phase has its measurement direction reversed
    expect(result).toHaveProperty('phase1MeasurementReversed', false);
    expect(result).toHaveProperty('phase2MeasurementReversed', false);
    expect(result).toHaveProperty('phase3MeasurementReversed', false);
  });

  test('should parse CT002 messages for the TPM and TPM2 device types', () => {
    // TPM-CN (CT002-CN) and TPM2-0 (TPM2-100CT) use the same parser as HME-4
    const message = 'pwr_a=100,pwr_b=0,pwr_c=0,pwr_t=100,ver_v=42,cur_d=0';

    for (const deviceType of ['TPM-CN', 'TPM2-0']) {
      const { data } = parseMessage(message, deviceType, 'abcd');
      expect(data).toBeDefined();
      const result = data as CT002DeviceData;
      expect(result).toHaveProperty('deviceType', deviceType);
      expect(result).toHaveProperty('phase1Power', 100);
      expect(result).toHaveProperty('totalPower', 100);
      expect(result).toHaveProperty('firmwareVersion', 42);
    }
  });

  test('should parse the CT002 cd=19 per-phase charge/discharge counters', () => {
    const message = 'ca=100,cb=200,cc=300,da=10,db=20,dc=30';
    const parsed = parseMessage(message, 'HME-4', 'abcd');

    // Published under its own path, separate from the cd=1 runtime data
    expect(Object.keys(parsed)).toEqual(['phase_energy']);
    const result = parsed['phase_energy'] as CT002PhaseEnergyInfo;
    expect(result).toHaveProperty('phase1Charge', 100);
    expect(result).toHaveProperty('phase2Charge', 200);
    expect(result).toHaveProperty('phase3Charge', 300);
    expect(result).toHaveProperty('phase1Discharge', 10);
    expect(result).toHaveProperty('phase2Discharge', 20);
    expect(result).toHaveProperty('phase3Discharge', 30);
  });

  test('should ignore the cd=19 write acknowledgement', () => {
    // A write is acknowledged with `ret` rather than the counters
    expect(parseMessage('ca=1,cb=1,cc=1,da=1,db=1,dc=1,ret=0', 'HME-4', 'abcd')).toEqual({});
  });

  test('should not handle cd=19 on SMR readers', () => {
    // The SMR family reports its energy as eng_t in the cd=1 payload instead
    expect(parseMessage('ca=100,cb=200,cc=300,da=10,db=20,dc=30', 'SMR-0', 'abcd')).toEqual({});
  });

  test('should decode the per-phase measurement direction bitmask', () => {
    // cur_d=5 -> bit 0 (phase 1) and bit 2 (phase 3) set
    const message = 'pwr_a=0,pwr_b=0,pwr_c=0,pwr_t=0,cur_d=5';
    const { data } = parseMessage(message, 'HME-4', 'abcd');

    const result = data as CT002DeviceData;
    expect(result).toHaveProperty('phase1MeasurementReversed', true);
    expect(result).toHaveProperty('phase2MeasurementReversed', false);
    expect(result).toHaveProperty('phase3MeasurementReversed', true);
  });

  test('should parse SMR smart meter reader message', () => {
    const message =
      'pwr_a=119,pwr_b=15,pwr_c=-136,pwr_t=-1,eng_t=1234567,smt_n=12,har_f=1,sof_f=0,irs_f=0,pwr_f=7,' +
      'ble_s=5,wif_r=-79,fc4_v=202409090159,ver_v=108,wif_s=2,slv_n=0,cur_d=2,com_t=1,com_b=115200,ptl_t=3';
    const { data } = parseMessage(message, 'SMR-0', 'b8d08fc5f943');

    expect(data).toBeDefined();
    const result = data as SmrMeterDeviceData;

    expect(result).toHaveProperty('deviceType', 'SMR-0');
    expect(result).toHaveProperty('phase1Power', 119);
    expect(result).toHaveProperty('phase2Power', 15);
    expect(result).toHaveProperty('phase3Power', -136);
    expect(result).toHaveProperty('totalPower', -1);
    // eng_t is reported in 0.1 Wh
    expect(result).toHaveProperty('totalEnergy', 123456.7);
    expect(result).toHaveProperty('meterNumber', 12);
    expect(result).toHaveProperty('p1DeviceConnected', true);
    expect(result).toHaveProperty('p1ReadStatus', 0);
    expect(result).toHaveProperty('infraredReadStatus', 0);
    expect(result).toHaveProperty('phaseReadStatus', 7);
    expect(result).toHaveProperty('bluetoothSignal', 5);
    expect(result).toHaveProperty('wifiRssi', -79);
    expect(result).toHaveProperty('fc4Version', '202409090159');
    expect(result).toHaveProperty('firmwareVersion', 108);
    expect(result).toHaveProperty('wifiStatus', 2);
    // Shared with the CT002: slave count and the per-phase direction bitmask
    expect(result).toHaveProperty('slaveCount', 0);
    expect(result).toHaveProperty('phase1MeasurementReversed', false);
    expect(result).toHaveProperty('phase2MeasurementReversed', true);
    expect(result).toHaveProperty('phase3MeasurementReversed', false);

    // Keys hm2mqtt does not map are still exposed raw
    expect(result.values).toHaveProperty('com_t', '1');
    expect(result.values).toHaveProperty('com_b', '115200');
    expect(result.values).toHaveProperty('ptl_t', '3');
  });

  test('should report a disconnected P1 reader', () => {
    const message = 'pwr_t=0,ver_v=108,har_f=0';
    const { data } = parseMessage(message, 'SMR-0', 'b8d08fc5f943');

    expect(data).toBeDefined();
    expect(data as SmrMeterDeviceData).toHaveProperty('p1DeviceConnected', false);
  });

  test('should parse HMI inverter (2-PV) message correctly', () => {
    // Sample message from an HMI inverter (2-PV variant, formerly MI800)
    const message =
      'ele_d=11,ele_s=1433,ele_m=1433,pv1_v=334,pv1_i=0,pv1_p=16,pv1_s=1,pv2_v=335,pv2_i=0,pv2_p=15,pv2_s=1,pe1_v=17,fb1_v=847,fb2_v=826,grd_f=4999,grd_v=2455,grd_s=1,grd_o=29,chp_t=33,rel_s=1,err_t=0,err_c=0,err_d=0,ver_s=120,mpt_m=1,ble_s=1,mpt1=1,mpt2=1,wif_r=69,fc4_v=202406141323,gc=0,pl=800,ct_r=0,ct_f=0,ct_c=0';
    const deviceType = 'HMI-1';
    const deviceId = '24197287XXXX';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as HmiInverterDeviceData;

    // Check the structure
    expect(result).toHaveProperty('deviceType', deviceType);
    expect(result).toHaveProperty('deviceId', deviceId);
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('values');

    // Check raw values are preserved
    expect(result.values).toHaveProperty('ele_d', '11');
    expect(result.values).toHaveProperty('pv1_v', '334');
    expect(result.values).toHaveProperty('grd_f', '4999');
    expect(result.values).toHaveProperty('chp_t', '33');

    // Check energy statistics (with /100 scale factor)
    expect(result).toHaveProperty('dailyEnergyGenerated', 0.11);
    expect(result).toHaveProperty('totalEnergyGenerated', 14.33);
    expect(result).toHaveProperty('monthlyEnergyGenerated', 14.33);

    // Check PV Input 1 (voltage/current with /10 scale factor)
    expect(result).toHaveProperty('pv1Voltage', 33.4);
    expect(result).toHaveProperty('pv1Current', 0);
    expect(result).toHaveProperty('pv1Power', 16);
    expect(result).toHaveProperty('pv1Status', true);

    // Check PV Input 2
    expect(result).toHaveProperty('pv2Voltage', 33.5);
    expect(result).toHaveProperty('pv2Current', 0);
    expect(result).toHaveProperty('pv2Power', 15);
    expect(result).toHaveProperty('pv2Status', true);

    // Check grid information
    expect(result).toHaveProperty('gridFrequency', 49.99);
    expect(result).toHaveProperty('gridVoltage', 245.5);
    expect(result).toHaveProperty('gridStatus', true);
    expect(result).toHaveProperty('gridOutputPower', 29);

    // Check device status
    expect(result).toHaveProperty('chipTemperature', 33);
    expect(result).toHaveProperty('errorType', 0);
    expect(result).toHaveProperty('errorCount', 0);
    expect(result).toHaveProperty('errorDetails', 0);
    expect(result).toHaveProperty('firmwareVersion', 120);

    expect(result).toHaveProperty('maximumOutputPower', 800);
    expect(result).toHaveProperty('mode', 'b2500Boost');
    expect(result).toHaveProperty('fc4Version', '202406141323');
    expect(result).toHaveProperty('gridConnectionBan', false);

    // Connectivity diagnostics
    expect(result).toHaveProperty('bluetoothSignal', 1);
    expect(result).toHaveProperty('wifiRssi', 69);

    // 2-PV variant: no PV3/PV4 data
    expect(result.pv3Voltage).toBeUndefined();
    expect(result.pv4Voltage).toBeUndefined();
  });

  test('should parse HMI-2000 (4-PV) inverter message correctly', () => {
    // HMI-2000 reports four PV inputs (pv3_*/pv4_*) in addition to the base fields
    const message =
      'ele_d=11,ele_s=1433,ele_m=1433,pv1_v=334,pv1_i=0,pv1_p=16,pv1_s=1,pv2_v=335,pv2_i=0,pv2_p=15,pv2_s=1,pv3_v=336,pv3_i=2,pv3_p=17,pv3_s=1,pv4_v=337,pv4_i=3,pv4_p=18,pv4_s=0,grd_f=4999,grd_v=2455,grd_s=1,grd_o=66,chp_t=33,ver_s=120,mpt_m=1,ble_s=4,wif_r=72,fc4_v=202406141323,gc=0,pl=2000';
    const deviceType = 'HMI-2000';
    const deviceId = '24197287YYYY';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as HmiInverterDeviceData;

    expect(result).toHaveProperty('deviceType', deviceType);

    // PV1/PV2 still parse
    expect(result).toHaveProperty('pv1Voltage', 33.4);
    expect(result).toHaveProperty('pv2Voltage', 33.5);

    // PV3 (voltage/current /10, power raw, status boolean)
    expect(result).toHaveProperty('pv3Voltage', 33.6);
    expect(result).toHaveProperty('pv3Current', 0.2);
    expect(result).toHaveProperty('pv3Power', 17);
    expect(result).toHaveProperty('pv3Status', true);

    // PV4
    expect(result).toHaveProperty('pv4Voltage', 33.7);
    expect(result).toHaveProperty('pv4Current', 0.3);
    expect(result).toHaveProperty('pv4Power', 18);
    expect(result).toHaveProperty('pv4Status', false);

    // Connectivity diagnostics
    expect(result).toHaveProperty('bluetoothSignal', 4);
    expect(result).toHaveProperty('wifiRssi', 72);
  });

  test('should handle HMI inverter message with different PV status values', () => {
    // Test with PV inputs inactive
    const message =
      'ele_d=25,ele_w=1500,ele_m=1500,pv1_v=0,pv1_i=0,pv1_p=0,pv1_s=0,pv2_v=0,pv2_i=0,pv2_p=0,pv2_s=0,grd_f=5000,grd_v=2400,grd_s=0,grd_o=0,chp_t=25,err_t=0,err_c=0,err_d=0,ver_s=105';
    const deviceType = 'HMI-1';
    const deviceId = 'test123';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as HmiInverterDeviceData;

    // Check PV status is false when inputs are inactive
    expect(result).toHaveProperty('pv1Status', false);
    expect(result).toHaveProperty('pv2Status', false);
    expect(result).toHaveProperty('gridStatus', false);

    // Check zero values are correctly parsed
    expect(result).toHaveProperty('pv1Voltage', 0);
    expect(result).toHaveProperty('pv1Current', 0);
    expect(result).toHaveProperty('pv1Power', 0);
    expect(result).toHaveProperty('gridOutputPower', 0);

    // Check scaled values
    expect(result).toHaveProperty('dailyEnergyGenerated', 0.25);
    expect(result).toHaveProperty('gridFrequency', 50.0);
    expect(result).toHaveProperty('gridVoltage', 240.0);
  });

  test('should handle HMI inverter message with error conditions', () => {
    // Test with error conditions
    const message =
      'ele_d=100,ele_w=2000,ele_m=2000,pv1_v=300,pv1_i=5,pv1_p=50,pv1_s=1,pv2_v=305,pv2_i=6,pv2_p=55,pv2_s=1,grd_f=4980,grd_v=2200,grd_s=1,grd_o=100,chp_t=45,err_t=1,err_c=3,err_d=255,ver_s=107';
    const deviceType = 'HMI-1';
    const deviceId = 'error_test';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as HmiInverterDeviceData;

    // Check error conditions are properly parsed
    expect(result).toHaveProperty('errorType', 1);
    expect(result).toHaveProperty('errorCount', 3);
    expect(result).toHaveProperty('errorDetails', 255);

    // Check other values are still correct
    expect(result).toHaveProperty('chipTemperature', 45);
    expect(result).toHaveProperty('dailyEnergyGenerated', 1.0);
    expect(result).toHaveProperty('gridFrequency', 49.8);
    expect(result).toHaveProperty('pv1Voltage', 30.0);
    expect(result).toHaveProperty('pv2Current', 0.6);
  });

  test('should parse Jupiter message correctly', () => {
    const message =
      'ele_d=349,ele_m=2193,ele_y=0,pv1_p=94,pv1_s=1,pv2_p=77,pv2_s=1,pv3_p=41,pv3_s=1,pv4_p=60,pv4_s=1,grd_o=250,grd_t=1,gct_s=1,cel_s=0,cel_p=424,cel_c=83,err_t=0,wor_m=1,tim_0=12|0|23|59|127|800|1,tim_1=0|0|12|0|127|150|1,tim_2=0|0|0|0|255|0|0,tim_3=0|0|0|0|255|0|0,tim_4=0|0|0|0|255|0|0,cts_m=0,grd_d=285,grd_m=2018,dev_n=134,dev_i=106,dev_m=206,dev_b=209,dev_t=110,wif_s=75,ala_c=0,ful_d=1,ssid=xxxx,stop_s=10,htt_p=0,ct_t=4,phase_t=1,dchrg=1,seq_s=3,ctrl_r=0,shelly_p=1010,c_ratio=100,b_lck=0,dod=88,total_b=1,online_b=1';
    const deviceType = 'JPLS-1';
    const deviceId = 'jupiter123';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as JupiterDeviceData;
    expect(result).toHaveProperty('deviceType', deviceType);
    expect(result).toHaveProperty('deviceId', deviceId);
    expect(result).toHaveProperty('timestamp');

    // Energy statistics
    expect(result).toHaveProperty('dailyChargingCapacity', 3.49);
    expect(result).toHaveProperty('monthlyChargingCapacity', 21.93);
    expect(result).toHaveProperty('yearlyChargingCapacity', 0);
    expect(result).toHaveProperty('dailyDischargeCapacity', 2.85);
    expect(result).toHaveProperty('monthlyDischargeCapacity', 20.18);

    // PV power and per-string status
    expect(result).toHaveProperty('pv1Power', 94);
    expect(result).toHaveProperty('pv2Power', 77);
    expect(result).toHaveProperty('pv3Power', 41);
    expect(result).toHaveProperty('pv4Power', 60);
    expect(result).toHaveProperty('pv1Status', true);
    expect(result).toHaveProperty('pv2Status', true);
    expect(result).toHaveProperty('pv3Status', true);
    expect(result).toHaveProperty('pv4Status', true);

    // Grid and power
    expect(result).toHaveProperty('combinedPower', 250);
    expect(result).toHaveProperty('workingStatus', 1);
    expect(result).toHaveProperty('ctStatus', 1);

    // Battery
    expect(result).toHaveProperty('batteryWorkingStatus', 'keep');
    expect(result).toHaveProperty('batteryEnergy', 4.24);
    expect(result).toHaveProperty('batterySoc', 83);

    // Error and working mode
    expect(result).toHaveProperty('errorCode', 0);
    expect(result).toHaveProperty('workingMode', 'automatic');
    expect(result).toHaveProperty('autoSwitchWorkingMode', 0);

    // Device information
    expect(result).toHaveProperty('httpServerType', 0);
    expect(result).toHaveProperty('wifiSignalStrength', -75);
    expect(result).toHaveProperty('ctType', 4);
    expect(result).toHaveProperty('phaseType', 1);
    expect(result).toHaveProperty('rechargeMode', 'threePhase');
    expect(result).toHaveProperty('deviceVersion', 134);
    expect(result).toHaveProperty('bmsVersion', 209);
    expect(result).toHaveProperty('mpptVersion', 206);
    expect(result).toHaveProperty('inverterVersion', 106);
    expect(result).toHaveProperty('screenVersion', 110);
    expect(result).toHaveProperty('wifiName', 'xxxx');

    // Additional features
    expect(result).toHaveProperty('surplusFeedInEnabled', true);
    expect(result).toHaveProperty('alarmCode', 0);
    expect(result).toHaveProperty('depthOfDischarge', 88);
    expect(result).toHaveProperty('batteryPacks', 1);
    expect(result).toHaveProperty('shellyPort', 1010);
    expect(result).toHaveProperty('phaseDiagnosisStatus', 3);

    // Time periods
    expect(result).toHaveProperty('timePeriods');
    expect(Array.isArray(result.timePeriods)).toBe(true);
    expect(result.timePeriods).toHaveLength(5);

    // Time period 0
    expect(result.timePeriods?.[0]).toHaveProperty('startTime', '12:00');
    expect(result.timePeriods?.[0]).toHaveProperty('endTime', '23:59');
    expect(result.timePeriods?.[0]).toHaveProperty('weekday', '0123456');
    expect(result.timePeriods?.[0]).toHaveProperty('power', 800);
    expect(result.timePeriods?.[0]).toHaveProperty('enabled', true);

    // Time period 1
    expect(result.timePeriods?.[1]).toHaveProperty('startTime', '0:00');
    expect(result.timePeriods?.[1]).toHaveProperty('endTime', '12:00');
    expect(result.timePeriods?.[1]).toHaveProperty('weekday', '0123456');
    expect(result.timePeriods?.[1]).toHaveProperty('power', 150);
    expect(result.timePeriods?.[1]).toHaveProperty('enabled', true);

    // Time periods 2-4 should be disabled
    expect(result.timePeriods?.[2]).toHaveProperty('enabled', false);
    expect(result.timePeriods?.[3]).toHaveProperty('enabled', false);
    expect(result.timePeriods?.[4]).toHaveProperty('enabled', false);
  });

  test('should parse Jupiter BMS message correctly', () => {
    const message =
      'inv:g_state=1,w_state1=1,w_state2=1,i_err=0,i_war=0,g_vol=2399,g_cur=0,g_pf=0,g_fre=5002,b_vol=526,g_power=119,i_temp=42,mppt:m_state=244,m_err=0,m_temp=30,m_war=0,pv1=350|37|1304,pv2=349|39|1372,pv3=378|18|712,pv4=365|32|1180,b_vol=525,b_cur=85,base_v=221,pe_v=165,fail_t=0,bms:c_vol=571,c_cur=500,d_cur=500,soc=33,soh=100,b_cap=5120,b_vol=5252,b_cur=63,b_temp=213,b_err=0,b_war=0,b_err2=0,b_war2=0,c_flag=192,s_flag=0,b_num=1,vol0=3280,vol1=3281,vol2=3283,vol3=3283,vol4=3283,vol5=3283,vol6=3280,vol7=3284,vol8=3283,vol9=3284,vol10=3282,vol11=3286,vol12=3277,vol13=3286,vol14=3283,vol15=3284,b_temp0=14,b_temp1=15,b_temp2=15,b_temp3=16,env_t=27,mos_t=20,lck=0';
    const deviceType = 'JPLS-1';
    const deviceId = 'jupiter123';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('bms');

    const result = parsed['bms'] as JupiterBMSInfo;

    // Check the structure
    expect(result).toHaveProperty('deviceType', deviceType);
    expect(result).toHaveProperty('deviceId', deviceId);
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('values');

    // Cell voltages (vol0-vol15)
    expect(result).toHaveProperty('cells');

    // Battery cell voltages: 4 batteries, each using 3 volX values
    // Battery 0 (internal): vol0, vol1, vol2
    // Battery 1 (external 1): vol3, vol4, vol5
    // Battery 2 (external 2): vol6, vol7, vol8
    // Battery 3 (external 3): vol9, vol10, vol11
    //
    // NOTE: The volX values in this message are synthetic (all 16 are non-zero
    // and in the same range), so they only exercise the field indexing. See the
    // "multiple battery packs" test below for a real-world message.
    expect(result).toHaveProperty('batteries');
    expect(Array.isArray(result.batteries)).toBe(true);
    expect(result.batteries).toHaveLength(4);

    // Battery 0 (internal): vol0=3280 (0x0CD0), vol1=3281, vol2=3283
    expect(result.batteries?.[0]).toHaveProperty('cellVoltages');
    expect(result.batteries?.[0]?.cellVoltages?.maxVoltage).toBe(3281);
    expect(result.batteries?.[0]?.cellVoltages?.minVoltage).toBe(3283);
    // Low byte: 0xD0 = 208
    expect(result.batteries?.[0]?.cellVoltages?.maxVoltageCell).toBe(208);
    // High byte: 0x0C = 12
    expect(result.batteries?.[0]?.cellVoltages?.minVoltageCell).toBe(12);
    // Drift (difference) between highest and lowest cell voltage
    expect(result.batteries?.[0]?.cellVoltages?.voltageDiff).toBe(2);

    // Battery 1 (external 1): vol3=3283 (0x0CD3), vol4=3283, vol5=3283
    expect(result.batteries?.[1]).toHaveProperty('cellVoltages');
    expect(result.batteries?.[1]?.cellVoltages?.maxVoltage).toBe(3283);
    expect(result.batteries?.[1]?.cellVoltages?.minVoltage).toBe(3283);
    // Low byte: 0xD3 = 211
    expect(result.batteries?.[1]?.cellVoltages?.maxVoltageCell).toBe(211);
    // High byte: 0x0C = 12
    expect(result.batteries?.[1]?.cellVoltages?.minVoltageCell).toBe(12);

    // Battery 2 (external 2): vol6=3280 (0x0CD0), vol7=3284, vol8=3283
    expect(result.batteries?.[2]).toHaveProperty('cellVoltages');
    expect(result.batteries?.[2]?.cellVoltages?.maxVoltage).toBe(3284);
    expect(result.batteries?.[2]?.cellVoltages?.minVoltage).toBe(3283);
    // Low byte: 0xD0 = 208
    expect(result.batteries?.[2]?.cellVoltages?.maxVoltageCell).toBe(208);
    // High byte: 0x0C = 12
    expect(result.batteries?.[2]?.cellVoltages?.minVoltageCell).toBe(12);

    // Battery 3 (external 3): vol9=3284 (0x0CD4), vol10=3282, vol11=3286
    expect(result.batteries?.[3]).toHaveProperty('cellVoltages');
    expect(result.batteries?.[3]?.cellVoltages?.maxVoltage).toBe(3282);
    expect(result.batteries?.[3]?.cellVoltages?.minVoltage).toBe(3286);
    // Low byte: 0xD4 = 212
    expect(result.batteries?.[3]?.cellVoltages?.maxVoltageCell).toBe(212);
    // High byte: 0x0C = 12
    expect(result.batteries?.[3]?.cellVoltages?.minVoltageCell).toBe(12);

    // Cell temperatures (b_temp0-b_temp3)
    expect(result.cells).toHaveProperty('temperatures');
    expect(Array.isArray(result.cells?.temperatures)).toBe(true);
    expect(result.cells?.temperatures).toHaveLength(4);
    expect(result.cells?.temperatures).toEqual([14, 15, 15, 16]);

    // BMS fields
    expect(result).toHaveProperty('bms');
    expect(result.bms).toHaveProperty('soc', 33);
    expect(result.bms).toHaveProperty('soh', 100);
    expect(result.bms).toHaveProperty('capacity', 5120);
    expect(result.bms).toHaveProperty('voltage', 52.52);
    expect(result.bms).toHaveProperty('current', 6.3);
    expect(result.bms).toHaveProperty('temperature', 21.3);
    expect(result.bms).toHaveProperty('chargeVoltage', 57.1);
    // These values need additional info to confirm the correct scaling
    // expect(result.bms).toHaveProperty('chargeCurrent', 500);
    // expect(result.bms).toHaveProperty('dischargeCurrent', 500);
    expect(result.bms).toHaveProperty('error', 0);
    expect(result.bms).toHaveProperty('warning', 0);
    expect(result.bms).toHaveProperty('error2', 0);
    expect(result.bms).toHaveProperty('warning2', 0);
    expect(result.bms).toHaveProperty('cellFlag', 192);
    expect(result.bms).toHaveProperty('statusFlag', 0);
    expect(result.bms).toHaveProperty('bmsNumber', 1);
    expect(result.bms).toHaveProperty('mosfetTemp', 20);
    expect(result.bms).toHaveProperty('envTemp', 27);

    // MPPT fields
    expect(result).toHaveProperty('mppt');
    expect(result.mppt).toHaveProperty('temperature', 30);
    expect(result.mppt).toHaveProperty('error', 0);
    expect(result.mppt).toHaveProperty('warning', 0);

    // MPPT PV fields
    expect(result.mppt).toHaveProperty('pv');
    expect(Array.isArray(result.mppt?.pv)).toBe(true);
    expect(result.mppt?.pv).toHaveLength(4);

    expect(result.mppt?.pv?.[0]).toHaveProperty('voltage', 35);
    expect(result.mppt?.pv?.[0]).toHaveProperty('current', 3.7);
    expect(result.mppt?.pv?.[0]).toHaveProperty('power', 130.4);

    expect(result.mppt?.pv?.[1]).toHaveProperty('voltage', 34.9);
    expect(result.mppt?.pv?.[1]).toHaveProperty('current', 3.9);
    expect(result.mppt?.pv?.[1]).toHaveProperty('power', 137.2);

    expect(result.mppt?.pv?.[2]).toHaveProperty('voltage', 37.8);
    expect(result.mppt?.pv?.[2]).toHaveProperty('current', 1.8);
    expect(result.mppt?.pv?.[2]).toHaveProperty('power', 71.2);

    expect(result.mppt?.pv?.[3]).toHaveProperty('voltage', 36.5);
    expect(result.mppt?.pv?.[3]).toHaveProperty('current', 3.2);
    expect(result.mppt?.pv?.[3]).toHaveProperty('power', 118);

    // Inverter fields
    expect(result).toHaveProperty('inverter');
    expect(result.inverter).toHaveProperty('temperature', 42);
    expect(result.inverter).toHaveProperty('error', 0);
    expect(result.inverter).toHaveProperty('warning', 0);
    expect(result.inverter).toHaveProperty('gridVoltage', 239.9);
    expect(result.inverter).toHaveProperty('gridCurrent', 0);
    expect(result.inverter).toHaveProperty('gridPower', 119);
    expect(result.inverter).toHaveProperty('gridPowerFactor', 0);
    expect(result.inverter).toHaveProperty('gridFrequency', 50.02);
  });

  test('should parse Jupiter BMS cell voltages for multiple battery packs', () => {
    // Real-world message from a Jupiter C Plus (JPLS-8H) with four battery
    // packs (`b_num=4`), see https://github.com/tomquist/hm2mqtt/discussions/393
    // Each pack occupies three volX fields: packed cell numbers, maximum cell
    // voltage, minimum cell voltage. The trailing vol12-vol15 are unused.
    const message =
      'inv:g_state=1,w_state1=1,w_state2=1,i_err=0,i_war=0,g_vol=2436,g_cur=0,g_pf=0,g_fre=5000,b_vol=536,g_power=0,i_temp=40,mppt:m_state=148,m_err=0,m_temp=38,m_war=0,pv1=429|26|1121,pv2=114|0|0,pv3=114|0|0,pv4=435|27|1179,b_vol=532,b_cur=43,base_v=220,pe_v=161,fail_t=0,bms:c_vol=584,c_cur=500,d_cur=500,soc=81,soh=0,b_cap=10240,b_vol=5340,b_cur=48,b_temp=290,b_err=0,b_war=0,b_err2=0,b_war2=0,c_flag=192,s_flag=0,b_num=4,vol0=1039,vol1=3353,vol2=3326,vol3=1,vol4=3320,vol5=3319,vol6=2063,vol7=3362,vol8=3328,vol9=774,vol10=3338,vol11=3327,vol12=0,vol13=0,vol14=0,vol15=0,b_temp0=28,b_temp1=28,b_temp2=28,b_temp3=29,env_t=36,mos_t=28,lck=0';
    const deviceType = 'JPLS-8H';
    const deviceId = 'jupiter123';

    const parsed = parseMessage(message, deviceType, deviceId);
    const result = parsed['bms'] as JupiterBMSInfo;

    expect(result.bms).toHaveProperty('bmsNumber', 4);
    expect(result.batteries).toHaveLength(4);

    // All decoded cell numbers must be within range of a 16-cell pack, and all
    // voltages must be plausible cell voltages. This is what rules out a
    // 4-field block, which would decode voltages as cell numbers (e.g. 248).
    const expected = [
      // vol0=1039 (0x040F), vol1=3353, vol2=3326
      { maxVoltageCell: 15, minVoltageCell: 4, maxVoltage: 3353, minVoltage: 3326, diff: 27 },
      // vol3=1 (0x0001), vol4=3320, vol5=3319
      { maxVoltageCell: 1, minVoltageCell: 0, maxVoltage: 3320, minVoltage: 3319, diff: 1 },
      // vol6=2063 (0x080F), vol7=3362, vol8=3328
      { maxVoltageCell: 15, minVoltageCell: 8, maxVoltage: 3362, minVoltage: 3328, diff: 34 },
      // vol9=774 (0x0306), vol10=3338, vol11=3327
      { maxVoltageCell: 6, minVoltageCell: 3, maxVoltage: 3338, minVoltage: 3327, diff: 11 },
    ];

    expected.forEach((values, index) => {
      const cellVoltages = result.batteries?.[index]?.cellVoltages;
      expect(cellVoltages?.maxVoltageCell).toBe(values.maxVoltageCell);
      expect(cellVoltages?.minVoltageCell).toBe(values.minVoltageCell);
      expect(cellVoltages?.maxVoltage).toBe(values.maxVoltage);
      expect(cellVoltages?.minVoltage).toBe(values.minVoltage);
      expect(cellVoltages?.voltageDiff).toBe(values.diff);
    });
  });

  test('should parse Jupiter BMS cell voltages with one external battery pack', () => {
    // Real-world message from a Jupiter C Plus with one external battery pack
    // (`b_num=2`), see https://github.com/tomquist/hm2mqtt/discussions/393
    // Only vol0-vol5 are populated, which is what pins the block size down to
    // three: a block size of four would need vol4-vol7 for the second pack.
    const message =
      'bms:c_vol=584,c_cur=500,d_cur=500,soc=38,soh=0,b_cap=5120,b_vol=5420,b_cur=300,b_temp=290,b_err=0,b_war=0,b_err2=0,b_war2=0,c_flag=192,s_flag=0,b_num=2,vol0=526,vol1=3241,vol2=3237,vol3=256,vol4=3390,vol5=3386,vol6=0,vol7=0,vol8=0,vol9=0,vol10=0,vol11=0,vol12=0,vol13=0,vol14=0,vol15=0,b_temp0=29,b_temp1=28,b_temp2=28,b_temp3=28,env_t=37,mos_t=30,lck=0';
    const deviceType = 'JPLS-1';
    const deviceId = 'jupiter123';

    const parsed = parseMessage(message, deviceType, deviceId);
    const result = parsed['bms'] as JupiterBMSInfo;

    expect(result.bms).toHaveProperty('bmsNumber', 2);

    // Internal battery: vol0=526 (0x020E), vol1=3241, vol2=3237
    expect(result.batteries?.[0]?.cellVoltages?.maxVoltageCell).toBe(14);
    expect(result.batteries?.[0]?.cellVoltages?.minVoltageCell).toBe(2);
    expect(result.batteries?.[0]?.cellVoltages?.maxVoltage).toBe(3241);
    expect(result.batteries?.[0]?.cellVoltages?.minVoltage).toBe(3237);
    expect(result.batteries?.[0]?.cellVoltages?.voltageDiff).toBe(4);

    // External battery 1: vol3=256 (0x0100), vol4=3390, vol5=3386
    expect(result.batteries?.[1]?.cellVoltages?.maxVoltageCell).toBe(0);
    expect(result.batteries?.[1]?.cellVoltages?.minVoltageCell).toBe(1);
    expect(result.batteries?.[1]?.cellVoltages?.maxVoltage).toBe(3390);
    expect(result.batteries?.[1]?.cellVoltages?.minVoltage).toBe(3386);
    expect(result.batteries?.[1]?.cellVoltages?.voltageDiff).toBe(4);
  });

  test('should convert negative Jupiter BMS temperatures correctly', () => {
    const message =
      'inv:g_state=1,w_state1=1,w_state2=1,i_err=0,i_war=0,g_vol=2340,g_cur=0,g_pf=0,g_fre=4997,b_vol=544,g_power=0,i_temp=-31,mppt:m_state=244,m_err=0,m_temp=5,m_war=0,pv1=377|3|146,pv2=389|6|258,pv3=387|6|236,pv4=376|3|141,b_vol=545,b_cur=14,base_v=222,pe_v=165,bms:c_vol=600,c_cur=75,d_cur=100,soc=44,soh=0,b_cap=2560,b_vol=5420,b_cur=14,b_temp=-25,b_err=0,b_war=0,b_err2=0,b_war2=0,c_flag=192,s_flag=0,b_num=1,vol0=3343,vol1=3397,vol2=3320,vol3=0,vol4=0,vol5=0,vol6=0,vol7=0,vol8=0,vol9=0,vol10=0,vol11=0,vol12=0,vol13=0,vol14=0,vol15=0,b_temp0=255,b_temp1=254,b_temp2=253,b_temp3=252,env_t=128,mos_t=127';
    const deviceType = 'JPLS-1';
    const deviceId = 'jupiter123';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('bms');
    const result = parsed['bms'] as JupiterBMSInfo;

    expect(result).toHaveProperty('cells');
    expect(result['cells']).toHaveProperty('temperatures');
    expect(result['cells']?.['temperatures']).toEqual([-1, -2, -3, -4]);

    expect(result).toHaveProperty('bms');
    expect(result['bms']).toHaveProperty('temperature', -2.5);
    expect(result['bms']).toHaveProperty('envTemp', -128);
    expect(result['bms']).toHaveProperty('mosfetTemp', 127);

    expect(result).toHaveProperty('mppt');
    expect(result['mppt']).toHaveProperty('temperature', 5);

    expect(result).toHaveProperty('inverter');
    expect(result.inverter).toHaveProperty('temperature', -31);
  });

  test('should parse surplus feed-in correctly', () => {
    // Surplus Feed-In disabled
    const messageDisabled =
      'ele_d=349,ele_m=2193,ele_y=0,pv1_p=94,pv1_s=1,pv2_p=77,pv2_s=1,pv3_p=41,pv3_s=1,pv4_p=60,pv4_s=1,grd_o=250,grd_t=1,gct_s=1,cel_s=0,cel_p=424,cel_c=83,err_t=0,wor_m=1,tim_0=12|0|23|59|127|800|1,tim_1=0|0|12|0|127|150|1,tim_2=0|0|0|0|255|0|0,tim_3=0|0|0|0|255|0|0,tim_4=0|0|0|0|255|0|0,cts_m=0,grd_d=285,grd_m=2018,dev_n=134,dev_i=106,dev_m=206,dev_b=209,dev_t=110,wif_s=75,ala_c=0,ful_d=0,ssid=xxxx,stop_s=10,htt_p=0,ct_t=4,phase_t=1,dchrg=1,seq_s=3,ctrl_r=0,shelly_p=1010,c_ratio=100,b_lck=0,dod=88,total_b=1,online_b=1';
    // Surplus Feed-In enabled
    const messageEnabled =
      'ele_d=349,ele_m=2193,ele_y=0,pv1_p=94,pv1_s=1,pv2_p=77,pv2_s=1,pv3_p=41,pv3_s=1,pv4_p=60,pv4_s=1,grd_o=250,grd_t=1,gct_s=1,cel_s=0,cel_p=424,cel_c=83,err_t=0,wor_m=1,tim_0=12|0|23|59|127|800|1,tim_1=0|0|12|0|127|150|1,tim_2=0|0|0|0|255|0|0,tim_3=0|0|0|0|255|0|0,tim_4=0|0|0|0|255|0|0,cts_m=0,grd_d=285,grd_m=2018,dev_n=134,dev_i=106,dev_m=206,dev_b=209,dev_t=110,wif_s=75,ala_c=0,ful_d=1,ssid=xxxx,stop_s=10,htt_p=0,ct_t=4,phase_t=1,dchrg=1,seq_s=3,ctrl_r=0,shelly_p=1010,c_ratio=100,b_lck=0,dod=88,total_b=1,online_b=1';
    // Surplus Feed-In actively feeding-in surplus
    const messageActive =
      'ele_d=349,ele_m=2193,ele_y=0,pv1_p=94,pv1_s=1,pv2_p=77,pv2_s=1,pv3_p=41,pv3_s=1,pv4_p=60,pv4_s=1,grd_o=250,grd_t=1,gct_s=1,cel_s=0,cel_p=424,cel_c=83,err_t=0,wor_m=1,tim_0=12|0|23|59|127|800|1,tim_1=0|0|12|0|127|150|1,tim_2=0|0|0|0|255|0|0,tim_3=0|0|0|0|255|0|0,tim_4=0|0|0|0|255|0|0,cts_m=0,grd_d=285,grd_m=2018,dev_n=134,dev_i=106,dev_m=206,dev_b=209,dev_t=110,wif_s=75,ala_c=0,ful_d=3,ssid=xxxx,stop_s=10,htt_p=0,ct_t=4,phase_t=1,dchrg=1,seq_s=3,ctrl_r=0,shelly_p=1010,c_ratio=100,b_lck=0,dod=88,total_b=1,online_b=1';
    const deviceType = 'JPLS-1';
    const deviceId = '12345';

    let parsed = parseMessage(messageDisabled, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    let result = parsed['data'] as B2500V2DeviceData;
    expect(result).toHaveProperty('surplusFeedInEnabled', false);

    parsed = parseMessage(messageEnabled, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    result = parsed['data'] as B2500V2DeviceData;
    expect(result).toHaveProperty('surplusFeedInEnabled', true);

    parsed = parseMessage(messageActive, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    result = parsed['data'] as B2500V2DeviceData;
    expect(result).toHaveProperty('surplusFeedInEnabled', true);
  });

  test('parses a corrupt Venus reading verbatim (suppression is the guard’s job, not the parser’s)', () => {
    // A real dropped-trailing-digit reading from issue #296: tot_i=3399 (vs 33993),
    // tot_o=4318 (vs 43187). The parser must not hide the bad value; the monotonic
    // guard in DeviceManager is responsible for rejecting it.
    const message =
      'cd=1,tot_i=3399,tot_o=4318,ele_d=3399,ele_m=3399,grd_d=4318,grd_m=4318,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=40,cel_c=7,err_t=100,err_a=4,dev_n=148,grd_y=0,wor_m=0,tim_0=0|0|0|0|0|0|0,cts_m=0,bac_u=0,tra_a=75,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=3,wif_s=35,inc_a=0,set_v=0,mcp_w=2500,mdp_w=2500,ct_t=3,phase_t=1,dchrg_t=1,bms_v=113,fc_v=202409090159,wifi_n=maekan,seq_s=3,ctrl_r=0,par=0,gen=0,ble=1,shelly_p=1010,c_ratio=100';
    const parsed = parseMessage(message, 'VNSE3-0', 'venus123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    expect(result).toHaveProperty('totalChargingCapacity', 33.99);
    expect(result).toHaveProperty('totalDischargeCapacity', 43.18);
  });

  test('parses Venus depth of discharge (dod)', () => {
    const message =
      'cd=1,tot_i=8848,tot_o=7097,ele_d=537,ele_m=8848,grd_d=328,grd_m=7097,inc_d=0,inc_m=0,grd_f=0,grd_o=613,grd_t=3,gct_s=1,cel_s=3,cel_p=327,cel_c=64,err_t=0,err_a=0,dev_n=158,grd_y=0,wor_m=0,tim_0=0|0|0|0|0|0|0,cts_m=0,bac_u=0,tra_a=1,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=1,wif_s=33,inc_a=0,set_v=0,mcp_w=2500,mdp_w=2500,ct_t=4,phase_t=1,dchrg_t=1,bms_v=212,fc_v=202409090159,wifi_n=XXX,seq_s=0,ctrl_r=1,par=255,gen=255,ble=3,shelly_p=1010,c_ratio=90,dod=88';
    const parsed = parseMessage(message, 'HMG-25', 'venus123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    expect(result).toHaveProperty('depthOfDischarge', 88);
  });

  test('treats out-of-range Venus depth of discharge as unknown', () => {
    // The device reports the actual percentage; the 0 sentinel is only used in
    // the write direction, so a reported value outside 30-88 is treated as unknown.
    const message =
      'cd=1,tot_i=8848,tot_o=7097,ele_d=537,ele_m=8848,grd_d=328,grd_m=7097,inc_d=0,inc_m=0,grd_f=0,grd_o=613,grd_t=3,gct_s=1,cel_s=3,cel_p=327,cel_c=64,err_t=0,err_a=0,dev_n=158,grd_y=0,wor_m=0,tim_0=0|0|0|0|0|0|0,cts_m=0,bac_u=0,tra_a=1,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=1,wif_s=33,inc_a=0,set_v=0,mcp_w=2500,mdp_w=2500,ct_t=4,phase_t=1,dchrg_t=1,bms_v=212,fc_v=202409090159,wifi_n=XXX,seq_s=0,ctrl_r=1,par=255,gen=255,ble=3,shelly_p=1010,c_ratio=90,dod=0';
    const parsed = parseMessage(message, 'HMG-25', 'venus123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    expect(result.depthOfDischarge).toBeUndefined();
  });

  test('parses Venus AI working mode (wor_m=5)', () => {
    const message =
      'cd=1,tot_i=8848,tot_o=7097,ele_d=537,ele_m=8848,grd_d=328,grd_m=7097,inc_d=0,inc_m=0,grd_f=0,grd_o=613,grd_t=3,gct_s=1,cel_s=3,cel_p=327,cel_c=64,err_t=0,err_a=0,dev_n=158,grd_y=0,wor_m=5,tim_0=0|0|0|0|0|0|0,cts_m=0,bac_u=0,tra_a=1,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=1,wif_s=33,inc_a=0,set_v=0,mcp_w=2500,mdp_w=2500,ct_t=4,phase_t=1,dchrg_t=1,bms_v=212,fc_v=202409090159,wifi_n=XXX,seq_s=0,ctrl_r=1,par=255,gen=255,ble=3,shelly_p=1010,c_ratio=90,dod=88';
    const parsed = parseMessage(message, 'VNSE3-0', 'venus123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    expect(result).toHaveProperty('workingMode', 'ai');
  });

  test('parses Jupiter AI working mode (wor_m=5)', () => {
    const message =
      'ele_d=349,ele_m=2193,ele_y=0,pv1_p=94,pv1_s=1,pv2_p=77,pv2_s=1,pv3_p=41,pv3_s=1,pv4_p=60,pv4_s=1,grd_o=250,grd_t=1,gct_s=1,cel_s=0,cel_p=424,cel_c=83,err_t=0,wor_m=5,tim_0=12|0|23|59|127|800|1,tim_1=0|0|12|0|127|150|1,tim_2=0|0|0|0|255|0|0,tim_3=0|0|0|0|255|0|0,tim_4=0|0|0|0|255|0|0,cts_m=0,grd_d=285,grd_m=2018,dev_n=134,dev_i=106,dev_m=206,dev_b=209,dev_t=110,wif_s=75,ala_c=0,ful_d=1,ssid=xxxx,stop_s=10,htt_p=0,ct_t=4,phase_t=1,dchrg=1,seq_s=3,ctrl_r=0,shelly_p=1010,c_ratio=100,b_lck=0,dod=88,total_b=1,online_b=1';
    const parsed = parseMessage(message, 'JPLS-1', 'jupiter123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as JupiterDeviceData;
    expect(result).toHaveProperty('workingMode', 'ai');
  });

  test('parses Jupiter Bluetooth advertising state (bl) and idle PV strings', () => {
    // `bl=1` means BLE advertising is on, which the Marstek app shows inverted
    // as its "Bluetooth Lock" switch being off.
    const message =
      'ele_d=349,ele_m=2193,ele_y=0,pv1_p=94,pv1_s=1,pv2_p=0,pv2_s=0,pv3_p=0,pv3_s=0,pv4_p=0,pv4_s=0,grd_o=250,grd_t=1,gct_s=1,cel_s=0,cel_p=424,cel_c=83,err_t=0,wor_m=1,tim_0=12|0|23|59|127|800|1,tim_1=0|0|12|0|127|150|1,tim_2=0|0|0|0|255|0|0,tim_3=0|0|0|0|255|0|0,tim_4=0|0|0|0|255|0|0,cts_m=0,grd_d=285,grd_m=2018,dev_n=141,dev_i=106,dev_m=206,dev_b=209,dev_t=110,wif_s=75,ala_c=0,ful_d=1,ssid=xxxx,stop_s=10,htt_p=0,ct_t=4,phase_t=1,dchrg=1,seq_s=3,ctrl_r=0,shelly_p=1010,c_ratio=100,b_lck=0,dod=88,bl=1,total_b=2,online_b=2';
    const parsed = parseMessage(message, 'JPLS-1', 'jupiter123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as JupiterDeviceData;
    expect(result).toHaveProperty('bluetoothAdvertisingEnabled', true);
    expect(result).toHaveProperty('pv1Status', true);
    expect(result).toHaveProperty('pv2Status', false);
    expect(result).toHaveProperty('pv3Status', false);
    expect(result).toHaveProperty('pv4Status', false);
    expect(result).toHaveProperty('batteryPacks', 2);
  });

  test('parses Jupiter network information response (cd=26)', () => {
    const message =
      'cd=26,dev_net_info:ip:192.168.1.42,gate:192.168.1.1,mask:255.255.255.0,dns:192.168.1.1,ct_connect_ip:192.168.1.255';
    const parsed = parseMessage(message, 'JPLS-1', 'jupiter123');

    expect(parsed).toHaveProperty('network');
    const result = parsed['network'] as JupiterNetworkInfo;
    expect(result).toHaveProperty('ipAddress', '192.168.1.42');
    expect(result).toHaveProperty('gateway', '192.168.1.1');
    expect(result).toHaveProperty('subnetMask', '255.255.255.0');
    expect(result).toHaveProperty('dns', '192.168.1.1');
    expect(result).toHaveProperty('ctConnectIp', '192.168.1.255');
  });

  test('parses Venus A (VNSA) PV input power and connection status (issue #218)', () => {
    // Real runtime reading from a Venus A: pv1 connected and producing, pv2-4 idle.
    const message =
      'cd=1,tot_i=0,tot_o=0,ele_d=0,ele_m=0,grd_d=0,grd_m=0,inc_d=1,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=0,cel_s=2,cel_p=157,cel_c=75,err_t=800,err_a=8,dev_n=143,grd_y=0,wor_m=1,tim_0=0|0|0|0|0|0|0,cts_m=0,bac_u=0,tra_a=74,tra_i=1,tra_o=0,htt_p=0,prc_c=0,prc_d=1,wif_s=51,inc_a=0,set_v=4,mcp_w=1200,mdp_w=1200,ct_t=1,phase_t=0,dchrg_t=1,bms_v=106,fc_v=202409090159,wifi_n=xxxx,seq_s=1,ctrl_r=0,par=0,gen=0,ble=3,shelly_p=1010,c_ratio=100,udp=0,api=1,net=1,port=48977,inv_v=113,id=2|0|0|0|0,lk=0,bp=99,ei=0,eb=0,rp=107,gp=0,vp=0,mppt=0,pv1=1076|1,pv2=0|0,pv3=0|0,pv4=0|0,pack=1|1|1|0,pv=41|57,fu=1|0,em=0';
    const parsed = parseMessage(message, 'VNSA-0', 'venusA123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    // PV power is reported in deciwatts: 1076 -> 107.6 W
    expect(result).toHaveProperty('pv1Power', 107.6);
    expect(result).toHaveProperty('pv2Power', 0);
    expect(result).toHaveProperty('pv1Connected', true);
    expect(result).toHaveProperty('pv2Connected', false);
    expect(result).toHaveProperty('totalPvPower', 107.6);
  });

  test('exposes PV inputs based on payload presence regardless of device type (VNSE3)', () => {
    // PV handling is device-type independent: any Venus that reports the pvN
    // fields exposes the corresponding values.
    const message =
      'cd=1,tot_i=0,tot_o=0,ele_d=0,ele_m=0,grd_d=0,grd_m=0,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=40,cel_c=7,err_t=0,err_a=0,dev_n=148,grd_y=0,wor_m=0,inc_a=0,pv1=1076|1,pv2=0|0,pv3=0|0,pv4=0|0';
    const parsed = parseMessage(message, 'VNSE3-0', 'venus123');

    const result = parsed['data'] as VenusDeviceData;
    expect(result).toHaveProperty('pv1Power', 107.6);
    expect(result).toHaveProperty('pv1Connected', true);
    expect(result).toHaveProperty('totalPvPower', 107.6);
  });

  test('does not expose PV inputs when the payload omits them', () => {
    const message =
      'cd=1,tot_i=0,tot_o=0,ele_d=0,ele_m=0,grd_d=0,grd_m=0,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=40,cel_c=7,err_t=0,err_a=0,dev_n=148,grd_y=0,wor_m=0,inc_a=0';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    const result = parsed['data'] as VenusDeviceData;
    expect(result).not.toHaveProperty('pv1Power');
    expect(result).not.toHaveProperty('totalPvPower');
  });

  test('does not warn about total PV power when the payload omits the pv fields (issue #360)', () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    try {
      const message =
        'cd=1,tot_i=0,tot_o=0,ele_d=0,ele_m=0,grd_d=0,grd_m=0,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=40,cel_c=7,err_t=0,err_a=0,dev_n=148,grd_y=0,wor_m=0,inc_a=0';
      const parsed = parseMessage(message, 'VNSE3-0', 'venus123');

      const result = parsed['data'] as VenusDeviceData;
      expect(result).not.toHaveProperty('totalPvPower');
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Some values are missing for field totalPvPower'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('aggregates total PV power from a partial set of pv fields without warning (issue #360)', () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    try {
      // Only pv1 and pv2 are reported; pv3/pv4 are absent.
      const message =
        'cd=1,tot_i=0,tot_o=0,ele_d=0,ele_m=0,grd_d=0,grd_m=0,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=40,cel_c=7,err_t=0,err_a=0,dev_n=148,grd_y=0,wor_m=0,inc_a=0,pv1=1076|1,pv2=1000|1';
      const parsed = parseMessage(message, 'VNSE3-0', 'venus123');

      const result = parsed['data'] as VenusDeviceData;
      // 1076 + 1000 -> 2076 deciwatts -> 207.6 W
      expect(result).toHaveProperty('totalPvPower', 207.6);
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Some values are missing for field totalPvPower'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('parses Venus D (VNSD) PV input power and connection status', () => {
    // Real runtime reading from a Venus D: pv1 connected and producing, pv2-4 idle.
    const message =
      'cd=1,tot_i=1,tot_o=212,ele_d=0,ele_m=1,grd_d=212,grd_m=212,inc_d=0,inc_m=0,grd_f=0,grd_o=423,grd_t=3,gct_s=1,cel_s=2,cel_p=483,cel_c=94,err_t=800,err_a=8,dev_n=142,grd_y=0,wor_m=0,inc_a=0,mcp_w=2200,mdp_w=800,pv1=2598|1,pv2=2652|1,pv3=0|1,pv4=0|1,pack=2|3|1|0,pv=697|697,fu=0|0,em=0';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    // PV power is reported in deciwatts: 2598 -> 259.8 W
    expect(result).toHaveProperty('pv1Power', 259.8);
    expect(result).toHaveProperty('pv2Power', 265.2);
    expect(result).toHaveProperty('pv3Power', 0);
    expect(result).toHaveProperty('pv1Connected', true);
    expect(result).toHaveProperty('pv2Connected', true);
    // 2598 + 2652 -> 5250 deciwatts -> 525 W
    expect(result).toHaveProperty('totalPvPower', 525);
  });

  test('parses Venus PV energy from the pv field (today|total in 10 Wh units)', () => {
    const message =
      'cd=1,tot_i=0,tot_o=0,ele_d=0,ele_m=0,grd_d=0,grd_m=0,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=40,cel_c=7,err_t=0,err_a=0,dev_n=148,grd_y=0,wor_m=0,inc_a=0,pv1=1076|1,pv=41|57';
    const parsed = parseMessage(message, 'VNSA-0', 'venusA123');

    const result = parsed['data'] as VenusDeviceData;
    // Raw values are in units of 10 Wh, so they are scaled to Wh.
    expect(result).toHaveProperty('pvEnergyToday', 410);
    expect(result).toHaveProperty('pvEnergyTotal', 570);
  });

  test('reads Venus PV total from the last pv component (future-proofing)', () => {
    // The total is read from the last component, so extra values inserted before
    // it (e.g. monthly/yearly) do not break the mapping.
    const message =
      'cd=1,tot_i=0,tot_o=0,ele_d=0,ele_m=0,grd_d=0,grd_m=0,inc_d=0,inc_m=0,grd_f=0,grd_o=0,grd_t=1,gct_s=1,cel_s=1,cel_p=40,cel_c=7,err_t=0,err_a=0,dev_n=148,grd_y=0,wor_m=0,inc_a=0,pv1=1076|1,pv=41|120|900|57';
    const parsed = parseMessage(message, 'VNSA-0', 'venusA123');

    const result = parsed['data'] as VenusDeviceData;
    // Raw values are in units of 10 Wh, so they are scaled to Wh.
    expect(result).toHaveProperty('pvEnergyToday', 410);
    expect(result).toHaveProperty('pvEnergyTotal', 570);
  });

  test('parses Venus metering, pricing and version fields', () => {
    // Full Venus D dump exercising the CT/phase/pricing/version sensors.
    const message =
      'cd=1,tot_i=1,tot_o=212,ele_d=0,ele_m=1,grd_d=212,grd_m=212,inc_d=0,inc_m=0,grd_f=0,grd_o=423,grd_t=3,gct_s=1,cel_s=2,cel_p=483,cel_c=94,err_t=800,err_a=8,dev_n=142,grd_y=0,wor_m=0,cts_m=0,bac_u=0,tra_a=74,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=3,wif_s=72,inc_a=0,set_v=1,mcp_w=2200,mdp_w=800,ct_t=3,phase_t=1,dchrg_t=1,bms_v=116,fc_v=202409090159,wifi_n=unten,shelly_p=1010';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    // Prices use the same 0.001 € unit as the income fields
    expect(result).toHaveProperty('chargingPrice', 0);
    expect(result).toHaveProperty('dischargePrice', 0.003);
    // WiFi signal strength is negated into a dBm-style value
    expect(result).toHaveProperty('wifiSignalStrength', -72);
    expect(result).toHaveProperty('ctType', 'ct3');
    expect(result).toHaveProperty('phaseType', 'phaseA');
    expect(result).toHaveProperty('rechargeMode', 'threePhase');
    expect(result).toHaveProperty('bmsVersion', 116);
    expect(result).toHaveProperty('communicationModuleVersion', '202409090159');
    expect(result).toHaveProperty('shellyPort', 1010);
    // set_v is a power-version code, not a wattage: 1 is the 800W version,
    // which the same dump confirms via mdp_w=800.
    expect(result).toHaveProperty('versionSet', '800W');
    expect(result).toHaveProperty('maxDischargePower', 800);
  });

  test('maps the Venus set_v power-version code to the rated power', () => {
    const base =
      'cd=1,tot_i=1,tot_o=212,ele_d=0,ele_m=1,grd_d=212,grd_m=212,inc_d=0,inc_m=0,grd_f=0,grd_o=423,grd_t=3,gct_s=1,cel_s=2,cel_p=483,cel_c=94,err_t=0,err_a=0,dev_n=142,grd_y=0,wor_m=0,inc_a=0';
    const expected: Record<string, string> = {
      '0': '2500W',
      '1': '800W',
      '2': '600W',
      '3': '2200W',
      '4': '1200W',
      '5': '1500W',
      '6': '2300W',
      '7': '2000W',
      '8': '3000W',
      '9': '3600W',
    };

    for (const [code, label] of Object.entries(expected)) {
      const parsed = parseMessage(`${base},set_v=${code}`, 'VNSD-0', 'venusD123');
      expect((parsed['data'] as VenusDeviceData).versionSet).toBe(label);
    }

    // Unknown codes are left unmapped rather than guessed.
    const unknown = parseMessage(`${base},set_v=42`, 'VNSD-0', 'venusD123');
    expect((unknown['data'] as VenusDeviceData).versionSet).toBeUndefined();
  });

  test('parses Venus v147 LED, backup, inverter/MPPT version and phase-diagnosis fields', () => {
    // Real Venus D v147 dump including the newer led/inv_v/mppt/seq_s fields.
    const message =
      'cd=1,tot_i=6,tot_o=1109,ele_d=0,ele_m=0,grd_d=27,grd_m=27,inc_d=0,inc_m=0,grd_f=0,grd_o=801,grd_t=3,gct_s=1,cel_s=2,cel_p=233,cel_c=45,err_t=800,err_a=4,dev_n=147,grd_y=0,wor_m=5,tim_0=0|0|23|59|127|250|0,cts_m=0,bac_u=0,tra_a=74,tra_i=0,tra_o=0,htt_p=0,prc_c=0,prc_d=3,wif_s=72,inc_a=0,set_v=1,mcp_w=2200,mdp_w=800,ct_t=3,phase_t=1,dchrg_t=0,bms_v=116,fc_v=202409090159,wifi_n=unten,seq_s=3,ctrl_r=0,par=0,gen=0,ble=3,shelly_p=1010,c_ratio=100,udp=0,api=0,net=0,port=30000,inv_v=115,id=2|0|0|0|0,lk=0,bp=291,ei=0,eb=0,rp=347,gp=801,vp=801,bl=1,dod=88,bl_p=-1,led=1,as=3,mppt=104,pv1=2584|1,pv2=2638|1,pv3=3180|1,pv4=3080|1,pack=2|3|2|0,pv=24|24,fu=0|0,em=0';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    expect(parsed).toHaveProperty('data');
    const result = parsed['data'] as VenusDeviceData;
    expect(result).toHaveProperty('ledEnabled', true);
    expect(result).toHaveProperty('backupEnabled', false);
    expect(result).toHaveProperty('inverterVersion', 115);
    expect(result).toHaveProperty('mpptVersion', 104);
    expect(result).toHaveProperty('phaseDiagnosisStatus', 3);
    // Battery and grid power, reported as bp/rp/gp
    expect(result).toHaveProperty('batteryPower', 291);
    expect(result).toHaveProperty('calculatedBatteryPower', 347);
    expect(result).toHaveProperty('gridPower', 801);
    // par=0 means parallel operation is turned off
    expect(result).toHaveProperty('parallelMode', 'off');
    // This firmware predates peak shaving, so it reports neither field
    expect(result.peakShavingEnabled).toBeUndefined();
    expect(result.peakShavingPower).toBeUndefined();
  });

  test('maps the Venus par field to the parallel mode', () => {
    const base =
      'cd=1,tot_i=6,tot_o=1109,ele_d=0,ele_m=0,grd_d=27,grd_m=27,inc_d=0,inc_m=0,grd_f=0,grd_o=801,grd_t=3,gct_s=1,cel_s=2,cel_p=233,cel_c=45,err_t=0,err_a=0,dev_n=147,grd_y=0,wor_m=5,inc_a=0';
    const expected: Record<string, string> = {
      '0': 'off',
      '1': 'wiringCheck',
      '2': 'on',
      // Units without parallel support report 255
      '255': 'unknown',
    };

    for (const [raw, mode] of Object.entries(expected)) {
      const parsed = parseMessage(`${base},par=${raw}`, 'VNSD-0', 'venusD123');
      expect((parsed['data'] as VenusDeviceData).parallelMode).toBe(mode);
    }
  });

  test('parses Venus peak shaving state (peak_status/peak_power)', () => {
    const base =
      'cd=1,tot_i=6,tot_o=1109,ele_d=0,ele_m=0,grd_d=27,grd_m=27,inc_d=0,inc_m=0,grd_f=0,grd_o=801,grd_t=3,gct_s=1,cel_s=2,cel_p=233,cel_c=45,err_t=0,err_a=0,dev_n=150,grd_y=0,wor_m=5,inc_a=0';

    const on = parseMessage(`${base},peak_status=1,peak_power=4000`, 'VNSD-0', 'venusD123');
    const onResult = on['data'] as VenusDeviceData;
    expect(onResult).toHaveProperty('peakShavingEnabled', true);
    expect(onResult).toHaveProperty('peakShavingPower', 4000);

    const off = parseMessage(`${base},peak_status=0,peak_power=2000`, 'VNSD-0', 'venusD123');
    const offResult = off['data'] as VenusDeviceData;
    expect(offResult).toHaveProperty('peakShavingEnabled', false);
    expect(offResult).toHaveProperty('peakShavingPower', 2000);
  });

  test('parses Venus surplus feed-in state from the fu field', () => {
    const base =
      'cd=1,tot_i=6,tot_o=1109,ele_d=0,ele_m=0,grd_d=27,grd_m=27,inc_d=0,inc_m=0,grd_f=0,grd_o=801,grd_t=3,gct_s=1,cel_s=2,cel_p=233,cel_c=45,err_t=800,err_a=4,dev_n=147,grd_y=0,wor_m=5,inc_a=0,pv1=2584|1,pv2=2638|1,pv3=3180|1,pv4=3080|1';

    const off = parseMessage(`${base},fu=0|0,em=0`, 'VNSD-0', 'venusD123');
    expect((off['data'] as VenusDeviceData).surplusFeedInEnabled).toBe(false);

    const on = parseMessage(`${base},fu=1|0,em=0`, 'VNSD-0', 'venusD123');
    expect((on['data'] as VenusDeviceData).surplusFeedInEnabled).toBe(true);
  });

  test('parses Venus Bluetooth advertising state from the ble field', () => {
    const base =
      'cd=1,tot_i=6,tot_o=1109,ele_d=0,ele_m=0,grd_d=27,grd_m=27,inc_d=0,inc_m=0,grd_f=0,grd_o=801,grd_t=3,gct_s=1,cel_s=2,cel_p=233,cel_c=45,err_t=800,err_a=4,dev_n=147,grd_y=0,wor_m=5,inc_a=0';

    // ble=4 -> advertising enabled (Bluetooth lock off)
    const on = parseMessage(`${base},ble=4`, 'VNSD-0', 'venusD123');
    expect((on['data'] as VenusDeviceData).bluetoothAdvertisingEnabled).toBe(true);

    // ble=1 -> advertising disabled (Bluetooth lock on)
    const off = parseMessage(`${base},ble=1`, 'VNSD-0', 'venusD123');
    expect((off['data'] as VenusDeviceData).bluetoothAdvertisingEnabled).toBe(false);
  });

  test('parses Venus cd=42 per-pack BMS details', () => {
    // Real Venus D v147 response to cd=42,bms_idx=255 (two packs present).
    const message =
      'cd=42, BMS: num=2,mask=3,idx=2,charge_pow=2643,discharge_pow=2643,soc1=424,state1=0,temp1=278,soc2=482,state2=2,temp2=254,soc3=0,state3=0,temp3=0,soc4=0,state4=0,temp4=0,soc5=0,state5=0,temp5=0,soc6=0,state6=0,temp6=0';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    expect(parsed).toHaveProperty('bmsPacks');
    const result = parsed['bmsPacks'] as VenusBMSPackInfo;
    expect(result).toHaveProperty('packMask', 3);
    expect(result).toHaveProperty('chargePower', 2643);
    expect(result).toHaveProperty('dischargePower', 2643);
    // SoC and temperature are reported in 0.1 units; VNSD scales temperatures by 10.
    expect(result.packs?.[0]).toEqual({ soc: 42.4, state: 0, temperature: 27.8 });
    expect(result.packs?.[1]).toEqual({ soc: 48.2, state: 2, temperature: 25.4 });
  });

  test('parses Venus cd=42 detailed per-pack BMS data (bms_idx=1)', () => {
    // Real Venus D v147 response to cd=42,bms_idx=1 (the first slave pack, "Pack 2").
    const message =
      'cd=42, BMS(1): num=2,vol=5327,cur=0,soc=708,c_vol=576,c_cur=500,d_cur=500,mos=0,ver=116,max_v=3331,min_v=3329,max_t=258,min_t=254,b_err1=0,b_err2=0,b_war1=0,b_vol=3330|3330|3330|3330|-|3330|3331|3329|3330|-|3329|3329|3329|3330|-|3329|3330|3329|3329,temp=258|257|254|255|256,env=314,mos=259';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    expect(parsed).toHaveProperty('bmsPack1');
    const result = parsed['bmsPack1'] as VenusBMSPackDetail;

    // 16 cell voltages (mV), with the "-" group separators dropped.
    expect(result.cellVoltages).toEqual([
      3330, 3330, 3330, 3330, 3330, 3331, 3329, 3330, 3329, 3329, 3329, 3330, 3329, 3330, 3329,
      3329,
    ]);
    // 5 temperature sensors (deci-degrees -> °C on VNSD).
    expect(result.temperatures).toEqual([25.8, 25.7, 25.4, 25.5, 25.6]);
    // Scalars: pack voltage (centivolts), SoC (deci-%), cell-voltage extremes (mV),
    // temperature extremes / ambient / MOSFET (deci-degrees on VNSD).
    expect(result.voltage).toBeCloseTo(53.27);
    expect(result.soc).toBeCloseTo(70.8);
    expect(result.maxCellVoltage).toBe(3331);
    expect(result.minCellVoltage).toBe(3329);
    expect(result.maxTemperature).toBeCloseTo(25.8);
    expect(result.minTemperature).toBeCloseTo(25.4);
    expect(result.ambientTemperature).toBeCloseTo(31.4);
    // `mos` appears twice; the later MOSFET-temperature value wins (25.9 °C).
    expect(result.mosfetTemperature).toBeCloseTo(25.9);
  });

  test('does not parse an absent Venus pack (bms_idx=2, all zeros) as another pack', () => {
    // bms_idx=2 maps to "Pack 3"; on a two-pack device it reports all zeros.
    const message =
      'cd=42, BMS(2): num=2,vol=0,cur=0,soc=0,c_vol=0,c_cur=0,d_cur=0,mos=0,ver=0,max_v=0,min_v=0,max_t=0,min_t=0,b_err1=0,b_err2=0,b_war1=0,b_vol=0|0|0|0|-|0|0|0|0|-|0|0|0|0|-|0|0|0|0,temp=0|0|0|0|0,env=0,mos=0';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    // The bms_idx=2 response only matches the bmsPack2 definition, not bmsPack1.
    expect(parsed).toHaveProperty('bmsPack2');
    expect(parsed).not.toHaveProperty('bmsPack1');
    expect(parsed).not.toHaveProperty('bmsPacks');
  });

  test('parses Venus cd=26 network info (colon-delimited format)', () => {
    const message =
      'cd=26,dev_net_info:ip:192.168.178.134,gate:192.168.178.1,mask:255.255.255.0,dns:192.168.178.1,ct_connect_ip:192.168.178.255';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    expect(parsed).toHaveProperty('network');
    const result = parsed['network'] as VenusNetworkInfo;
    expect(result).toHaveProperty('ipAddress', '192.168.178.134');
    expect(result).toHaveProperty('gateway', '192.168.178.1');
    expect(result).toHaveProperty('subnetMask', '255.255.255.0');
    expect(result).toHaveProperty('dns', '192.168.178.1');
    expect(result).toHaveProperty('ctConnectIp', '192.168.178.255');
  });

  test('scales Venus A (VNSA) BMS voltages and temperatures (issue #218)', () => {
    // Real BMS reading from a Venus A. Battery voltage is in centivolts,
    // charge voltage in decivolts, cell/MOSFET temperatures in deci-degrees.
    const message =
      'cd=14,b_ver=106,b_chv=468,b_rci=400,b_rdi=400,b_soc=75,b_soh=0,b_cap=2080,b_vol=4328,b_cur=20,b_tem=16,b_chf=3,b_slf=0,b_cpc=157,b_err=0,b_war=0,b_ret=0,b_ent=228,b_mot=173,b_tp1=164,b_tp2=166,b_tp3=168,b_tp4=166,b_vo1=3334,b_vo2=3332,b_vo3=3333,b_vo4=3333,b_vo5=3334,b_vo6=3335,b_vo7=3334,b_vo8=3334,b_vo9=3334,b_vo10=3334,b_vo11=3333,b_vo12=3333,b_vo13=3333,b_vo14=0,b_vo15=0,b_vo16=0';
    const parsed = parseMessage(message, 'VNSA-0', 'venusA123');

    expect(parsed).toHaveProperty('bms');
    const result = parsed['bms'] as VenusBMSInfo;
    expect(result.bms?.voltage).toBeCloseTo(43.28);
    expect(result.bms?.chargeVoltage).toBeCloseTo(46.8);
    expect(result.bms?.mosfetTemp).toBeCloseTo(17.3);
    expect(result.cells?.temperatures?.[0]).toBeCloseTo(16.4);
    // Battery temperature (b_tem) is already in whole degrees and must stay unscaled.
    expect(result.bms?.temperature).toBe(16);
    // Cell voltages are already reported in mV and stay unscaled.
    expect(result.cells?.voltages?.[0]).toBe(3334);
    // Aggregate cell voltage statistics ignore unused cells reported as 0
    // (b_vo14-b_vo16 are 0 on this battery).
    expect(result.cells?.minVoltage).toBe(3332);
    expect(result.cells?.maxVoltage).toBe(3335);
    expect(result.cells?.voltageDiff).toBe(3);
    expect(result.cells?.voltageAvg).toBe(3334);
  });

  test('scales Venus D (VNSD) BMS cell/MOSFET temperatures like Venus A', () => {
    const message =
      'cd=14,b_ver=116,b_chv=468,b_soc=94,b_soh=100,b_cap=5120,b_vol=4328,b_cur=20,b_tem=16,b_chf=3,b_cpc=157,b_err=0,b_war=0,b_ret=0,b_ent=0,b_mot=173,b_tp1=164,b_tp2=166,b_tp3=168,b_tp4=166,b_vo1=3334,b_vo2=3332,b_vo3=3333,b_vo4=3333,b_vo5=3334,b_vo6=3335,b_vo7=3334,b_vo8=3334,b_vo9=3334,b_vo10=3334,b_vo11=3333,b_vo12=3333,b_vo13=3333,b_vo14=0,b_vo15=0,b_vo16=0';
    const parsed = parseMessage(message, 'VNSD-0', 'venusD123');

    const result = parsed['bms'] as VenusBMSInfo;
    // Cell/MOSFET temperatures are reported in deci-degrees and scaled to °C.
    expect(result.bms?.mosfetTemp).toBeCloseTo(17.3);
    expect(result.cells?.temperatures?.[0]).toBeCloseTo(16.4);
    // Battery temperature (b_tem) is already in whole degrees and stays unscaled.
    expect(result.bms?.temperature).toBe(16);
  });

  test('Venus E (VNSE3) BMS scales voltages but keeps raw temperatures', () => {
    const message =
      'cd=14,b_ver=212,b_chv=571,b_soc=65,b_soh=100,b_cap=5120,b_vol=5223,b_cur=-94,b_tem=25,b_chf=192,b_cpc=332,b_err=0,b_war=0,b_ret=0,b_ent=0,b_mot=23,b_tp1=18,b_tp2=19,b_tp3=18,b_tp4=19,b_vo1=3265,b_vo2=3265,b_vo3=3265,b_vo4=3265,b_vo5=3264,b_vo6=3264,b_vo7=3265,b_vo8=3265,b_vo9=3264,b_vo10=3265,b_vo11=3264,b_vo12=3265,b_vo13=3265,b_vo14=3265,b_vo15=3264,b_vo16=3262';
    const parsed = parseMessage(message, 'VNSE3-0', 'venus123');

    const result = parsed['bms'] as VenusBMSInfo;
    expect(result.bms?.voltage).toBeCloseTo(52.23);
    expect(result.bms?.chargeVoltage).toBeCloseTo(57.1);
    // Other Venus variants already report temperatures in whole degrees.
    expect(result.bms?.mosfetTemp).toBe(23);
    expect(result.cells?.temperatures?.[0]).toBe(18);
    // Aggregate cell voltage statistics across all 16 cells.
    expect(result.cells?.minVoltage).toBe(3262);
    expect(result.cells?.maxVoltage).toBe(3265);
    expect(result.cells?.voltageDiff).toBe(3);
    expect(result.cells?.voltageAvg).toBe(3265);
  });
});
