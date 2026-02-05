# Changelog
## [Next]

### Breaking Changes

- Drop 32-bit ARM (linux/arm/v7) image builds. Home Assistant no longer supports 32-bit ARM, and the CI now builds ARM images natively (arm64).

### Fixed

- Venus/Jupiter: Fix time period end time transformation between device end-of-day marker (24:00) and Home Assistant time entities (23:59) when sending commands (#243)
- B2500: Fix `Surplus Feed-in` entity missing for `HMJ-*` devices (firmware 108+) (fixes #235, #242)
- B2500: Fix time period 5 control topics not being processed and normalize time format in timer commands (fixes #244)

## [1.6.0] - 2026-01-25

- Fix Home Assistant warning when surplus feed-in is unavailable on older HM firmware versions
- Only encrypt Marstek topic device IDs for HMA, HMF, HMK, and HMJ devices (#231)
- Jupiter: Add Depth of Discharge control (needs firmware 140+). It is a reverse of the battery charge, so setting it to 75% means that the battery will only feed-in power when charged above 25%.
- Jupiter: Add BMS, MPPT, and inverter version sensors. Change friendly name of _Device Version_ sensor to _EMS Version_, as reported by the Marstek app during firmware upgrade.
- Jupiter: The firmware reported to Home Assistant is now composed of four values: `<EMS version>.<BMS version>.<MPPT version>.<INV version>`.
- Jupiter: Add inverter metrics: temperature, error and warning codes, as well as grid voltage, current, power, power factor, and frequency.
- Jupiter: Fix parsing of negative temperatures.
- Jupiter: Fix Surplus Feed-In toggle not applying.
- Jupiter: Fix Surplus Feed-In state when device is actively feeding in surplus.
- Jupiter: Fix parsing of BMS Charge Voltage field.


## [1.5.3] - 2026-01-01

- Venus: Add support for Venus A (VNSA) and Venus D (VNSD) device types
- Fix loop when all configured devices have invalid/unknown device types.

## [1.5.2] - 2025-10-03

### Fixed

- Venus: Fix race condition where local API components were incorrectly disabled on startup. Components with conditional enablement now defer their decision until required device data is available (#189)

## [1.5.1] - 2025-10-03

- Venus: Add support for Venus E 3.0 device type (VNSE3-0) (#182)
- Venus: Add local API enable and port controls for firmware 153 and above (#157)
- Home Assistant add-on: make application log level configurable via `log_level` option (#161)


## [1.5.0] - 2025-08-09

- Fix time synchronization to use local timezone offset (#102)
- Venus: Allow setting maximum charging power as low as 0W (#117)
- Add support for CT002 smart meter device type HME (#116)
- Add support for MI800 micro inverter device type HMI with sensors and control commands (#118, #123)
- Add 24-hour format for timings and fix "mAh" unit availability for energy class (#121)
- Switch logging system to pino for better performance and structured logging (#90)
- Sensors can now be conditionally disabled using a state-based function (#124, #148)
- Fix tests and improve test infrastructure (#105)


## [1.4.3] - 2025-06-22

- Jupiter: Add MPPT sensors for PV voltage, current, and power (#82)
- Jupiter: Add MPPT temperature, error, and warning sensors (#82)
- Jupiter: Fix BMS voltage, current, and temperature sensors by adding proper divisors (#82)
- Jupiter: Fix WiFi signal strength sensor (reverse sign and add dBm unit) (#82)
- Use `total_increasing` state class for Jupiter and Venus period energy sensors instead of `total` (#86, fixes #84)
- Jupiter: Add missing device and state classes to various sensors (#82)

## [1.4.2] - 2025-06-20

- Add configurable MQTT topic prefix in Home Assistant addon configuration (#78, fixes #72)
- Correct state class from incorrect type to proper monetary sensor state class (#81, fixes #80)
- Fix global availability topic to use correct path `hm2mqtt/availability` (#74)  

## [1.4.1] - 2025-06-07

- Add support for Jupiter C

## [1.4.0] - 2025-06-07

### Added

- Add support for Marstek Jupiter and Jupiter Plus (JPLS-8H) devices (#38)

### Fixed

- Venus: Fix version set and discharge power commands (#67, related to #60)
- Fix time period weekday bug when changing power settings via MQTT - weekdays would change unexpectedly when modifying power, start/end times, or enabled status (#65, fixes #61)
- MQTT proxy: Prevent all client ID conflicts (not just 'mst_' prefixed ones) to resolve connection issues with multiple devices (#64)

### Changed

- Add `state_class: 'measurement'` to power sensors for Home Assistant statistics and Energy Dashboard support (#66, fixes #62)
- MQTT proxy: Improved conflict resolution with retry logic and proper cleanup when clients disconnect (#64)

## [1.3.4] - 2025-05-27

- Add optional MQTT proxy server to workaround a bug in the B2500 firmware 226.5 or 108.7 which disconnects other devices when connecting multiple devices simultaneously. See [this issue](https://github.com/tomquist/hm2mqtt/issues/41) and read the [README](https://github.com/tomquist/hm2mqtt) for more information.
- Add more robust timeout handling: New setting `allowedConsecutiveTimeouts` to define the number of allowed timeouts before switching the device to offline.

## [1.3.3] - 2025-05-25

- Fix: Prevent overlapping device requests and ensure robust polling. Only send new requests if there is no outstanding response timeout for the device, set the response timeout before sending requests, and use a consistent key for lastRequestTime. This resolves issues with multi-device polling, especially for B2500 devices. (Closes #41)

## [1.3.2] - 2025-05-17

- B2500: Added Surplus Feed-in switch. This allows toggling surplus PV feed-in to the home grid when the battery is nearly full, via MQTT and Home Assistant.
- B2500: Fix unit and device class of Extra 2 battery SoC

## [1.3.1]

- Venus:
  - Fix working mode command
  - Add max charging/discharging power command
  - Add version command
  - Turn grid-type into read-only sensor
- B2500: Support setting output power to a value below 80W

## [1.3.0]

### Breaking Change

- Previously hm2mqtt published its own data to the `hame_energy/{deviceType}/` or `marstek_energy/{deviceType}` topic. From 1.3.0 onwards the topic changed to `hm2mqtt/{deviceType}`

### Added

- **B2500**: Better support for devices with firmware >=226 (for HMA, HMF or HMK) or >=108 (for HMJ):
  - Automatically calculate new encrypted device ID: No need to wait for 20 minutes to get the encrypted id. Instead, just enter the MAC address.
  - Remove the need to manually enter the topicPrefix
- **Venus**: Add BMS information sensors including:
  - Cell voltages (up to 16 cells)
  - Cell temperatures (up to 4 sensors)
  - BMS version, SOC, SOH, capacity
  - Battery voltage, current, temperature
  - Charge voltage and full charge capacity
  - Cell cycle count
  - Error and warning states
  - Total runtime and energy throughput
  - MOSFET temperature

## [1.2.0]

### Added

- Add support for configurable MQTT topic prefix per device (defaults to 'hame_energy') to support B2500 devices with firmware version >v226

## [1.1.2]

- B2500: Add support for devices of the HMJ series
- B2500: Fix incorrect battery capacity sensor unit for host and extra battery

## [1.1.1]

### Added

- Add sensors for when the data has last been updated

## [1.1.0]

### Added

- B2500: Add cell voltage sensors
- B2500: Add overall battery voltage and current sensors
- B2500: Add calibration information sensors
- Venus: Add wifi name sensor

### Fixed

- Venus Working Status now uses the correct mapping (thanks jbe)

## [1.0.7]

### Added

- B2500: Add total input and output power sensors

### Fixed

- Venus battery capacity

## [1.0.6]

### Fixed

- Always use flash-command for discharge mode on B2500 v1 device since the non-flash command is not supported

### Changed

- Refactored advertisement registration

## [1.0.5]

### Added

- Support changing output threshold for B2500 v1 devices
- Allow v2 timer output values below 80 

## [1.0.4]

### Fixed

- Venus timer config

## [1.0.3]

### Fixed

- Fix unit of measurement for number sensors

## [1.0.2]

### Fixed

- Fix timer output value range

## [1.0.1]

### Added

- Added support for Venus device type (HMG)
- Added support for HMF series of B2500
- Set state class for daily energy sensor to `total_increasing`

### Fixed

- Multiple devices in Addon config

## [1.0.0] Initial Release

### Added

- Initial release with support for HMA, HMB and HMK series of B2500
