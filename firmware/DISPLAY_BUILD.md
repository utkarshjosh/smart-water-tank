# Display Build (v0 — live power)

```bash
make build DISPLAY=1          # LCD variant
make build                    # normal device, unchanged
```

A display build is a **different product**, not an added feature: mains powered
through an SMPS, permanently associated to WiFi, and read by a person standing
at the tank. The default build compiles none of it — the binary is byte for byte
what it was before this branch, apart from the 1-Wire diagnostics both
builds share (526456 flash / 36524 RAM).

| | default | `DISPLAY=1` |
|---|---|---|
| flash | 526456 | 525092 |
| RAM | 36524 | 37464 |

The display build is *smaller* because deep sleep and the local alert code drop
out and more than pay for the panel.

## What's in it

- 16x2 character LCD on a PCF8574 I2C backpack, three screens
- Two panel buttons
- WiFi light sleep instead of deep sleep
- No speaker, no status LED — their pins are now the I2C clock and a button
- Reading carries a wall-clock timestamp

## Wiring

| | pin | |
|---|---|---|
| LCD SDA | D7 / GPIO13 | |
| LCD SCL | D4 / GPIO2 | was the status LED |
| Button: Next | D5 / GPIO14 | freed by dropping the speaker |
| Button: Select | D8 / GPIO15 | |

**Both buttons are wired identically**: one side to 3V3, the other to the GPIO,
with a **10k pull-down to GND**. Active HIGH throughout.

That uniformity is load-bearing, not cosmetic. GPIO15 must be LOW at boot or the
board will not start, so an `INPUT_PULLUP` button to GND is impossible there.
One wiring rule for the whole panel means no boot surprises — and it's why the
code uses plain `INPUT`, never `INPUT_PULLUP`.

### There is no button on D0/GPIO16, and there cannot be

Dropping deep sleep frees the D0-to-RST wire, so GPIO16 *looks* available. It is
not. GPIO16 is the deep-sleep wake output (XPD_DCDC): the chip drives it HIGH
during normal operation and drops it LOW to pull RST and wake itself. That is
exactly what makes the D0-to-RST jumper work.

The consequence is that **D0 idles at 3.3 V on a bare board with nothing
attached**, and no pull-down beats an active push-pull driver — not an external
10k, not `INPUT_PULLDOWN_16`. A button there reads permanently pressed, so the
debounce latches it down at boot and no press ever fires.

Measured on hardware: with every wire removed from D0, the pin still sat at
3.3 V and `digitalRead` returned 1.

There is no backlight button as a result, and it costs nothing: the backlight
comes on with any press and times out on its own, which is all a dedicated
button would have done.

### Power

Power the backpack from **5V** (VIN). 3V3 leaves the contrast unreadable on most
of these modules — the V0 range never reaches the glass threshold, so the pot
does nothing across its whole travel.

That means the I2C pull-ups must not go to 5V, since GPIO13 and GPIO2 are 3.3V
parts with a ~3.6V absolute maximum. Two options, pick one deliberately:

- Remove the backpack's onboard pull-ups and fit your own **4.7k to 3V3**.
  Outside the PCF8574's datasheet V<sub>IH</sub> of 0.7 × VDD, but works on most
  real parts — verify when changing supplier.
- A **BSS138 bidirectional level shifter** on SDA/SCL. In spec, ~₹50.

> **Unrelated but adjacent:** the ultrasonic ECHO line has the same problem and
> always has. It drives ~5V straight into GPIO4. `hardware/README.md:165` claims
> NodeMCU GPIOs are 5V tolerant — **they are not**, and the divider it calls
> optional should be mandatory. 10k series, 20k to GND, tap to the GPIO.

## Narrated boot and updates

Wi-Fi association, NTP and an OTA download each block for tens of seconds. A
panel that freezes for that long is indistinguishable from a crashed device,
and the natural response to a crashed device is to cut its power - which during
a flash write is the one action that turns a recoverable update into a board
that needs a USB cable.

So long operations draw a stage name, an activity bar and the seconds spent:

```
Wi-Fi: cached        Clock: NTP 2/3       DO NOT POWER OFF
▮▮▮▮......  2s      ▮▮▮▮▮▮.... 21s      ▮▮▮▮▮▮▮... 68%
```

The elapsed count is the load-bearing half: a bar alone cannot tell you whether
a stage has run for four seconds or forty, and forty is the number that means
go and look at the router. `Wi-Fi: cached` versus `Wi-Fi: scanning` names the
strategy, because three seconds cached followed by twenty scanning is a stale
BSSID and not a weak signal. The NTP attempt counter is shown because reaching
3/3 is where slow stops and broken starts.

Steps that block somewhere the code cannot reach into - a TLS handshake, an
HTTP GET - get static text instead. A bar that stops moving is a worse lie than
a line of text, because a bar promises movement.

Shared code reaches all of this through `progress.h`, so `wifi_manager.cpp`,
`tls_client.h` and `ota_handler.cpp` stay ignorant of whether the build has a
screen. On a headless build every one of those calls is an empty inline.

## The reported version carries the variant

A display build reports `<version>-display`, not `<version>` — `make build
DISPLAY=1` sets `FIRMWARE_VERSION` from `REPORTED_VERSION` in `config.mk`.

That is not cosmetic. The backend's `FirmwareBinary.version` is UNIQUE and the
table has no variant column, so the two binaries of one release cannot both be
uploaded as `1.1.5` — and `checkOtaUpdate` only stops re-offering an update when
the assigned version equals the version the device reports. Upload each image
under the string it reports and the guard works for both builds. Label them any
other way and a display device whose install report fails to land is told to
reinstall its own firmware, forever.

Nothing in the backend actually prevents a display image being assigned to a
headless device. The version strings are a signal for whoever is doing the
assigning, not an enforced constraint.

## Why light sleep, not deep sleep

Deep sleep would work fine for the *panel* — the HD44780 holds its own frame, so
a sleeping device keeps showing its last reading at no cost. The problem is the
buttons: an ESP8266 can only be woken from deep sleep by the RST pin, so every
GPIO button would be dead between wakes.

Automatic light sleep keeps the WiFi association, so the device stays
continuously online, MQTT keeps its subscriptions, config pushes arrive
immediately, and buttons stay responsive — while average current still drops
well over an order of magnitude from always-awake. In a sealed box on a rooftop
that headroom is about heat and component life, not the electricity bill.

`WIFI_LIGHT_SLEEP_LISTEN_INTERVAL` (default 3) is how many DTIM beacons to skip.

## Screens

`Next` cycles; `Select` re-measures and reports now; hold `Select` for ~2s to
enter the pairing portal. Either press lights the backlight, which auto-offs
after `BACKLIGHT_TIMEOUT_MS` (30s, or 0 to disable).

| | line 1 | line 2 |
|---|---|---|
| Reading | `Tank 84%` + status | `1260L 27C  14:32` |
| Network | `-58dBm` + status | IP address |
| Device | `fw 1.1.6-display` | device ID |

The temperature is whole degrees with no unit symbol — at 16 columns a decimal
place buys a number nobody acts on, and the HD44780's degree glyph is not
portable across the ROM variants these panels ship with. A disconnected DS18B20
prints `--C`, matching the clock's `--:--`: a field that vanishes when its
sensor dies looks exactly like a field that was never designed in. On a tank
large enough that the volume, temperature and clock cannot all fit, the
temperature is dropped whole rather than truncated.

Reading is replaced by `PAIRING MODE` when unclaimed, and by `SENSOR FAULT` when
the ultrasonic returns no echo — a dead sensor reads as 0cm, which the tank math
would otherwise render as a full tank.

The two status glyphs are signal strength and a server-link arrow. **They are
deliberately separate**: a device joined to WiFi with a dead broker looks
perfectly healthy otherwise, and that's a failure someone at the tank needs to
be able to see.

### The timestamp is not decoration

The HD44780 keeps displaying its last frame for as long as it has power,
regardless of what the ESP8266 is doing — or whether it is doing anything at
all. So a dead device leaves a perfectly crisp, completely stale number on the
screen, indistinguishable from a fresh one.

A *relative* age would be worse than nothing: the CPU can't count while it's
sleeping or crashed, so `4m` would freeze at `4m` forever and lie. An absolute
wall-clock time stays honest no matter how long the device has been gone —
glance at it, compare against your phone, and you know immediately whether this
is four minutes old or from Tuesday.

`DISPLAY_TZ_OFFSET_MIN` (default 330, IST) applies the offset, because
`tls_client.h` configures NTP as `configTime(0, 0, ...)` and the clock runs UTC.
Before NTP lands the screen shows `--:--` rather than a plausible wrong time.

## Verified on hardware

Flashed to a NodeMCU v2 and booted:

```
[Display] LCD at 0x27
[Buttons] raw at boot: NEXT(D5)=0 SELECT(D8)=0  (both should be 0)
[Power] WiFi light sleep enabled
[MQTT] announce -> devices/<id>/announce (PUBACK)
[Report] Data sent successfully
[System] Setup complete!
```

`Setup complete!` rather than a sleep message confirms the always-on loop. The
`SENSOR FAULT` screen was exercised unintentionally but for real, since neither
sensor was attached on the bench.

Two diagnostics stay in this build while the panel is being brought up: the raw
button states at boot, and a line on every debounced edge. Both are cheap and
they are what turned the D0 problem from a wiring hunt into a one-line answer.

## Not done yet

- Buttons have not been exercised end to end on a fitted panel.
- The `SENSOR_FAULT` and `PAIRING MODE` states have not been exercised on a panel.
- Light sleep's real average current on this board is unmeasured.
- No screen for buffered-reading count; irrelevant while mains-powered and
  always online, worth adding if this variant ever runs on the LiFePO4 cell.
