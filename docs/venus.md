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
Venus currently has the following type: HMG-x, like HMG-1.

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
cd=16,cp=[300,2500]
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
