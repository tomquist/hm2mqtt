import mqtt, { MqttClient } from 'mqtt';

export interface ReceivedMessage {
  topic: string;
  payload: string;
  retain: boolean;
}

/**
 * The scenario's own eyes and hands on the broker: it publishes what a device
 * or a previous release would have published, and records everything so
 * assertions can look at the current value of a topic or its whole history.
 */
export class MqttProbe {
  private readonly latestByTopic = new Map<string, string>();
  private readonly history: ReceivedMessage[] = [];

  private constructor(private readonly client: MqttClient) {}

  static async connect(url: string, subscriptions: string[] = ['#']): Promise<MqttProbe> {
    const client = await mqtt.connectAsync(url, { clientId: `e2e-probe-${Date.now()}` });
    const probe = new MqttProbe(client);
    client.on('message', (topic, payload, packet) => {
      const text = payload.toString();
      probe.latestByTopic.set(topic, text);
      probe.history.push({ topic, payload: text, retain: packet.retain === true });
    });
    for (const filter of subscriptions) {
      await client.subscribeAsync(filter, { qos: 1 });
    }
    return probe;
  }

  async publish(topic: string, payload: string, retain = false): Promise<void> {
    await this.client.publishAsync(topic, payload, { qos: 1, retain });
  }

  /** Most recent payload seen on a topic, or undefined if it never appeared. */
  latest(topic: string): string | undefined {
    return this.latestByTopic.get(topic);
  }

  latestJson<T>(topic: string): T | undefined {
    const payload = this.latest(topic);
    return payload === undefined || payload === '' ? undefined : (JSON.parse(payload) as T);
  }

  topics(prefix: string): string[] {
    return [...this.latestByTopic.keys()].filter(topic => topic.startsWith(prefix)).sort();
  }

  messages(): readonly ReceivedMessage[] {
    return this.history;
  }

  async stop(): Promise<void> {
    await this.client.endAsync(true);
  }
}
