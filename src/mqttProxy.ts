import * as mqtt from 'mqtt';
import Aedes from 'aedes';
import * as net from 'net';
import { DeviceManager } from './deviceManager';
import logger from './logger';

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
  private aedesServer: Aedes;
  private tcpServer: net.Server;
  private mainBrokerClient: mqtt.MqttClient;
  private isRunning: boolean = false;
  private connectedClients: Set<string> = new Set();
  private usedClientIds: Set<string> = new Set();

  constructor(
    private config: MqttProxyConfig,
    private deviceManager: DeviceManager,
  ) {
    this.aedesServer = new Aedes({
      // Handle client ID conflicts by ensuring unique client IDs
      preConnect: (client, packet, callback) => {
        const originalClientId = packet.clientId || '';

        // If auto-resolve is enabled and the client ID is already in use
        if (
          this.config.autoResolveClientIdConflicts !== false &&
          this.usedClientIds.has(originalClientId)
        ) {
          // Generate unique client ID by appending timestamp and random suffix
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
          logger.warn(
            `MQTT Proxy: Modified client ID from '${originalClientId}' to '${uniqueId}' (conflict resolution)`,
          );
        }

        // Add the client ID to our tracking set
        this.usedClientIds.add(packet.clientId);
        callback(null, true);
      },
    });
    this.tcpServer = net.createServer(this.aedesServer.handle);
    this.mainBrokerClient = this.setupMainBrokerConnection();
    this.setupAedesEventHandlers();
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
    });

    this.aedesServer.on('clientDisconnect', client => {
      logger.info(`Client ${client.id} disconnected from MQTT proxy`);
      this.connectedClients.delete(client.id);
      // Remove the client ID from our tracking set when client disconnects
      this.usedClientIds.delete(client.id);
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
