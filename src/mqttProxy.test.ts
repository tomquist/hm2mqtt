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
 *   5. Client ID conflict resolution renames duplicate IDs of *different* devices
 *   6. Multiple clients with same original ID all forward data
 *   7. The same device reconnecting takes its session over instead of being renamed
 *   8. Client ID bookkeeping stays correct across takeover / disconnect
 *   9. Proxy stops cleanly
 *
 * Distinct physical devices are simulated by binding the client sockets to
 * different loopback addresses (all of 127.0.0.0/8 is loopback), so the proxy
 * sees different TCP peer addresses.
 */

import { Aedes } from 'aedes';
import * as net from 'net';
import * as mqtt from 'mqtt';
import { MqttProxy } from './mqttProxy.js';

const MAIN_PORT = 19801;
const PROXY_PORT = 19802;

const HOST = '127.0.0.1';
/** Source addresses standing in for separate physical devices */
const DEVICE_A = '127.0.0.2';
const DEVICE_B = '127.0.0.3';
const DEVICE_C = '127.0.0.4';

const CTRL_TOPIC = 'hame_energy/HMA-1/App/test/ctrl';
const DATA_TOPIC = 'hame_energy/HMA-1/device/test/ctrl';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Poll until `predicate` holds, so tests do not rely on fixed sleeps */
function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error('Timeout waiting for condition'));
      }
    }, 10);
  });
}

/** Resolves once the broker has closed this client's connection */
function waitForClose(client: mqtt.MqttClient, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout waiting for connection close')),
      timeoutMs,
    );
    client.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
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

/**
 * Connect an MQTT client, optionally from a specific source address.
 *
 * mqtt.js' built-in TCP stream builder forwards only host/port/path and drops
 * `localAddress`, so the socket is created here to be able to bind it.
 */
function connectClient(
  port: number,
  clientId: string,
  localAddress: string = HOST,
  options: mqtt.IClientOptions = {},
): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = new mqtt.MqttClient(() => net.connect({ port, host: HOST, localAddress }), {
      clientId,
      clean: true,
      reconnectPeriod: 0, // no auto-reconnect in tests
      ...options,
    });
    client.once('connect', () => {
      // The broker closes stale sessions on takeover, which makes the client
      // emit `error` later on. An `error` without a listener would take the
      // Jest worker down.
      client.on('error', () => {});
      resolve(client);
    });
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

function waitForMessage(client: mqtt.MqttClient, topic: string, timeoutMs = 3000): Promise<string> {
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
    await waitFor(() => proxy.getConnectedClientCount() === 1);

    expect(proxy.getConnectedClients()).toContain('device-1');

    await disconnectClient(client);
    await waitFor(() => proxy.getConnectedClientCount() === 0);
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

  test('duplicate client IDs of different devices are renamed so both stay connected', async () => {
    const client1 = await connectClient(PROXY_PORT, 'same-id', DEVICE_A);
    await waitFor(() => proxy.getConnectedClients().includes('same-id'));

    const client2 = await connectClient(PROXY_PORT, 'same-id', DEVICE_B);
    await waitFor(() => proxy.getConnectedClientCount() === 2);

    const connected = proxy.getConnectedClients();
    expect(connected).toContain('same-id');

    const renamed = connected.filter(id => id !== 'same-id');
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatch(/^same-id_/);

    // Both connections are still usable
    expect(client1.connected).toBe(true);
    expect(client2.connected).toBe(true);

    await disconnectClient(client1);
    await disconnectClient(client2);
  });

  test('data of two different devices sharing one client ID reaches the main broker', async () => {
    const mainClient = await connectClient(MAIN_PORT, 'main-subscriber');
    await subscribe(mainClient, DATA_TOPIC);

    const received: string[] = [];
    mainClient.on('message', (_t: string, payload: Buffer) => {
      received.push(payload.toString());
    });

    // Both devices connect with the identical client ID (B2500 fw 226.5/108.7)
    const device1 = await connectClient(PROXY_PORT, 'mst_', DEVICE_A);
    const device2 = await connectClient(PROXY_PORT, 'mst_', DEVICE_B);
    await waitFor(() => proxy.getConnectedClientCount() === 2);

    device1.publish(DATA_TOPIC, 'from-device-1');
    device2.publish(DATA_TOPIC, 'from-device-2');

    await waitFor(() => received.length === 2);
    expect(received).toContain('from-device-1');
    expect(received).toContain('from-device-2');

    await disconnectClient(device1);
    await disconnectClient(device2);
    await disconnectClient(mainClient);
  });

  test('same device reconnecting with the same client ID takes over instead of being renamed', async () => {
    const mainClient = await connectClient(MAIN_PORT, 'main-subscriber');
    await subscribe(mainClient, DATA_TOPIC);

    const staleSession = await connectClient(PROXY_PORT, 'HMJ-2_2222', DEVICE_A);
    await waitFor(() => proxy.getConnectedClients().includes('HMJ-2_2222'));

    // Same device reconnects while the broker still believes the old session
    // is alive (half-open TCP connection on WiFi)
    const staleClosed = waitForClose(staleSession);
    const reconnected = await connectClient(PROXY_PORT, 'HMJ-2_2222', DEVICE_A);

    // The stale session must be closed by the broker ([MQTT-3.1.4-2]) ...
    await staleClosed;
    expect(staleSession.connected).toBe(false);

    // ... and the reconnected device must keep its original client ID
    await waitFor(() => proxy.getConnectedClientCount() === 1);
    expect(proxy.getConnectedClients()).toEqual(['HMJ-2_2222']);

    const forwarded = waitForMessage(mainClient, DATA_TOPIC);
    reconnected.publish(DATA_TOPIC, 'after-takeover');
    expect(await forwarded).toBe('after-takeover');

    await disconnectClient(staleSession);
    await disconnectClient(reconnected);
    await disconnectClient(mainClient);
  });

  test('client ID stays tracked after a takeover', async () => {
    const first = await connectClient(PROXY_PORT, 'mst_', DEVICE_A);
    await waitFor(() => proxy.getConnectedClients().includes('mst_'));

    const firstClosed = waitForClose(first);
    const takeover = await connectClient(PROXY_PORT, 'mst_', DEVICE_A);
    await firstClosed;
    await waitFor(() => proxy.getConnectedClientCount() === 1);

    // A genuinely different device using the same ID must still be renamed,
    // which only works if the ID is still tracked after the takeover
    const other = await connectClient(PROXY_PORT, 'mst_', DEVICE_B);
    await waitFor(() => proxy.getConnectedClientCount() === 2);

    const connected = proxy.getConnectedClients();
    expect(connected).toContain('mst_');
    const renamed = connected.filter(id => id !== 'mst_');
    expect(renamed).toHaveLength(1);
    expect(renamed[0]).toMatch(/^mst__/);

    await disconnectClient(first);
    await disconnectClient(takeover);
    await disconnectClient(other);
  });

  test('client ID is released after a device disconnects and is reusable without rename', async () => {
    const first = await connectClient(PROXY_PORT, 'HMJ-2_1245', DEVICE_A);
    await waitFor(() => proxy.getConnectedClients().includes('HMJ-2_1245'));

    await disconnectClient(first);
    await waitFor(() => proxy.getConnectedClientCount() === 0);

    // Even from a different address the ID must be handed out unchanged now
    const second = await connectClient(PROXY_PORT, 'HMJ-2_1245', DEVICE_B);
    await waitFor(() => proxy.getConnectedClientCount() === 1);
    expect(proxy.getConnectedClients()).toEqual(['HMJ-2_1245']);

    await disconnectClient(second);
  });

  test('client ID of a rejected connection is not poisoned', async () => {
    // MQTT 3.1 limits client IDs to 23 characters, so Aedes rejects this
    // CONNECT in `init()` - after preConnect already reserved the ID
    const longId = 'x'.repeat(30);
    await expect(
      connectClient(PROXY_PORT, longId, DEVICE_A, {
        protocolVersion: 3,
        protocolId: 'MQIsdp',
      }),
    ).rejects.toThrow(/Identifier rejected/i);

    // The same device must be able to connect again under its own ID
    const client = await connectClient(PROXY_PORT, longId, DEVICE_A);
    await waitFor(() => proxy.getConnectedClientCount() === 1);
    expect(proxy.getConnectedClients()).toEqual([longId]);

    await disconnectClient(client);
  });

  test('multiple clients with same ID all forward their data to main broker', async () => {
    const mainClient = await connectClient(MAIN_PORT, 'main-subscriber');
    await subscribe(mainClient, DATA_TOPIC);

    // Connect three "devices" that all identify as the same client ID
    const [c1, c2, c3] = await Promise.all([
      connectClient(PROXY_PORT, 'b2500', DEVICE_A),
      connectClient(PROXY_PORT, 'b2500', DEVICE_B),
      connectClient(PROXY_PORT, 'b2500', DEVICE_C),
    ]);
    await waitFor(() => proxy.getConnectedClientCount() === 3);

    // Collect all messages arriving on the main broker
    const received: string[] = [];
    mainClient.on('message', (_t: string, payload: Buffer) => {
      received.push(payload.toString());
    });

    c1.publish(DATA_TOPIC, 'from-c1');
    c2.publish(DATA_TOPIC, 'from-c2');
    c3.publish(DATA_TOPIC, 'from-c3');

    await waitFor(() => received.length === 3);

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
