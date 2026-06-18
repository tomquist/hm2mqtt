/**
 * E2E integration tests for MqttProxy.
 *
 * Topology:
 *
 *   [main broker (Aedes)]  <-->  [MqttProxy]  <-->  [proxy client(s) (mqtt.js)]
 *        port MAIN_PORT                port PROXY_PORT
 *
 * Tests verify:
 *   1. Proxy starts and accepts connections
 *   2. Client tracking (connect / disconnect)
 *   3. Proxy client → main broker message forwarding
 *   4. Main broker → proxy client message forwarding
 *   5. Client ID conflict resolution renames duplicate IDs
 *   6. Multiple clients with same original ID all forward data
 *   7. Proxy stops cleanly
 */

import { Aedes } from 'aedes';
import * as net from 'net';
import * as mqtt from 'mqtt';
import { MqttProxy } from './mqttProxy.js';

const MAIN_PORT = 19801;
const PROXY_PORT = 19802;

const CTRL_TOPIC = 'hame_energy/HMA-1/App/test/ctrl';
const DATA_TOPIC = 'hame_energy/HMA-1/device/test/ctrl';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startMainBroker(): Promise<{ broker: Aedes; server: net.Server }> {
  const broker = await Aedes.createBroker();
  const server = net.createServer(broker.handle.bind(broker));
  await new Promise<void>((resolve, reject) =>
    server.listen(MAIN_PORT, (err?: Error) => (err ? reject(err) : resolve())),
  );
  return { broker, server };
}

async function stopMainBroker(broker: Aedes, server: net.Server): Promise<void> {
  await new Promise<void>(resolve => broker.close(() => resolve()));
  await new Promise<void>(resolve => server.close(() => resolve()));
}

function connectClient(port: number, clientId: string): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(`mqtt://localhost:${port}`, {
      clientId,
      clean: true,
      reconnectPeriod: 0, // no auto-reconnect in tests
    });
    client.once('connect', () => resolve(client));
    client.once('error', reject);
  });
}

function disconnectClient(client: mqtt.MqttClient): Promise<void> {
  return new Promise(resolve => client.end(true, {}, () => resolve()));
}

function subscribe(client: mqtt.MqttClient, topic: string): Promise<void> {
  return new Promise((resolve, reject) =>
    client.subscribe(topic, err => (err ? reject(err) : resolve())),
  );
}

function waitForMessage(
  client: mqtt.MqttClient,
  topic: string,
  timeoutMs = 3000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for message on "${topic}"`)),
      timeoutMs,
    );
    client.on('message', (t: string, payload: Buffer) => {
      if (t === topic) {
        clearTimeout(timer);
        resolve(payload.toString());
      }
    });
  });
}

/** DeviceManager mock that exposes CTRL_TOPIC for subscription */
const deviceManager: any = {
  getDevices: () => [{ deviceType: 'HMA-1', deviceId: 'test' }],
  getDeviceTopics: () => ({
    deviceControlTopicOld: CTRL_TOPIC,
    deviceControlTopicNew: CTRL_TOPIC,
  }),
};

describe('MqttProxy E2E', () => {
  let mainBroker: Aedes;
  let mainServer: net.Server;
  let proxy: MqttProxy;

  beforeEach(async () => {
    ({ broker: mainBroker, server: mainServer } = await startMainBroker());
    proxy = new MqttProxy(
      {
        port: PROXY_PORT,
        mainBrokerUrl: `mqtt://localhost:${MAIN_PORT}`,
        proxyClientId: 'test-proxy',
        autoResolveClientIdConflicts: true,
      },
      deviceManager,
    );
    await proxy.start();
    await sleep(100); // let proxy connect to main broker
  }, 10000);

  afterEach(async () => {
    if (proxy.isProxyRunning()) await proxy.stop();
    await stopMainBroker(mainBroker, mainServer);
  }, 10000);

  test('proxy starts and reports running', () => {
    expect(proxy.isProxyRunning()).toBe(true);
  });

  test('proxy client connects and is tracked', async () => {
    const client = await connectClient(PROXY_PORT, 'device-1');
    await sleep(100);

    expect(proxy.getConnectedClientCount()).toBe(1);
    expect(proxy.getConnectedClients()).toContain('device-1');

    await disconnectClient(client);
    await sleep(100);
    expect(proxy.getConnectedClientCount()).toBe(0);
  });

  test('message from proxy client is forwarded to main broker', async () => {
    const payload = 'pe=75,kn=500';

    const mainClient = await connectClient(MAIN_PORT, 'main-subscriber');
    await subscribe(mainClient, DATA_TOPIC);

    const proxyClient = await connectClient(PROXY_PORT, 'device-1');
    const received = waitForMessage(mainClient, DATA_TOPIC);
    proxyClient.publish(DATA_TOPIC, payload);

    expect(await received).toBe(payload);

    await disconnectClient(proxyClient);
    await disconnectClient(mainClient);
  });

  test('message from main broker is forwarded to proxy client', async () => {
    const payload = 'cd=1';

    const proxyClient = await connectClient(PROXY_PORT, 'device-1');
    await subscribe(proxyClient, CTRL_TOPIC);
    await sleep(100); // let subscription propagate

    const mainClient = await connectClient(MAIN_PORT, 'main-publisher');
    const received = waitForMessage(proxyClient, CTRL_TOPIC);
    mainClient.publish(CTRL_TOPIC, payload);

    expect(await received).toBe(payload);

    await disconnectClient(proxyClient);
    await disconnectClient(mainClient);
  });

  test('duplicate client IDs are renamed so both stay connected', async () => {
    const client1 = await connectClient(PROXY_PORT, 'same-id');
    await sleep(100);
    expect(proxy.getConnectedClients()).toContain('same-id');

    const client2 = await connectClient(PROXY_PORT, 'same-id');
    await sleep(100);

    const connected = proxy.getConnectedClients();
    expect(connected).toHaveLength(2);

    const renamed = connected.filter(id => id !== 'same-id');
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatch(/^same-id_/);

    await disconnectClient(client1);
    await disconnectClient(client2);
  });

  test('multiple clients with same ID all forward their data to main broker', async () => {
    const mainClient = await connectClient(MAIN_PORT, 'main-subscriber');
    await subscribe(mainClient, DATA_TOPIC);

    // Connect three "devices" that all identify as the same client ID
    const [c1, c2, c3] = await Promise.all([
      connectClient(PROXY_PORT, 'b2500'),
      connectClient(PROXY_PORT, 'b2500'),
      connectClient(PROXY_PORT, 'b2500'),
    ]);
    await sleep(150);
    expect(proxy.getConnectedClientCount()).toBe(3);

    // Collect all messages arriving on the main broker
    const received: string[] = [];
    mainClient.on('message', (_t: string, payload: Buffer) => {
      received.push(payload.toString());
    });

    c1.publish(DATA_TOPIC, 'from-c1');
    c2.publish(DATA_TOPIC, 'from-c2');
    c3.publish(DATA_TOPIC, 'from-c3');

    // Give messages time to arrive
    await sleep(300);

    expect(received).toHaveLength(3);
    expect(received).toContain('from-c1');
    expect(received).toContain('from-c2');
    expect(received).toContain('from-c3');

    await disconnectClient(c1);
    await disconnectClient(c2);
    await disconnectClient(c3);
    await disconnectClient(mainClient);
  });

  test('proxy stops cleanly', async () => {
    const client = await connectClient(PROXY_PORT, 'device-1');
    await sleep(100);

    await proxy.stop();
    expect(proxy.isProxyRunning()).toBe(false);

    await disconnectClient(client);
  });
});
