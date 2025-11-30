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
| `make ota` | Upload via OTA |
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

1. First, upload via USB
2. Device registers on network as `watertank.local`
3. Update OTA settings in `config.mk`
4. Use `make ota` for subsequent uploads

## Troubleshooting

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

