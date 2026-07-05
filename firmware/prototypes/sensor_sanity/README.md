# Sensor Sanity Prototype (ESP8266)

A throwaway bench sketch to validate the **raw signals** from the two sensors we
already own, before building the real split-device system. See
[`../../../plans/split-device-wireless-esp32.md`](../../../plans/split-device-wireless-esp32.md)
for where this is heading.

It does **not** do tank math, WiFi, server, OTA, or alerts — just: *are the
sensors wired right, and are the signals clean and stable?* That's the exact
question the breadboard build failed on.

## Sensors tested
- **SR04M / JSN-SR04T** waterproof ultrasonic (trig/echo mode, via `NewPing`)
- **DS18B20** 1-Wire temperature (via `OneWire` + `DallasTemperature`)

All three libraries are already in `firmware/libraries.txt` — nothing new to buy
or install.

## Wiring (NodeMCU v2)
| Sensor pin | NodeMCU | Notes |
|---|---|---|
| SR04M VCC | **5V / VIN** | 5V — under-powering the transmitter was a breadboard failure |
| SR04M GND | GND | |
| SR04M TRIG | D1 (GPIO5) | |
| SR04M ECHO | D2 (GPIO4) | |
| DS18B20 VCC | 3V3 | |
| DS18B20 GND | GND | |
| DS18B20 DATA | D3 (GPIO0) | **needs a 4.7k pull-up to 3V3** (required) |

> GPIO0 is a boot strapping pin; the 4.7k pull-up holds it HIGH so the board
> boots normally. If you see boot loops, move DATA to D5 (GPIO14) and change
> `TEMP_PIN` in the sketch.
>
> SR04M min reliable range is ~20–25 cm — point it at a wall/floor further than
> that when testing.

## Flash & monitor (run from `firmware/`)
```bash
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 prototypes/sensor_sanity
arduino-cli upload  --fqbn esp8266:esp8266:nodemcuv2 \
    -p /dev/tty.usbserial-XXXX prototypes/sensor_sanity
arduino-cli monitor -p /dev/tty.usbserial-XXXX -c baudrate=115200
```
(Replace the port with yours — `arduino-cli board list` shows it.)

## Web UI (recommended — no console typing)
A clean single-file dashboard lives in [`webui/index.html`](webui/index.html). It
talks to the ESP8266 **directly over USB** via the browser's Web Serial API —
no server, no install, no build.

1. **Close** the Arduino IDE / `arduino-cli monitor` — only one program can hold
   the serial port.
2. Open `webui/index.html` in **Chrome, Edge, or Brave** (desktop). Just
   double-click it (`file://` works). If Connect does nothing, serve the folder:
   `python3 -m http.server` then open `http://localhost:8000/webui/`.
3. Click **Connect**, pick the USB serial port. The page auto-switches the device
   into JSON telemetry mode and shows live cards (distance, temperature, signal
   quality, dropouts, jitter), two charts, and a raw feed.
4. Use the buttons — **Run self-test**, **Help**, **Pause**, **Clear** — instead
   of typing commands.

Not Chrome-family? Fall back to the serial menu below.

## Serial menu (115200 baud, send one char)
| Key | Mode |
|---|---|
| `b` | both sensors, continuous (default) |
| `u` | ultrasonic only |
| `t` | temperature only |
| `c` | CSV output for Arduino **Serial Plotter** (`dist_cm,temp_c`) |
| `j` | JSON telemetry (machine-readable; used by the Web UI) |
| `s` | one-shot self-test / pass-fail summary |
| `h` | help |

## Reading the diagnostics
- **Ultrasonic** prints median distance, raw echo time (µs), min/max spread, and
  **dropout count**. Clean sensor = 0 dropouts and <3 cm spread. Many dropouts →
  weak power or noisy/long cable. High spread → reflections or loose mounting.
- **Temperature** flags the two failure sentinels: `-127` = disconnected / no
  pull-up; `85.00` = power-on default (brown-out, never converted).

Once both pass `s` (self-test) reliably on the bench, we're clear to proceed to
the ESP32 split build.
