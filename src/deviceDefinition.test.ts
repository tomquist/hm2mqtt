import './device/registry.js';
import { getDeviceDefinition } from './deviceDefinition.js';

/** The messages array is shared by every device type of one registration. */
const messagesOf = (deviceType: string) => getDeviceDefinition(deviceType)?.messages;

describe('getDeviceDefinition', () => {
  test('prefers a definition registered under the full device type', () => {
    const ct003 = messagesOf('SMR-0');
    const ct002 = messagesOf('HME');
    expect(ct003).toBeDefined();
    expect(ct002).toBeDefined();

    expect(messagesOf('HME-3')).toBe(ct003);
    expect(messagesOf('HME-5')).toBe(ct003);
    // HME-2 and HME-4 fall back to the HME base type, the CT002
    expect(messagesOf('HME-4')).toBe(ct002);
    expect(messagesOf('HME-2')).toBe(ct002);
    expect(ct002).not.toBe(ct003);
  });

  test('matches the full and the base type case-insensitively', () => {
    expect(messagesOf('hme-3')).toBe(messagesOf('SMR-0'));
    expect(messagesOf('hme-4')).toBe(messagesOf('HME-4'));
    expect(messagesOf('hma-1')).toBe(messagesOf('HMA-1'));
  });

  test('returns undefined for an unknown type', () => {
    expect(getDeviceDefinition('NOPE-1')).toBeUndefined();
  });
});

describe('CT002 polled messages', () => {
  const payloads = (deviceType: string) =>
    getDeviceDefinition(deviceType)?.messages.map(m => m.refreshDataPayload);

  test('does not poll cd=19 on the HME CT002s', () => {
    expect(payloads('HME-4')).not.toContain('cd=19');
    expect(payloads('HME-2')).not.toContain('cd=19');
  });

  test('keeps polling cd=19 on TPM-CN and TPM2', () => {
    expect(payloads('TPM-CN')).toContain('cd=19');
    expect(payloads('TPM2-0')).toContain('cd=19');
  });
});

describe('B2500 cd=28 polling', () => {
  const shouldPoll = (deviceType: string, deviceVersion?: number, deviceSubversion?: number) => {
    const message = getDeviceDefinition(deviceType)?.messages.find(
      m => m.refreshDataPayload === 'cd=28',
    );
    expect(message?.shouldPoll).toBeDefined();
    return message?.shouldPoll?.({
      deviceType,
      deviceId: 'x',
      timestamp: '',
      values: {},
      deviceInfo: { deviceVersion, deviceSubversion },
    } as never);
  };

  test('polls the HMJ from firmware 102', () => {
    expect(shouldPoll('HMJ-2', 102)).toBe(true);
    expect(shouldPoll('HMJ-2', 116)).toBe(true);
    expect(shouldPoll('HMJ-2', 101)).toBe(false);
  });

  test('polls the other models from firmware 224 subversion 3', () => {
    for (const deviceType of ['HMA-1', 'HMF-2', 'HMK-1']) {
      expect(shouldPoll(deviceType, 226)).toBe(true);
      expect(shouldPoll(deviceType, 224, 3)).toBe(true);
      expect(shouldPoll(deviceType, 224, 2)).toBe(false);
      expect(shouldPoll(deviceType, 224)).toBe(false);
      expect(shouldPoll(deviceType, 220, 5)).toBe(false);
    }
  });

  test('does not poll before the firmware version is known', () => {
    expect(shouldPoll('HMJ-2')).toBe(false);
    expect(shouldPoll('HMA-1')).toBe(false);
  });
});

describe('CT002 cd=31/cd=32 polling', () => {
  const messages = () => getDeviceDefinition('HME-4')?.messages ?? [];
  const byPayload = (payload: string) => messages().find(m => m.refreshDataPayload === payload);
  const state = (firmwareVersion?: number, deviceType = 'HME-4') =>
    ({ deviceType, deviceId: 'x', timestamp: '', values: {}, firmwareVersion }) as never;

  test('polls cd=31 and cd=32 only from firmware 124 on', () => {
    for (const payload of ['cd=31', 'cd=32']) {
      const message = byPayload(payload);
      expect(message?.shouldPoll?.(state(124))).toBe(true);
      expect(message?.shouldPoll?.(state(130))).toBe(true);
      expect(message?.shouldPoll?.(state(120))).toBe(false);
      // Not before the firmware version is known
      expect(message?.shouldPoll?.(state())).toBe(false);
      // Only the HME-4 has them; the HME-2 shares its definition
      expect(message?.shouldPoll?.(state(124, 'HME-2'))).toBe(false);
      expect(message?.shouldPoll?.(state(124, 'HME-1'))).toBe(false);
    }
  });

  test('sends cd=31 and cd=32 at least a second apart from cd=1 and from each other', () => {
    const delay = (payload: string) => {
      const index = messages().findIndex(m => m.refreshDataPayload === payload);
      return index * 100 + (messages()[index].pollOffsetMs ?? 0);
    };
    expect(delay('cd=31') - delay('cd=1')).toBeGreaterThanOrEqual(1000);
    expect(delay('cd=32') - delay('cd=31')).toBeGreaterThanOrEqual(1000);
  });

  test('is only offered on the HME CT002s', () => {
    for (const deviceType of ['TPM-CN', 'TPM2-0', 'HME-3', 'SMR-0']) {
      const payloads = getDeviceDefinition(deviceType)?.messages.map(m => m.refreshDataPayload);
      expect(payloads).not.toContain('cd=31');
      expect(payloads).not.toContain('cd=32');
    }
  });

  test('no meter ever polls cd=30', () => {
    // HME-4 firmware 124 answers cd=30 with the cd=31 reply
    for (const deviceType of ['HME-2', 'HME-3', 'HME-4', 'HME-5', 'TPM-CN', 'TPM2-0', 'SMR-0']) {
      for (const message of getDeviceDefinition(deviceType)?.messages ?? []) {
        expect(message.refreshDataPayload).not.toMatch(/^cd=30\b/);
      }
    }
  });
});
