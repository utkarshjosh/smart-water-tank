# I2C LCD Display Prototype (ESP8266)

The bench circuit for putting a screen on the tank-side device. It proves three
things and nothing else:

1. The PCF8574 backpack is on the I2C bus at the pins we picked.
2. Every screen we plan to show fits legibly in 16x2 characters.
3. The custom glyphs (WiFi bars, link dot, droplet) render.

No WiFi, no sensors, no MQTT, no tank math. Every number on screen comes from
`fakeStateFor()`. You can flash this onto a bare NodeMCU with nothing attached
but the LCD.

> **Not the same as `../lcd_display/`.** That one drives an HD44780 in 4-bit
> *parallel* mode and needs six GPIOs. The real board does not have six to
> spare. This one uses an I2C backpack: two wires.

## Wiring

| LCD backpack | NodeMCU | |
|---|---|---|
| VCC | 3V3 (preferred) or 5V/VIN | see the 5V note below |
| GND | GND | must share ground |
| SDA | **D7 (GPIO13)** | |
| SCL | **D4 (GPIO2)** | |

Contrast is the blue pot on the back of the backpack. Fresh out of the box it
usually shows either a blank screen or two rows of solid blocks — **both mean
"turn the pot"**, not "broken".

### Why these two pins

The pins silkscreened `SDA`/`SCL` (D2/D1) are already the ultrasonic sensor's
ECHO/TRIG on the real board. That is fine: **the ESP8266 has no fixed hardware
I2C peripheral at all.** `Wire` is bit-banged in software, so `Wire.begin(sda,
scl)` works on any GPIO pair. D1/D2 are not electrically special.

The board only has one genuinely spare pin, so the second one is borrowed:

| Pin | | |
|---|---|---|
| GPIO2 (D4) | status LED | **taken by SCL on display builds** |
| GPIO4 (D2) | ultrasonic ECHO | |
| GPIO5 (D1) | ultrasonic TRIG | |
| GPIO0 (D3) | DS18B20 temp | must be HIGH at boot |
| GPIO12 (D6) | sensor power gate | |
| GPIO13 (D7) | **free — taken by SDA** | |
| GPIO14 (D5) | speaker | |
| GPIO15 (D8) | reserved | must be LOW at boot |
| GPIO16 (D0) | wired to RST for deep sleep | |
| A0 | battery ADC | |

GPIO2 must be HIGH at boot or the ESP8266 will not start, and an I2C bus idles
HIGH through its pull-ups — so this is electrically *correct*, not merely
tolerated. The cost is the blinking status LED, which the display build gives
up. That is the point: the screen says more than a blink ever did.

**Do not move either line to D8 (GPIO15).** It must be LOW at boot and an I2C
pull-up would hold it HIGH, stopping the board from booting at all.

### The 5V note

Most backpacks pull SDA/SCL up to whatever VCC they are given. Powered from 5V
that puts 5V on GPIO13 and GPIO2, which are 3.3V parts. These boards get run
this way constantly and survive, but it is out of spec. Two clean options:

- **Power the backpack from 3V3.** Contrast is dimmer but usually readable, and
  the bus then idles at a correct 3.3V. Try this first.
- **Keep 5V for the panel and add a 2-channel level shifter on SDA/SCL.**

The production build should pick one deliberately rather than by accident.

## Flash and watch

From `firmware/`:

```bash
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 prototypes/lcd_i2c_display
arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 \
    -p /dev/tty.usbserial-XXXX prototypes/lcd_i2c_display
arduino-cli monitor -p /dev/tty.usbserial-XXXX -c baudrate=115200
```

(`arduino-cli board list` shows your port.)

No new libraries. `Wire` ships with the ESP8266 core and `lcd_pcf8574.h` is a
self-contained ~150-line driver, so there is nothing to add to
`firmware/libraries.txt`.

Serial keys while it runs:

| key | |
|---|---|
| `n` / `p` | next / previous screen |
| `a` | resume auto-cycling (the default, 3s per screen) |
| `s` | rescan the I2C bus |
| `b` | toggle the backlight |
| `c` | fill both rows with solid blocks (find the contrast point) |
| `i` | re-run the HD44780 init sequence |

### When the bus scans clean but the screen stays blank

A `0x27` ACK only proves the **PCF8574 I/O expander** answered. The HD44780
behind it is write-only over this backpack — there is no reply path — so
nothing in software can confirm the glass works. The backlight is a separate
transistor circuit and lights either way. All three good signs are therefore
compatible with a panel showing nothing.

Press `c` and look:

| what you see | what it means |
|---|---|
| solid blocks | contrast is right and the controller is alive — the fault is above this layer |
| faint blocks | turn the pot until they are crisp, then back off until they just fade |
| two rows of blocks *before* pressing `c` | controller powered but never initialised — press `i` |
| nothing at any pot position | the panel is almost certainly on 3V3 — move it to 5V |

**On 3V3 and blank:** many 16x2 modules cannot develop usable contrast below
about 4.5V. The V0 range simply never reaches the glass threshold, so the pot
does nothing across its whole travel. If that is you, move VCC to VIN and add a
level shifter on SDA/SCL — the 3V3-first advice above buys GPIO safety, but not
every panel will take it.

**It runs with no panel attached.** If nothing ACKs at 0x27 or 0x3F it says so
and keeps going in serial-only mode, printing every screen between `|` markers
so you can review all eleven layouts for overflow before soldering anything.

## The screens

| Mode | Line 1 | Line 2 |
|---|---|---|
| `BOOT` | `AquaMind  v1.1.4` | `starting up...` |
| `WIFI_CONNECTING` | `WiFi connecting` | *ssid* |
| `PAIRING_PORTAL` | `PAIRING MODE` | `WaterTank-Setup` |
| `CLAIM_CODE` | `Claim code` | `   8F3K-92QD` |
| `READING_ONLINE` | `Tank  84%` + glyphs | `1260L 42cm 24C` |
| `READING_OFFLINE` | `Tank  84%` + glyphs | `12 held offline` |
| `ALERT_LOW` | `! TANK LOW` | `78L of 1500L` |
| `ALERT_FULL` | `! TANK FULL` | `1480L of 1500L` |
| `OTA_PROGRESS` | `Updating 1.1.5` | `[####      ] 42%` |
| `SENSOR_FAULT` | `SENSOR FAULT` | `no echo returned` |
| `SLEEPING` | `Sleeping` | `wake in 4m52s` |

Two design decisions worth keeping:

- **The top-right glyph pair separates "on WiFi" from "reaching the server".**
  A device joined to WiFi with a dead broker looks perfectly healthy otherwise,
  and that is a failure someone standing at the tank needs to be able to see.
- **`SENSOR_FAULT` is a screen, not a number.** A disconnected ultrasonic reads
  0cm, which the tank math renders as *full*. Showing FAULT instead of a
  confident wrong number is the same reason `levelValid` exists in the firmware.

## Where this is going

`renderScreen()` takes a `DisplayState` struct and returns two lines. It never
learns whether the data is real, which is what lets it move into
`firmware/src/water_tank/` as a `display` module unchanged — the firmware just
populates `DisplayState` from `SystemState`, `Config` and `MqttReporter`
instead of from `fakeStateFor()`.

The display build stays a **compile-time option**, so a device with no panel
pays nothing for it:

```make
make build DISPLAY=1     # LCD build: display module in, status LED out
make build               # unchanged default, no display code compiled
```

Guarded by `#if DISPLAY_ENABLED` the same way `MQTT_ENABLED` and
`ENABLE_DEEP_SLEEP` already work in `config.h`.

Open questions for that stage, deliberately not answered here:

- **Deep sleep.** The device sleeps most of its life, and the panel goes blank
  with it. Options are a always-on display build (mains-powered tanks), or a
  button on... no spare GPIO — most likely reusing the reset button, since a
  reset now runs a full report cycle immediately.
- **Backlight power.** ~15-40mA lit, which is significant against the battery
  budget. Probably: lit for N seconds after a wake, then off.
- **20x4 panels.** The driver already carries the four row offsets; only the
  layouts in `renderScreen()` would need rewriting.
