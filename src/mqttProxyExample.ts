import { MqttProxy, MqttProxyConfig } from './mqttProxy';
import { DeviceManager } from './deviceManager';

/**
 * Example usage of MQTT Proxy to handle B2500 client ID conflicts
 */
async function main() {
  // Create a mock MQTT config for the device manager
  const mockConfig = {
    brokerUrl: 'mqtt://your-main-broker:1883',
    clientId: 'hm2mqtt-proxy-example',
    devices: [
      { deviceType: 'HMA-1', deviceId: 'example123' },
      { deviceType: 'HMB-1', deviceId: 'example456' },
    ],
  };

  // Mock state update handler
  const mockStateUpdateHandler = (device: any, path: string, state: any) => {
    console.log(`State updated for ${device.deviceType}:${device.deviceId} at ${path}:`, state);
  };

  // Initialize device manager with required parameters
  const deviceManager = new DeviceManager(mockConfig, mockStateUpdateHandler);

  // Option 1: Single proxy with automatic client ID conflict resolution
  const singleProxyConfig: MqttProxyConfig = {
    port: 1884,
    mainBrokerUrl: 'mqtt://your-main-broker:1883',
    mainBrokerUsername: 'your-username',
    mainBrokerPassword: 'your-password',
    proxyClientId: 'hame2mqtt-proxy-single',
    autoResolveClientIdConflicts: true, // This allows multiple B2500s on one proxy
  };

  const singleProxy = new MqttProxy(singleProxyConfig, deviceManager);

  try {
    await singleProxy.start();
    console.log('Single proxy started - B2500 devices can connect to port 1884');
    console.log('Multiple devices with same client ID will be automatically handled');
  } catch (error) {
    console.error('Failed to start single proxy:', error);
  }

  // Option 2: Multiple proxies for guaranteed isolation
  const proxyConfigs: MqttProxyConfig[] = [
    {
      port: 1885,
      mainBrokerUrl: 'mqtt://your-main-broker:1883',
      mainBrokerUsername: 'your-username',
      mainBrokerPassword: 'your-password',
      proxyClientId: 'hame2mqtt-proxy-device1',
      autoResolveClientIdConflicts: false, // Not needed with one device per proxy
    },
    {
      port: 1886,
      mainBrokerUrl: 'mqtt://your-main-broker:1883',
      mainBrokerUsername: 'your-username',
      mainBrokerPassword: 'your-password',
      proxyClientId: 'hame2mqtt-proxy-device2',
      autoResolveClientIdConflicts: false,
    },
    {
      port: 1887,
      mainBrokerUrl: 'mqtt://your-main-broker:1883',
      mainBrokerUsername: 'your-username',
      mainBrokerPassword: 'your-password',
      proxyClientId: 'hame2mqtt-proxy-device3',
      autoResolveClientIdConflicts: false,
    },
  ];

  const multipleProxies: MqttProxy[] = [];

  for (const config of proxyConfigs) {
    const proxy = new MqttProxy(config, deviceManager);
    try {
      await proxy.start();
      multipleProxies.push(proxy);
      console.log(`Proxy started on port ${config.port} for individual B2500 device`);
    } catch (error) {
      console.error(`Failed to start proxy on port ${config.port}:`, error);
    }
  }

  // Monitor proxy status
  setInterval(() => {
    console.log('\n=== Proxy Status ===');
    console.log(
      `Single Proxy (port 1884): ${singleProxy.getConnectedClientCount()} clients connected`,
    );

    multipleProxies.forEach((proxy, index) => {
      const port = proxyConfigs[index].port;
      console.log(
        `Proxy ${index + 1} (port ${port}): ${proxy.getConnectedClientCount()} clients connected`,
      );
    });
  }, 30000); // Check every 30 seconds

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down proxies...');

    await singleProxy.stop();
    console.log('Single proxy stopped');

    for (let i = 0; i < multipleProxies.length; i++) {
      await multipleProxies[i].stop();
      console.log(`Proxy ${i + 1} stopped`);
    }

    process.exit(0);
  });
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main as runMqttProxyExample };
