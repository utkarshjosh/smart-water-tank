# Water Tank Monitoring System - Firmware

A modular ESP8266 firmware for water level monitoring using `arduino-cli`.

## Project Structure

```
firmware/
├── Makefile              # Build system (run make help)
├── config.mk             # Board & project configuration
├── arduino-cli.yaml      # arduino-cli settings
├── libraries.txt         # Library dependencies
├── src/
│   ├── water_tank.ino    # Main sketch
│   └── modules/          # Modular code
│       ├── config.h/cpp      # Configuration management
│       ├── sensor.h/cpp      # Sensor readings
│       ├── wifi_manager.h/cpp # WiFi handling
│       ├── alerts.h/cpp      # Audio/LED alerts
│       ├── data_reporter.h/cpp # Server communication
│       ├── ota_handler.h/cpp # OTA updates
│       └── storage.h/cpp     # Local storage
├── lib/                  # Local libraries (if any)
├── build/                # Build output
└── scripts/
    ├── setup.sh          # Initial setup
    └── libs.sh           # Library manager
```

## Quick Start

```bash
# 1. Initial setup (installs arduino-cli, ESP8266 core, libraries)
make setup

# 2. Configure your WiFi (edit src/modules/config.h)
nano src/modules/config.h

# 3. Build
make build

# 4. Upload to device
make upload

# 5. Monitor serial output
make monitor

# Or do all at once:
make run
```

## Configuration

Edit `src/modules/config.h` to set:
- WiFi credentials
- Server endpoint
- Tank dimensions
- Alert thresholds
- Pin assignments

For board settings, edit `config.mk`:
- Board type (NodeMCU, D1 Mini, etc.)
- Upload speed
- Debug mode

### Part I production transport

The checked-in firmware defaults to `aquamind-mqtt.utkarshjoshi.com:8883` with
certificate validation. It contains no Wi-Fi credentials or device token.
Those are received only through AP claim onboarding. A legacy flash state with
Wi-Fi plus an HTTP token is deliberately not MQTT-provisioned: it must claim
again, authenticate to MQTT/TLS, and receive retained configuration before it
can publish telemetry.

Plain MQTT is only for an explicit local development build, for example:

```bash
make build MQTT_HOST=192.168.1.10 MQTT_PORT=1883 MQTT_TLS=0
```

The firmware uses `ArduinoMqttClient` for outbound QoS 1. Telemetry, announce,
and acknowledgement publishes count as successful only after Mosquitto returns
the corresponding PUBACK; a local socket write is not enough.

### Opt-in duty-cycle mode

The checked-in binary stays always-on by default. Enable deep sleep only after
verifying GPIO16/D0 is physically wired to RST on the installed ESP8266:

```bash
make build EXTRA_BUILD_FLAGS=-DENABLE_DEEP_SLEEP=1
```

In this mode each normal wake has a 90-second maximum budget: it samples,
connects, applies retained config, waits for telemetry PUBACK, receives for
1.5 seconds, optionally performs the six-hour OTA check, then sleeps. Failed
network wakes back off from one minute to one hour; the third consecutive MQTT
failure attempts HTTPS recovery once before sleeping.

An unattended AP onboarding portal also times out safely in this mode: it keeps
the device unconfigured and sleeps with the same backoff rather than restarting
into another indefinite setup cycle. The default always-on build retains the
restart behavior for USB-powered bench setup.

## Commands

| Command | Description |
|---------|-------------|
| `make build` | Compile firmware |
| `make upload` | Build & flash to device |
| `make monitor` | Serial monitor (115200 baud) |
| `make run` | Build + upload + monitor |
| `make clean` | Remove build files |
| `make setup` | Full initial setup |
| `make install-libs` | Install libraries from libraries.txt |
| `make add-lib LIB="Name@ver"` | Add new library |
| `make info` | Show build configuration |
| `make size` | Show binary size |
| `make help` | Show all commands |

## Adding Libraries

```bash
# Search for a library
make search-lib LIB="ultrasonic"

# Add and install
make add-lib LIB="NewPing@1.9.7"

# Or edit libraries.txt directly and run:
make install-libs
```

## Debug Build

```bash
# Build with debug flags
make build DEBUG=1
```

## Board Variants

Edit `config.mk` to change board:

```makefile
# NodeMCU v2 (default)
BOARD_FQBN := esp8266:esp8266:nodemcuv2

# Wemos D1 Mini
BOARD_FQBN := esp8266:esp8266:d1_mini

# ESP-01
BOARD_FQBN := esp8266:esp8266:esp01_1m
```

## Hardware Connections

| Function | Pin | GPIO |
|----------|-----|------|
| Ultrasonic TRIG | D1 | GPIO5 |
| Ultrasonic ECHO | D2 | GPIO4 |
| Temperature (DS18B20) | D3 | GPIO0 |
| Speaker | D5 | GPIO14 |
| Battery ADC | A0 | ADC |
| Status LED | Built-in | GPIO2 |

## OTA Updates

1. Flash the initial or recovery image over USB.
2. Upload the next production `.bin` through the admin firmware page/API.
3. Assign it to a canary device before widening the rollout.
4. The device checks the authenticated HTTPS OTA endpoint on its scheduled
   cadence, validates the exact size and SHA-256, installs, and reboots.

The production firmware does not expose a local ArduinoOTA listener.

## Troubleshooting

**Permission denied / Cannot monitor port:**
```bash
# Check if you're in the dialout group
groups | grep dialout

# If not, add yourself to the dialout group:
sudo usermod -a -G dialout $USER

# Then either:
# Option 1: Log out and log back in (recommended)
# Option 2: Use newgrp in current terminal:
newgrp dialout

# Verify it worked:
groups
make monitor
```

**Port not detected:**
```bash
# List connected boards
make list-boards

# Set port manually in config.mk
SERIAL_PORT := /dev/ttyUSB0
```

**Library conflicts:**
```bash
# Remove and reinstall
./scripts/libs.sh remove "LibName"
./scripts/libs.sh install
```

**Flash issues:**
```bash
# Erase flash completely
make erase
make upload
```
