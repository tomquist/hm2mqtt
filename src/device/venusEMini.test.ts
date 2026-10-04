import './registry.js';
import { getDeviceDefinition } from '../deviceDefinition.js';

describe('Venus E Mini', () => {
  test('uses the zero-padded runtime data request required by the device', () => {
    const definition = getDeviceDefinition('VNSEMINI-0');
    const runtimeMessage = definition?.messages.find(message => message.publishPath === 'data');

    expect(runtimeMessage?.refreshDataPayload).toBe('cd=01');
  });
});
