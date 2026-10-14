# AquaMind firmware v1.1.6 OTA candidate

Built on 2026-09-07 from `feat/lcd-i2c-display` for the ESP8266 NodeMCU v2.

**Two binaries, not interchangeable.** Upload each under the version string it
reports; the backend has no variant column and cannot tell them apart.

| Field | Default | Display (`DISPLAY=1`) |
| --- | --- | --- |
| Binary | `water_tank-1.1.6-nodemcuv2.bin` | `water_tank-1.1.6-nodemcuv2-display.bin` |
| Upload as version | `1.1.6` | `1.1.6-display` |
| Size | `568496` bytes | `567296` bytes |
| SHA-256 | `ae47c402cd6932317cf6ae5b27b529e49182334278c2ccaedf7cb70e1a50711b` | `4b559a0c9954eb25a7ebe63423ac2d4473820a54379fa7f8511d6116daa36dc7` |
| Flash | `526456` | `525092` |
| RAM | `36524` | `37464` |

Board: `esp8266:esp8266:nodemcuv2`. Transport: MQTT/TLS primary, bounded HTTPS
recovery. Power: deep sleep on the default build, WiFi light sleep on display.

## Changes

**The panel narrates long blocking operations.** Wi-Fi association, NTP and the
OTA download each block for tens of seconds, and a frozen screen is
indistinguishable from a crashed device. The honest response to a device that
looks crashed is to cut its power, which during a flash write is the one action
that turns a recoverable update into a board needing a USB cable.

Boot now shows the stage, an activity bar and **elapsed seconds** - the seconds
being the half that matters, since a bar alone cannot distinguish four seconds
from forty:

```
Wi-Fi: cached      Clock: NTP 2/3     Cloud connecting
....  2s           ...... 21s         TLS handshake
```

`Wi-Fi: cached` vs `Wi-Fi: scanning` names the strategy: three seconds cached
then twenty scanning is a stale BSSID, a different fault from weak signal. The
NTP attempt counter is on screen because 3/3 is where slow becomes broken.
Failures hold three seconds so they can be read.

An update in progress shows `DO NOT POWER OFF` (exactly 16 columns) over a bar
tracking bytes written, then `Verifying image`, then `Update OK` before the
reboot. A failure says `Update failed / device unharmed`.

**1-Wire bus diagnostics.** A `-127` from the DS18B20 library means both "no
sensor on the bus" and "sensor present but unreadable", which have completely
different fixes. Init and every failed read now issue a bus reset and report:

```
[Sensor] 1-Wire on GPIO0: presence=NO, devices=0
```

`presence=NO` is the bus itself - almost always the missing 4.7k pull-up from
data to 3V3, since a 1-Wire bus is open-drain and has nothing else to pull it
high. `presence=yes, devices=0` exonerates the wiring. A failed read also
re-enumerates the bus, so a reseated probe recovers without a reboot.

**Splash shows the firmware version** instead of "starting up...". On a device
that is only ever updated over the air, that is the one place the running image
is readable without pressing a button twice.

## Verify before upload

```bash
cd firmware/releases/v1.1.6
shasum -a 256 -c water_tank-1.1.6-nodemcuv2.sha256 water_tank-1.1.6-nodemcuv2-display.sha256
```

## Rollout

Assign per device, not by rollout percentage. Keep v1.1.5 as the rollback
artifact.

Note that the new update screens are in the image being *installed*, not the
one doing the installing: v1.1.5 performs this download, so this update still
looks like a frozen panel. The narration appears from the next update onward.
The boot progress does show immediately, on the reboot into v1.1.6.
