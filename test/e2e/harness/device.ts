import mqtt, { MqttClient } from 'mqtt';
import { DeviceFixture } from '../../fixtures/devices.js';

/**
 * A Marstek device, as far as hm2mqtt can tell.
 *
 * hm2mqtt asks for data by publishing `cd=<n>` on the device's App topic; the
 * device answers on its ctrl topic. The simulator replays the canned reading
 * for the requested command and ignores commands it has no fixture for, which
 * is also what a real device does for features it lacks.
 */
export interface SimulatedDevice {
  readonly deviceType: string;
  readonly deviceId: string;
  /** Every `cd=` value hm2mqtt asked for, in order. */
  readonly requests: string[];
  /** Responses that could not be published, for diagnosing a quiet device. */
  readonly failures: unknown[];
  /** Publish a reading without being asked, as a device does while running. */
  pushReading(command?: number): Promise<void>;
  stop(): Promise<void>;
}

export async function startSimulatedDevice(
  brokerUrl: string,
  fixture: DeviceFixture,
  deviceId: string,
): Promise<SimulatedDevice> {
  const { deviceType } = fixture;
  const requestTopic = `hame_energy/${deviceType}/App/${deviceId}/ctrl`;
  const responseTopic = `hame_energy/${deviceType}/device/${deviceId}/ctrl`;
  const requests: string[] = [];
  const failures: unknown[] = [];
  const responder = fixture.createResponder?.();

  // The device id is unique within a scenario, so it alone keeps client ids
  // apart — truncating a type-plus-id string could collide for two devices of
  // the same type.
  const client: MqttClient = await mqtt.connectAsync(brokerUrl, {
    clientId: `e2e-device-${deviceId}`,
  });

  const respond = async (request: string) => {
    const command = /(?:^|,)cd=(\d+)/.exec(request);
    const response = responder
      ? responder(request)
      : command
        ? fixture.responses[Number(command[1])]
        : undefined;
    if (response !== undefined) {
      await client.publishAsync(responseTopic, response, { qos: 1 });
    }
  };

  client.on('message', (_topic, payload) => {
    const request = payload.toString();
    requests.push(request);
    const command = /(?:^|,)cd=(\d+)/.exec(request);
    if (command) {
      // The client can be closing while a response is in flight during
      // teardown; an unhandled rejection there would fail an unrelated test.
      respond(request).catch(error => failures.push(error));
    }
  });
  await client.subscribeAsync(requestTopic, { qos: 1 });

  return {
    deviceType,
    deviceId,
    requests,
    failures,
    async pushReading(command = 1) {
      await respond(`cd=${command}`);
    },
    async stop() {
      await client.endAsync(true);
    },
  };
}
