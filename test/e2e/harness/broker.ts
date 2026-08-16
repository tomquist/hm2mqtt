import { AddressInfo, createServer, Server } from 'node:net';
import { Aedes } from 'aedes';

/**
 * The MQTT broker every component in a scenario talks to.
 *
 * hm2mqtt already depends on aedes for its proxy, so a scenario needs no
 * external service. The broker listens on an ephemeral port so parallel runs
 * and a developer's own broker never collide.
 */
export interface Broker {
  readonly port: number;
  readonly url: string;
  /** Topics published by any client, in order — useful when a scenario fails. */
  readonly published: string[];
  /** Topic filters clients subscribed to. Shows which components are listening. */
  readonly subscribed: string[];
  stop(): Promise<void>;
}

export async function startBroker(): Promise<Broker> {
  const aedes = await Aedes.createBroker({});
  const published: string[] = [];
  const subscribed: string[] = [];
  aedes.on('publish', (packet, client) => {
    if (client) {
      published.push(packet.topic);
    }
  });
  aedes.on('subscribe', subscriptions => {
    subscribed.push(...subscriptions.map(subscription => subscription.topic));
  });

  const server: Server = createServer(stream => aedes.handle(stream));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    url: `mqtt://127.0.0.1:${port}`,
    published,
    subscribed,
    async stop() {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await new Promise<void>(resolve => aedes.close(() => resolve()));
    },
  };
}
