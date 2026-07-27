# Venus MQTT Document
## Table of Contents
1. [MQTT Core Concepts](#1-mqtt-core-concepts)
    1. [Introduction](#11-introduction)
    2. [Publish/Subscribe Pattern](#12-publishsubscribe-pattern)
    3. [MQTT Server](#13-mqtt-server)
    4. [MQTT Client](#14-mqtt-client)
    5. [Topic](#15-topic)
2. [Subscribe to your device](#2-subscribe-to-your-device)
3. [Read device information](#3-read-device-information)
    1. [Public](#31-public)
    2. [Receive](#32-receive)
4. [Set working status](#4-set-working-status)
    1. [Public](#41-public)
5. [Set automatic discharge time period](#5-set-automatic-discharge-time-period)
    1. [Public](#51-public)
6. [Set transaction mode content](#6-set-transaction-mode-content)
    1. [Public](#61-public)
7. [Set device time](#7-set-device-time)
    1. [Public](#71-public)
8. [Restore factory settings](#8-restore-factory-settings)
    1. [Public](#81-public)
9. [Upgrade FC41D firmware version](#9-upgrade-fc41d-firmware-version)
    1. [Public](#91-public)
10. [Enable EPS function](#10-enable-eps-function)
    1. [Public](#101-public)
    2. [Receive](#102-receive)
11. [Set version](#11-set-version)
    1. [Public](#111-public)
    2. [Receive](#112-receive)
12. [Set maximum charging power](#12-set-maximum-charging-power)
    1. [Public](#121-public)
    2. [Receive](#122-receive)
13. [Set maximum discharge power](#13-set-maximum-discharge-power)
14. [Set the meter type and supplementary power type](#14-set-the-meter-type-and-supplementary-power-type)
    1. [Public](#141-public)
15. [Obtain CT power](#15-obtain-ct-power)
    1. [Public](#151-public)
    2. [Receive](#152-receive)
16. [Upgrade the firmware of the FC4 module](#16-upgrade-the-firmware-of-the-fc4-module)
    1. [Public](#161-public)
    2. [Receive](#162-receive)
17. [Set depth of discharge](#17-set-depth-of-discharge)
    1. [Public](#171-public)
18. [Enable surplus feed-in](#18-enable-surplus-feed-in)
    1. [Public](#181-public)
    2. [Receive](#182-receive)
19. [Configure the local API](#19-configure-the-local-api)
    1. [Public](#191-public)
20. [Start phase diagnosis](#20-start-phase-diagnosis)
    1. [Public](#201-public)
21. [Pre-update check](#21-pre-update-check)
    1. [Public](#211-public)
    2. [Receive](#212-receive)
22. [Start an OTA update](#22-start-an-ota-update)
    1. [Public](#221-public)
    2. [Receive](#222-receive)
23. [Read network information](#23-read-network-information)
    1. [Public](#231-public)
    2. [Receive](#232-receive)
24. [Read BMS pack details](#24-read-bms-pack-details)
    1. [Public](#241-public)
    2. [Receive](#242-receive)
25. [Read power history](#25-read-power-history)
    1. [Public](#251-public)
    2. [Receive](#252-receive)
26. [Enable/disable the status LED](#26-enabledisable-the-status-led)
    1. [Public](#261-public)
    2. [Receive](#262-receive)
27. [Configure Bluetooth advertising](#27-configure-bluetooth-advertising)
    1. [Public](#271-public)
    2. [Receive](#272-receive)
28. [Configure peak shaving](#28-configure-peak-shaving)
    1. [Public](#281-public)
    2. [Receive](#282-receive)
29. [Configure parallel operation](#29-configure-parallel-operation)
    1. [Public](#291-public)
    2. [Receive](#292-receive)

## 1 MQTT Core Concepts

### 1.1 Introduction

MQTT (Message Queue Telemetry Transport) is the most commonly used lightweight messaging protocol for the IoT (Internet of Things). The protocol is based on a publish/subscribe (pub/sub) pattern for message communication. It allows devices and applications to exchange data in real-time using a simple and efficient message format, which minimizes network overhead and reduces power consumption.

### 1.2 Publish/Subscribe Pattern

The protocol is event-driven and connects devices using the pub/sub pattern. Different from the traditional client/server pattern, it is a messaging pattern in which senders (publishers) do not send messages directly to specific receivers (subscribers). Instead, publishers categorize messages into topics, and subscribers subscribe to specific topics that they are interested in.

When a publisher sends a message to a topic, the MQTT broker routes and filters all incoming messages, and then delivers the message to all the subscribers that have expressed interest in that topic.

The publisher and subscriber are decoupled from each other and do not need to know each other's existence. Their sole connection is based on a predetermined agreement regarding the message. The Pub/Sub pattern enables flexible message communication, as subscribers and publishers can be dynamically added or removed as needed. It also makes the implementation of message broadcasting, multicasting, and unicasting easier.

### 1.3 MQTT Server

The MQTT server acts as a broker between the publishing clients and subscribing clients, forwarding all received messages to the matching subscribing clients. Therefore, sometimes the server is directly referred to as the MQTT Broker.

### 1.4 MQTT Client

The clients refer to devices or applications that can connect to an MQTT server using the MQTT protocol. They can act as both publishers and subscribers or in either of those roles separately.

### 1.5 Topic

Topics are used to identify and differentiate between different messages, forming the basis of MQTT message routing. Publishers can specify the topic of a message when publishing, while subscribers can choose to subscribe to topics of interest to receive relevant messages.

## 2 Subscribe to your device

Before sending/receiving messages in MQTT, you must subscribe to your device using the following command:

```
hame_energy/{type}/device/{uid or mac}/ctrl
```

The parameters that need to be filled in the command include your device type, device ID or MAC.
Venus currently has the following types: HMG-x (e.g. HMG-1), VNSE3-x (e.g. VNSE3-0), VNSA-x (e.g. VNSA-1), and VNSD-x (e.g. VNSD-1).

## 3 Read device information

### 3.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=01
```

### 3.2 Receive

You will receive a message, such as:

```
tot_i=44785,tot_o=36889,ele_d=489,ele_m=3931,grd_d=395,grd_m=2833,inc_d=0,inc_m=-111,grd_f=0,grd_o=807,grd_t=3,gct_s=1,cel_s=3,cel_p=138,cel_c=27,err_t=0,err_a=0,dev_n=140,grd_y=0,wor_m=1,tim_0=14|0|17|0|127|800|1,tim_1=17|1|20|0|127|-800|1,tim_2=20|1|23|0|127|800|1,tim_3=23|1|23|59|127|-800|1,tim_4=0|1|3|0|127|800|1,tim_5=3|1|6|0|127|-800|1,tim_6=6|1|9|0|127|800|1,tim_7=9|1|12|1|127|-800|1,tim_8=9|10|12|0|127|-2500|0,tim_9=0|0|0|0|0|0|0,cts_m=0,bac_u=1,tra_a=41,tra_i=40000,tra_o=600000,htt_p=0,prc_c=4620,prc_d=4620,wif_s=35,inc_a=-152,set_v=1,mcp_w=2500,mdp_w=800,ct_t=1,phase_t=0,dchrg_t=255,bms_v=109,fc_v=202407221950,wifi_n=Hame
```

Description of the above parameters:

| Key | Description |
|-----|-------------|
| tot_i | Total cumulative charging capacity (0.01kw.h) |
| tot_o | Total cumulative discharge capacity (0.01kw.h) |
| ele_d | Daily cumulative charging capacity (0.01kw.h) |
| ele_m | Monthly cumulative charging capacity (0.01kw.h) |
| grd_d | Daily cumulative discharge capacity (0.01kw.h) |
| grd_m | Monthly cumulative discharge capacity (0.01kw.h) |
| inc_d | Daily cumulative income (Unit: 0.001 euros) |
| inc_m | Monthly cumulative income (Unit: 0.001 euros) |
| grd_f | Off grid power (VA) |
| grd_o | Combined power (-: Charging +: Discharging, Unit: W) |
| grd_t | Working status (0x0: sleep mode; 0x1: standby; 0x2: charging; 0x3: discharging; 0x4: backup mode; 0x5: OTA upgrade; 0x6: bypass status) |
| gct_s | CT status (0: Not connected; 1: has been connected; 2: Weak signal) |
| cel_s | Battery working status (1: Not working; 2: Charging; 3: Discharge) |
| cel_p | Battery energy (0.01kWh) |
| cel_c | SOC |
| err_t | Error code (fault code) |
| err_a | Error code (warning code) |
| dev_n | Device version number |
| grd_y | Grid type (0: Adaptive (220-240) (50-60hz) AUTO; 1: EN50549 EN50549; 2: Netherlands; 3: Germany; 4: Austria; 5: United Kingdom; 6: Spain; 7: Poland; 8: Italy; 9: China) |
| wor_m | Working mode (0: Automatic; 1: Manual operation; 2: Trading; 5: AI) |
| tim_0 | Start time (hour \| minute) \| End time (hour \| minute) \| Cycle \| Power \| Enable |
| tim_1 | ditto |
| tim_2 | ditto |
| tim_3 | ditto |
| tim_4 | ditto |
| tim_5 | ditto |
| tim_6 | ditto |
| tim_7 | ditto |
| tim_8 | ditto |
| tim_9 | ditto |
| cts_m | Automatically switch the working mode switch based on CT signals (0: Off; 1: On) |
| bac_u | Enable status of back up function (0: Close; 1: Open) |
| tra_a | Transaction mode - region code |
| tra_i | Transaction mode - electricity price during charging (0: EU; 1: China; 2: North America) |
| tra_o | Transaction mode - electricity price during discharge |
| htt_p | HTTP Server Type |
| prc_c | Obtain regional charging prices |
| prc_d | Obtain regional discharge prices |
| wif_s | WIFI signal strength (Less than 50: Good signal; 50-70: The signal is average; 70-80: Poor signal; Greater than 80: The signal is very weak) |
| inc_a | Total cumulative income (Unit: 0.001 euros) |
| set_v | Power version — a *code* for the device's rated output power, not a wattage (see [Set version](#11-set-version)). The resulting power is reported back as `mdp_w`. |
| mcp_w | Maximum charging power (Not exceeding 2500W) |
| mdp_w | Maximum discharge power (Not exceeding 2500W) |
| ct_t | CT type (0: No meter detected; 1: CT1; 2: CT2; 3: CT3; 4: Shelly pro; 5: p1 meter) |
| phase_t | The phase where the device is located (0: Unknown; 1: Phase A; 2: Phase B; 3: Phase C; 4: Not detected) |
| dchrg_t | Recharge mode (0: Single phase power supply; 1: Three phase power supply) |
| bms_v | BMS version number |
| fc_v | Communication module version number |
| wifi_n | WIFI Name |
| dod | Depth of discharge (%) (configurable 30-88% in the Marstek app; the maximum of 88% is encoded as 0) |
| shelly_p | Shelly UDP port (only meaningful when `ct_t` is a Shelly meter) |
| pv1 | PV input 1 power (0.1W) \| connection status (0: Not connected; 1: Connected) (only reported by Venus models with PV inputs, e.g. Venus A/D) |
| pv2 | PV input 2 power (0.1W) \| connection status (only reported by Venus models with PV inputs) |
| pv3 | PV input 3 power (0.1W) \| connection status (only reported by Venus models with PV inputs) |
| pv4 | PV input 4 power (0.1W) \| connection status (only reported by Venus models with PV inputs) |

The following additional fields have been observed on newer firmware (e.g.
Venus D control firmware v147). Meanings marked *(unconfirmed)* are educated
guesses based on context and cross-referencing other commands:

| Key | Description |
|-----|-------------|
| seq_s | Phase-diagnosis status *(unconfirmed)* — changes after running `cd=18,seq_check` |
| ctrl_r | *(unconfirmed)* |
| par | Parallel operation status (0: turned off; 1: wiring check; 2: turned on). Units that do not support parallel operation report `255`. See [Configure parallel operation](#29-configure-parallel-operation) |
| gen | Generator flag *(unconfirmed)* |
| ble | Bluetooth state bitmask; bit 2 (value `4`) is set when advertising is enabled (Bluetooth lock off), `1` when the lock is enabled (see `cd=55`) |
| c_ratio | CT ratio (%) *(unconfirmed)* |
| udp | UDP enabled *(unconfirmed)* |
| api | Local API enabled (0: disabled; 1: enabled) (see `cd=30`) |
| net | *(unconfirmed)* |
| port | Local API port (see `cd=30`) |
| inv_v | Inverter / micro module version number (matches the `micro` OTA image version) |
| id | *(unconfirmed)*, pipe-separated list |
| lk | Lock flag *(unconfirmed)* |
| bp | Battery power (W) |
| ei | *(unconfirmed)* |
| eb | *(unconfirmed)* |
| rp | Battery power (W), calculated. The app overwrites the `bp` reading with this one when its per-model "use calculated power" flag is set (see the note below) |
| gp | Grid power (W). Only used by the app when the same flag is set; otherwise grid power comes from `grd_o` |
| vp | *(unconfirmed)* power (W) |
| bl | *(unconfirmed)* |
| bl_p | *(unconfirmed)* |
| led | Status LED state (0: off; 1: on) (see `cd=59`) |
| as | *(unconfirmed)* |
| mppt | MPPT module version number *(unconfirmed)* |
| pack | Battery pack summary `num\|mask\|idx\|?` — matches the `cd=42` BMS response (number of packs \| present-pack bitmask \| index) |
| pv | PV energy (Wh), pipe-separated — first component is today's collected PV energy, the last component is the cumulative total (the total is likely but unconfirmed; reading it as the last component leaves room for monthly/yearly values to be added in between) |
| fu | Surplus feed-in state `enabled\|?` — first component is `1` when surplus feed-in is enabled, `0` when disabled (see `cd=43`) |
| em | *(unconfirmed)* |
| peak_status | Peak shaving enabled (0: off; 1: on) (see [Configure peak shaving](#28-configure-peak-shaving)) |
| peak_power | Peak shaving power cap (W) (see [Configure peak shaving](#28-configure-peak-shaving)) |

> **Note on `bp`, `rp` and `gp`.** The Marstek app shows a single battery-power
> value and a single grid-power value. Battery power normally comes from `bp`
> and grid power from `grd_o`, but on some models a "calculated" reading is used
> instead: `rp` for battery power and `gp` for grid power. Which models those are
> is not something the payload reveals. On the devices observed so far `gp`
> matched `grd_o` exactly, while `bp` and `rp` differed slightly (e.g. `bp=291`
> vs `rp=347`), and all three only appear on models with PV inputs (Venus A/D).

## 4 Set working status

### 4.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=2,md=0` - Automatic mode
2. `cd=2,md=1` - Manual mode
3. `cd=2,md=2` - Trading mode
4. `cd=2,md=5,nl=1` - AI mode (the `nl=1` flag is required to enable AI mode)

## 5 Set automatic discharge time period

### 5.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=3,md=1,nm=xx,bt=8:30,et=20:30,wk=1,vv=123,as=0
```

Description of the above parameters:

| Key | Description |
|-----|-------------|
| cd | Instruction identification |
| md | Working mode (0: Automatic; 1: Manual operation; 2: Trading; 5: AI) |
| nm | [0-9] |
| bt | Start Time |
| et | End Time |
| wk | Week[0-6] |
| vv | Power |
| as | Enable (0: disable; 1: enable) |

## 6 Set transaction mode content

### 6.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=3,md=2,id=xx,in=xx,on=xx
```

Description of the above parameters:

| Key | Description |
|-----|-------------|
| cd | Instruction identification |
| md | Working mode (0: Automatic; 1: Manual operation; 2: Trading; 5: AI) |
| id | Region code |
| in | Electricity price during charging |
| on | Electricity price during discharge |

## 7 Set device time

### 7.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=4,yy=123,mm=1,rr=2,hh=23,mn=56
```

Description of the above parameters:

| Key | Description |
|-----|-------------|
| cd | Instruction identification |
| yy | Year |
| mm | Month [0,11] (0 represents January) |
| rr | Day [1,31] |
| hh | Hour [0,23] |
| mn | Minute [0,59] |

### 7.2 Receive

The device echoes the time it applied, e.g.:

```
cd=4,2026-5-14 16:55:0
```

Note that the month is echoed as the raw value that was sent, i.e. it is
0-indexed (`mm=5` is June and is echoed back as `5`). The time is the device's
configured local time.

## 8 Restore factory settings

### 8.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=5,rs=1` - Restore factory settings and clear accumulated data
2. `cd=5,rs=2` - Restore factory settings without clearing accumulated data

## 9 Upgrade FC41D firmware version

### 9.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=9,ot=0` - OTA via URL interface
2. `cd=9,ot=1` - OTA via LAN setup

## 10 Enable EPS function

### 10.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=11,bc=0` - Disable the back up function
2. `cd=11,bc=1` - Enable the back up function

This is the same setting exposed in the Marstek app as "UPS mode" / the backup
power supply toggle (German: "Backup-Stromversorgung aktivieren"). The current
state is reported as the `bac_u` field in the device information.

### 10.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

## 11 Set version

Selects the device's rated output power ("power version").

### 11.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=15,vs=800` - Set up 800W version
2. `cd=15,vs=2500` - Set up 2500W version

The `vs` parameter is the rated power **in watts**. These are the values the
Marstek app sends; which of them a given unit accepts depends on its model and
region:

`600`, `800`, `1200`, `1500`, `2000`, `2200`, `2300`, `2400`, `2500`, `3000`, `3600`

### 11.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

The current setting is reported in the `cd=1` response as the `set_v` **code**
(not the wattage), and the resulting power as `mdp_w`. The codes map to the
rated powers as follows:

| `set_v` | Rated power |
|-----|-------------|
| 0 | Device default: 2500 W on a Venus C/D/E with recent firmware; 800 W on older firmware or on a Venus A below control v148 / inverter v118, 1500 W on a Venus A at or above those versions, and 600 W on the Swiss (`…CH-0`) variants |
| 1 | 800 W |
| 2 | 600 W |
| 3 | 2200 W |
| 4 | 1200 W |
| 5 | 1500 W |
| 6 | 2300 W |
| 7 | 2000 W |
| 8 | 3000 W |
| 9 | 3600 W |

Note that code `0` is **not** the 800 W version — observed device dumps report
`set_v=0` alongside `mcp_w=2500,mdp_w=2500`, `set_v=1` alongside `mdp_w=800`,
and `set_v=4` alongside `mdp_w=1200`.

## 12 Set maximum charging power

### 12.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=16,cp=[0,2500]
```

### 12.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

## 13 Set maximum discharge power

The maximum discharge power is not a separate setting: it follows the power
version, so it is changed with the same `cd=15,vs=<watts>` command as
[Set version](#11-set-version) and read back as `mdp_w`. (Only the maximum
*charging* power, `mcp_w`, is independently adjustable — see
[Set maximum charging power](#12-set-maximum-charging-power).)

## 14 Set the meter type and supplementary power type

### 14.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=15,meter=0` - ct
2. `cd=15,meter=1` - shelly pro
3. `cd=15,meter=2` - p1 meter
4. `cd=15,dchrg=0` - single-phase
5. `cd=15,dchrg=1` - three-phase

Newer firmware uses `cd=18` for the same purpose. Set the recharge phase with
`cd=18,dchrg=0` (single-phase) or `cd=18,dchrg=1` (three-phase), and set the
external meter type with `cd=18,meter=<code>,mac=<mac>`:

| meter code | Meter type | MAC |
| --- | --- | --- |
| 0 | CT001 | not required (`000000000000`) |
| 1 | Shelly Pro 3EM | fixed `000000000000` |
| 3 | CT002 | required |
| 4 | CT003 | required |
| 5 | Shelly EM Gen3 | required |
| 6 | Shelly Pro EM50 | required |

## 15 Obtain CT power

### 15.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=19
```

### 15.2 Receive

You will receive a message:
```
get_power=%d|%d|%d|%d|%d (A-phase power | B-phase power | C-phase power | three-phase total power | output power) Unit: W
```

## 16 Upgrade the firmware of the FC4 module

### 16.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=20,le=%d,url=%s
```

Description of the above parameters:

| Key | Description |
|-----|-------------|
| cd | Instruction identification |
| le | URL length |
| url | Download path |

### 16.2 Receive

If the device receives the message correctly, it will return `ret=1`. If it does not receive the message, there will be no return.

## 17 Set depth of discharge

### 17.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=56,dod=%d
```

Description of the above parameters:

| Key | Description |
|-----|-------------|
| cd | Instruction identification |
| dod | Depth of discharge (%) (configurable 30-88% in the Marstek app; the maximum of 88% is encoded as 0) |

This command does not produce a response. On newer firmware (e.g. Venus D
v147) the value is reported back as-is, e.g. `cd=56,dod=84` sets the depth of
discharge to 84%.

The current depth of discharge is reported as the `dod` field in the device information (see [Read device information](#3-read-device-information)).

## 18 Enable surplus feed-in

Enables/disables surplus feed-in (feeding excess PV power into the grid) on
Venus A and Venus D.

### 18.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=43,full_d=1` - Enable surplus feed-in
2. `cd=43,full_d=0` - Disable surplus feed-in

### 18.2 Receive

You will receive a message echoing the resulting state:
1. `cd=43,ret=1` - Surplus feed-in is now enabled
2. `cd=43,ret=0` - Surplus feed-in is now disabled

> Note: unlike most other commands (where `ret=1` means "success" and `ret=0`
> means "failure"), here `ret` echoes the new state of the setting.

The current surplus feed-in state is also reported in the first component of the
`fu` field of the `cd=1` response (`fu=1|0` when enabled, `fu=0|0` when disabled).

## 19 Configure the local API

Enables/disables the device's local API (used by tools such as the Marstek
local Modbus/UDP integrations) and configures its port.

### 19.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=30,api=1,port=30000` - Enable the local API on the given port
2. `cd=30,api=0,port=30000` - Disable the local API

Description of the above parameters:

| Key | Description |
|-----|-------------|
| cd | Instruction identification |
| api | Local API enabled (0: disabled; 1: enabled) |
| port | Local API port (e.g. 30000) |

The current local API state and port are reported as the `api` and `port`
fields in the device information.

> Note: this command does not produce a response.

## 20 Start phase diagnosis

Triggers the phase-detection ("Phase Diagnose") routine, which determines which
grid phase the device is connected to (reported as `phase_t`). This behaves like
a button: it has no parameters and produces no response.

### 20.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=18,seq_check
```

> Note: `cd=18` is also used to set the meter type and recharge phase (see
> [Set the meter type and supplementary power type](#14-set-the-meter-type-and-supplementary-power-type)). The `seq_check` sub-command starts phase diagnosis instead.

## 21 Pre-update check

Observed on a Venus D when pressing the firmware "update" button, before
confirming the update dialog. It appears to be a pre-check that reports whether
an update can be performed.

### 21.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=51
```

### 21.2 Receive

Example response observed on a Venus D:
```
cd=51,state=0,way=0,net=1,type=0,mod=1,cnt=0
```

The exact meaning of the fields has not been confirmed. Based on the context
(an OTA pre-check) the following is an educated guess and should be treated as
**speculative**:

| Key | Likely meaning (unconfirmed) |
|-----|-------------|
| state | Update/check state (0: idle/ready) |
| way | Update method/channel |
| net | Network reachability for OTA (1: online/reachable) |
| type | Update or device type |
| mod | Module to update / module flag |
| cnt | Counter (e.g. retries or available updates; 0 observed) |

## 22 Start an OTA update

Triggers a firmware OTA update over MQTT. This is a two-step sequence: first
push the image metadata for each module with `cd=53`, then start the actual
update with `cd=54`.

### 22.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

**Step 1 — push image metadata (`cd=53`):**

```
cd=53,num=2,type2=VNSD,mod2=2,size2=372736,crc2=42516,ver2=147,len2=<url length>,url2=<control image URL>,type1=VNSD,mod1=1,size1=115712,crc1=9636,ver1=115,len1=<url length>,url1=<micro image URL>
```

`num` is the number of images included; the remaining parameters are repeated
per image with a 1-based index suffix (`type1`/`mod1`/... for image 1,
`type2`/`mod2`/... for image 2, etc.):

| Key | Description |
|-----|-------------|
| num | Number of images included |
| type*N* | Device type prefix (e.g. `VNSD`) |
| mod*N* | Target module (observed: `1` = micro/inverter, `2` = control/MCU) |
| size*N* | Image size in bytes |
| crc*N* | Image CRC checksum |
| ver*N* | Firmware version contained in the image |
| len*N* | Length of the URL string |
| url*N* | Download URL of the firmware image |

The image metadata matches the firmware OTA API (the `data.control` and
`data.micro` objects map to the `mod=2` and `mod=1` images respectively):

```json
{
  "code": 1,
  "msg": "success",
  "data": {
    "control": {
      "mcu_type": "control",
      "type": "VNSD-0",
      "url": "<control image URL>",
      "version": 147,
      "crc": "42516",
      "size": 372736,
      "force_update": "N"
    },
    "micro": {
      "mcu_type": "micro",
      "type": "VNSD-0",
      "url": "<micro image URL>",
      "version": 115,
      "crc": "9636",
      "size": 115712,
      "force_update": "N"
    }
  }
}
```

**Step 2 — start the update (`cd=54`):** send immediately after `cd=53`.

```
cd=54,start
```

### 22.2 Receive

After `cd=53` the device acknowledges with the number of images accepted:
```
cd=53,ret=2
```
(`ret` matches the `num` value when all images are accepted.)

After `cd=54` the device confirms the update has started:
```
cd=54,ret=1
```
1. `ret=0` - Failed to start
2. `ret=1` - Update started

> Warning: this initiates a real firmware flash. Use known-good image URLs,
> CRCs and sizes (e.g. from the official OTA API) for the correct device type.

## 23 Read network information

Returns the device's current network configuration. Observed on Venus D v147.

### 23.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=26
```

### 23.2 Receive

```
cd=26,dev_net_info:ip:192.168.178.134,gate:192.168.178.1,mask:255.255.255.0,dns:192.168.178.1,ct_connect_ip:192.168.178.255
```

Note the unusual format: after `cd=26,` the payload is a `dev_net_info:`
prefix followed by colon-separated `key:value` pairs (comma-separated).

| Key | Description |
|-----|-------------|
| ip | Device IP address |
| gate | Gateway address |
| mask | Subnet mask |
| dns | DNS server address |
| ct_connect_ip | Address used to reach the CT/meter (a broadcast address in the example) |

## 24 Read BMS pack details

Returns per-pack details for the connected battery packs. Observed on Venus D
v147.

### 24.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=42,bms_idx=255
```

`bms_idx=255` appears to request all packs.

### 24.2 Receive

```
cd=42, BMS: num=2,mask=3,idx=2,charge_pow=2643,discharge_pow=2643,soc1=424,state1=0,temp1=278,soc2=482,state2=2,temp2=254,soc3=0,state3=0,temp3=0,soc4=0,state4=0,temp4=0,soc5=0,state5=0,temp5=0,soc6=0,state6=0,temp6=0
```

| Key | Description |
|-----|-------------|
| num | Number of battery packs present |
| mask | Bitmask of present packs (bit 0 = pack 1, bit 1 = pack 2, ...; `3` = packs 1 & 2) |
| idx | *(unconfirmed)* pack index / count |
| charge_pow | Allowed charge power (W) |
| discharge_pow | Allowed discharge power (W) |
| soc*N* | Pack *N* state of charge (0.1%; `424` = 42.4%) |
| state*N* | Pack *N* working state *(unconfirmed: 0 = idle, 2 = charging, mirrors `cel_s`)* |
| temp*N* | Pack *N* temperature (0.1 °C; `278` = 27.8 °C) |

Fields are reported for up to 6 packs (`*1` … `*6`); unused packs report zeros.
The `num`/`mask`/`idx` values match the `pack` field in the `cd=1` response.

### 24.3 Per-pack detail (`bms_idx=N`)

Requesting a specific index (`bms_idx=N`, `N >= 1`) returns detailed data for a
single pack, including individual cell voltages and temperature sensors.

The Venus unit is only a controller and has no battery of its own; all packs are
identical. `bms_idx=0` returns a whole-system aggregate (no per-cell data; it
reports system-wide fields such as `num`/`mask`). `bms_idx=N` (`N >= 1`) returns
the per-cell detail for one pack and maps to **pack `N+1`**: `bms_idx=1` is the
second pack ("Pack 2"). The first pack's individual cells are reported by the
`cd=14` BMS-info response instead. A pack only returns data when its present-pack
bit is set in the `mask` above (`bms_idx=N` ↔ bit `N`); absent indices report all
zeros.

A Venus A supports up to 5 battery packs and a Venus D up to 6. Since the first
pack is read via `cd=14`, the remaining packs occupy `bms_idx=1..4` (Venus A) or
`bms_idx=1..5` (Venus D).

Payload:
```
cd=42,bms_idx=1
```

Receive (real Venus D v147 response):
```
cd=42, BMS(1): num=2,vol=5327,cur=0,soc=708,c_vol=576,c_cur=500,d_cur=500,mos=0,ver=116,max_v=3331,min_v=3329,max_t=258,min_t=254,b_err1=0,b_err2=0,b_war1=0,b_vol=3330|3330|3330|3330|-|3330|3331|3329|3330|-|3329|3329|3329|3330|-|3329|3330|3329|3329,temp=258|257|254|255|256,env=314,mos=259
```

| Key | Description |
|-----|-------------|
| vol | Pack voltage (centivolts; `5327` = 53.27 V) |
| soc | Pack state of charge (0.1%; `708` = 70.8%) |
| ver | BMS firmware version |
| max_v / min_v | Highest / lowest cell voltage (mV) |
| max_t / min_t | Highest / lowest temperature (0.1 °C on Venus A/D) |
| b_vol | Individual cell voltages (mV), pipe-separated; cells are grouped in fours separated by `-` |
| temp | Temperature sensors (0.1 °C on Venus A/D), pipe-separated |
| env | Ambient temperature (0.1 °C on Venus A/D) |
| mos | MOSFET temperature (0.1 °C on Venus A/D) |

Other observed keys (`cur`, `c_vol`, `c_cur`, `d_cur`, `b_err*`, `b_war*`) are
not yet decoded.

## 25 Read power history

Returns recent power-curve samples. Observed on Venus D v147.

### 25.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=29,num=15
```

`num` is the number of samples to return.

### 25.2 Receive

```
cd=29,p1=[801,...],p2=[0,...],p3=[686,...],p4=[694,...],p5=[803,...],p6=[809,...],p7=[-502,...]
```

The response contains seven series (`p1` … `p7`), each an array of `num`
values. The exact meaning of each series has **not been confirmed**; from
context they appear to be a recent history of the various power readings (PV
inputs, battery, grid and output power), with the most recent sample first.

## 26 Enable/disable the status LED

Turns the device's status LED on or off. Observed on Venus D v147.

### 26.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=59,led=0` - Turn the LED off
2. `cd=59,led=1` - Turn the LED on

### 26.2 Receive

The device echoes the resulting state:
1. `cd=59,ret=0` - LED is now off
2. `cd=59,ret=1` - LED is now on

The current LED state is reported as the `led` field in the `cd=1` response.

## 27 Configure Bluetooth advertising

Enables or disables the device's Bluetooth (BLE) advertising. When advertising
is disabled the device is no longer discoverable over Bluetooth (a "Bluetooth
lock"). Observed on Venus D v147.

### 27.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=55,adv=1` - Enable Bluetooth advertising (discoverable)
2. `cd=55,adv=0` - Disable Bluetooth advertising (lock)

### 27.2 Receive

The device echoes the resulting state:
1. `cd=55,ret=1` - Advertising enabled (discoverable; Bluetooth lock off)
2. `cd=55,ret=0` - Advertising disabled (Bluetooth lock on)

The current state is also reflected in the `ble` field of the `cd=1` response: it
is a bitmask where bit 2 (value `4`) is set when advertising is enabled
(Bluetooth lock off), and `1` when the lock is enabled.

## 28 Configure peak shaving

Peak shaving caps how much power the device draws from the grid, for regions
that limit the grid connection. Supported from control firmware v150 on the
Venus D and Venus E (`VNSD`/`VNSE3`); older firmware neither accepts the command
nor reports the two status fields.

### 28.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=63,as=1,vv=2000` - Enable peak shaving and cap grid draw at 2000 W
2. `cd=63,as=0` - Disable peak shaving

Description of the above parameters:

| Key | Description |
|-----|-------------|
| cd | Instruction identification |
| as | Enable (0: disable; 1: enable) |
| vv | Peak power cap in watts. Only sent when enabling; the Marstek app defaults it to 2000 W and does not enforce an upper bound of its own |

### 28.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

The current state is reported in the `cd=1` response as `peak_status` (0/1) and
`peak_power` (the cap, in watts).

## 29 Configure parallel operation

Links several units into one group so they operate in parallel, for a higher
combined output than a single unit can deliver.

This is a wiring-level change, not a software setting: the units have to be
physically cabled together, and the command only tells them to run in that
configuration. The Marstek app exposes it under *Parallel Mode Control*, behind
a "⚠️ Parallel Connection Safety Notice", and the warnings it shows are worth
repeating verbatim:

> - This function involves high-voltage output. Please ensure correct wiring.
> - Check all device wiring before operation.
> - Improper operation may cause device damage. Please proceed with caution.
> - For all devices in the group, please follow the app instructions carefully.
> - In parallel mode, the Backup Power function will be unavailable.
> - For your safety, do not operate under load!
> - Do not operate unless you are a qualified professional!

The order of operations matters, and differs between enabling and disabling:

- **Enabling**: enable parallel mode first, then power off and reconnect all the
  wiring ("After enabling parallel mode, power off before reconnecting all
  wiring. Do not operate under load!").
- **Disabling**: power off every device in the group and remove the wiring
  *first*, then disable parallel mode ("Before disabling parallel mode, power
  off all devices in the group and disconnect wiring. Do not operate under load!
  After removing all wiring, use the app to turn off parallel mode.").

While a group is in off-grid parallel mode the backup/EPS function is refused
with "This device is currently in off-grid parallel mode. This function is
unavailable." — so parallel operation and [the backup function](#10-enable-eps-function)
are mutually exclusive.

### 29.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=23,pm=0` - Turn parallel mode off
2. `cd=23,pm=1` - Run the wiring check
3. `cd=23,pm=2` - Turn parallel mode on

The app's own flow is to run the wiring check (`pm=1`) first and only send
`pm=2` once it passes.

### 29.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

The current state is reported in the `cd=1` response as the `par` field, using
the same values (0: turned off; 1: wiring check; 2: turned on). Units that do
not support parallel operation report `255`.

The `pm=1` "wiring check" is the app's own verification step, shown as *Wiring
Check* in the status line; the app runs it and asks the user to follow the
on-screen instructions before it sends `pm=2`.
