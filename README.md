# hm2mqtt

Reads Hame energy storage MQTT data, parses it and exposes it as JSON.

## Overview

hm2mqtt is a bridge application that connects Hame energy storage devices (like the B2500 series) to Home Assistant (or other home automation systems) through MQTT. It provides real-time monitoring and control of your energy storage system directly from your Home Assistant dashboard.

## Supported Devices

- B2500 series (e.g. Marstek B2500-D, Greensolar, BluePalm, Plenti SOLAR B2500H, Be Cool BC2500B)
  - First generation without timer support
  - Second and third generation with timer support
- Marstek Venus
- Marstek Jupiter

## Prerequisites

- Before you start, you need a local MQTT broker. You can install one as a Home Assistant Addon: https://www.home-assistant.io/integrations/mqtt/#setting-up-a-broker
- After setting up an MQTT broker, configure your energy storage device to send MQTT data to your MQTT broker:
  1. For the **B2500**, you have two options:
     1. Contact the support and ask them to enable MQTT for your device, then configure the MQTT broker in the device settings through the PowerZero or Marstek app.
     2. With your an Android Smartphone or with a Bluetooth enabled PC use [this tool](https://tomquist.github.io/hame-relay/b2500.html) to configure the MQTT broker directly via Bluetooth. **Make sure you write down the MAC address that is displayed in this tool or in the Marstek app! You will need it later on and the WIFI MAC address of the battery is the wrong one.**
   
     **Warning:** Enabling MQTT on the device will disable the cloud connection. You will not be able to use the PowerZero or Marstek app to monitor or control your device anymore. You can re-enable the cloud connection by installing [Hame Relay](https://github.com/tomquist/hame-relay#mode-1-storage-configured-with-local-broker-inverse_forwarding-false) in Mode 1.
  2. The **Marstek Venus** doesn't officially support MQTT. However, you can install the [Hame Relay](https://github.com/tomquist/hame-relay) in [Mode 2](https://github.com/tomquist/hame-relay#mode-2-storage-configured-with-hame-broker-inverse_forwarding-true) to forward the Cloud MQTT data to your local MQTT broker.

## Installation

### As a Home Assistant Add-on (Recommended)

The easiest way to use hm2mqtt is as a Home Assistant add-on:

1. Add this repository URL to your Home Assistant add-on store:
   
   [![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Ftomquist%2Fhm2mqtt)
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
  -e POLL_CELL_DATA=false \
  -e POLL_EXTRA_BATTERY_DATA=false \
  -e POLL_CALIBRATION_DATA=false \
  -e DEVICE_0=HMA-1:your-device-mac \
  ghcr.io/tomquist/hm2mqtt:latest
```
**your-device-mac** has to be formatted like this: 001a2b3c4d5e  (no colon and all lowercase). It's the one mentiond before!

Configure multiple devices by adding more environment variables:

```bash
# Example with devices using different firmware versions:
docker run -d --name hm2mqtt \
  -e MQTT_BROKER_URL=mqtt://your-broker:1883 \
  -e DEVICE_0=HMA-1:001a2b3c4d5e \
  -e DEVICE_1=HMA-1:001a2b3c4d5e \
  ghcr.io/tomquist/hm2mqtt:latest
```

The Docker image is automatically built and published to the GitHub package registry with each release.

### Using Docker Compose

A docker-compose example for a Marstek B2500-D V2:

```yaml
version: '3.7'

services:
  hm2mqtt:
    container_name: hm2mqtt
    image: ghcr.io/tomquist/hm2mqtt:latest
    restart: unless-stopped
    environment:
      - MQTT_BROKER_URL=mqtt://x.x.x.x:1883
      - MQTT_USERNAME=''
      - MQTT_PASSWORD=''
      - POLL_CELL_DATA=true
      - POLL_EXTRA_BATTERY_DATA=true
      - POLL_CALIBRATION_DATA=true
      - DEVICE_0=HMA-1:0019aa0d4dcb  # 12-character MAC address
```

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
   POLL_CELL_DATA=false
   POLL_EXTRA_BATTERY_DATA=false
   POLL_CALIBRATION_DATA=false
   DEVICE_0=HMA-1:001a2b3c4d5e  # 12-character MAC address
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
| `POLL_CELL_DATA` | Enable cell voltage (only available on B2500 devices) | false |
| `POLL_EXTRA_BATTERY_DATA` | Enable extra battery data reporting (only available on B2500 devices) | false |
| `POLL_CALIBRATION_DATA` | Enable calibration data reporting (only available on B2500 devices) | false |
| `DEVICE_n` | Device configuration in format `{type}:{mac}` | -                       |
| `MQTT_ALLOWED_CONSECUTIVE_TIMEOUTS` | Number of consecutive timeouts before a device is marked offline | `3` |

### Add-on Configuration

```yaml
pollingInterval: 60000  # Interval between device polls in milliseconds
responseTimeout: 30000  # Timeout for device responses in milliseconds
allowedConsecutiveTimeouts: 3  # Number of consecutive timeouts before a device is marked offline
devices:
  - deviceType: "HMA-1"
    deviceId: "your-device-mac"
```

The device id is the MAC address of the device in lowercase, without colons.

**Important Note for B2500 Devices:**
- Use the MAC address shown in the Marstek/PowerZero app's device list or in the Bluetooth configuration tool
- **Important:** Do not use the WiFi interface MAC address - it must be the one shown in the app or Bluetooth tool

The device type can be one of the following:
- HMB-X: (e.g. HMB-1, HMB-2, ...) B2500 storage v1
- HMA-X: (e.g. HMA-1, HMA-2, ...) B2500 storage v2
- HMK-X: (e.g. HMK-1, HMK-2, ...) Greensolar storage v3
- HMG-X: (e.g. HMG-50) Marstek Venus

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
docker run -e MQTT_BROKER_URL=mqtt://your-broker:1883 -e DEVICE_0=HMA-1:your-device-mac hm2mqtt
```

## MQTT Topics

### Device Data Topic

Your device data is published to the following MQTT topic:

```
hm2mqtt/{device_type}/device/{device_mac}/data
```

This topic contains the current state of your device in JSON format, including battery status, power flow data, and device settings.

### Control Topics

You can control your device by publishing messages to specific MQTT topics. The base topic pattern for commands is:

```
hm2mqtt/{device_type}/control/{device_mac}/{command}
```

### Common Commands (All Devices)
- `refresh`: Refreshes the device data
- `factory-reset`: Resets the device to factory settings

### B2500 Commands (All Versions)
- `discharge-depth`: Controls battery discharge depth (0-100%)
- `restart`: Restarts the device
- `use-flash-commands`: Toggles flash command mode

### B2500 V1 Specific Commands
- `charging-mode`: Sets charging mode (`pv2PassThrough` or `chargeThenDischarge`)
- `battery-threshold`: Sets battery output threshold (0-800W)
- `output1`: Enables/disables output port 1 (`on` or `off`)
- `output2`: Enables/disables output port 2 (`on` or `off`)

### B2500 V2/V3 Specific Commands
- `charging-mode`: Sets charging mode (`chargeDischargeSimultaneously` or `chargeThenDischarge`)
- `adaptive-mode`: Toggles adaptive mode (`on` or `off`)
- `time-period/[1-5]/enabled`: Enables/disables specific time period (`on` or `off`)
- `time-period/[1-5]/start-time`: Sets start time for period (HH:MM format)
- `time-period/[1-5]/end-time`: Sets end time for period (HH:MM format)
- `time-period/[1-5]/output-value`: Sets output power for period (0-800W)
- `connected-phase`: Sets connected phase for CT meter (`1`, `2`, or `3`)
- `time-zone`: Sets time zone (UTC offset in hours)
- `sync-time`: Synchronizes device time with server
- `surplus-feed-in`: Toggles Surplus Feed-in mode (`on` or `off`). When enabled, surplus PV power is fed into the home grid when the battery is nearly full.

### Venus Device Commands
- `working-mode`: Sets working mode (`automatic`, `manual`, or `trading`)
- `auto-switch-working-mode`: Toggles automatic mode switching (`on` or `off`)
- `time-period/[0-9]/enabled`: Enables/disables time period (`on` or `off`)
- `time-period/[0-9]/start-time`: Sets start time for period (HH:MM format)
- `time-period/[0-9]/end-time`: Sets end time for period (HH:MM format)
- `time-period/[0-9]/power`: Sets power value for period (-2500 to 2500W)
- `time-period/[0-9]/weekday`: Sets days of week for period (0-6, where 0 is Sunday)
- `get-ct-power`: Gets current transformer power readings
- `transaction-mode`: Sets transaction mode parameters

### Jupiter Device Commands
- `refresh`: Refreshes the device data
- `factory-reset`: Resets the device to factory settings
- `sync-time`: Synchronizes device time with server
- `working-mode`: Sets working mode (`automatic` or `manual`)
- `time-period/[0-4]/enabled`: Enables/disables time period (`on` or `off`)
- `time-period/[0-4]/start-time`: Sets start time for period (HH:MM format)
- `time-period/[0-4]/end-time`: Sets end time for period (HH:MM format)
- `time-period/[0-4]/power`: Sets power value for period (W)
- `time-period/[0-4]/weekday`: Sets days of week for period (0-6, where 0 is Sunday)

> **Note:** The Jupiter E does not support trading mode or auto-switch working mode.

### Examples

```
# Refresh data from a B2500 device
mosquitto_pub -t "hm2mqtt/HMA-1/control/abcdef123456/refresh" -m ""

# Set charging mode for B2500
mosquitto_pub -t "hm2mqtt/HMA-1/control/abcdef123456/charging-mode" -m "chargeThenDischarge"

# Enable Surplus Feed-in on B2500 V2
mosquitto_pub -t "hm2mqtt/HMA-1/control/abcdef123456/surplus-feed-in" -m "on"

# Disable Surplus Feed-in on B2500 V2
mosquitto_pub -t "hm2mqtt/HMA-1/control/abcdef123456/surplus-feed-in" -m "off"

# Enable timer period 1 on Venus device
mosquitto_pub -t "hm2mqtt/HMG-50/control/abcdef123456/time-period/1/enabled" -m "on"
```

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
