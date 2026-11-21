import './registry.js';
import { getDeviceDefinition } from '../deviceDefinition.js';

describe('Venus E Mini', () => {
  test('uses the zero-padded runtime data request required by the device', () => {
    const definition = getDeviceDefinition('VNSEMINI-0');
    const runtimeMessage = definition?.messages.find(message => message.publishPath === 'data');

    expect(runtimeMessage?.refreshDataPayload).toBe('cd=01');
  });

  test('polls the meter readings with cd=19 and the network info with cd=03', () => {
    const definition = getDeviceDefinition('VNSEMINI-0');
    const payloads = Object.fromEntries(
      definition?.messages.map(m => [m.publishPath, m.refreshDataPayload]) ?? [],
    );
    expect(payloads).toMatchObject({ ct: 'cd=19', network: 'cd=03' });
  });
});
