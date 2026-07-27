# Smart Meter MQTT Document

Covers the Marstek smart meters and smart meter readers:

- **CT002** — the three-phase smart meter, sold as the CT002, the CT002-CN and the TPM2-100CT
- **CT003** — the smart meter reader, sold as the Marstek CT003 Smart Meter Reader (model code `SMR-W/C`), in P1, infrared and TIC variants

Both families share most of their protocol. Where they differ, the section says so.

## Table of Contents

1. [Device types](#1-device-types)
2. [Subscribe to your device](#2-subscribe-to-your-device)
3. [Read device information](#3-read-device-information)
   1. [Public](#31-public)
   2. [Receive](#32-receive)
4. [Read the per-phase charge and discharge counters](#4-read-the-per-phase-charge-and-discharge-counters)
   1. [Public](#41-public)
   2. [Receive](#42-receive)
5. [Set the phase measurement direction](#5-set-the-phase-measurement-direction)
   1. [Public](#51-public)
   2. [Receive](#52-receive)
6. [Configure the connected smart meter](#6-configure-the-connected-smart-meter)
   1. [Public](#61-public)
7. [Read slave device information](#7-read-slave-device-information)
   1. [Public](#71-public)
   2. [Receive](#72-receive)
8. [Restore factory settings](#8-restore-factory-settings)
   1. [Public](#81-public)
9. [Hardware reset](#9-hardware-reset)
   1. [Public](#91-public)
10. [Read connection information](#10-read-connection-information)
    1. [Public](#101-public)
    2. [Receive](#102-receive)
11. [Bound inverter information](#11-bound-inverter-information)
    1. [Public](#111-public)

## 1 Device types

| Device type | Family | Sold as |
| --- | --- | --- |
| `HME-2`, `HME-4` | CT002 | Marstek CT002 |
| `TPM-CN` | CT002 | Marstek CT002-CN |
| `TPM2-0` | CT002 | Marstek TPM2-100CT |
| `HME-3`, `HME-5` | CT003 | Marstek CT003 Smart Meter Reader |
| `SMR-0` | CT003 | CT003, P1 variant |
| `SMR-1` | CT003 | CT003, infrared variant |
| `SMR-2` | CT003 | CT003, TIC variant (France) |

> **Note:** `HME-3` and `HME-5` belong to the CT003 family despite the `HME`
> prefix they share with the CT002 device types.

## 2 Subscribe to your device

Before sending/receiving messages in MQTT, you must subscribe to your device using the following command:

```
hame_energy/{type}/device/{uid or mac}/ctrl
```

The parameters that need to be filled in the command include your device type, device ID or MAC.

Commands are published to:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

## 3 Read device information

### 3.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=1
```

### 3.2 Receive

You will receive a message, such as:

```
pwr_a=119,pwr_b=15,pwr_c=-136,pwr_t=-1,ble_s=5,wif_r=-79,fc4_v=202409090159,ver_v=119,wif_s=2,slv_n=1,cur_d=0
```

Description of the above parameters:

| Field | Description |
| --- | --- |
| `pwr_a` | Phase A power, in W |
| `pwr_b` | Phase B power, in W |
| `pwr_c` | Phase C power, in W |
| `pwr_t` | Total power, in W |
| `ble_s` | Bluetooth signal |
| `wif_r` | Wi-Fi RSSI, in dBm |
| `wif_s` | Wi-Fi status |
| `fc4_v` | FC41D firmware version |
| `ver_v` | Firmware version |
| `slv_n` | Number of attached slave devices. See [section 7](#7-read-slave-device-information) |
| `cur_d` | Measurement direction bitmask, one bit per phase. See [section 5](#5-set-the-phase-measurement-direction). The CT002 also accepts this field under the name `cur_dir` |
| `eth_f` | Unknown |
| `eep_f` | Unknown |

The CT003 additionally reports:

| Field | Description |
| --- | --- |
| `eng_t` | Total energy, in 0.1 Wh. This is a net reading (import minus export) and can therefore decrease as well as increase |
| `smt_n` | Number identifying the configured smart meter model. See [section 6](#6-configure-the-connected-smart-meter) |
| `har_f` | P1 device connected |
| `sof_f` | P1 read status |
| `irs_f` | Infrared read status |
| `pwr_f` | Phase read status, a bitmask with one bit per phase |
| `com_t` | Interface type of the connected smart meter (unconfirmed) |
| `com_b` | Baud rate of the connected smart meter (unconfirmed) |
| `ptl_t` | Protocol type of the connected smart meter (unconfirmed) |

The CT002 accepts an `eng_t` field but does not use it; it reports its energy
through [section 4](#4-read-the-per-phase-charge-and-discharge-counters) instead.

## 4 Read the per-phase charge and discharge counters

CT002 only. These counters are not part of the `cd=1` payload.

### 4.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=19
```

### 4.2 Receive

You will receive a message, such as:

```
ca=100,cb=200,cc=300,da=10,db=20,dc=30
```

Description of the above parameters:

| Field | Description |
| --- | --- |
| `ca` | Phase A charge counter |
| `cb` | Phase B charge counter |
| `cc` | Phase C charge counter |
| `da` | Phase A discharge counter |
| `db` | Phase B discharge counter |
| `dc` | Phase C discharge counter |

> **Note:** The unit and scale of these six counters is unknown. Other Marstek
> energy fields are reported in 0.1 Wh, but that has not been confirmed for
> these.

A `cd=19` message that carries a `ret` field is the acknowledgement of a write
rather than a reading:

1. `ret=0` — Setting failed
2. `ret=1` — Setting successful

## 5 Set the phase measurement direction

Inverts the direction in which a phase is measured. The device takes all three
phases at once as a bitmask:

| Bit | Phase |
| --- | --- |
| 0 (value 1) | Phase A |
| 1 (value 2) | Phase B |
| 2 (value 4) | Phase C |

A set bit means that phase is measured in reverse. The same bitmask is reported
as the `cur_d` field in the device information, so the current setting can be
read back before changing a single phase.

### 5.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

1. `cd=5,p1={mask}` — for every device type except `TPM2-*`
2. `cd=5,dir={mask}` — for `TPM2-*`

For example, `cd=5,p1=5` reverses phases A and C and leaves phase B as measured.

> **Note:** On the CT003 family, `cd=5` configures the connected smart meter
> instead — see [section 6](#6-configure-the-connected-smart-meter). Do not send
> the direction command to a CT003.

### 5.2 Receive

You will receive a `cd=5` message carrying the resulting bitmask.

## 6 Configure the connected smart meter

CT003 only. Selects which smart meter the reader is attached to.

### 6.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=5,p1={interfaceType},p2={baudRate},p3={protocolType},p4={meterNum}
```

| Parameter | Description |
| --- | --- |
| `p1` | Interface type. `0` = infrared, `4` = TIC, otherwise P1 |
| `p2` | Baud rate |
| `p3` | Protocol type |
| `p4` | Meter number, identifying the meter model |

The four values come from Marstek's smart meter catalogue, which the app
retrieves from the cloud. The selected meter number is reported back as the
`smt_n` field in the device information.

## 7 Read slave device information

Queried once per slave device when the device information reports `slv_n`
greater than zero.

### 7.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=4,p1={index}
```

`{index}` is the zero-based index of the slave device.

### 7.2 Receive

You will receive a message containing:

| Field | Description |
| --- | --- |
| `slv_id` | Slave device ID |
| `slv_ip` | Slave device IP address |
| `slv_t` | Slave device type |
| `slv_p` | Slave device port |

## 8 Restore factory settings

### 8.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=11
```

## 9 Hardware reset

### 9.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=8
```

## 10 Read connection information

### 10.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=51
```

### 10.2 Receive

You will receive a message containing `state`, `way`, `net`, `type`, `mod` and
`cnt` fields, describing how the device is currently connected.

`cd=51` is also the first step of an over-the-air firmware update, which
continues with `cd=52,clr={n}` (prepare), `cd=53,num={n}` (connect) and
`cd=54,start` (start).

## 11 Bound inverter information

`TPM-CN` only.

### 11.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

1. `cd=14` — Read the list of bound inverters
2. `cd=16` — Read the details of a bound inverter
3. `cd=17` — Read a bound inverter's ID
