import { parseMessage } from './parser';
import { B2500V2DeviceData, MI800DeviceData } from './types';

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
  });

  test('should parse MI800 micro inverter message correctly', () => {
    // Sample message from the provided MI800 inverter format
    const message =
      'ele_d=53,ele_w=3984,ele_m=3984,pv1_v=335,pv1_i=3,pv1_p=39,pv1_s=1,pv2_v=341,pv2_i=11,pv2_p=38,pv2_s=1,pe1_v=17,fb1_v=832,fb2_v=773,grd_f=5001,grd_v=2543,grd_s=1,grd_o=72,chp_t=36,rel_s=1,err_t=0,err_c=0,err_d=0,ver_s=106,mpt_m=1,ble_s=2';
    const deviceType = 'HMI-1';
    const deviceId = '24197287XXXX';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as MI800DeviceData;

    // Check the structure
    expect(result).toHaveProperty('deviceType', deviceType);
    expect(result).toHaveProperty('deviceId', deviceId);
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('values');

    // Check raw values are preserved
    expect(result.values).toHaveProperty('ele_d', '53');
    expect(result.values).toHaveProperty('pv1_v', '335');
    expect(result.values).toHaveProperty('grd_f', '5001');
    expect(result.values).toHaveProperty('chp_t', '36');

    // Check energy statistics (with /100 scale factor)
    expect(result).toHaveProperty('dailyEnergyGenerated', 0.53);
    expect(result).toHaveProperty('weeklyEnergyGenerated', 39.84);
    expect(result).toHaveProperty('monthlyEnergyGenerated', 39.84);

    // Check PV Input 1 (voltage/current with /10 scale factor)
    expect(result).toHaveProperty('pv1Voltage', 33.5);
    expect(result).toHaveProperty('pv1Current', 0.3);
    expect(result).toHaveProperty('pv1Power', 39);
    expect(result).toHaveProperty('pv1Status', true);

    // Check PV Input 2
    expect(result).toHaveProperty('pv2Voltage', 34.1);
    expect(result).toHaveProperty('pv2Current', 1.1);
    expect(result).toHaveProperty('pv2Power', 38);
    expect(result).toHaveProperty('pv2Status', true);

    // Check grid information
    expect(result).toHaveProperty('gridFrequency', 50.01);
    expect(result).toHaveProperty('gridVoltage', 254.3);
    expect(result).toHaveProperty('gridStatus', true);
    expect(result).toHaveProperty('gridOutputPower', 72);

    // Check device status
    expect(result).toHaveProperty('chipTemperature', 36);
    expect(result).toHaveProperty('errorType', 0);
    expect(result).toHaveProperty('errorCount', 0);
    expect(result).toHaveProperty('errorDetails', 0);
    expect(result).toHaveProperty('firmwareVersion', 106);
  });

  test('should handle MI800 message with different PV status values', () => {
    // Test with PV inputs inactive
    const message =
      'ele_d=25,ele_w=1500,ele_m=1500,pv1_v=0,pv1_i=0,pv1_p=0,pv1_s=0,pv2_v=0,pv2_i=0,pv2_p=0,pv2_s=0,grd_f=5000,grd_v=2400,grd_s=0,grd_o=0,chp_t=25,err_t=0,err_c=0,err_d=0,ver_s=105';
    const deviceType = 'HMI-1';
    const deviceId = 'test123';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as MI800DeviceData;

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

  test('should handle MI800 message with error conditions', () => {
    // Test with error conditions
    const message =
      'ele_d=100,ele_w=2000,ele_m=2000,pv1_v=300,pv1_i=5,pv1_p=50,pv1_s=1,pv2_v=305,pv2_i=6,pv2_p=55,pv2_s=1,grd_f=4980,grd_v=2200,grd_s=1,grd_o=100,chp_t=45,err_t=1,err_c=3,err_d=255,ver_s=107';
    const deviceType = 'HMI-1';
    const deviceId = 'error_test';

    const parsed = parseMessage(message, deviceType, deviceId);
    expect(parsed).toHaveProperty('data');

    const result = parsed['data'] as MI800DeviceData;

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
});
