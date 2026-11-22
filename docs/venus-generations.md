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

Through the Marstek cloud, the topic id a first-generation Venus uses depends on
the broker generation and the firmware:

- **Plain id** on the older `hame-2024` broker (`hame_energy` topics): the
  Venus C/E (HMG) up to control firmware 152.
- **AES id of the MAC** on the `hame-2025` broker (`marstek_energy` topics):
  HMG 153.
- **Salt-based id** on the `hame-2025` broker: HMG from 154 and, on most
  firmware, the Venus E 3.0, Venus A and Venus D. It is derived from a
  per-device salt issued by the Marstek cloud, so it cannot be computed from the
  MAC alone.

hame-relay works out which one applies and forwards the messages to
`hame_energy/<type>/device/<mac>/ctrl` on your own broker, which is where
hm2mqtt expects them.

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
| Reboot              | `cd=28` (see below) | `cd=61` |

And these agree, which is why the split is easy to miss:

| Command             | Both generations |
| ------------------- | ---------------- |
| Read device info    | `cd=1` / `cd=01` |
| Set working mode    | `cd=2,md=` / `cd=02,md=` |
| Factory reset       | `cd=5` / `cd=05` |
| Set CT / meter type | `cd=18,meter=` |
| Get CT power        | `cd=19` (the Mini's app table leaves it out, but its firmware answers it) |
| Bluetooth advertising | `cd=55,adv=` |

The first generation reboots with `cd=28`: every Venus E 3.0, Venus A and Venus D
build, and the Venus C/E (HMG) from control firmware 151. The device answers
`cd=28,ret=1` and restarts about a second later; HMG 151 to 153 restart without
answering. `cd=10` is not a reboot: on this family it is `GET_FC41D_INFO`, the
WiFi module version query, and it is only the *B2500* that restarts with
`cd=10`. Reaching for that number on a Venus queries the WiFi module instead.

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
| Reboot | `cd=61` | `CMD_SET_REBOOT` |
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
| Configure server | `cd=60,ser=<n>` | `CMD_SET_SERVER` |
| Recharge type | `cd=63,ct_chg_type=<n>` | `CMD_SET_CT_CHARGE_TYPE` |
| Configure WiFi | *(Bluetooth only)* | `CMD_SET_WIFI` |

### What the Mini's firmware accepts

The tables above are the app's. The Mini's control firmware (PMU 309, V135;
inverter firmware 270) was read and run in
[marsemu](https://github.com/tomquist/marsemu) to see what each `cd=` handler
parses, where it stores the values and what uses them. Not everything below has
been confirmed on hardware.

The firmware parses every command the same way: it splits the message at `,`,
takes what follows each `=` and splits that at `:` too, and stores the numbers
in order. Key names are ignored, `08:15` is two values, values are 16-bit
unsigned, and a value left out is whatever was on the stack — so a command has
to carry all of its values. Each handler is found by searching the message for
`cd=NN`.

| Command | Values, in order | What it does | Reported as |
| ------- | ---------------- | ------------ | ----------- |
| `cd=01` | – | status report | – |
| `cd=02` | mode | 0 self-consumption, 1 UPS (charges from the grid at `ups_p`), 2 manual (the schedule slots), 3 AI (a plan fetched from the Marstek cloud; idle without one); any other value acts as 0 | `cm` |
| `cd=03` | – | `net_info=ip:…,gate:…,mask:…,dns:…` | – |
| `cd=05` | – | factory reset | – |
| `cd=18` | meter code, MAC | the meter (`ct_t=%d,mac=%12s`); it acknowledges `meter=` and ignores it | `ct_type` |
| `cd=19` | – | `power_a=…,power_b=…,power_c=…,power_s=…,d_p=…,ct_ph=…,ct_type=…,ct_st=…,ct_mac=…` | – |
| `cd=33` | day, month, year, hour, minute, second | sets the clock; no time zone, and the schedule slots run on it | `time` |
| `cd=44` | % | depth of discharge | `do` |
| `cd=47`..`cd=52` | enabled, power, mode, start h, start min, end h, end min, weekdays | schedule slot 1..6, see below | `m1`.., `mp1`.., `ms1`.., `st1`.., `et1`.., `re1`.. |
| `cd=53` | 48 values | all six slots at once, 8 per slot | as above |
| `cd=54` | three | anti-reverse flow; passed to the inverter (block `0x40` words 4-6), whose firmware 270 ignores the first two and uses the third in its output ramp | `ar`, `aw`, `apt` |
| `cd=55` | 0-4 | Bluetooth lock: 1 stops advertising about ten minutes later, 2 starts it at once (both saved; 3 and 4 do the same unsaved), 0 does nothing | `bbs` |
| `cd=56` | 0/1 | status LED, 0 on, 1 off | `leds` |
| `cd=57` | `gps`, `ogpc` | the inverter's limits: `gps` 0 feed-in 800 W, 1 the app's "1500 W" (1250 W with inverter firmware 270); `ogpc` 0 grid charging 1250 W, 1 800 W | `gps`, `ogpc` |
| `cd=58` | 1 | phase detection: an 800 W probe, the phase found is stored | `ct_ph` (1-3 = A-C) |
| `cd=59` | – | the last 15 samples of the device's own power and SOC (`gn_pwr1`..`gn_pwr15`, `gf_pwr1`.., `bat_pwr1`.., `bat_soc1`.., `dev_sta1`..) | – |
| `cd=60` | region | the cloud region of its own HTTP requests: 0 eu, 1 us, 2 dev, 3 staging | `ser` |
| `cd=61` | 1 | restart, but only with a value of 1; a bare `cd=61` is acknowledged and does nothing | – |
| `cd=62` | port | a custom UDP port for the Shelly meters (defaults 1010 Pro 3EM, 2222 EM gen3, 2223 Pro EM 50); there is no way back to the default | – |
| `cd=63` | 0/1 | phase mode: 0 covers its own phase, 1 the sum of all three (the meter poll asks for phase `D`) | `rechg_type` |
| `cd=64` | W | the UPS-mode charge power, clamped to 100-1500 W | `ups_p` |
| `cd=65` | enabled, own port, remote port | the local API (Open API, JSON over UDP); it listens on the own port | `lapi_en`, `self_port`, `rem_port` |
| `cd=66` | IP | the IP of a P1 Meter (`http://<ip>/api/v1/data`) or an EcoTracker (`http://<ip>/v1/json`); read to the end of the line, so it goes last | – |
| `cd=A0`..`cd=A3` | | firmware update of the control, inverter and DC/DC boards: `A1,cnt=` images, `A2,num=` one image (`type`, `url`, `mod`, `size`, `crc`, `ver`), `A3` starts it, `A0` reports its state | – |
| `cd=32`, `cd=35`, `cd=38`, `cd=45` | one | accepted, but change nothing in this build (`cd=38` is reported back as `gn`) | – |

There is no `cd=46`. The meter codes match the polls the firmware makes: Shelly
Pro 3EM 1 (UDP 1010), P1 Meter 2 (HTTP), CT002 3, CT003 4, Shelly EM gen3 5
(UDP 2222), Shelly Pro EM 50 6 (UDP 2223), EcoTracker 7 (HTTP), SMR-P1 8 and
TPM2-100CT 11 (both on the CT002 protocol, UDP 12345).

**The schedule slots.** A slot applies while start ≤ now < end on a day in its
mask (bit 0 = Monday .. bit 6 = Sunday, 127 every day); an end of 23:59 runs
to midnight, and a slot cannot cross midnight. Its mode 0 idles, 1 charges and
2 discharges at its power (capped at 1500 W), 3 follows the meter. Outside every
slot the device follows the meter while the enabled slots only idle or charge,
and idles once any of them discharges or follows the meter. In AI mode the
same evaluation runs over a second table that the cloud plan fills.

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

Of the second generation, only the Venus E Mini is supported:

- `cd=01` runtime request and payload — parsed
- `cd=19` meter power readings and `cd=03` network info — polled
- `cd=02,md=` working mode, with UPS (`md=1`), and `cd=64,ups_p=` its charge power
- `cd=47`..`cd=52` the six schedule slots, each change sending the whole slot
- `cd=44,do=` depth of discharge
- `cd=57,gps=,ogpc=` the feed-in and grid-charge limits, each sending the other's
  current value
- `cd=63,ct_chg_type=` the phase mode
- `cd=56,led=` the status LED
- `cd=55,adv=` Bluetooth lock, read back from `bbs`
- `cd=65,en=,sp=,rp=` the local API
- `cd=18,ct_t=,mac=` meter type, `cd=66,meter_ip=` the meter IP and `cd=58` phase
  detection
- `cd=33` clock sync, with hm2mqtt's local time
- `cd=05` factory reset and `cd=61,rst=1` reboot
- `cd=01` refresh and `cd=19` get CT power — also exposed as buttons, so a poll
  can be triggered on demand

The entities carry the same ids and names as their counterparts on the
first-generation Venus models, and the same option names where the two models
have the same option, so an automation can treat them alike; only the numbers on
the wire differ. The ranges are still each model's own — the Mini has no
`trading` working mode, and takes a depth of discharge of 30-90%, like the Venus
C/E (HMG), against 30-88% on the Venus E 3.0, Venus A and Venus D. Where this
model has no counterpart at all — backup power, peak shaving, surplus feed-in —
no entity is invented for it.

Not exposed on purpose: the board firmware update (`cd=A0`..`cd=A3`), the cloud
region (`cd=60`), the Shelly port (`cd=62`, which cannot be reset), the
anti-reverse flow (`cd=54`, mostly ignored by the inverter) and `cd=53`, which
the per-slot commands cover. Venus X and Venus G have no device definitions at
all.

## Cross-checked against firmware

The first generation's side of this page has since been checked against real
device firmware, from the community archive at
[sphings79/marstek-firmware-archiv](https://github.com/sphings79/marstek-firmware-archiv).
The Venus control firmware images are unencrypted ARM Cortex-M binaries whose
strings include the `cd=1` response format string and the parameter names the
MQTT handler parses, so they say what the *device* accepts rather than what one
client happens to send.

Three things that came out of it, from `VNSD-0` control 150:

- **The first generation reboots with `cd=28`**, a command of its own,
  answered `cd=28,ret=1` (see above). `cd=61` is the second generation's number
  for it.
- **`cd=5` has a third variant.** The image contains `rs=1`, `rs=2` *and*
  `rs=3`: `rs=1` clears everything, `rs=2` clears part of the settings and
  `rs=3` clears only the certificates, and each reboots the device. The app
  never sends `rs=3`. It is present in every archived build back to v147, and
  in `VNSA-0` and `VNSE3-0` too. The Venus C/E (HMG) has only `rs=1` and
  `rs=2`.
- **`ct_dev=` and `ip=` are real.** Both appear in the firmware's parameter
  table, confirming the app-side readings of the conditional third meter
  parameter and of `setP1MeterIp`.

Feature timing lines up with the archive's own changelog: `soh` appears in
control 149.2, `peak_status`/`peak_power` in 150 — the release that lists "Add
Peak-shaving function". The Venus E 3.0 and Venus A add `soh` in 150 instead;
[venus.md](venus.md#fields-added-by-firmware-build) lists the fields each model
and build adds.

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
