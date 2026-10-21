# AquaMind firmware v1.1.7 OTA candidate

Built on 2026-10-18 from `main` (`e894ff2`) for the ESP8266 NodeMCU v2.

**Two binaries, not interchangeable.** Upload each under the version string it
reports; the backend has no variant column and cannot tell them apart.

| Field | Default | Display (`DISPLAY=1`) |
| --- | --- | --- |
| Binary | `water_tank-1.1.7-nodemcuv2.bin` | `water_tank-1.1.7-nodemcuv2-display.bin` |
| Upload as version | `1.1.7` | `1.1.7-display` |
| Size | `569808` bytes | `568752` bytes |
| SHA-256 | `dad6ec04433d91207cbb259064658f66ad3c969cd2de2f8a60bcd8cdd2e2b01a` | `f18bfe7232200b0947571e05c8b6f9afba5929ea61042abc3f48b4f00b39ebc6` |

Board: `esp8266:esp8266:nodemcuv2`. Transport: MQTT/TLS primary, bounded HTTPS
recovery. Power: deep sleep on the default build, WiFi light sleep on display.

## Changes

**A device whose token the server keeps refusing goes back to pairing (#31).**
The backend now revokes device tokens (admin re-issue, revoke-all, re-claim)
and refuses decommissioned devices. Before this, such a device retried forever
and just looked offline.

- Only MQTT CONNACK 4/5 and HTTP 401 from the device API count as a refusal.
  Network, TLS, timeout and 5xx failures are ignored; any success clears the
  count.
- After 5 backoff windows (about 15 minutes) in which *both* the broker and the
  device API refused, the device shows `Re-pair needed`, forgets it was
  provisioned and restarts into the pairing portal. One signal alone is not
  trusted, since a broken broker auth hook refuses everyone.
- After a refusal, reconnects wait out the failure backoff instead of a TLS
  handshake every 5 s.
- Re-pairing keeps the new token even if no retained config arrives, instead of
  falling back to the retired one.
- Display builds show `RE-PAIR NEEDED` instead of `PAIRING MODE` on the portal
  screen for a device that was paired before.

## Verify before upload

```bash
cd firmware/releases/v1.1.7
shasum -a 256 -c water_tank-1.1.7-nodemcuv2.sha256 water_tank-1.1.7-nodemcuv2-display.sha256
```

## Rollout

Assign per device, not by rollout percentage. Keep v1.1.6 as the rollback
artifact.
