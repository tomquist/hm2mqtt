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
    3. [Extended runtime fields (newer firmware)](#33-extended-runtime-fields-newer-firmware)
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
    1. [Public](#131-public)
    2. [Receive](#132-receive)
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
18. [Read BMS information](#18-read-bms-information)
19. [Additional message types](#19-additional-message-types)
20. [Additional commands](#20-additional-commands)

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
| wor_m | Working mode (0: Automatic; 1: Manual operation; 2: Trading) |
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
| set_v | Version set (0: 2500W version; 1: 800W version) |
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

### 3.3 Extended runtime fields (newer firmware)

Newer Venus firmware (e.g. Venus D, communication module `fc_v=202409090159`)
appends a number of additional fields to the `cd=01` response. They are emitted
in the order below, immediately after `c_ratio`. Not every variant emits every
field; clients should treat each field as optional and key on its name rather
than its position.

Fields are marked **(confirmed)** where the meaning is well established, and
**(inferred)** where the field name strongly implies the meaning but it has not
been fully verified.

| Key | Description |
|-----|-------------|
| seq_s | Status/self‑test sequence indicator. **(inferred)** |
| ctrl_r | EMS control rate; governs how the device tracks the CT/meter reading. Pairs with `c_ratio`. **(confirmed)** |
| par | Parallel‑machine (multi‑unit) enable/status. `255` = feature not configured/unavailable. Written by the *set parallel machine* command. **(confirmed)** |
| gen | Generator‑input enable/status. `255` = feature not configured/unavailable. Written by the *set generator* command. **(confirmed)** |
| ble | Bluetooth‑LE advertising / SDV state. Written by the *set BLE adv/SDV* command. **(confirmed)** |
| c_ratio | EMS control ratio in percent (e.g. `90` = 90%). Pairs with `ctrl_r`. **(confirmed)** |
| udp | Local UDP service enabled (0: off; 1: on). **(confirmed)** |
| api | Local HTTP API enabled (0: off; 1: on). Only present when the firmware supports the local API (`dev_n` ≥ 153). **(confirmed)** |
| net | Active network interface/mode (observed `1`; the device can run over Wi‑Fi or, on Ethernet‑equipped units, a wired interface). **(inferred)** |
| port | Local HTTP API TCP port (e.g. `48977`). **(confirmed)** |
| inv_v | Inverter (micro‑inverter) firmware version number, analogous to `bms_v`/`dev_n`. **(confirmed)** |
| id | Battery‑pack / stacked‑unit identifiers `id0\|id1\|id2\|id3\|id4` (up to 5 packs; the first value is the connected‑pack count, e.g. `2\|0\|0\|0\|0`). **(inferred)** |
| lk | BMS lock state (0: unlocked; 1: locked). Written by the *lock BMS* command. **(confirmed)** |
| bp | Backup reserved State of Charge in percent (battery level held in reserve for EPS/backup; observed `99`). **(inferred)** |
| ei | Event‑log identifier bitmask, 64‑bit hexadecimal (`0` = no events). **(confirmed)** |
| eb | Error/warning bitmask, 32‑bit hexadecimal (`0` = none). **(confirmed)** |
| rp | Real (output) power in W (tracks the combined inverter output; observed `107` alongside `pv1=1076` ≙ 107.6 W). **(inferred)** |
| gp | Grid power in W. **(inferred)** |
| vp | Auxiliary power reading in W. **(inferred)** |
| mppt | Total MPPT / solar‑charger input power (W) on models with a built‑in charger. **(inferred)** |
| pack | Battery‑pack status vector `%d\|%d\|%d\|%d` (pack count / per‑pack present flags, e.g. `1\|1\|1\|0`). **(inferred)** |
| pv | PV summary pair `%d\|%d` (e.g. `41\|57`). **(inferred)** |
| fu | Full‑charge / firmware‑update state pair `%d\|%d` (e.g. `1\|0`). **(inferred)** |
| em | Economy‑mode / energy‑management state (0: off). **(inferred)** |
| bl | Cell‑balancing state. **(inferred)** |
| bl_p | Companion value to `bl`. **(inferred)** |
| led | Front LED indicator state (1: on; 0: off). Written by the *set LED* command. **(confirmed)** |
| as | Auto‑/AI‑strategy enable. **(inferred)** |

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
| md | Working mode (0: Automatic; 1: Manual operation; 2: Trading) |
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
| md | Working mode (0: Automatic; 1: Manual operation; 2: Trading) |
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

### 10.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

## 11 Set version

### 11.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=15,vs=800` - Set up 800W version
2. `cd=15,vs=2500` - Set up 2500W version

### 11.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

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

### 13.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
1. `cd=15,vs=800` - Set up 800W version
2. `cd=15,vs=2500` - Set up 2500W version

### 13.2 Receive

You will receive a message with a ret value:
1. `ret=0` - Setting failed
2. `ret=1` - Setting successful

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

The current depth of discharge is reported as the `dod` field in the device information (see [Read device information](#3-read-device-information)).

## 18 Read BMS information

### 18.1 Public

Topic:
```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:
```
cd=14
```

### 18.2 Receive

You will receive a message, such as:

```
b_ver=212,b_chv=571,b_rci=1000,b_rdi=1000,b_soc=65,b_soh=100,b_cap=5120,b_vol=5223,b_cur=-94,b_tem=250,b_chf=192,b_slf=0,b_cpc=332,b_err=0,b_war=0,b_ret=102482070,b_ent=0,b_mot=23,b_tp1=18,b_tp2=19,b_tp3=18,b_tp4=19,b_vo1=3265,...,b_vo16=3262
```

Description of the above parameters:

| Key | Description |
|-----|-------------|
| b_ver | BMS firmware version number |
| b_chv | Charge voltage limit (0.1V, e.g. `571` = 57.1V) |
| b_rci | Rated/limit charge current (mA, e.g. `1000`). **(inferred)** |
| b_rdi | Rated/limit discharge current (mA, e.g. `1000`). **(inferred)** |
| b_soc | State of charge (%) |
| b_soh | State of health (%) |
| b_cap | Battery capacity (Wh) |
| b_vol | Battery pack voltage (0.01V, e.g. `5223` = 52.23V) |
| b_cur | Battery current (mA, signed; positive = charge) |
| b_tem | Battery temperature (0.1°C on VNSA/VNSD, 1°C on other variants) |
| b_chf | Full‑charge capacity flag/value |
| b_slf | Self‑check / state‑of‑life flag (observed `0`). **(inferred)** |
| b_cpc | Cell cycle count |
| b_err | Error code |
| b_war | Warning code |
| b_ret | Total runtime (s) |
| b_ent | Energy throughput |
| b_mot | MOSFET temperature (0.1°C on VNSA/VNSD, 1°C on other variants) |
| b_tp1…b_tp4 | Cell‑group temperatures (0.1°C on VNSA/VNSD, 1°C otherwise) |
| b_vo1…b_vo16 | Per‑cell voltages (mV); unused cells report `0` |

> Note: `b_rci`, `b_rdi` and `b_slf` are reported by the device but are not yet
> parsed by hm2mqtt.

## 19 Additional message types

Newer Venus firmware emits several further response messages. Each is a
comma‑separated `key=value` payload published on the device topic, the same way
as the messages above.

### 19.1 CT / meter power (`cd=19`)

In addition to the documented `get_power=%d|%d|%d|%d|%d` reply, the device also
emits a detailed meter reading:

```
cd=19, meter: type=%d,real_tol_power=%d,real_power1=%d,real_power2=%d,real_power3=%d,err_flag=%d
```

| Key | Description |
|-----|-------------|
| type | Meter type (matches `ct_t`) |
| real_tol_power | Total real power across all phases (W) |
| real_power1..3 | Per‑phase real power, A/B/C (W) |
| err_flag | Meter error flag |

### 19.2 Self‑control power

```
cd=%d,selfctl_power=%d
```

Echoes the self‑consumption control set‑point (W) written by the *set selfctl
power* command.

### 19.3 MPPT data

```
cd=%d, vns: pow=%d,time=%d; mppt: vol=%d,pow=%d,time=%d
```

Reports the inverter (`vns`) and solar‑charger (`mppt`) instantaneous
power/voltage and the timestamp of each reading. (`vol` in 0.1V, `pow` in W.)

### 19.4 AI strategy

```
AI%d=%d|%d|%d|%d|%d.
```

One line per strategy slot: `AI<index>=<enabled>|<v1>|<v2>|<v3>|<v4>`, returned in
response to the *get AI strategy* command.

### 19.5 Event and error logs

```
event%d=%d|%d|%d|%d|%d|%d|%d.
err%d=%d|%d|%d|%d|%d|%lld.
```

Up to 20 entries each, returned for the *get event log info* / *get err code
info* commands. The aggregated event identifiers/bitmasks are also surfaced in
the runtime info as `ei` (64‑bit) and `eb` (32‑bit).

### 19.6 P1 / multi‑meter snapshot

```
cd=%d,p1=[...],p2=[...],p3=[...],p4=[...],p5=[...],p6=[...],p7=[...]
```

Raw per‑channel meter samples used when a P1/Shelly meter is configured.

### 19.7 Other request/response payloads

Further `key=value` payloads observed on the device topic. Each is the reply to
(or echo of) the corresponding command; `cd` echoes the request opcode.

| Payload | Meaning |
|---------|---------|
| `cd=%d,ret=%d` | Generic acknowledgement (`ret=1` success, `ret=0` failure). |
| `cd=%d,err_cmd` / `cd=%d,%s` | Unknown/invalid command response. |
| `cd=%d,md=%d` | Working‑mode echo (`md` = 0 auto / 1 manual / 2 trading). |
| `cd=%d,md=%d,nl=%d` | Manual/economy‑mode info (`md` mode, `nl` slot count). |
| `cd=%d,%d-%d-%d %d:%d:%d` | Device time read‑back (`Y-M-D h:m:s`). |
| `cd=%d,data:%s` | Generic topic/data passthrough. |
| `cd=%d,uid=%s` | Device UID. |
| `cd=%d,boot_v=%d` | Bootloader version. |
| `cd=%d,http_data_cnt=%d,time_no=%d,time:%d-%d-%d %d:%d:%d` | Cloud/HTTP data status (record count + timestamp). |
| `cd=%d,ip=%s` | P1/Shelly meter IP address (get/set reply). |
| `cd=%d,ret=%d,port=%d` | Local‑API enable reply, carrying the active `port`. |
| `cd=%d,dev_net_info:%s,ct_connect_ip:%s` | Device network info and the CT/meter connection IP. |
| `cd=%d,state=%d,way=%d,net=%d,type=%d,mod=%d,cnt=%d` | Connection/topic status (link state, connection `way`, `net` interface, server `type`, module, retry `cnt`). |
| `cd=%d,jp=%d` | Device "jump" control echo (switch server / redirect; `jp`). |
| `cd=%d,bms_ver=%d\|%d\|%d\|%d\|%d\|%d\|%d\|%d` | Per‑pack BMS versions for up to 8 stacked packs. |
| `cd=%d,vid=%s,id=%d,flg=%d,crc=%d` | Configured VID record (vendor/config id, flags, CRC). |
| `cd=%d,selfctl_power=%d` | Self‑control power set‑point echo (see 19.2). |

## 20 Additional commands

The device recognises a number of commands beyond those documented above. The
`cd=` opcodes for these are not yet confirmed and are therefore omitted rather
than guessed; the request/response payloads are given where known.

| Capability | Payload / notes |
|------------|-----------------|
| Set working mode | Echoes `cd=%d,md=%d` (also `md,nl` for manual/economy). |
| Set parallel machine | Enables/disables multi‑unit parallel operation (`par`). |
| Set generator | Enables/disables generator input (`gen`). |
| Set BLE advertising / SDV | Controls Bluetooth advertising (`ble`). |
| Set / lock BMS | Locks/unlocks the BMS (`lk`); also `set stack bms`. |
| Set LED | Turns the front LED on/off (`led`, `1:OPEN 0:Close`). |
| Set self‑control power | Sets the self‑consumption set‑point; replies `cd=%d,selfctl_power=%d`. |
| Get / set AI strategy | Reads/writes the AI scheduling strategy; replies `AI%d=…` (see 19.4). |
| Set economy mode | Enables current‑protection / economy mode (`cur_protect_en`). |
| Set develop mode | Toggles developer mode. |
| Set work‑mode auto change | Auto‑switches work mode based on the CT signal (`cts_m`). |
| Set HTTP server type | Selects the cloud/HTTP server (`htt_p`). |
| Get / set meter IP | Reads/writes the P1/Shelly meter IP; replies `cd=%d,ip=%s`. |
| Set device jump control | Server‑switch / redirect; echoes `cd=%d,jp=%d`. |
| Get device IP / net info | Replies `cd=%d,dev_net_info:%s,ct_connect_ip:%s`. |
| Get topic / connection status | Replies `cd=%d,state=%d,way=%d,net=%d,type=%d,mod=%d,cnt=%d`. |
| Get / set EMS control info | Reads/writes the EMS control parameters (`ctrl_r`, `c_ratio`). |
| Get BMS version (stacked) | Replies `cd=%d,bms_ver=%d\|…` (up to 8 packs). |
| Get/set VID info | Replies `cd=%d,vid=%s,id=%d,flg=%d,crc=%d`. |
| Get UID / boot version | Replies `cd=%d,uid=%s` / `cd=%d,boot_v=%d`. |
| Get event log / err code | Returns the logs in 19.5. |
| Get MPPT data | Returns the message in 19.3. |
| Get now‑power data | Returns the current power snapshot. |
| FC4 / MPPT OTA | `set ota url/start`, `get ota state/info` for module firmware updates. |

> These are recorded here for completeness; only a subset is currently
> implemented by hm2mqtt.
