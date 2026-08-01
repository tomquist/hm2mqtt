import * as mqtt from 'mqtt';
import { Aedes, Client as AedesClient, ConnectPacket } from 'aedes';
import * as net from 'net';
import { DeviceManager } from './deviceManager.js';
import logger from './logger.js';

export interface MqttProxyConfig {
  /** Port for the proxy MQTT server */
  port: number;
  /** Main MQTT broker URL to forward messages to */
  mainBrokerUrl: string;
  /** Main MQTT broker username */
  mainBrokerUsername?: string;
  /** Main MQTT broker password */
  mainBrokerPassword?: string;
  /** Unique client ID for the proxy's connection to main broker */
  proxyClientId: string;
  /** Automatically resolve client ID conflicts by appending unique suffix (default: true) */
  autoResolveClientIdConflicts?: boolean;
}

/**
 * MQTT Proxy class to work around B2500 client ID collision bug.
 *
 * This proxy:
 * 1. Spins up an MQTT server for devices to connect to
 * 2. Forwards messages from main broker on deviceControlTopicOld/New to proxy clients
 * 3. Forwards messages from proxy clients to the main broker
 */
export class MqttProxy {
  private aedesServer!: Aedes;
  private tcpServer!: net.Server;
  private mainBrokerClient!: mqtt.MqttClient;
  private isRunning: boolean = false;
  private connectedClients: Set<string> = new Set();
  private usedClientIds: Set<string> = new Set();
  /** Client ID handed out in preConnect, per connection attempt */
  private assignedClientIds: WeakMap<AedesClient, string> = new WeakMap();

  constructor(
    private config: MqttProxyConfig,
    private deviceManager: DeviceManager,
  ) {}

  private async initAedes(): Promise<void> {
    this.aedesServer = await Aedes.createBroker({
      preConnect: (
        client: AedesClient,
        packet: ConnectPacket,
        callback: (error: Error | null, success: boolean) => void,
      ) => {
        const originalClientId = packet.clientId || '';

        if (
          this.config.autoResolveClientIdConflicts !== false &&
          this.usedClientIds.has(originalClientId) &&
          !this.isSameDeviceReconnecting(client, originalClientId)
        ) {
          let uniqueId: string;
          let attempts = 0;
          const maxAttempts = 10;

          do {
            uniqueId = `${originalClientId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            attempts++;
          } while (this.usedClientIds.has(uniqueId) && attempts < maxAttempts);

          if (attempts >= maxAttempts) {
            logger.error(
              `MQTT Proxy: Failed to generate unique client ID after ${maxAttempts} attempts for '${originalClientId}'`,
            );
            callback(new Error('Unable to generate unique client ID'), false);
            return;
          }

          packet.clientId = uniqueId;
          logger.info(
            `MQTT Proxy: Modified client ID from '${originalClientId}' to '${uniqueId}' (conflict resolution). Use distinct usernames for each storage to avoid conflicts`,
          );
        }

        // An empty client ID is not an identity - Aedes generates a unique one
        // for those, and tracking `''` would only make the next anonymous
        // client look like a conflict.
        if (packet.clientId) {
          this.trackClientId(client, packet.clientId);
        }
        callback(null, true);
      },
    });
    this.tcpServer = net.createServer(this.aedesServer.handle.bind(this.aedesServer));
    this.setupAedesEventHandlers();
  }

  /**
   * Look up the client currently registered under a client ID.
   *
   * `clients` is part of the Aedes runtime but is not declared in its type
   * definitions, hence the cast.
   */
  private getRegisteredClient(clientId: string): AedesClient | undefined {
    const clients = (
      this.aedesServer as unknown as {
        clients?: Record<string, AedesClient | undefined>;
      }
    )?.clients;
    return clients?.[clientId];
  }

  /**
   * Remote (peer) address of a connection, if it can be determined.
   */
  private getRemoteAddress(client: AedesClient | undefined): string | undefined {
    // An empty address means the socket is already gone - treat it as unknown
    return (client?.conn as net.Socket | undefined)?.remoteAddress || undefined;
  }

  /**
   * Decide whether a CONNECT for an already known client ID comes from the very
   * device that currently holds it.
   *
   * Devices on WiFi routinely reconnect while the broker still holds their
   * previous, half-open session. MQTT-3.1.4-2 requires the new CONNECT to take
   * over and the stale session to be closed, which Aedes does for us as long as
   * the client ID stays untouched. Renaming instead keeps the zombie session
   * alive until keepalive expiry, duplicates every control message to it and
   * stacks another ghost session on each reconnect.
   *
   * Heuristic: compare the TCP peer address. Same address means the same
   * physical device reconnecting, so let Aedes take the session over. A
   * different (or unknown) address means genuinely different devices colliding
   * on one ID - B2500 firmware 226.5/108.7 connects every device as `mst_` -
   * so the conflict resolution rename still applies.
   *
   * This assumes devices reach the proxy from distinct addresses. Devices
   * behind a shared NAT look like one device and would take each other over
   * instead of being renamed.
   */
  private isSameDeviceReconnecting(client: AedesClient, clientId: string): boolean {
    const existingClient = this.getRegisteredClient(clientId);
    if (!existingClient) {
      return false;
    }

    const incomingAddress = this.getRemoteAddress(client);
    const existingAddress = this.getRemoteAddress(existingClient);
    return incomingAddress !== undefined && incomingAddress === existingAddress;
  }

  /**
   * Remember the client ID assigned to a connection attempt.
   */
  private trackClientId(client: AedesClient, clientId: string): void {
    this.usedClientIds.add(clientId);
    this.assignedClientIds.set(client, clientId);

    // A connection can die before Aedes ever registers it (CONNECT rejected in
    // `init`, socket reset mid-handshake). Those paths never emit
    // `clientDisconnect`, so without releasing the ID here it would stay in
    // `usedClientIds` forever and every later connect of that device would be
    // renamed.
    (client.conn as net.Socket | undefined)?.once('close', () => {
      this.releaseClientId(client);
    });
  }

  /**
   * Release the client ID of a connection that went away, unless a different,
   * still registered client owns that ID now (session takeover).
   */
  private releaseClientId(client: AedesClient): void {
    const clientId = this.assignedClientIds.get(client) ?? client.id;
    if (!clientId) {
      return;
    }

    const owner = this.getRegisteredClient(clientId);
    if (owner && owner !== client) {
      return;
    }

    this.usedClientIds.delete(clientId);
  }

  /**
   * Set up connection to the main MQTT broker
   */
  private setupMainBrokerConnection(): mqtt.MqttClient {
    const options: mqtt.IClientOptions = {
      clientId: this.config.proxyClientId,
      username: this.config.mainBrokerUsername,
      password: this.config.mainBrokerPassword,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    };

    logger.info(
      `MQTT Proxy connecting to main broker at ${this.config.mainBrokerUrl} with client ID ${this.config.proxyClientId}`,
    );

    const client = mqtt.connect(this.config.mainBrokerUrl, options);

    client.on('connect', () => {
      logger.info('MQTT Proxy connected to main broker');
      this.subscribeToControlTopics();
    });

    client.on('message', (topic: string, message: Buffer) => {
      this.handleMainBrokerMessage(topic, message);
    });

    client.on('error', (error: Error) => {
      logger.error('MQTT Proxy main broker connection error:', error);
    });

    client.on('close', () => {
      logger.info('MQTT Proxy disconnected from main broker');
    });

    client.on('reconnect', () => {
      logger.debug('MQTT Proxy attempting to reconnect to main broker...');
    });

    return client;
  }

  /**
   * Subscribe to device control topics on the main broker
   */
  private subscribeToControlTopics(): void {
    const devices = this.deviceManager.getDevices();

    for (const device of devices) {
      const topics = this.deviceManager.getDeviceTopics(device);
      if (topics) {
        // Subscribe to control topics to forward to proxy clients
        this.mainBrokerClient.subscribe(topics.deviceControlTopicOld, err => {
          if (err) {
            logger.error(`Error subscribing to ${topics.deviceControlTopicOld}:`, err);
          } else {
            logger.debug(`MQTT Proxy subscribed to ${topics.deviceControlTopicOld}`);
          }
        });

        this.mainBrokerClient.subscribe(topics.deviceControlTopicNew, err => {
          if (err) {
            logger.error(`Error subscribing to ${topics.deviceControlTopicNew}:`, err);
          } else {
            logger.debug(`MQTT Proxy subscribed to ${topics.deviceControlTopicNew}`);
          }
        });
      }
    }
  }

  /**
   * Handle messages received from the main broker
   */
  private handleMainBrokerMessage(topic: string, message: Buffer): void {
    logger.debug(`MQTT Proxy received message from main broker on topic: ${topic}`);

    // Forward the message to all connected proxy clients
    this.aedesServer.publish(
      {
        cmd: 'publish',
        topic,
        payload: message,
        qos: 0,
        retain: false,
        dup: false,
      },
      err => {
        if (err) {
          logger.error(`Error forwarding message to proxy clients:`, err);
        } else {
          logger.debug(`Forwarded message to proxy clients on topic: ${topic}`);
        }
      },
    );
  }

  /**
   * Set up event handlers for the Aedes server
   */
  private setupAedesEventHandlers(): void {
    this.aedesServer.on('client', client => {
      logger.info(`Client ${client.id} connected to MQTT proxy`);
      this.connectedClients.add(client.id);
      // On a session takeover Aedes disconnects the stale session before
      // registering this one, so the `clientDisconnect` handler below has just
      // dropped an ID that this client actually holds. Re-add it.
      this.usedClientIds.add(client.id);
    });

    this.aedesServer.on('clientDisconnect', client => {
      logger.info(`Client ${client.id} disconnected from MQTT proxy`);
      this.connectedClients.delete(client.id);
      // Remove the client ID from our tracking set when client disconnects
      this.usedClientIds.delete(client.id);
    });

    // Connections that error out (rejected CONNECT, protocol error, socket
    // reset) never reach `clientDisconnect`, so release their client ID here.
    this.aedesServer.on('clientError', (client, error) => {
      logger.debug(`MQTT Proxy client ${client.id} error: ${error.message}`);
      this.releaseClientId(client);
    });

    this.aedesServer.on('connectionError', (client, error) => {
      logger.debug(`MQTT Proxy connection error before registration: ${error.message}`);
      this.releaseClientId(client);
    });

    this.aedesServer.on('publish', (packet, client) => {
      if (client) {
        logger.debug(
          `MQTT Proxy received message from client ${client.id} on topic: ${packet.topic}`,
        );

        // Forward the message to the main broker
        this.mainBrokerClient.publish(
          packet.topic,
          packet.payload,
          {
            qos: packet.qos,
            retain: packet.retain,
          },
          err => {
            if (err) {
              logger.error(`Error forwarding message to main broker:`, err);
            } else {
              logger.debug(`Forwarded message to main broker on topic: ${packet.topic}`);
            }
          },
        );
      }
    });

    this.aedesServer.on('subscribe', (subscriptions, client) => {
      logger.debug(
        `Client ${client.id} subscribed to:`,
        subscriptions.map(s => s.topic).join(', '),
      );
    });

    this.aedesServer.on('unsubscribe', (unsubscriptions, client) => {
      logger.debug(`Client ${client.id} unsubscribed from:`, unsubscriptions.join(', '));
    });
  }

  /**
   * Start the MQTT proxy server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('MQTT Proxy is already running');
      return;
    }

    await this.initAedes();
    this.mainBrokerClient = this.setupMainBrokerConnection();

    return new Promise((resolve, reject) => {
      this.tcpServer.listen(this.config.port, (err?: Error) => {
        if (err) {
          logger.error(`Failed to start MQTT Proxy on port ${this.config.port}:`, err);
          reject(err);
          return;
        }

        this.isRunning = true;
        logger.info(`MQTT Proxy server started on port ${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the MQTT proxy server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('MQTT Proxy is not running');
      return;
    }

    return new Promise(resolve => {
      // Close the main broker connection
      this.mainBrokerClient.end();

      // Close the Aedes server
      this.aedesServer.close(() => {
        // Close the TCP server
        this.tcpServer.close(() => {
          this.isRunning = false;
          logger.info('MQTT Proxy stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Get the number of connected clients
   */
  getConnectedClientCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get the list of connected client IDs
   */
  getConnectedClients(): string[] {
    return Array.from(this.connectedClients);
  }

  /**
   * Check if the proxy is running
   */
  isProxyRunning(): boolean {
    return this.isRunning;
  }
}
