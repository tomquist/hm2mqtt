# Changelog
## [Next]



## [1.8.1] - 2026-06-20

### Added

- Venus & Jupiter: Add support for the *AI* working mode, selectable via the *Working Mode* entity.
- Venus & Jupiter: Add a *Meter Type* select and *Meter MAC* text entity to configure the external meter (CT001, Shelly Pro 3EM, CT002, CT003, Shelly EM Gen3, Shelly Pro EM50). CT002/CT003 and the Shelly EM Gen3/Pro EM50 require the MAC to be set first; Shelly Pro 3EM does not need a MAC. Both entities are disabled by default.
- B2500 V2: Add a *Meter Type* select and *Meter MAC* text entity to configure the smart meter type (CT001, Shelly Pro 3EM, CT002, CT003, Shelly EM Gen3, Shelly Pro EM50) via the `cd=27` command. Same MAC rules apply as Venus/Jupiter. Both entities are disabled by default.
- Venus: Add a *Backup Power* switch to toggle the backup/EPS ("UPS") function.
- Venus: Add a *Status LED* switch on devices that support it.
- Venus: Add a *Surplus Feed-in* switch on models with PV inputs (Venus A/D), letting you feed excess solar power into the grid.
- Venus: Add a *Bluetooth Advertising* switch to turn Bluetooth discovery on or off (the "Bluetooth lock").
- Venus: Add a *Phase Diagnosis* button to start grid-phase detection, plus a *Phase Diagnosis Status* sensor.
- Venus: Add *Inverter Version* and *MPPT Version* sensors on devices that report them.
- Venus: Add *Network* sensors (IP Address, Gateway, Subnet Mask, DNS Server, CT Connect IP). Only the IP Address is enabled by default.
- Venus: Add per-battery-pack sensors (State of Charge, State, Temperature and Charge/Discharge Power). These require cell-data polling to be enabled and are disabled by default.
- Venus: Add detailed per-pack cell sensors (individual cell voltages, temperature sensors, min/max cell voltage, min/max/ambient/MOSFET temperature, pack voltage and state of charge) for additional battery packs, decoded from the `cd=42,bms_idx=N` response. Each pack is only polled when it is reported as present, so absent packs add no traffic. These require cell-data polling (`POLL_CELL_DATA`) to be enabled and are disabled by default.
- Venus: Add *PV Energy Today* and *PV Energy Total* sensors on models with PV inputs (Venus A/D).

### Changed

- Venus & Jupiter: The *Recharge Mode* entity is now a settable select (Single Phase / Three Phase) instead of a read-only sensor, so the grid recharge mode can be switched from Home Assistant.
- Docs: List Marstek Venus A, Venus D, the HMF-X B2500 v2 device type, and the HMI micro inverters in the supported device lists in the README and the GitHub issue templates.

## [1.8.0] - 2026-06-13

### Added

- Venus: Add aggregate cell-voltage sensors (*Min Cell Voltage*, *Max Cell Voltage*, *Cell Voltage Difference* and *Average Cell Voltage*) computed from the individual cell voltages, ignoring unused cells reported as `0`. These match the equivalent sensors already available on the B2500.
- Jupiter: Add a *Cell Voltage Difference* (drift) sensor per battery, derived from the reported highest/lowest cell voltage. (Jupiter only reports the highest and lowest cell voltage, not individual cells, so a true average cannot be computed.)
- All new sensors are disabled by default.
- Venus: Expose per-string PV input power (PV1–PV4), their connection status and a combined Total PV Power sensor on any Venus model that reports them (e.g. Venus A and Venus D). The entities are advertised purely based on the presence of the corresponding `pv1`–`pv4` values in the payload, independent of the device type
- Venus: Expose additional runtime info sensors: Charging Price (`prc_c`) and Discharge Price (`prc_d`), WiFi Signal Strength (`wif_s`), CT Type (`ct_t`), Phase Type (`phase_t`), Recharge Mode (`dchrg_t`), BMS Version (`bms_v`), Communication Module Version (`fc_v`) and Shelly Port (`shelly_p`)

### Fixed

- Venus D (VNSD): Scale the BMS cell and MOSFET temperatures to °C (they were previously published 10× too high, e.g. 164 instead of 16.4 °C), matching the existing Venus A behavior
- Log messages no longer drop their trailing values (e.g. `Current period 1 settings:` was logged without the actual settings, and error logs were missing the error details). Pino only interpolates extra arguments into `%s`-style placeholders, so console-style log calls silently lost everything after the message (fixes #326)
- B2500: The `Current period X settings:` message logged for every received time-period command is now logged at `debug` level instead of `info`, so automations that frequently update time periods no longer flood the log (fixes #326)

### Changed

- B2500: The *Use Flash Commands* switch now publishes its command as a retained MQTT message. This makes the setting survive a restart of hm2mqtt — on reconnect the broker re-delivers the retained command and the flash-commands mode is re-applied automatically.
- Home Assistant discovery messages are now only published after the device responds to a `cd=1` request at least once, instead of immediately on connect. This prevents devices that never reply from creating unavailable "ghost" entities in Home Assistant.

## [1.7.1] - 2026-06-06

### Added

- Venus: Add *Depth of Discharge* number entity (`discharge-depth` command) so the battery's depth of discharge (`dod`) can be read and configured (30-88%). The entity is only advertised on devices that report the value (fixes #306)
- Venus A (VNSA): Expose per-string PV input power (PV1–PV4), their connection status and a combined Total PV Power sensor (fixes #218)

### Fixed

- Add missing `state_class: measurement` to battery, voltage, current and temperature sensors across the B2500, Venus and Jupiter devices so Home Assistant records long-term statistics and the *State of Charge* sensors can be added to the Energy Dashboard battery configuration introduced in Home Assistant 2026.6 (#311, #312). Thanks @michikrug! (fixes #310)
- Venus: Scale the BMS battery voltage and charge voltage to volts (they were previously published as raw centivolt/decivolt values, e.g. 4328 instead of 43.28 V) (fixes #218)
- Venus A (VNSA): Scale the BMS cell and MOSFET temperatures to °C (they were previously published 10× too high, e.g. 164 instead of 16.4 °C) (fixes #218)

## [1.7.0] - 2026-06-01

### Breaking Changes

- Drop 32-bit ARM (linux/arm/v7) image builds. Home Assistant no longer supports 32-bit ARM, and the CI now builds ARM images natively (arm64).

- Jupiter: The "Cell Voltage X" sensors were removed as they were misleading. The `vol0`..`vol15` fields do not represent the actual cell voltages, but rather the numbers and voltages of the cell with the highest and lowest voltage. New sensors were added to represent these values properly.

- Jupiter: `chargeCurrent` and `dischargeCurrent` sensors were renamed to `chargeCurrentLimit` and `dischargeCurrentLimit` to reflect that they represent the current limits set by BMS.

### Added

- Log the build commit hash at application startup to make it easier to verify which exact source revision a running container/add-on was built from
- Add configurable Home Assistant MQTT discovery topic prefix via `AUTODISCOVERY_TOPIC_PREFIX` (add-on option: `autodiscoveryTopicPrefix`, default: `homeassistant`) (#248)
- Include `connections` field with formatted MAC address in device discovery payloads, allowing Home Assistant to correlate devices by their Bluetooth address
- HMI inverter: Support 4-PV variants such as the HMI-2000 by adding PV3/PV4 voltage, current, power and status sensors. These are only advertised when the device actually reports them, so 2-PV inverters (e.g. MI800) are unaffected. Also expose the Bluetooth signal and WiFi RSSI diagnostics already received from these devices (fixes #301)

### Fixed

- Filter transient corrupt readings in cumulative energy counters: a single backward jump (e.g. a dropped digit from the battery) is now suppressed until a following reading confirms it, so genuine period resets still pass through but glitches no longer poison Home Assistant statistics (fixes #296)
- Venus: Treat out-of-range/sentinel `mcp_w` values (e.g. -1) as unknown for the *Maximum Charging Power* entity to avoid Home Assistant log spam (#240)
- B2500: Fix `Surplus Feed-in` entity missing for `HMJ-*` devices (firmware 108+) (fixes #235, #242)
- B2500: Fix time period 5 control topics not being processed and normalize time format in timer commands (fixes #244)
- Jupiter: Change parsing of cell voltages (`vol0`..`vol15`). They were not what they seemed, as they represent the numbers and the voltages of the cell with the highest and lowest voltage, not the actual cell voltages. See discussion in #253 for more details. The values are now parsed into new sensors and the old sensors ("Cell Voltage X") were removed.
- Jupiter: Fix incorrect parsing of the "Surplus Feed-In" control state. The fix that was included in the previous release (#223) was incorrect and the control would still show as disabled when the device was actively feeding in surplus power.
- Jupiter: Fix "Inverter Temperature" (`i_temp`) parsing by applying the correct divisor.
- Jupiter: Update "Depth of Discharge" control range to 30% - 90% to keep up-to-date with the Marstek app (fixes #260).
- Jupiter: Fix parsing and naming of "BMS ChargeCurrent" (`c_cur`) and "BMS DischargeCurrent" (`d_cur`) fields. They represent current limits set by the BMS, not the actual currents, so they were renamed to `BMS ChargeCurrentLimit` and `BMS DischargeCurrentLimit` and their values are now in Amperes.

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
