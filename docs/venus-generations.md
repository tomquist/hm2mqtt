# The two generations of Venus firmware

Marstek's Venus line splits into two firmware generations that speak different
MQTT dialects. They share a wire format — `cd=<n>,<key>=<value>` — but assign
different numbers to the same commands, and connect over different topics.

This matters because hm2mqtt currently implements the first generation. The
Venus E Mini belongs to the second, and Venus X and Venus G are unsupported
second-generation models.

Everything here was read out of the Marstek Android app's compiled Dart
(`com.hamedata.marstek` 1.6.72, snapshot `830f4f59e7969c70b595182826435c19`).
The first generation's half has since been cross-checked against real device
firmware — see [Cross-checked against firmware](#cross-checked-against-firmware).
The second generation's has not; see [Confidence](#confidence).

## Telling them apart

|                | First generation | Second generation |
| -------------- | ---------------- | ----------------- |
| Products       | Venus C, Venus E, Venus A, Venus D | Venus X, Venus G, Venus E Mini |
| Device types   | `HMG`, `VNSE3`, `VNSA`, `VNSD` (and the regional `VNSE3CH`, `VNSE3AU`, `VNSDCH`, `VNSACH`, `VDAC`, `VEPRO`, `VAAC2`, `VNSE4`) | `VENX`, `VNSG`, `VNSGPV`, `VNSEMINI` |
| App code       | `pages/Ac_Coupler`, commands built by `CommonCommand` | `modules/devices`, commands built by `DataVenus*` tables and `venus_model.dart` |
| MQTT topics    | `hame_energy/<type>/App/<mac>/ctrl` | `marstek_energy/<type>/App/<hashed id>/ctrl` |
| Strategy class | `VenusMqttStrategy` | `VNXMqttStrategy` |

`mqtt_factory` is what settles the grouping: it routes `VNSEMINI` behind
`VNXMqttStrategy` alongside `VENX`, `VNSG` and `VNSGPV`. `MqttSendMixin.TOPIC`
in that tree builds the `marstek_energy` topic with the hashed device id, where
`CommonCommand` builds `hame_energy` with the plain MAC.

## Where the numbering collides

Only some commands moved. These are the ones where both generations implement
the same thing under different numbers — the traps when reading one generation's
code while working on the other:

| Command             | 1st gen | 2nd gen |
| ------------------- | ------- | ------- |
| Depth of discharge  | `cd=56,dod=` | `cd=44,do=` |
| Set LED             | `cd=59,led=` | `cd=56,led=` |
| Set device time     | `cd=4,yy=,mm=,rr=,hh=,mn=` | `cd=33` |
| Network info        | `cd=26` | `cd=03` |
| Reboot              | *(none — see below)* | `cd=61` |

And these agree, which is why the split is easy to miss:

| Command             | Both generations |
| ------------------- | ---------------- |
| Read device info    | `cd=1` / `cd=01` |
| Set working mode    | `cd=2,md=` / `cd=02,md=` |
| Factory reset       | `cd=5` / `cd=05` |
| Set CT / meter type | `cd=18,meter=` |
| Get CT power        | `cd=19` — but not on the Venus E Mini, which has no `cd=19` and uses `cd=59` |
| Bluetooth advertising | `cd=55,adv=` |

The first generation has no reboot command at all, on Venus. `cd=10` is not one:
on this family it is `GET_FC41D_INFO`, the WiFi module version query, and it is
only the *B2500* that restarts with `cd=10`. Reaching for that number on a Venus
queries the WiFi module instead.

The second generation writes every command number as two characters, which for
the single-digit ones means zero-padded: `cd=01`, `cd=02`, `cd=03`, `cd=04`,
`cd=05`. On the Venus E Mini that is not cosmetic — a real unit answered `cd=01`
and did not answer the bare `cd=1` — so hm2mqtt pads all of them for this model.

That is not a rule about Marstek firmware in general. The first generation's
B2500 code pads the same way (`cd=01`, `cd=03,md=0`, `cd=08,wy=`), yet hm2mqtt
has always sent those bare and real B2500s answer, so on that firmware the
padding really is decoration. The two generations differ in how the device
matches the number, not in what the app writes.

## Second-generation command map

The second generation layers its command tables: a base every model inherits,
plus per-model additions. Parameter names come from
`modules/devices/model/venus_model.dart`, whose setters name them directly; the
numbers come from the `CMD_*` descriptors in each model's entity file.

### Base — inherited by every second-generation model

Declared in `modules/devices/entity/dev_data.dart` (the `VxCmd` mixin).

| Command | Payload | App name |
| ------- | ------- | -------- |
| Read device info | `cd=01` | `CMD_GET_DEVICE_INFO` |
| Network info | `cd=03` | `CMD_GET_NET_INFO` |
| Error code | `cd=04` | `CMD_GET_ERROR_CODE` |
| Factory reset | `cd=05` | `CMD_SET_RESET_TO_FACTORY` |
| Set working mode | `cd=02,md=<n>` | `CMD_SET_WORK_MODE` |
| Set CT / meter | `cd=18,meter=<n>` | `CMD_SET_CT` |
| Set device time | `cd=33` | `CMD_SET_TIME` |
| Depth of discharge | `cd=44,do=<pct>` | `CMD_SET_DOD` |
| Access power | `cd=46,cv=<n>` | `CMD_SET_ACCESS_POWER` |
| Anti-reverse-flow | `cd=54,am=<n>` | `CMD_SET_ANTL_REVERSE` |
| Bluetooth advertising | `cd=55,adv=<0\|1>` | `CMD_SET_BLUETOOTH_STATE` |
| Reboot | MQTT request `cd=61,rst=1` (derived from the app's model reboot method and MQTT command descriptor) | `CMD_SET_REBOOT` descriptor |
| Configure WiFi | *(Bluetooth only — no MQTT form)* | `CMD_SET_WIFI` |
| Manual mode config | `cd=` *(built at the call site)* | `CMD_SET_MODE_MANUAL_INFO` |

### Venus X — `dev_venus_x.dart`

Adds, on top of the base:

| Command | Payload | App name |
| ------- | ------- | -------- |
| Get NOW power | `cd=59` | `CMD_GET_NOW_POWER` |
| Get CT power | `cd=19` | `CMD_GET_CT_POWER` |
| Get config info | `cd=01` | `CMD_GET_CONFIG_INFO` |
| Set LED | `cd=56,led=<n>` | `CMD_SET_LED_STATE` |
| Discharge grid power | `cd=57,on_grid=<n>` | `CMD_SET_DISCHARGE_GRID_POWER` |
| CT phase auto-check | `cd=58` | `CMD_SET_CT_PHASE_AUTO_CHECK` |
| Configure server | `cd=60,ser=<n>` | `CMD_SET_SERVER` |
| Shelly Pro 3EM port | `cd=62,shelly_pro=<port>` | `CMD_SET_SHELLY_PRO_3EM_PORT` |
| Grid power standard | `cd=38,grid_sta=<n>` | `CMD_SET_GRID_POWER_STANDARD` |
| Access power | `cd=46,cv=<n>` | `CMD_SET_ACCESS_POWER` |

### Venus G — `dev_venus_g.dart`

| Command | Payload | App name |
| ------- | ------- | -------- |
| Battery pack info | `cd=62` | `CMD_GET_BATTERY_PACK_INFO` |

Note `cd=62` means something different here than on the Venus X, which uses it
for the Shelly port. Numbers are not stable across models within a generation
either — always read the model's own table.

### Venus E Mini — `dev_venus_b.dart`

| Command | Payload | App name |
| ------- | ------- | -------- |
| Get NOW power | `cd=59` | `CMD_GET_NOW_POWER` |
| Bluetooth advertising | `cd=55,adv=<0\|1>` | `CMD_SET_BLUETOOTH_STATE` |
| Schedule slot 1–6 | `cd=<47–52>,mN=<0\|1>,mpN=<W>,msN=<1\|2\|3>,stN=<HH:mm>,etN=<HH:mm>,reN=<mask>` | `CMD_SET_MODE_MANUAL_INFO` |
| Configure server | `cd=60,ser=<n>` | `CMD_SET_SERVER` |
| Recharge type | `cd=63,ct_chg_type=<n>` | `CMD_SET_CT_CHARGE_TYPE` |
| Configure WiFi | *(Bluetooth only)* | `CMD_SET_WIFI` |

The Mini has no `cd=19`, which is why hm2mqtt polls it for power with `cd=59`.
Its schedule slots are configured consecutively as a precaution. Out-of-sequence
writes were suspected of causing a hang on earlier firmware; causation and the
exact firmware failure conditions remain unconfirmed.

### Venus E Mini schedule slot behavior

Live tests established that the six MQTT slots and the schedules shown by the
Marstek app are not the same thing:

- The battery always reports all six slots.
- Setting `mN=0` disables a slot but does not erase its other values.
- Removing a schedule in the app leaves the old power, direction, times and
  repeat mask in the battery. The app hides that slot and may reuse it later.
- Creating a complete slot over MQTT with `mN=0` does not make it appear in the
  app.
- Creating it with `mN=1` makes it appear. Setting `mN=0` afterward disables it
  but leaves it visible in the app.

This means MQTT telemetry cannot tell whether the app will show a disabled slot.
The app keeps additional state that is not present in the device response.
Home Assistant should continue to show the values reported by the battery.

Schedule edits are staged independently from telemetry, then all slot fields are
sent in one command when the user selects *Apply*. hm2mqtt must not
automatically enable and then disable a schedule to make it visible in the app.
That two-command workaround could briefly start charging or discharging when
the configured time range includes the current time.

The app also rejects schedules whose time ranges overlap on a selected weekday.
hm2mqtt applies the same guard to all complete slots, including disabled slots.
Intervals that meet at one boundary do not overlap. Only same-day intervals are
accepted; an overnight schedule needs two slots.

Schedule writes require an explicit, non-persistent opt-in and three complete
runtime readings with advancing device time. Apply refreshes before writing,
uses only the latest live namespace, waits for `cdNN=ok`, then requests another
runtime response. Confirmation requires an advancing device clock, exact target
slot read-back, unchanged other slots, and Manual mode. Pending writes block
additional Apply requests and other normal device writes. No commands are queued.

Preflight refresh and read-back time out after 150 seconds to accommodate
60-second relay synchronization and one skipped cycle. Acknowledgements still time out after
15 seconds. Confirmed writes have a ten-second cooldown. Runtime receipt and
device-clock progress must remain within the polling interval plus 15 seconds,
with a minimum allowance of 90 seconds. Temporary staleness pauses writes while
preserving opt-in; an advancing valid snapshot restores readiness without
retrying a command. Prolonged staleness (two polling intervals plus 30 seconds,
at least 150 seconds), faults, command failures and disconnects lock controls.
Recovery from a lockout needs three new healthy readings and explicit
re-enablement.

Cached packets do not count as device-clock progress and older snapshots are
ignored for schedule decisions. A mismatched target read-back remains
unconfirmed until a matching newer snapshot arrives or the original deadline
expires. Changes to other slots or Manual mode still abort immediately.
The clock-jump check
compares elapsed time since the last clock advancement, not the latest packet.
It allows up to 150 seconds of additional forward progress for a delayed
snapshot catching up; larger discontinuities still lock controls.
Retained control and response messages cannot authorize a transaction. Guarded
publishes use QoS 0, are not retained, and are rejected while the broker is
disconnected to avoid queued or retransmitted device writes.

These checks do not establish firmware safety. Acknowledgements contain no
transaction identifier, so a delayed acknowledgement for the same slot cannot
be distinguished from the current one. Post-write telemetry reduces that risk
but cannot prove actual power-control behavior or exclude concurrent app writes.
Limited tests on one Mini confirmed editing an existing slot and
creating a new slot. Its reported firmware identifiers were PMU 301,
inverter 270 and DC-DC 269. The transport was hame-relay 1.5.0 through Marstek's
cloud, with roughly 60-second telemetry synchronization. This is not a
compatibility guarantee for other firmware, direct MQTT, all directions or all
failure-recovery paths.

The `time` field has no timezone offset. Its parser uses the hm2mqtt process
timezone, so a container's `TZ` must match the battery's local timezone. Use an
IANA name so daylight-saving rules are applied. Clock jumps or ambiguous
fall-back readings can pause or lock writes; do not bypass that guard or
automatically resynchronize the device clock.

## A `cd=60` ambiguity worth knowing about

`cd=60` carries two different meanings depending on which parameter it takes.
The second-generation device command is `cd=60,ser=<n>`, matching its label
"配置服务器" (configure server), and the Mini reports the setting back as `ser`
in its `cd=1` payload.

Separately, `NewHomeMqttTool.getScanShellyList` builds `cd=60` with `mod=1` /
`mod=0` to start and stop a **Shelly scan**, and the device answers with the
Shelly energy meters it found on its own network (shape as in the app's
demo-mode fixture, with the MAC and address replaced by placeholders):

```text
cd=60,[{"id":"Shellypro3em63-aabbccddeeff","mac":"AABBCCDDEEFF","ip":"192.0.2.10",
        "rssi":-68,"model":"SPEM-003CEBEU63","name":null,"ver":"1.4.0"}, …]
```

`cd=61` (`connectShellRPC`) then connects to a chosen one. That is the same
number the second generation uses for reboot, on a different code path — so
`cd=60` and `cd=61` both need the parameter to disambiguate them. The Shelly
reply is a JSON array, which hm2mqtt's `key=value` parser cannot represent, so
none of the Shelly flow is implemented.

## What hm2mqtt implements

Of the second generation, only the Venus E Mini is supported, and only partly:

- `cd=01` runtime request and payload — parsed
- `cd=59` power readings — polled
- `cd=55,adv=` bluetooth advertising — implemented
- `cd=44,do=` depth of discharge — implemented
- `cd=02,md=` working mode — implemented
- `cd=47` through `cd=52` manual-mode schedule slots — implemented
- `cd=18,meter=,mac=` meter type — implemented
- `cd=05` factory reset — implemented
- `cd=61,rst=1` reboot request — app-derived; device-side result remains unconfirmed
- `cd=01` refresh and `cd=59` get CT power — also exposed as buttons, so a poll
  can be triggered on demand

The entities carry the same ids and names as their counterparts on the
first-generation Venus models, and the same option names where the two models
have the same option, so an automation can treat them alike; only the numbers on
the wire differ. The ranges are still each model's own — the Mini has no
`trading` working mode, and takes a depth of discharge of 30-90% against the
Venus 30-88%. Where this model has no counterpart at all — the LED, backup
power, peak shaving, surplus feed-in, the local API, the power limits — no
entity is invented for it.

Everything else in the tables above is unimplemented. For all but one the reason
is that the values it accepts are unknown rather than that the command is in
doubt; the exception is the grid-connection power limit, which has no device
command to implement (see below):
`cd=60,ser=`, `cd=63,ct_chg_type=` and `cd=54,am=,aw=,ap=` have no documented
value set; `cd=3` and `cd=4` are reads whose reply shape is unknown; `cd=33`
has known parameters but an undetermined local-vs-UTC convention (see below).
Venus X and Venus G have no
device definitions at all.

### `cd=33` and the local-vs-UTC question

`cd=33` takes `d`, `m`, `y`, `h`, `min`, `s` and `wy`. `wy` is the timezone
offset in minutes — the same key, with the same meaning, that the B2500 uses on
its own set-time command. On the B2500 the clock fields that accompany `wy` are
UTC. The first-generation Venus `cd=4` has no `wy` at all and takes local time.
The app calls `timeZoneOffset` once either way, which does not settle which
convention `cd=33` follows, and choosing wrong sets the device clock off by the
offset. Pressing the setting in the app while watching the device's reported
`time` would resolve it in one go.

### The 800 W / 1500 W limit is not a device command

The Mini reports its grid-connection power limit as `gps` (0 = 800 W,
1 = 1500 W), but there is no `cd=` that writes it. The app changes it through
Marstek's cloud — the setter resolves to an HTTP call, the two wattages live in
the app's HTTP API module, and the surrounding flow is an application-and-
approval one (submit, "VIP power", upgrade status) that then provisions the
device. `cd=46,cv=` (access power, literally "permission power") is the nearest
device command and has no callers anywhere in the app. This is why the limit
appears as a read-only sensor here.

## Cross-checked against firmware

The first generation's side of this page has since been checked against real
device firmware, from the community archive at
[sphings79/marstek-firmware-archiv](https://github.com/sphings79/marstek-firmware-archiv).
The Venus control firmware images are unencrypted ARM Cortex-M binaries whose
strings include the `cd=1` response format string and the parameter names the
MQTT handler parses, so they say what the *device* accepts rather than what one
client happens to send.

Three things that came out of it, from `VNSD-0` control 150:

- **There is no reboot command on the first generation.** The only reboot string
  in the image is `system will reboot!`, sitting next to `Reset, clear all…`,
  `Reset, clear part…` and `Reset, clear cert…` — rebooting is a side effect of
  the reset command, not a command of its own. `cd=61` really is new in the
  second generation.
- **`cd=5` has a third variant.** The image contains `rs=1`, `rs=2` *and*
  `rs=3`, matching those three reset strings. Only `rs=1` and `rs=2` are
  documented in [venus.md](venus.md), and the app never sends `rs=3`. It is
  present in every archived build back to v147, and in `VNSA-0` and `VNSE3-0`
  too. Which `rs` value maps to which variant is inferred from their order in
  the binary, not proven — the strings have no literal-pool references to
  follow.
- **`ct_dev=` and `ip=` are real.** Both appear in the firmware's parameter
  table, confirming the app-side readings of the conditional third meter
  parameter and of `setP1MeterIp`.

Feature timing lines up with the archive's own changelog: `soh` appears in
control 149.2, `peak_status`/`peak_power` in 150 — the release that lists "Add
Peak-shaving function".

## Confidence

Read from one app build, and not confirmed against hardware. Specifically:

- **Numbers and parameter names** come from the app's own command tables and
  setters, so they are what the app sends. They are not proof of what the
  firmware accepts.
- **Value domains** are mostly unknown. The app rarely encodes the accepted
  range in the command builder, so `md=`, `ser=`, `cv=`, `am=`, `grid_sta=`
  and `ct_chg_type=` have no documented value set here.
- **Polarity** is unknown wherever a boolean is involved. `led=` is a good
  example: the Mini reports its LED state in `leds` inverted (`leds=0` means
  the LED is on), and nothing says whether `led=` follows the same convention.
- A later app release can move a number or add a model. Re-read rather than
  trusting this page for a build other than 1.6.72.

To re-derive any row: the app ships as a Flutter AOT snapshot, so disassembling
`libapp.so` gives back the command tables named above. The numbers live in each
model's `CMD_*` members, the parameter names in `venus_model.dart`'s setters,
and the device-type-to-number branch tables in `CommonCommand`.

The firmware side needs no tooling beyond `strings`: the control images are
unencrypted ARM Cortex-M binaries, and both the `cd=1` response format string
and the parameter names the MQTT handler parses are readable in the clear.
