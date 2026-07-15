# MQTT firmware real-device testing

Run these checks on the physical ESP8266 before enabling deep sleep for the
installed tank. Record the firmware commit, device ID, date, serial output, and
result for each item.

## 1. Safe default firmware: always-on MQTT/TLS

- [ ] Flash the default production build. Do **not** enable deep sleep yet.
- [ ] Confirm cold boot joins Wi-Fi, synchronizes NTP, validates TLS, and
  connects to `aquamind-mqtt.utkarshjoshi.com:8883`.
- [ ] Confirm the broker log records the correct device ID and no TLS/auth
  errors.
- [ ] Confirm the device prints `announce ... (PUBACK)`.
- [ ] Confirm the device prints `telemetry ... (PUBACK)`.
- [ ] Confirm the resulting measurement appears in the backend database and
  existing application `/current` view.
- [ ] Stop Mosquitto briefly, restart it, and confirm the device reconnects and
  resumes PUBACK-confirmed telemetry.
- [ ] Restart `aquamind-api`, confirm telemetry is ingested after it returns,
  and confirm retained config still exists.

## 2. Provisioning, TLS, and retained configuration

- [ ] From a legacy or erased configuration, enter the AP portal and claim the
  device with a fresh code.
- [ ] Confirm the claim completes only after MQTT/TLS authentication and a
  retained config are received.
- [ ] Confirm a same-tenant reclaim works and a different-tenant claim is
  rejected.
- [ ] Confirm a reboot preserves `mqttProvisioned` and does not reopen the AP
  portal during a temporary Wi-Fi, DNS, broker, or NTP failure.
- [ ] Confirm a cold boot can synchronize NTP before HTTPS/MQTTS; it must never
  fall back to unverified TLS.
- [ ] Change tank/config settings in the application and verify the retained
  config is applied once, persisted, and reported with the new
  `config_version`.
- [ ] Reboot without changing config and verify the equal-version retained
  message does not cause an unnecessary flash save.

## 3. Sensor and calibration correctness

- [ ] Compare ultrasonic distance against a manual measurement at several tank
  levels.
- [ ] Confirm a no-echo/disconnected ultrasonic sensor reports `level_cm: null`
  to the backend and does not trigger a false tank-full or tank-low alert.
- [ ] Verify DS18B20 wiring and confirm temperature is plausible; a disconnected
  sensor must be reported as invalid/null, not used for alerts.
- [ ] Calibrate the ADC voltage divider against a multimeter. Do not accept the
  current `0.02 V` reading as a real battery value.
- [ ] Verify server-derived level/volume match the installed tank profile,
  calibration offsets, dead zone, and parallel tank count.

## 4. MQTT and HTTP recovery behavior

- [ ] Block or stop MQTT for two consecutive normal report cycles; confirm the
  device buffers the reading and does not busy-loop.
- [ ] On the third failed MQTT cycle, confirm it makes exactly one HTTPS
  recovery attempt before the next cycle.
- [ ] Restore MQTT and confirm normal PUBACK-confirmed telemetry resumes.
- [ ] Verify buffered data is not deleted merely because MQTT returns PUBACK;
  application-level replay receipts remain a Part II feature.
- [ ] Confirm malformed, wrong-token, and cross-device MQTT attempts are
  denied by Mosquitto/backend ACLs.

## 5. Deep-sleep hardware and duty-cycle test

Deep sleep requires a physical wire from **GPIO16 / D0 to RST**. Confirm that
wiring on the exact board before enabling it:

- [ ] Verify GPIO16/D0 is wired to RST and the board wakes after a manual short
  deep-sleep sketch test.
- [ ] With no saved Wi-Fi/claim credentials, leave the AP portal untouched
  until its timeout. Confirm the deep-sleep canary prints that it is staying
  unconfigured, sleeps with backoff, and never sends telemetry.
- [ ] Build the canary explicitly with:

  ```bash
  make build DEBUG=1 EXTRA_BUILD_FLAGS=-DENABLE_DEEP_SLEEP=1
  ```

- [ ] Flash only this canary binary and confirm one wake performs sample →
  Wi-Fi → MQTT/config → telemetry PUBACK → short receive window → sleep.
- [ ] Confirm serial output includes `[Power] Sleeping for ...` and that the
  next boot occurs near the configured normal report interval.
- [ ] Disconnect Wi-Fi or MQTT and verify failure sleeps back off from one
  minute up to one hour rather than retrying indefinitely.
- [ ] Measure awake duration, average current, peak current, and projected
  battery life for the installed board, sensors, and report interval.
- [ ] Power-cycle the unit and verify it safely resumes normal operation. An
  early OTA check after a full power loss is acceptable because RTC schedule
  state is intentionally lost.

## 6. OTA and rollback

- [ ] Verify OTA is not checked on every normal wake; it is scheduled at most
  every six hours while RTC state survives.
- [ ] Assign a small OTA update, confirm authenticated download, install,
  reboot, MQTT reconnect, and the new firmware version in telemetry.
- [ ] Flash or assign the known rollback image and verify the same recovery
  path.

## 7. Release evidence

- [ ] Save the final production binary checksum and physical rollback binary.
- [ ] Record board/pin map, GPIO16-to-RST wiring status, sensor wiring, tank
  calibration, battery configuration, and install date.
- [ ] Run a 48-hour bench soak, then a seven-day real-tank canary with daily
  checks that recent readings, MQTT connection, retained config, and battery
  trend remain plausible.
