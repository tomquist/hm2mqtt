# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0]

### Breaking Change

- Previously hm2mqtt published its own data to the `hame_energy/{deviceType}/` or `marstek_energy/{deviceType}` topic. From 1.3.0 onwards the topic changed to `hm2mqtt/{deviceType}`

### Added

- **B2500**: Better support for devices with firmware >=226 (for HMA, HMF or HMK) or >=108 (for HMJ):
  - Automatically calculate new encrypted device ID: No need to wait for 20 minutes to get the encrypted id. Instead, just enter the MAC address.
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
