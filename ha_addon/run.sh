#!/usr/bin/with-contenv bashio

# Enable error handling
set -e

# Function to manually parse options.json
parse_options_json() {
    local file="$1"
    local key="$2"
    local default="$3"
    
    if [ -f "$file" ]; then
        local value
        value=$(jq -r ".$key // \"$default\"" "$file" 2>/dev/null)
        if [ "$value" != "null" ] && [ -n "$value" ]; then
            echo "$value"
            return 0
        fi
    fi
    
    echo "$default"
    return 1
}

# Function to get MQTT URI
get_mqtt_uri() {
    # First check if mqtt_uri is provided in the config
    if bashio::config.has_value 'mqtt_uri'; then
        bashio::log.info "Using custom MQTT broker URL from configuration"
        bashio::config 'mqtt_uri'
    # Fall back to Home Assistant's internal MQTT broker if available
    elif bashio::services.available "mqtt"; then
        bashio::log.info "Using Home Assistant's internal MQTT broker"
        local ssl=$(bashio::services mqtt "ssl")
        local protocol="mqtt"
        if [[ "$ssl" == "true" ]]; then
            protocol="mqtts"
        fi
        local host=$(bashio::services mqtt "host")
        local port=$(bashio::services mqtt "port")
        local username=$(bashio::services mqtt "username")
        local password=$(bashio::services mqtt "password")

        local uri="${protocol}://"
        if [[ -n "$username" && -n "$password" ]]; then
            uri+="${username}:${password}@"
        elif [[ -n "$username" ]]; then
            uri+="${username}@"
        fi
        uri+="${host}:${port}"
        echo "$uri"
    else
        bashio::log.error "No MQTT URI provided in config and MQTT service is not available."
        exit 1
    fi
}

# Enable debug logging by default for now to help diagnose issues
bashio::log.level "debug"
bashio::log.debug "Debug logging enabled by default"

# Try to check if debug is enabled in config, but don't fail if it errors
if bashio::config.true 'debug' 2>/dev/null; then
    bashio::log.debug "Debug logging confirmed via configuration"
    
    # Try to print configuration but don't fail if it errors
    bashio::log.debug "Attempting to print full addon configuration:"
    (bashio::config 2>/dev/null | jq '.' 2>/dev/null) || bashio::log.warning "Failed to print configuration"
fi

# Create config directory
mkdir -p /app/config

# Get MQTT URI
BROKER_URL=$(get_mqtt_uri)
bashio::log.info "MQTT Broker URL: ${BROKER_URL}"

# Set environment variables for the application
export MQTT_BROKER_URL="${BROKER_URL}"
export MQTT_CLIENT_ID="hm2mqtt-ha-addon"

# Try to get config values with proper default handling
export MQTT_POLLING_INTERVAL=$(bashio::config 'pollingInterval' "60")
export MQTT_RESPONSE_TIMEOUT=$(bashio::config 'responseTimeout' "30")
export POLL_CELL_DATA=$(bashio::config 'enableCellData' "false")
export POLL_CALIBRATION_DATA=$(bashio::config 'enableCalibrationData' "false")
export POLL_EXTRA_BATTERY_DATA=$(bashio::config 'enableExtraBatteryData' "false")
export DEBUG=$(bashio::config 'debug' "false")

bashio::log.info "MQTT polling interval: ${MQTT_POLLING_INTERVAL} seconds"
bashio::log.info "MQTT response timeout: ${MQTT_RESPONSE_TIMEOUT} seconds"

# Process devices using Bashio functions properly
bashio::log.info "Configuring devices..."
DEVICE_COUNT=0

# Clean approach to reading the devices array
if bashio::config.exists 'devices'; then
    # Get the actual count of elements directly from the config
    if DEVICE_COUNT=$(bashio::config 'devices|length'); then
        bashio::log.info "Found ${DEVICE_COUNT} devices in configuration"

        # Process each device in the array
        for i in $(seq 0 $((DEVICE_COUNT - 1))); do
            # Use Bashio to access array elements with proper error handling
            if bashio::config.exists "devices[${i}].deviceType" && bashio::config.exists "devices[${i}].deviceId"; then
                DEVICE_TYPE=$(bashio::config "devices[${i}].deviceType")
                DEVICE_ID=$(bashio::config "devices[${i}].deviceId")

                # Skip if either value is empty
                if [ -n "$DEVICE_TYPE" ] && [ -n "$DEVICE_ID" ]; then
                    export "DEVICE_${i}=${DEVICE_TYPE}:${DEVICE_ID}"
                    bashio::log.info "Configured device $((i + 1)): ${DEVICE_TYPE}:${DEVICE_ID}"
                else
                    bashio::log.warning "Device ${i} has empty deviceType or deviceId"
                fi
            else
                bashio::log.warning "Device ${i} is missing required parameters (deviceType or deviceId)"
            fi
        done
    else
        bashio::log.error "Failed to determine the number of devices in the configuration"
        DEVICE_COUNT=0
    fi
else
    bashio::log.error "No 'devices' configuration found. Please check your configuration."

    # Show example configuration
    bashio::log.info "Example configuration:"
    bashio::log.info '{
  "devices": [
    {
      "deviceType": "b2500v1",
      "deviceId": "12345"
    }
  ],
  "pollingInterval": 60,
  "responseTimeout": 30,
  "debug": true
}'

    # Add a test device if debug is enabled
    if bashio::config.true 'debug' 2>/dev/null; then
        bashio::log.warning "Debug mode enabled - adding a test device for debugging purposes"
        export "DEVICE_0=b2500v1:12345"
        DEVICE_COUNT=1
        bashio::log.info "Added test device: b2500v1:12345"
    else
        exit 1
    fi
fi

# Update total count based on actual processed devices
DEVICE_COUNT=$(env | grep -c "^DEVICE_" || echo 0)
bashio::log.info "Total configured devices: ${DEVICE_COUNT}"

# Debug: show all device environment variables
bashio::log.debug "Device environment variables:"
env | grep "^DEVICE_" | sort

# In debug mode, show all environment variables (excluding passwords)
if bashio::config.true 'debug'; then
    bashio::log.debug "All environment variables (excluding passwords):"
    env | grep -v -i "password" | sort
fi

if [ "$DEVICE_COUNT" -eq 0 ]; then
    bashio::log.error "No devices configured! Please check your addon configuration."

    # Add a manual device for testing if debug is enabled
    if bashio::config.true 'debug' 2>/dev/null; then
        bashio::log.warning "Debug mode enabled - adding a test device for debugging purposes"
        export "DEVICE_0=b2500v1:12345"
        DEVICE_COUNT=1
        bashio::log.info "Added test device: b2500v1:12345"
    else
        exit 1
    fi
fi

# Start the application
bashio::log.info "Starting hm2mqtt..."
cd /app && node dist/index.js || bashio::log.error "Application crashed with exit code $?"
