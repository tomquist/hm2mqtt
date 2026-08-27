# The two generations of Venus firmware

Marstek's Venus line splits into two firmware generations that speak different
MQTT dialects. They share a wire format — `cd=<n>,<key>=<value>` — but assign
different numbers to the same commands, and connect over different topics.

This matters because hm2mqtt currently implements the first generation. The
Venus E Mini belongs to the second, and Venus X and Venus G are unsupported
second-generation models.

Everything here was read out of the Marstek Android app (`com.hamedata.marstek`
1.6.72, snapshot `830f4f59e7969c70b595182826435c19`) with
[marstool](https://github.com/tomquist/marstool). None of it has been confirmed
against hardware — see [Confidence](#confidence).

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
| Restart / reboot    | `cd=10` | `cd=61` |

And these agree, which is why the split is easy to miss:

| Command             | Both generations |
| ------------------- | ---------------- |
| Read device info    | `cd=1` / `cd=01` |
| Set working mode    | `cd=2,md=` / `cd=02,md=` |
| Factory reset       | `cd=5` / `cd=05` |
| Set CT / meter type | `cd=18,meter=` |
| Get CT power        | `cd=19` |
| Bluetooth advertising | `cd=55,adv=` |

The second generation writes its numbers zero-padded (`cd=01`, `cd=05`) where
hm2mqtt sends them bare. The first generation's B2500 code does the same, and
real devices evidently parse the number rather than the string, so this appears
to be cosmetic.

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

The Mini has no `cd=19`, which is why hm2mqtt polls it for power with `cd=59`.

## A `cd=60` ambiguity worth knowing about

`cd=60` carries two different meanings depending on which parameter it takes.
The second-generation device command is `cd=60,ser=<n>`, matching its label
"配置服务器" (configure server), and the Mini reports the setting back as `ser`
in its `cd=1` payload.

Separately, `NewHomeMqttTool.getScanShellyList` builds `cd=60` with `mod=1` /
`mod=0` to start and stop a **Shelly scan**, and the device answers with the
Shelly energy meters it found on its own network:

```
cd=60,[{"id":"Shellypro3em63-2cbcbbb83378","mac":"2CBCBBB83378","ip":"10.6.138.80",
        "rssi":-68,"model":"SPEM-003CEBEU63","name":null,"ver":"1.4.0"}, …]
```

`cd=61` (`connectShellRPC`) then connects to a chosen one. That is the same
number the second generation uses for reboot, on a different code path — so
`cd=60` and `cd=61` both need the parameter to disambiguate them. The Shelly
reply is a JSON array, which hm2mqtt's `key=value` parser cannot represent, so
none of the Shelly flow is implemented.

## What hm2mqtt implements

Of the second generation, only the Venus E Mini is supported, and only partly:

- `cd=1` runtime payload — parsed
- `cd=59` power readings — polled
- `cd=55,adv=` bluetooth advertising — implemented
- `cd=44,do=` depth of discharge — implemented
- `cd=61` reboot — implemented

Everything else in the tables above is unimplemented. Venus X and Venus G have
no device definitions at all.

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

Reproduce any row with:

```sh
marstool app disasm --app <app> --blutter-out ./blutter-out
marstool app rules  --blutter-out ./blutter-out --class CommonCommand --member setCtType
marstool mqtt topics --app <app> --device-type VNSEMINI-0 --device-id 001122334455
```
