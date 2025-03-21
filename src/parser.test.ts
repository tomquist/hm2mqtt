import { parseMessage } from './parser';
import { B2500V2DeviceData } from './types';

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
});
