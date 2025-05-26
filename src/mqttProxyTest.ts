#!/usr/bin/env node

/**
 * Simple test script for MQTT Proxy functionality
 * This script tests the proxy by connecting mock clients and verifying message forwarding
 */

import * as mqtt from 'mqtt';
import { MqttProxy, MqttProxyConfig } from './mqttProxy';
import { DeviceManager } from './deviceManager';

async function testMqttProxy() {
  console.log('🧪 Starting MQTT Proxy Test...\n');

  // Create a mock device manager
  const mockConfig = {
    brokerUrl: 'mqtt://localhost:1883',
    clientId: 'test-main-client',
    devices: [{ deviceType: 'HMA-1', deviceId: 'test123' }],
  };

  const mockStateHandler = (device: any, path: string, state: any) => {
    console.log(`📊 State update: ${device.deviceType}:${device.deviceId} -> ${path}`);
  };

  const deviceManager = new DeviceManager(mockConfig, mockStateHandler);

  // Configure the proxy
  const proxyConfig: MqttProxyConfig = {
    port: 1885, // Use a different port for testing
    mainBrokerUrl: 'mqtt://localhost:1883',
    proxyClientId: 'test-proxy-client',
    autoResolveClientIdConflicts: true,
  };

  console.log('🚀 Starting MQTT Proxy on port 1885...');
  const proxy = new MqttProxy(proxyConfig, deviceManager);

  try {
    await proxy.start();
    console.log('✅ Proxy started successfully!\n');

    // Test 1: Connect multiple clients with same ID
    console.log('🔧 Test 1: Connecting multiple clients with same ID...');

    const client1 = mqtt.connect('mqtt://localhost:1885', { clientId: 'mst_' });
    const client2 = mqtt.connect('mqtt://localhost:1885', { clientId: 'mst_' });
    const client3 = mqtt.connect('mqtt://localhost:1885', { clientId: 'mst_' });

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`📈 Connected clients: ${proxy.getConnectedClientCount()}`);
    console.log(`📋 Client IDs: ${proxy.getConnectedClients().join(', ')}`);

    if (proxy.getConnectedClientCount() === 3) {
      console.log('✅ Test 1 PASSED: All clients connected with unique IDs\n');
    } else {
      console.log('❌ Test 1 FAILED: Not all clients connected\n');
    }

    // Test 2: Message forwarding
    console.log('🔧 Test 2: Testing message forwarding...');

    let messagesReceived = 0;
    client1.on('message', (topic, message) => {
      console.log(`📨 Client1 received: ${topic} -> ${message.toString()}`);
      messagesReceived++;
    });

    client1.subscribe('test/topic');

    // Simulate a message from the main broker (this would normally come from the actual broker)
    setTimeout(() => {
      console.log('📤 Simulating message from main broker...');
      // In a real scenario, this would come from the main MQTT broker
      // For testing, we'll publish directly to the proxy
      client2.publish('test/topic', 'Hello from proxy test!');
    }, 1000);

    await new Promise(resolve => setTimeout(resolve, 3000));

    if (messagesReceived > 0) {
      console.log('✅ Test 2 PASSED: Message forwarding works\n');
    } else {
      console.log('❌ Test 2 FAILED: No messages received\n');
    }

    // Cleanup
    console.log('🧹 Cleaning up...');
    client1.end();
    client2.end();
    client3.end();

    await proxy.stop();
    console.log('✅ Proxy stopped successfully');
    console.log('🎉 Test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testMqttProxy().catch(console.error);
}

export { testMqttProxy };
