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
