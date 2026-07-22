# AquaMind firmware v1.1.3 OTA candidate

Built on 2026-07-22 from the current working tree for the ESP8266 NodeMCU v2.

| Field | Value |
| --- | --- |
| Firmware version | `1.1.3` |
| Board | `esp8266:esp8266:nodemcuv2` |
| Binary | `water_tank-1.1.3-nodemcuv2.bin` |
| Size | `566720` bytes |
| SHA-256 | `d65e1400b3c327a740c4cbb522a8a9fd195570bb4d518531449913fa264346e4` |
| Power mode | Always-on (`ENABLE_DEEP_SLEEP=0`) |
| Transport | MQTT/TLS primary, bounded HTTPS recovery |

## OTA changes

- Requires the OTA manifest to contain an exact byte size and SHA-256 checksum.
- Requires the download response checksum header to match the manifest.
- Hashes the downloaded firmware on-device before finalizing the update.
- Aborts partial, stalled, size-mismatched, or checksum-mismatched downloads.
- Disables the unauthenticated local ArduinoOTA listener; updates use the authenticated HTTPS path only.

## Verify before upload

```bash
cd firmware/releases/v1.1.3
shasum -a 256 -c water_tank-1.1.3-nodemcuv2.sha256
```

Upload this binary through the admin firmware page as version `1.1.3`, assign it only to the deployed canary device, and retain the existing `1.1.2` binary as the rollback artifact.
