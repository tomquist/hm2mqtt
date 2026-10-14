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
12. [Read voltage and current](#12-read-voltage-and-current)
    1. [Public](#121-public)
    2. [Receive](#122-receive)
13. [Read the per-phase energy](#13-read-the-per-phase-energy)
    1. [Public](#131-public)
    2. [Receive](#132-receive)
14. [Other commands](#14-other-commands)

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

The `TPM-CN`, `TPM2-0` and `SMR` meters, the `HME-2` and `HME-4` from firmware
119 and the `HME-3` and `HME-5` from firmware 116 use `marstek_energy` topics.
They publish on:

```
marstek_energy/{type}/device/{id}/ctrl
```

and take commands on:

```
marstek_energy/{type}/App/{id}/ctrl
```

`{type}` is the device type, e.g. `HME-4`. `{id}` is the meter's MAC address
(12 lowercase hex digits, no separators), encrypted with AES-128-CBC (key
`!@#$%^&*()_+{}[]`, zero IV) and hex-encoded. For the MAC `0123456789ab` that is
`6f8008b9ee08cc3f8cf9f6c065a123dd`. hm2mqtt works this id out itself when the
configured device id is the MAC.

From `HME-4` firmware 124 and `HME-3` firmware 122, a meter that has been given
an id by the Marstek cloud uses that stored id as `{id}` instead of the
encrypted MAC. Such a meter has to be configured with that id, exactly as it
appears in its topics; hm2mqtt uses any id that is not a 12 hex digit MAC as
is.

Older firmware (`HME-2`/`HME-4` before 119, `HME-3`/`HME-5` before 116) uses
`hame_energy/{type}/device/{id}/ctrl` and `hame_energy/{type}/App/{id}/ctrl`
with the plain id. hm2mqtt listens on both forms.

When the meter stays on the Marstek cloud and hame-relay forwards its messages
to a local broker, they appear there on
`hame_energy/{type}/device/{mac}/ctrl`, and commands go to
`hame_energy/{type}/App/{mac}/ctrl` with the plain MAC. The examples below use
that form.

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
| `pwr_t` | Total power, in W. On the `HME-4` all powers are 16-bit values that wrap around beyond ±32767 W |
| `ble_s` | Bluetooth state: `0` initial, `2` advertising, `5` connected, `6` disconnected, `7` not initialised. Not a signal strength |
| `wif_r` | Wi-Fi RSSI, in dBm |
| `wif_s` | Wi-Fi state: `0` disconnected, `2` connected (has an IP address), `3` access point not found |
| `fc4_v` | FC41D firmware version |
| `ver_v` | Firmware version |
| `slv_n` | Number of attached slave devices. See [section 7](#7-read-slave-device-information) |
| `cur_d` | Measurement direction bitmask, one bit per phase. See [section 5](#5-set-the-phase-measurement-direction). The CT002 also accepts this field under the name `cur_dir` |
| `eth_f` | Unknown |
| `eep_f` | Unknown |

The CT003 additionally reports:

| Field | Description |
| --- | --- |
| `eng_t` | Total energy, in 0.1 Wh. On an SML meter (`ptl_t=0`) this is the import register only; on a DSMR meter (`ptl_t=1`) it is the net reading (import minus export, both tariffs) and can therefore decrease as well as increase |
| `smt_n` | Number identifying the configured smart meter model. See [section 6](#6-configure-the-connected-smart-meter) |
| `har_f` | P1 device connected |
| `sof_f` | P1 read status |
| `irs_f` | Infrared read status |
| `pwr_f` | Phase read status, a bitmask with one bit per phase |
| `com_t` | Interface: `0` infrared head, `1` P1 port. See [section 6](#6-configure-the-connected-smart-meter) |
| `com_b` | Serial settings code, not a baud rate. See [section 6](#6-configure-the-connected-smart-meter) |
| `ptl_t` | Protocol: `0` SML, `1` DSMR |

The CT002 does not report `eng_t`. The `HME-4` reports its energy with `cd=32`
(see [section 13](#13-read-the-per-phase-energy)); for `TPM-CN` and `TPM2-*`
see [section 4](#4-read-the-per-phase-charge-and-discharge-counters).

## 4 Read the per-phase charge and discharge counters

`TPM-CN` and `TPM2-*` only, and unverified: no reply to `cd=19` has been
reported from a real meter yet. The `HME-3` and `HME-4` firmware does not
handle `cd=19`, so hm2mqtt does not poll it on the `HME-*` device types. These
counters are not part of the `cd=1` payload.

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

The `HME-4` only uses the low byte of `p1` (`p1=256` is taken as `0`) and
rejects values above `7`. It does not recognise `dir`.

> **Note:** On the CT003 family, `cd=5` configures the connected smart meter
> instead — see [section 6](#6-configure-the-connected-smart-meter). Do not send
> the direction command to a CT003.

### 5.2 Receive

`HME-4` firmware 124 replies `cd=5,cur={mask}` with the bitmask now in effect.
It also replies when it rejected the value, then with the unchanged bitmask.
Firmware 120 does not reply.

## 6 Configure the connected smart meter

CT003 only. Selects how the reader talks to the attached smart meter.

### 6.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=5,p1={interfaceType},p2={baudRate},p3={protocolType},p4={meterNum}
```

| Parameter | Reported as | Description |
| --- | --- | --- |
| `p1` | `com_t` | Interface. `0` = infrared head, `1` = P1 port. The `HME-3` stores `2` or more as `1`, so it has no TIC setting |
| `p2` | `com_b` | Serial settings code, see below. Any other value is stored as `0` |
| `p3` | `ptl_t` | Protocol. `0` = SML, `1` = DSMR. `2` or more is stored as `1` |
| `p4` | `smt_n` | Meter number, `0`–`255`, identifying the meter model |

| `com_b` | P1 port | Infrared head |
| --- | --- | --- |
| `0` | 115200 baud, 8N1 | 115200 baud, 8N1 |
| `1` | 9600 baud, 8N1 | 9600 baud, 8N1 |
| `2` | 9600 baud, 7E1 | 9600 baud, 8N1 |
| `3` | 115200 baud, 7E1 | 9600 baud, 8N1 |

All four parameters are required; if one is missing the command is ignored. The
`HME-3` stores the values and reboots without replying. The defaults, also
restored by a factory reset, are `com_t=1`, `com_b=0`, `ptl_t=1` and
`smt_n=100`.

The values for a given meter come from Marstek's smart meter catalogue, which
the app retrieves from the cloud.

## 7 Read slave device information

Lists the attached slave devices (the batteries that read this meter) when the
device information reports `slv_n` greater than zero. hm2mqtt does not use it:
the reply joins records with `;`, which its comma-separated parser cannot read.

### 7.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=4,p1={any}
```

`p1` must be present, but its value is ignored: there is no query for a single
slave. Without slaves there is no reply.

### 7.2 Receive

You will receive one or more messages, each with up to five records such as:

```
slv_ip=192.168.1.20,slv_t=HMG-50,slv_p=A,slv_id=0123456789ab;
```

| Field | Description |
| --- | --- |
| `slv_ip` | Slave device IP address |
| `slv_t` | Slave device type, e.g. `HMG-50` |
| `slv_p` | Phase the slave is assigned to: `0`, `A`, `B`, `C` or `D` |
| `slv_id` | Slave device ID |

The `HME-4` sends three messages (the third can be empty), the `HME-3` up to
two.

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

The `HME-3` and `HME-4` firmware up to 122 and 124 does not handle `cd=11`: the
meter does not reply and nothing is reset. On that firmware a factory reset is
only possible over Bluetooth.

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

Restarts the meter. It replies `reset ct` and reboots about 300 ms later. No
setting is changed.

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

## 12 Read voltage and current

`HME-4` firmware 124 and later. Firmware 120 does not answer.

### 12.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=31
```

### 12.2 Receive

You will receive a message such as:

```
cd=31,va=231,vb=229,vc=232,ia=1.25,ib=0.40,ic=2.10,pa=119,pb=15,pc=-136,vara=0,varb=0,varc=0,fvara=12,fvarb=-3,fvarc=40,pfa=0,pfb=0,pfc=0,uia=0,uib=0,uic=0,uab=120,ubc=119,uca=121
```

| Field | Description |
| --- | --- |
| `va` / `vb` / `vc` | Phase voltage, in whole V |
| `ia` / `ib` / `ic` | Phase current, in A with two decimals |
| `pa` / `pb` / `pc` | Phase power, in W. The same values as `pwr_a` / `pwr_b` / `pwr_c` |
| `fvara` / `fvarb` / `fvarc` | Reactive power per phase, in var. The sign is the metering chip's; the measurement direction does not apply to it |
| `uab` / `ubc` / `uca` | Angle between two phase voltages, in degrees. About 120 each on a correctly wired three-phase supply |
| `vara` … `varc`, `pfa` … `pfc`, `uia` … `uic` | Always `0` |

> **Note:** Do not send `cd=30` to an `HME-4` on firmware 124: it is answered
> with this `cd=31` reply instead of the power history.

## 13 Read the per-phase energy

`HME-4` firmware 124 and later. Firmware 120 does not answer.

### 13.1 Public

Topic:

```
hame_energy/{type}/App/{uid or mac}/ctrl
```

Payload:

```
cd=32
```

### 13.2 Receive

You will receive a message such as:

```
cd=32,kwh_a=12.50kwh,kwh_b=3.75kwh,kwh_c=0.08kwh,n_kwh_a=1.05kwh,n_kwh_b=0.99kwh,n_kwh_c=2.100kwh,kwh=15.133kwh,n_kwh=3.204kwh
```

| Field | Description |
| --- | --- |
| `kwh_a` / `kwh_b` / `kwh_c` | Energy per phase in one direction, as `<kWh>.<hundredths>kwh` |
| `n_kwh_a` / `n_kwh_b` / `n_kwh_c` | Energy per phase in the other direction, same format |
| `kwh` / `n_kwh` | Sum over the three phases. Wrong, see below |

- Which direction is import depends on how the clamp is fitted. The measurement
  direction setting does not apply to these counters.
- The counters are kept in memory only and start again from 0 when the meter
  reboots.
- The hundredths run from `00` to `100` and are printed as they are, so
  `2.100kwh` means 3.00 kWh. Right after a whole kWh is reached, the meter can
  report the old hundredths with the new whole kWh once, so a value can be
  briefly about 1 kWh too high. hm2mqtt therefore keeps showing the previous
  value through a drop of up to about 1 kWh until the counter catches up, and
  takes only a larger drop as a reboot.
- `kwh` and `n_kwh` add the whole kWh and the hundredths of the three phases
  separately, without carrying: in the example `15.133kwh` stands for 16.33 kWh.
  hm2mqtt sums the phases itself instead.

## 14 Other commands

| Payload | Reply |
| --- | --- |
| `cd=2` | Network information: `wif_n` (SSID), `ip_ad`, `udp_f`, `gate`, `mask`, `dns` |
| `cd=29,num={1-30}` | Per-phase power history, newest first: `p1=[…],p2=[…],p3=[…]` |
| `cd=30,num={1-30}` | Total power history. Do not send it to an `HME-4` on firmware 124, which answers with the `cd=31` reply, or to an `HME-3` on firmware 122, which does not answer it |
