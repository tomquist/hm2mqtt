import { parseMessage } from './parser';
import { B2500V2DeviceData, JupiterBMSInfo, JupiterDeviceData, MI800DeviceData } from './types';

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
      'ele_d=11,ele_s=1433,ele_m=1433,pv1_v=334,pv1_i=0,pv1_p=16,pv1_s=1,pv2_v=335,pv2_i=0,pv2_p=15,pv2_s=1,pe1_v=17,fb1_v=847,fb2_v=826,grd_f=4999,grd_v=2455,grd_s=1,grd_o=29,chp_t=33,rel_s=1,err_t=0,err_c=0,err_d=0,ver_s=120,mpt_m=1,ble_s=1,mpt1=1,mpt2=1,wif_r=69,fc4_v=202406141323,gc=0,pl=800,ct_r=0,ct_f=0,ct_c=0';
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

    // PV power
    expect(result).toHaveProperty('pv1Power', 94);
    expect(result).toHaveProperty('pv2Power', 77);
    expect(result).toHaveProperty('pv3Power', 41);
    expect(result).toHaveProperty('pv4Power', 60);

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
    expect(result).toHaveProperty('rechargeMode', 1);
    expect(result).toHaveProperty('deviceVersion', 134);
    expect(result).toHaveProperty('bmsVersion', 209);
    expect(result).toHaveProperty('mpptVersion', 206);
    expect(result).toHaveProperty('inverterVersion', 106);
    expect(result).toHaveProperty('wifiName', 'xxxx');

    // Additional features
    expect(result).toHaveProperty('surplusFeedInEnabled', true);
    expect(result).toHaveProperty('alarmCode', 0);
    expect(result).toHaveProperty('depthOfDischarge', 88);

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
      'inv:g_state=1,w_state1=1,w_state2=1,i_err=0,i_war=0,g_vol=2399,g_cur=0,g_pf=0,g_fre=5002,b_vol=526,g_power=119,i_temp=143,mppt:m_state=244,m_err=0,m_temp=30,m_war=0,pv1=350|37|1304,pv2=349|39|1372,pv3=378|18|712,pv4=365|32|1180,b_vol=525,b_cur=85,base_v=221,pe_v=165,fail_t=0,bms:c_vol=571,c_cur=500,d_cur=500,soc=33,soh=100,b_cap=5120,b_vol=5252,b_cur=63,b_temp=213,b_err=0,b_war=0,b_err2=0,b_war2=0,c_flag=192,s_flag=0,b_num=1,vol0=3280,vol1=3281,vol2=3283,vol3=3283,vol4=3283,vol5=3283,vol6=3280,vol7=3284,vol8=3283,vol9=3284,vol10=3282,vol11=3286,vol12=3277,vol13=3286,vol14=3283,vol15=3284,b_temp0=14,b_temp1=15,b_temp2=15,b_temp3=16,env_t=27,mos_t=20,lck=0';
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
    expect(result.cells).toHaveProperty('voltages');
    expect(Array.isArray(result.cells?.voltages)).toBe(true);
    expect(result.cells?.voltages).toHaveLength(16);
    expect(result.cells?.voltages).toEqual([
      3280, 3281, 3283, 3283, 3283, 3283, 3280, 3284, 3283, 3284, 3282, 3286, 3277, 3286, 3283,
      3284,
    ]);

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
    expect(result.inverter).toHaveProperty('temperature', 14.3);
    expect(result.inverter).toHaveProperty('error', 0);
    expect(result.inverter).toHaveProperty('warning', 0);
    expect(result.inverter).toHaveProperty('gridVoltage', 239.9);
    expect(result.inverter).toHaveProperty('gridCurrent', 0);
    expect(result.inverter).toHaveProperty('gridPower', 119);
    expect(result.inverter).toHaveProperty('gridPowerFactor', 0);
    expect(result.inverter).toHaveProperty('gridFrequency', 50.02);
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
    expect(result.inverter).toHaveProperty('temperature', -3.1);
  });
});
