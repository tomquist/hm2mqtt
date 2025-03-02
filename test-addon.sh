#!/bin/bash

# Create a simulated environment for testing the addon
echo "Setting up test environment..."

# Create config directory
mkdir -p ./config

# Set environment variables for the application
export MQTT_BROKER_URL="mqtt://localhost:1883"
export MQTT_CLIENT_ID="hm2mqtt-test"
export MQTT_USERNAME="your_username"
export MQTT_PASSWORD="your_password"
export MQTT_POLLING_INTERVAL="60"
export MQTT_RESPONSE_TIMEOUT="30"

# Set device environment variables
# Replace with your actual device information
export DEVICE_0="HMA-1:your-device-id"

echo "Environment variables set:"
echo "MQTT_BROKER_URL: $MQTT_BROKER_URL"
echo "MQTT_CLIENT_ID: $MQTT_CLIENT_ID"
echo "MQTT_POLLING_INTERVAL: $MQTT_POLLING_INTERVAL seconds"
echo "MQTT_RESPONSE_TIMEOUT: $MQTT_RESPONSE_TIMEOUT seconds"
echo "DEVICE_0: $DEVICE_0"

# Check if node and dist/index.js exist
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

if [ ! -f "./dist/index.js" ]; then
    echo "Error: Application file not found: ./dist/index.js"
    echo "Make sure you've built the application with 'npm run build'"
    exit 1
fi

# Start the application
echo "Starting hm2mqtt..."
node dist/index.js
