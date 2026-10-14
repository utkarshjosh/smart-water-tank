# AquaMind firmware v0.1.1 rollback artifact

This is the exact production image built and USB-flashed to the ESP8266 on
2026-07-21. Keep it as the known-good rollback for later staged OTA releases.

| Field | Value |
|---|---|
| Firmware version | `0.1.1` |
| Source commit | `b02bc9408a03fda5edc33ca09d3a902b28186ba8` |
| Board | NodeMCU v2 (`esp8266:esp8266:nodemcuv2`) |
| ESP8266 Arduino core | `3.1.2` |
| Binary size | `590512` bytes |
| SHA-256 | `59c0681d9351760a32ef2806b60e584d88ecc5358c56b68b9610534ecea25806` |
| Canonical build | `make build VERSION=0.1.1` from the source commit above |

Verify before upload or rollback:

```bash
cd firmware/releases/v0.1.1
shasum -a 256 -c water_tank-0.1.1-nodemcuv2.sha256
```
