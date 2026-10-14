# AquaMind firmware v1.1.7 OTA candidate

Built on 2026-10-14 from `fix/ntp-fast-sync` (v1.1.6 plus the NTP fix) for the
ESP8266 NodeMCU v2.

**Two binaries, not interchangeable.** Upload each under the version string it
reports; the backend has no variant column and cannot tell them apart.

| Field | Default | Display (`DISPLAY=1`) |
| --- | --- | --- |
| Binary | `water_tank-1.1.7-nodemcuv2.bin` | `water_tank-1.1.7-nodemcuv2-display.bin` |
| Upload as version | `1.1.7` | `1.1.7-display` |
| Size | `568592` bytes | `567392` bytes |
| SHA-256 | `73cc77ab58639189bfd5ddc14dfe4e4db4f1fcbde41f2dc59623311f89a83d44` | `a1f92cbdd2f24f618e5fdd4dccf907aac01afcfa495245c716f368af7182b3a8` |
| Flash (`.irom0.text`) | `526492` | `525128` |
| RAM | `36584` | `37516` |

Board: `esp8266:esp8266:nodemcuv2`. Transport: MQTT/TLS primary, bounded HTTPS
recovery. Power: deep sleep on the default build, WiFi light sleep on display.

## Changes

**Clock sync no longer stalls boot for up to 45 seconds.** TLS needs a real
clock, so NTP sits in front of every secure connection. Each attempt used to
hand `configTime()` all three servers and wait 15 s. `configTime()` restarts
the SNTP client at its first server, and lwIP only fails over after 15 s of
silence - so every attempt was restarted just before it would have tried the
second server. Only `time.cloudflare.com` was ever asked, one packet per
attempt, and a single lost UDP packet cost the full 15 s. Three misses meant
45 s of boot followed by no secure link at all.

Each attempt now asks one server for 3 s and rotates through
`time.google.com`, `time.cloudflare.com` and `pool.ntp.org`, twice each: 18 s
worst case, every server actually tried, and a lost packet costs 3 s. A healthy
sync finishes in well under a second. After success the client is re-armed
with all three servers so the hourly re-sync keeps lwIP's own failover.

The panel shows `Clock: NTP n/6`, and the serial log names the server that
answered and how long it took:

```
[TLS] Clock synchronized via time.google.com in 212 ms
```

## Verify before upload

```bash
cd firmware/releases/v1.1.7
shasum -a 256 -c water_tank-1.1.7-nodemcuv2.sha256 water_tank-1.1.7-nodemcuv2-display.sha256
```

## Rollout

Assign per device, not by rollout percentage. Keep v1.1.6 as the rollback
artifact.

v1.1.6 performs this download, so the update shows `DO NOT POWER OFF` over a
progress bar, then `Verifying image` and `Update OK` before the reboot.
