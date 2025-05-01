#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure we're in the correct directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.." || exit 1

echo "Building test Docker image..."
# Build from the root directory to include all necessary files
docker build -t hm2mqtt-test -f ha_addon/Dockerfile .

# Create temporary directory for test configs
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

# Function to create a test config file
create_test_config() {
    local config_file="$1"
    local config_content="$2"
    echo "$config_content" > "$config_file"
}

# Function to run test and check environment variables
run_test() {
    local test_name=$1
    local config_file="$TEST_DIR/config_$RANDOM.json"
    local config_content=$2
    local expected_vars=$3

    echo -e "\nRunning test: $test_name"
    
    # Create config file
    create_test_config "$config_file" "$config_content"
    
    # Run container with the test configuration and mock run script
    local output
    output=$(docker run --rm \
        -v "$config_file:/data/options.json" \
        -v "$SCRIPT_DIR/test_run.sh:/test_run.sh" \
        hm2mqtt-test \
        bash -c "chmod +x /test_run.sh && /test_run.sh" 2>&1)
    
    # Check each expected variable
    local all_passed=true
    for var in $expected_vars; do
        if ! echo "$output" | grep -F -q "$var"; then
            echo -e "${RED}✗${NC} Missing $var"
            all_passed=false
        fi
    done
    
    if [ "$all_passed" = true ]; then
        echo -e "${GREEN}✓${NC} Test passed"
    else
        echo -e "${RED}Test failed!${NC}"
        exit 1
    fi
}

# Test 1: Basic configuration with firmware < 226
run_test "Basic configuration (firmware < 226)" \
    '{
        "mqtt_uri": "mqtt://test:1883",
        "devices": [
            {
                "deviceType": "HMA-1",
                "deviceId": "001a2b3c4d5e"
            }
        ]
    }' \
    "MQTT_BROKER_URL=mqtt://test:1883
DEVICE_0=HMA-1:001a2b3c4d5e"

# Test 2: Configuration with firmware >= 226
run_test "Configuration with firmware >= 226" \
    '{
        "mqtt_uri": "mqtt://test:1883",
        "devices": [
            {
                "deviceType": "HMA-1",
                "deviceId": "1234567890abcdef1234567890abcdef",
                "topicPrefix": "marstek_energy"
            }
        ]
    }' \
    "MQTT_BROKER_URL=mqtt://test:1883
DEVICE_0=HMA-1:1234567890abcdef1234567890abcdef:marstek_energy"

# Test 3: Multiple devices with different firmware versions
run_test "Multiple devices with different firmware versions" \
    '{
        "mqtt_uri": "mqtt://test:1883",
        "devices": [
            {
                "deviceType": "HMA-1",
                "deviceId": "001a2b3c4d5e"
            },
            {
                "deviceType": "HMA-1",
                "deviceId": "1234567890abcdef1234567890abcdef",
                "topicPrefix": "marstek_energy"
            }
        ]
    }' \
    "MQTT_BROKER_URL=mqtt://test:1883
DEVICE_0=HMA-1:001a2b3c4d5e
DEVICE_1=HMA-1:1234567890abcdef1234567890abcdef:marstek_energy"

# Test 4: Additional configuration options
run_test "Additional configuration options" \
    '{
        "mqtt_uri": "mqtt://test:1883",
        "pollingInterval": 30,
        "responseTimeout": 15,
        "enableCellData": true,
        "enableCalibrationData": true,
        "enableExtraBatteryData": true,
        "devices": [
            {
                "deviceType": "HMA-1",
                "deviceId": "001a2b3c4d5e"
            }
        ]
    }' \
    "MQTT_BROKER_URL=mqtt://test:1883
MQTT_POLLING_INTERVAL=30
MQTT_RESPONSE_TIMEOUT=15
POLL_CELL_DATA=true
POLL_EXTRA_BATTERY_DATA=true
POLL_CALIBRATION_DATA=true
DEVICE_0=HMA-1:001a2b3c4d5e"

echo -e "\n${GREEN}All tests passed!${NC}" 