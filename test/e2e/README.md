# End-to-end tests

These scenarios run the shipped hm2mqtt build against a real Home Assistant and
a real MQTT broker, with simulated Marstek devices answering its polls. They
exist because the bugs that hurt users most are not wrong values — they are
entities that look correct in the code and make Home Assistant log an error on
every single message.

## Running them

```bash
npm run e2e:setup   # once: installs Home Assistant into test/e2e/.venv-ha
npm run test:e2e    # builds, then runs the scenarios
```

`npm test` does not run them and does not need Python. Without the environment
the scenarios skip with a message instead of failing.

## How a scenario is put together

| Piece                      | What it is                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `harness/broker.ts`        | An aedes broker on an ephemeral port. hm2mqtt already depends on aedes, so no external service is needed.            |
| `harness/device.ts`        | A Marstek device: answers `cd=<n>` polls with a canned reading from `test/fixtures/devices.ts`.                      |
| `harness/emulator.ts`      | A Marstek device running its real firmware in marsemu; opt-in (see [Against real firmware](#against-real-firmware)). |
| `harness/hm2mqtt.ts`       | The built `dist/index.js`, configured through environment variables exactly like the add-on does.                    |
| `harness/homeAssistant.ts` | Home Assistant with a generated config directory, plus the log scan that decides what counts as a complaint.         |
| `harness/rig.ts`           | Composes the above. hm2mqtt is started separately, because when it starts is the difference between the scenarios.   |
| `harness/stack.ts`         | Teardown in reverse order, including after a failure, so a stray process never poisons the next run.                 |

Scenarios never sleep. Everything goes through `waitFor`, whose timeout message
carries the log tail you need to understand a CI failure.

Home Assistant is observed **over MQTT**: a generated automation mirrors entity
state changes to `e2e/state/<entity_id>`, so assertions read entity states
without authenticating against the HTTP API.

## The scenarios

- **`smoke.e2e.ts`** — a fresh installation. Three devices from different
  families announce their entities; the entities must reach real states and
  Home Assistant must log no complaint.
- **`upgrade.e2e.ts`** — an existing installation. The previous release's
  retained discovery messages are seeded into the broker first, Home Assistant
  adopts those entities, and only then does the new build announce itself over
  the top. Applying a changed discovery message to an entity that already
  exists is a different code path in Home Assistant than creating one, and it
  is the one that has broken before.

## Against real firmware

**`firmware.e2e.ts`** is the smoke test with real firmware in place of the
fixtures. Each device runs its own firmware in
[marsemu](https://github.com/tomquist/marsemu), so hm2mqtt sees what the
firmware actually reports, such as a fresh device's unset timers or fields only
some versions send. It also applies the commands hm2mqtt sends. Firmware images
are not redistributable, so the scenario skips unless told where marsemu and
the images are:

```bash
MARSEMU="/path/to/marsemu/.venv/bin/python -m marsemu" \
MARSEMU_FIRMWARE=/path/to/marstek-firmware-archiv/firmwares \
npm run test:e2e -- firmware
```

By default it runs one device of each family: a B2500 (HMJ-2 116), a CT003
(HME-3 122), a Venus E 3.0 (control 151, BMS 115) and a Venus E Mini (309).
`MARSEMU_DEVICES` picks others, as `command:dir[,dir]` entries separated by `;`,
with the directories relative to `MARSEMU_FIRMWARE`:

```bash
MARSEMU_DEVICES="venusce:HMG-50/Control/156,HMG-50/BMS/216;venusd:VNSD-0/Control/151,VNSD-0/BMS/118;run:HME-4/124"
```

The firmware runs at real time, so expect a few minutes; a Venus C/E takes
about eight to reach MQTT. Each device gets its own BLE MAC, hence its own MQTT
topic id, and the scenario reads the `DEVICE_n` value for hm2mqtt from what
marsemu prints once the firmware subscribes. `harness/emulator.ts` has the
details.

To investigate by hand rather than assert, run the same pieces yourself: a
broker, `marsemu <command> … --mqtt broker --ble-mac …` per device (it prints
the `DEVICE_0=` line to give hm2mqtt), hm2mqtt, and Home Assistant from
`.venv-ha`.

## Discovery baselines

`test/fixtures/discovery` holds every discovery message hm2mqtt publishes, and
serves two masters on purpose:

- `current/` tracks the working tree. Its diff in a pull request shows what
  changed about the entities users get. Regenerate with
  `npm run baseline:update` after an intentional change and review the result.
- `released/<version>/` is frozen at what that release published. The upgrade
  scenario replays it, and `test/discovery/baseline.test.ts` fails if an entity
  loses a state topic it used to have, which breaks every installation that
  already has that entity.

**At release time**, copy `current/` to `released/<new version>/`. Without that,
the upgrade scenario keeps testing an ever-older starting point.

The same fixtures feed both halves: a baseline is generated from the state a
device fixture parses into, and the simulator replays that fixture to the real
build. The baseline therefore describes exactly the entities a scenario creates.

`.oxlintrc.json` turns `no-await-in-loop` off for `test/e2e`: scenarios drive
real processes, so starting components in order, polling, and tearing down in
reverse are sequential on purpose.

## Pinned versions

`versions.json` pins Home Assistant. A scenario failing should mean hm2mqtt
changed, not that Home Assistant released this morning. Bump it deliberately;
when you do, re-check `CONFIG_ENTRY_STORAGE_MINOR_VERSION` in
`harness/homeAssistant.ts`, which mirrors Home Assistant's internal storage
schema for the generated MQTT config entry.

Note what a green run does and does not mean: it says hm2mqtt does not trip
Home Assistant in the ways we know about. Some of what these scenarios guard
against are Home Assistant bugs that hm2mqtt merely provokes; the suite cannot
vouch for Home Assistant itself.
