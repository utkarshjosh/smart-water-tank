# AquaMind firmware v1.1.7 OTA candidate

Built on 2026-10-22 from `claude/temp-sensor-reliability-6cebf4` for the ESP8266 NodeMCU v2.

**Two binaries, not interchangeable.** Upload each under the version string it
reports; the backend has no variant column and cannot tell them apart.

| Field | Default | Display (`DISPLAY=1`) |
| --- | --- | --- |
| Binary | `water_tank-1.1.7-nodemcuv2.bin` | `water_tank-1.1.7-nodemcuv2-display.bin` |
| Upload as version | `1.1.7` | `1.1.7-display` |
| Size | `570080` bytes | `569040` bytes |
| SHA-256 | `b448ebb67cd456ec5495164290c212303881963319e69018209db3e38adcad1a` | `7fd26d6c94048addf70c8bef2420732e0fc626ea307aa4a71f3e5bada025b19f` |

Board: `esp8266:esp8266:nodemcuv2`.

## Changes

**DS18B20 reads retry.** A temperature read now makes up to three attempts
before reporting the probe missing. On the ESP8266 the 1-Wire timing is
bit-banged in software, so one corrupted bit fails the scratchpad CRC and the
library returns `-127` - the same value as an absent probe. A recovered read
logs `[Sensor] Temperature read recovered on attempt N`.

**85C is rejected.** 85C is the DS18B20's power-on scratchpad value: the probe
reset between the convert command and the read. It was previously reported as
a real temperature.

**The LCD names the failure.** When all attempts fail, the temperature field
shows the reason instead of `--C`, so a probe can be diagnosed at the tank
without a laptop on serial:

| LCD | Meaning | Look at |
| --- | --- | --- |
| `!P` | no presence pulse - nothing answered on the bus | pin, pull-up, connector |
| `!R` | the probe answered but every read was corrupt | timing, noise, ground |
| `!H` | the probe returned 85C - it reset mid-read | its supply |

## Field note

The unit that prompted this release missed most readings while the probe's
ground ran through the low-side sensor-power transistor on D6. Wiring the
probe's GND directly to board ground fixed it. Keep the DS18B20 on unswitched
ground: it idles at about 1uA, so switching it saves nothing, and a transistor
in its ground path shifts the reference the data line is read against.
