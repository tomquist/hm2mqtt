# hm2mqtt

Reads Hame energy storage MQTT data, parses it and exposes it as JSON.

## Overview

hm2mqtt is a bridge application that connects Hame energy storage devices (like the B2500 series) to Home Assistant through MQTT. It provides real-time monitoring and control of your energy storage system directly from your Home Assistant dashboard.

## Supported Devices

- B2500 series (e.g. Marstek B2500-D, Greensolar, BluePalm, Plenti SOLAR B2500H, Be Cool BC2500B)
  - First generation without timer support
  - Seconds and third generation with timer support
- Marstek Venus

## Prerequisites

Before you start, you need to configure your energy storage device to send MQTT data to your MQTT broker. There are two options:
1. For the B2500, contact the support to enable MQTT on your device, then configure the MQTT broker in the device settings through the PowerZero or Marstek app.
2. For the Marstek Venus (or for your B2500 if you don't want to do 1., install the [Hame Relay](https://github.com/tomquist/hame-relay), which forwards the data to your MQTT broker.

## Installation

### As a Home Assistant Add-on (Recommended)

The easiest way to use hm2mqtt is as a Home Assistant add-on:

1. Add this repository URL to your Home Assistant add-on store: [![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Ftomquist%2Fhm2mqtt)
2. Install the "hm2mqtt" add-on
3. Configure your devices in the add-on configuration
4. Start the add-on

### Using Docker

#### Pre-built Docker Image

You can run hm2mqtt using the pre-built Docker image from the GitHub package registry:

```bash
docker run -d --name hm2mqtt \
  -e MQTT_BROKER_URL=mqtt://your-broker:1883 \
  -e MQTT_USERNAME=your-username \
  -e MQTT_PASSWORD=your-password \
  -e DEVICE_0=HMA-1:your-device-id \
  ghcr.io/tomquist/hm2mqtt:latest
```

Configure multiple devices by adding more environment variables:

```bash
docker run -d --name hm2mqtt \
  -e MQTT_BROKER_URL=mqtt://your-broker:1883 \
  -e DEVICE_0=HMA-1:device-id-1 \
  -e DEVICE_1=HMB-1:device-id-2 \
  ghcr.io/tomquist/hm2mqtt:latest
```

The Docker image is automatically built and published to the GitHub package registry with each release.

### Manual Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/tomquist/hm2mqtt.git
   cd hm2mqtt
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run build
   ```

4. Create a `.env` file with your configuration:
   ```
   MQTT_BROKER_URL=mqtt://your-broker:1883
   MQTT_USERNAME=your-username
   MQTT_PASSWORD=your-password
   MQTT_POLLING_INTERVAL=60000
   MQTT_RESPONSE_TIMEOUT=30000
   DEVICE_0=HMA-1:your-device-id
   ```

5. Run the application:
   ```bash
   node dist/index.js
   ```

## Configuration

### Environment Variables

| Variable | Description | Default                 |
|----------|-------------|-------------------------|
| `MQTT_BROKER_URL` | MQTT broker URL | `mqtt://localhost:1883` |
| `MQTT_CLIENT_ID` | MQTT client ID | `hm2mqtt-{random}`      |
| `MQTT_USERNAME` | MQTT username | -                       |
| `MQTT_PASSWORD` | MQTT password | -                       |
| `MQTT_POLLING_INTERVAL` | Interval between device polls (ms) | `60000`                 |
| `MQTT_RESPONSE_TIMEOUT` | Timeout for device responses (ms) | `15000`                 |
| `DEVICE_n` | Device configuration in format `{type}:{id}` | -                       |

### Add-on Configuration

```yaml
pollingInterval: 60000  # Interval between device polls in milliseconds
responseTimeout: 30000  # Timeout for device responses in milliseconds
devices:
  - deviceType: "HMA-1"
    deviceId: "your-device-id"
```

The device id is the MAC address of the device in lowercase, without colons.

The device type can be one of the following:
- HMB-X: (e.g. HMB-1, HMB-2, ...) B2500 storage v1
- HMA-X: (e.g. HMA-1, HMA-2, ...) B2500 storage v2
- HMK-X: (e.g. HMK-1, HMK-2, ...) Greensolar storage v3

## Supported Devices

- B2500 series energy storage devices

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Docker

#### Building Your Own Docker Image

If you prefer to build the Docker image yourself:

```bash
docker build -t hm2mqtt .
```

Run the container:

```bash
docker run -e MQTT_BROKER_URL=mqtt://your-broker:1883 -e DEVICE_0=HMA-1:your-device-id hm2mqtt
```

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
