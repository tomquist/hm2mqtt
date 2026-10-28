#!/usr/bin/with-contenv bashio

# Mock bashio functions
bashio::services.available() {
    return 0
}

bashio::services() {
    echo "mqtt"
}

# Newer bashio reads the options through bashio::app.config, older bashio
# through bashio::addon.config
bashio::app.config() {
    cat /data/options.json
}

bashio::addon.config() {
    cat /data/options.json
}

# Set test mode to prevent starting the application
export TEST_MODE=true

# Source the original run script
source /run.sh 