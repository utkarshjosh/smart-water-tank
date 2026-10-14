# AquaMind firmware v1.1.5 OTA candidate

Built on 2026-09-07 from `feat/lcd-i2c-display` for the ESP8266 NodeMCU v2.

**This release ships two binaries and they are not interchangeable.** Sending
the display device the default image turns the LCD off and re-enables deep
sleep, which also kills the panel buttons.

| Field | Default | Display (`DISPLAY=1`) |
| --- | --- | --- |
| Binary | `water_tank-1.1.5-nodemcuv2.bin` | `water_tank-1.1.5-nodemcuv2-display.bin` |
| Reported version | `1.1.5` | `1.1.5-display` |
| Size | `568112` bytes | `565888` bytes |
| SHA-256 | `7c1ddb0852a3d9eac2a4dde0fec608b0ab146c42beae409158d22c7c13d1d81d` | `ec99472e10039bb190068bf6323b8d0f31963d6d4d93cfc40f51b08c4a419dcc` |
| Flash | `526168` | `524036` |
| RAM | `36428` | `37072` |

Board: `esp8266:esp8266:nodemcuv2`. Transport: MQTT/TLS primary, bounded HTTPS
recovery. Power: deep sleep on the default build, WiFi light sleep on display.

## Changes

- The LCD reading screen now shows water temperature beside the volume:
  `1260L 27C  14:32`. A disconnected DS18B20 prints `--C` rather than leaving
  the field blank, so a dead probe is distinguishable from one that was never
  fitted. The temperature is dropped whole, not truncated, when a very large
  tank volume leaves no room for all three fields.
- The display build now reports its version as `1.1.5-display`. `FirmwareBinary.version`
  is UNIQUE and the table has no variant column, so the two images of one
  release cannot both be uploaded as `1.1.5`. Making the reported version match
  the uploaded one keeps `checkOtaUpdate`'s "already on this version" guard
  working for display devices; without it, a display device whose install
  report failed to land would be told to reinstall its own firmware forever.
- Default (non-display) build is unchanged in behaviour from v1.1.4; flash and
  RAM figures are identical to that release.

## Verify before upload

```bash
cd firmware/releases/v1.1.5
shasum -a 256 -c water_tank-1.1.5-nodemcuv2.sha256 water_tank-1.1.5-nodemcuv2-display.sha256
```

## Rollout

Upload each image under the version string it reports — `1.1.5` and
`1.1.5-display` — and assign per device rather than by rollout percentage.
Nothing in the backend stops a display image being assigned to a headless
device; the version strings are the only signal, and they are advisory.

Keep v1.1.4 as the rollback artifact. This device is no longer flashed over
serial, so a bad image is recovered only by opening the enclosure and plugging
in USB.
