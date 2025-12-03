# Building a custom library management tool
_Exported on 11/30/2025 at 23:30:56 GMT+5:30 from Cursor (2.1.39)_

---

**User**

PlatformIO sucks

we will build our own library managemetn and building tool using arduino-cli



some board config and tweaking setup 



currently we only need to program esp8266 board , library , using arduino framework

and we will need some other libraries for sensors in futuire too 



need better project structure, like keeping modules , and all







---

**Cursor**

I'll help you create a clean, modular build system using `arduino-cli` for your ESP8266 project. Let me first check what's currently in your workspace.

Got it! This is a serious IoT project. Let me create a clean, modular build system using `arduino-cli` that will be much simpler and more flexible than PlatformIO.

```makefile
# ============================================================================
# WATER TANK FIRMWARE - Board & Project Configuration
# ============================================================================

# Project Settings
PROJECT_NAME    := water_tank
VERSION         := 0.1.0

# Board Configuration (ESP8266)
BOARD_FQBN      := esp8266:esp8266:nodemcuv2
BOARD_PLATFORM  := esp8266:esp8266
PLATFORM_URL    := https://arduino.esp8266.com/stable/package_esp8266com_index.json

# Serial Port (auto-detect or override)
# Leave empty for auto-detection, or set manually:
# SERIAL_PORT   := /dev/ttyUSB0
SERIAL_PORT     ?= $(shell ls /dev/ttyUSB* 2>/dev/null | head -1)

# Upload Settings
UPLOAD_SPEED    := 921600

# Build Settings
BUILD_FLAGS     := \
    -DVERSION=\"$(VERSION)\" \
    -DPROJECT_NAME=\"$(PROJECT_NAME)\"

# Extra Build Properties (board-specific)
BUILD_PROPS     := \
    build.flash_size=4M \
    build.flash_mode=dio \
    build.flash_freq=40

# Compiler Warnings
WARNINGS        := all

# Debug/Release Mode
# Set to 1 for debug builds
DEBUG           ?= 0
ifeq ($(DEBUG),1)
    BUILD_FLAGS += -DDEBUG=1 -DCORE_DEBUG_LEVEL=5
else
    BUILD_FLAGS += -DNDEBUG -DCORE_DEBUG_LEVEL=0
endif

# OTA Settings (for future use)
OTA_HOST        := 
OTA_PORT        := 8266
OTA_PASSWORD    := 

# ============================================================================
# ESP8266 Board Variants (uncomment the one you're using)
# ============================================================================

# NodeMCU v2 (most common)
# BOARD_FQBN := esp8266:esp8266:nodemcuv2

# NodeMCU v1 (older)
# BOARD_FQBN := esp8266:esp8266:nodemcu

# Wemos D1 Mini
# BOARD_FQBN := esp8266:esp8266:d1_mini

# Generic ESP8266 Module
# BOARD_FQBN := esp8266:esp8266:generic

# ESP-01
# BOARD_FQBN := esp8266:esp8266:esp01_1m

# ============================================================================
# ESP32 Board Variants (for future migration)
# ============================================================================

# ESP32 Dev Module
# BOARD_FQBN := esp32:esp32:esp32
# BOARD_PLATFORM := esp32:esp32
# PLATFORM_URL := https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json

```

```yaml
# arduino-cli configuration file
# https://arduino.github.io/arduino-cli/latest/configuration/

board_manager:
  additional_urls:
    - https://arduino.esp8266.com/stable/package_esp8266com_index.json
    # Uncomment for ESP32 support:
    # - https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json

daemon:
  port: "50051"

directories:
  data: .arduino15
  downloads: .arduino15/staging
  user: .

library:
  enable_unsafe_install: true

logging:
  file: ""
  format: text
  level: info

sketch:
  always_export_binaries: true

build_cache:
  compilations_before_purge: 10
  ttl: 720h0m0s

```

```plaintext
# ============================================================================
# WATER TANK FIRMWARE - Library Dependencies
# ============================================================================
# Format: library_name@version (or just library_name for latest)
# Lines starting with # are comments
# ============================================================================

# --- Core WiFi & Networking ---
ArduinoJson@7.0.4
PubSubClient@2.8
WiFiManager@2.0.17

# --- Sensors ---
# Ultrasonic sensor support
NewPing@1.9.7

# Temperature sensor (DS18B20)
OneWire@2.3.8
DallasTemperature@3.9.0

# --- Time & RTC ---
NTPClient@3.2.1
Time@1.6.1

# --- Storage ---
# LittleFS is included in ESP8266 core

# --- OTA Updates ---
# ArduinoOTA is included in ESP8266 core

# --- Audio/Alerts ---
# ESP8266Audio for better audio (optional, uncomment if needed)
# ESP8266Audio@1.9.7

# --- Debug & Logging ---
# ArduinoLog@1.1.1

# ============================================================================
# Future Libraries (uncomment when needed)
# ============================================================================

# Pressure sensor (I2C)
# Adafruit_BMP280@2.6.8

# OLED Display
# Adafruit_SSD1306@2.5.9
# Adafruit_GFX@1.11.9

# HTTP Client improvements
# ArduinoHttpClient@0.6.1

# Secure WiFi
# WiFiClientSecure is included in ESP8266 core

```

```makefile
# ============================================================================
#                    WATER TANK FIRMWARE - Build System
#                         Powered by arduino-cli
# ============================================================================

.PHONY: all build upload clean monitor setup install-libs update-libs \
        list-boards list-libs info help fqbn compile flash erase ota \
        deps check lint size

# Include project configuration
include config.mk

# Paths
FIRMWARE_DIR    := $(shell pwd)
SRC_DIR         := $(FIRMWARE_DIR)/src
LIB_DIR         := $(FIRMWARE_DIR)/lib
BUILD_DIR       := $(FIRMWARE_DIR)/build
SCRIPTS_DIR     := $(FIRMWARE_DIR)/scripts
SKETCH          := $(SRC_DIR)/$(PROJECT_NAME).ino

# arduino-cli command with config
CLI             := arduino-cli --config-file arduino-cli.yaml
CLI_FLAGS       := 

# Build output
BUILD_OUTPUT    := $(BUILD_DIR)/$(PROJECT_NAME)
BINARY          := $(BUILD_OUTPUT).ino.bin

# Colors for pretty output
RED             := \033[0;31m
GREEN           := \033[0;32m
YELLOW          := \033[1;33m
BLUE            := \033[0;34m
CYAN            := \033[0;36m
NC              := \033[0m

# ============================================================================
# Main Targets
# ============================================================================

all: build

## Build the firmware
build: compile
	@echo "$(GREEN)✓ Build complete!$(NC)"
	@echo "  Binary: $(BINARY)"
	@$(MAKE) size

## Compile only (alias for build)
compile: check-sketch
	@echo "$(CYAN)→ Compiling $(PROJECT_NAME)...$(NC)"
	@mkdir -p $(BUILD_DIR)
	$(CLI) compile \
		--fqbn $(BOARD_FQBN) \
		--build-path $(BUILD_DIR) \
		--libraries $(LIB_DIR) \
		--warnings $(WARNINGS) \
		$(foreach flag,$(BUILD_FLAGS),--build-property compiler.cpp.extra_flags="$(flag)") \
		$(SRC_DIR)

## Upload firmware to device
upload: build
	@echo "$(CYAN)→ Uploading to $(SERIAL_PORT)...$(NC)"
	$(CLI) upload \
		--fqbn $(BOARD_FQBN) \
		--port $(SERIAL_PORT) \
		--input-dir $(BUILD_DIR) \
		$(SRC_DIR)
	@echo "$(GREEN)✓ Upload complete!$(NC)"

## Flash (alias for upload)
flash: upload

## Clean build artifacts
clean:
	@echo "$(YELLOW)→ Cleaning build directory...$(NC)"
	rm -rf $(BUILD_DIR)/*
	@echo "$(GREEN)✓ Clean complete$(NC)"

## Serial monitor
monitor:
	@echo "$(CYAN)→ Opening serial monitor on $(SERIAL_PORT)...$(NC)"
	$(CLI) monitor --port $(SERIAL_PORT) --config baudrate=115200

## Build and upload in one step
run: upload monitor

# ============================================================================
# Setup & Dependencies
# ============================================================================

## Initial setup - install arduino-cli, cores, and libraries
setup: install-cli install-core install-libs
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "  Run 'make build' to compile the firmware"

## Check if arduino-cli is installed, install if not
install-cli:
	@echo "$(CYAN)→ Checking arduino-cli...$(NC)"
	@which arduino-cli > /dev/null 2>&1 || { \
		echo "$(YELLOW)→ Installing arduino-cli...$(NC)"; \
		curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh -s -- -b ~/.local/bin; \
		echo "$(GREEN)✓ arduino-cli installed to ~/.local/bin$(NC)"; \
		echo "  Add to PATH: export PATH=\"\$$HOME/.local/bin:\$$PATH\""; \
	}
	@arduino-cli version

## Install ESP8266/ESP32 core
install-core:
	@echo "$(CYAN)→ Updating board index...$(NC)"
	$(CLI) core update-index
	@echo "$(CYAN)→ Installing $(BOARD_PLATFORM)...$(NC)"
	$(CLI) core install $(BOARD_PLATFORM)
	@echo "$(GREEN)✓ Core installed$(NC)"

## Install libraries from libraries.txt
install-libs:
	@echo "$(CYAN)→ Installing libraries...$(NC)"
	@grep -v '^#' libraries.txt | grep -v '^$$' | while read lib; do \
		echo "  Installing: $$lib"; \
		$(CLI) lib install "$$lib" 2>/dev/null || echo "$(YELLOW)  Warning: $$lib may already be installed$(NC)"; \
	done
	@echo "$(GREEN)✓ Libraries installed$(NC)"

## Update all installed libraries
update-libs:
	@echo "$(CYAN)→ Updating libraries...$(NC)"
	$(CLI) lib update-index
	$(CLI) lib upgrade
	@echo "$(GREEN)✓ Libraries updated$(NC)"

## Add a new library (usage: make add-lib LIB="LibraryName@version")
add-lib:
	@if [ -z "$(LIB)" ]; then \
		echo "$(RED)Error: Specify library with LIB=\"LibraryName@version\"$(NC)"; \
		exit 1; \
	fi
	@echo "$(CYAN)→ Installing $(LIB)...$(NC)"
	$(CLI) lib install "$(LIB)"
	@echo "$(LIB)" >> libraries.txt
	@echo "$(GREEN)✓ $(LIB) installed and added to libraries.txt$(NC)"

## Search for a library (usage: make search-lib LIB="sensor")
search-lib:
	@if [ -z "$(LIB)" ]; then \
		echo "$(RED)Error: Specify search term with LIB=\"search term\"$(NC)"; \
		exit 1; \
	fi
	$(CLI) lib search "$(LIB)"

# ============================================================================
# OTA Update (Over-The-Air)
# ============================================================================

## Upload via OTA
ota: build
	@if [ -z "$(OTA_HOST)" ]; then \
		echo "$(RED)Error: Set OTA_HOST in config.mk$(NC)"; \
		exit 1; \
	fi
	@echo "$(CYAN)→ OTA upload to $(OTA_HOST)...$(NC)"
	python3 $(SCRIPTS_DIR)/espota.py \
		-i $(OTA_HOST) \
		-p $(OTA_PORT) \
		$(if $(OTA_PASSWORD),-a $(OTA_PASSWORD)) \
		-f $(BINARY)
	@echo "$(GREEN)✓ OTA upload complete$(NC)"

# ============================================================================
# Information & Diagnostics
# ============================================================================

## Show build info
info:
	@echo "$(BLUE)═══════════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)  Water Tank Firmware - Build Info$(NC)"
	@echo "$(BLUE)═══════════════════════════════════════════════════════════$(NC)"
	@echo "  Project:    $(PROJECT_NAME) v$(VERSION)"
	@echo "  Board:      $(BOARD_FQBN)"
	@echo "  Port:       $(SERIAL_PORT)"
	@echo "  Sketch:     $(SKETCH)"
	@echo "  Build Dir:  $(BUILD_DIR)"
	@echo "  Debug:      $(DEBUG)"
	@echo "$(BLUE)═══════════════════════════════════════════════════════════$(NC)"

## List connected boards
list-boards:
	@echo "$(CYAN)→ Connected boards:$(NC)"
	$(CLI) board list

## List installed libraries
list-libs:
	@echo "$(CYAN)→ Installed libraries:$(NC)"
	$(CLI) lib list

## List installed cores
list-cores:
	@echo "$(CYAN)→ Installed cores:$(NC)"
	$(CLI) core list

## Show binary size
size: 
	@if [ -f "$(BINARY)" ]; then \
		echo "$(CYAN)→ Binary size:$(NC)"; \
		ls -lh $(BINARY); \
		echo ""; \
		$(CLI) compile \
			--fqbn $(BOARD_FQBN) \
			--build-path $(BUILD_DIR) \
			--libraries $(LIB_DIR) \
			$(SRC_DIR) 2>&1 | grep -E "(Sketch|Global|bytes)"; \
	else \
		echo "$(YELLOW)Binary not found. Run 'make build' first$(NC)"; \
	fi

## Check if sketch exists
check-sketch:
	@if [ ! -f "$(SKETCH)" ]; then \
		echo "$(RED)Error: Sketch not found at $(SKETCH)$(NC)"; \
		echo "$(YELLOW)Creating template sketch...$(NC)"; \
		$(MAKE) create-sketch; \
	fi

## Create template sketch if missing
create-sketch:
	@mkdir -p $(SRC_DIR)
	@echo "// $(PROJECT_NAME).ino - Auto-generated template" > $(SKETCH)
	@echo "// Edit this file or replace with your code" >> $(SKETCH)
	@echo "" >> $(SKETCH)
	@echo "#include <Arduino.h>" >> $(SKETCH)
	@echo "" >> $(SKETCH)
	@echo "void setup() {" >> $(SKETCH)
	@echo "    Serial.begin(115200);" >> $(SKETCH)
	@echo "    Serial.println(\"$(PROJECT_NAME) v$(VERSION)\");" >> $(SKETCH)
	@echo "}" >> $(SKETCH)
	@echo "" >> $(SKETCH)
	@echo "void loop() {" >> $(SKETCH)
	@echo "    delay(1000);" >> $(SKETCH)
	@echo "}" >> $(SKETCH)
	@echo "$(GREEN)✓ Template sketch created at $(SKETCH)$(NC)"

## Erase flash completely
erase:
	@echo "$(YELLOW)→ Erasing flash on $(SERIAL_PORT)...$(NC)"
	@echo "$(RED)WARNING: This will erase ALL data including WiFi credentials!$(NC)"
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	esptool.py --port $(SERIAL_PORT) erase_flash
	@echo "$(GREEN)✓ Flash erased$(NC)"

# ============================================================================
# Help
# ============================================================================

## Show this help
help:
	@echo ""
	@echo "$(BLUE)═══════════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)  Water Tank Firmware - Build System Help$(NC)"
	@echo "$(BLUE)═══════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(CYAN)Build Commands:$(NC)"
	@echo "  make build        - Compile the firmware"
	@echo "  make upload       - Build and upload to device"
	@echo "  make flash        - Alias for upload"
	@echo "  make run          - Build, upload, and open monitor"
	@echo "  make clean        - Remove build artifacts"
	@echo ""
	@echo "$(CYAN)Setup Commands:$(NC)"
	@echo "  make setup        - Full setup (cli + core + libs)"
	@echo "  make install-libs - Install libraries from libraries.txt"
	@echo "  make update-libs  - Update all libraries"
	@echo "  make add-lib LIB=\"Name@ver\" - Add new library"
	@echo "  make search-lib LIB=\"term\"  - Search for library"
	@echo ""
	@echo "$(CYAN)Development:$(NC)"
	@echo "  make monitor      - Open serial monitor"
	@echo "  make ota          - Upload via OTA"
	@echo "  make erase        - Erase entire flash"
	@echo ""
	@echo "$(CYAN)Information:$(NC)"
	@echo "  make info         - Show build configuration"
	@echo "  make size         - Show binary size"
	@echo "  make list-boards  - List connected boards"
	@echo "  make list-libs    - List installed libraries"
	@echo "  make list-cores   - List installed cores"
	@echo ""
	@echo "$(CYAN)Configuration:$(NC)"
	@echo "  Edit config.mk for board/project settings"
	@echo "  Edit libraries.txt for dependencies"
	@echo ""
	@echo "$(CYAN)Debug Build:$(NC)"
	@echo "  make build DEBUG=1"
	@echo ""

```

```shellscript
#!/bin/bash
# ============================================================================
# WATER TANK FIRMWARE - Initial Setup Script
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Water Tank Firmware - Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check for arduino-cli
echo -e "${CYAN}→ Checking arduino-cli...${NC}"
if ! command -v arduino-cli &> /dev/null; then
    echo -e "${YELLOW}→ arduino-cli not found. Installing...${NC}"
    
    # Create ~/.local/bin if it doesn't exist
    mkdir -p ~/.local/bin
    
    # Download and install
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh -s -- -b ~/.local/bin
    
    # Add to PATH for this session
    export PATH="$HOME/.local/bin:$PATH"
    
    echo -e "${GREEN}✓ arduino-cli installed${NC}"
    echo -e "${YELLOW}  Add to your shell profile:${NC}"
    echo -e "  export PATH=\"\$HOME/.local/bin:\$PATH\""
else
    echo -e "${GREEN}✓ arduino-cli found: $(which arduino-cli)${NC}"
fi

arduino-cli version

echo ""
echo -e "${CYAN}→ Updating board index...${NC}"
cd "$FIRMWARE_DIR"
arduino-cli --config-file arduino-cli.yaml core update-index

echo ""
echo -e "${CYAN}→ Installing ESP8266 core...${NC}"
arduino-cli --config-file arduino-cli.yaml core install esp8266:esp8266

echo ""
echo -e "${CYAN}→ Installing libraries...${NC}"
"$SCRIPT_DIR/libs.sh" install

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Next steps:"
echo -e "  1. cd $FIRMWARE_DIR"
echo -e "  2. make build    # Compile firmware"
echo -e "  3. make upload   # Upload to device"
echo -e "  4. make monitor  # View serial output"
echo ""

```

```shellscript
#!/bin/bash
# ============================================================================
# WATER TANK FIRMWARE - Library Management Script
# ============================================================================
# Usage:
#   ./libs.sh install          - Install all libraries from libraries.txt
#   ./libs.sh update           - Update all installed libraries
#   ./libs.sh add "Lib@1.0.0"  - Add and install a new library
#   ./libs.sh remove "LibName" - Remove a library
#   ./libs.sh search "query"   - Search for libraries
#   ./libs.sh list             - List installed libraries
#   ./libs.sh sync             - Sync libraries.txt with installed
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="$(dirname "$SCRIPT_DIR")"
LIBRARIES_FILE="$FIRMWARE_DIR/libraries.txt"
CLI="arduino-cli --config-file $FIRMWARE_DIR/arduino-cli.yaml"

# Parse libraries.txt (ignore comments and empty lines)
parse_libraries() {
    grep -v '^#' "$LIBRARIES_FILE" | grep -v '^[[:space:]]*$'
}

# Install all libraries from libraries.txt
cmd_install() {
    echo -e "${CYAN}→ Installing libraries from libraries.txt...${NC}"
    
    while IFS= read -r lib; do
        if [ -n "$lib" ]; then
            echo -e "  Installing: ${lib}"
            $CLI lib install "$lib" 2>/dev/null || echo -e "  ${YELLOW}Warning: $lib may already exist or failed${NC}"
        fi
    done < <(parse_libraries)
    
    echo -e "${GREEN}✓ Libraries installed${NC}"
}

# Update all installed libraries
cmd_update() {
    echo -e "${CYAN}→ Updating library index...${NC}"
    $CLI lib update-index
    
    echo -e "${CYAN}→ Upgrading libraries...${NC}"
    $CLI lib upgrade
    
    echo -e "${GREEN}✓ Libraries updated${NC}"
}

# Add a new library
cmd_add() {
    local lib="$1"
    if [ -z "$lib" ]; then
        echo -e "${RED}Error: Specify library name/version${NC}"
        echo "Usage: $0 add \"LibraryName@version\""
        exit 1
    fi
    
    echo -e "${CYAN}→ Installing $lib...${NC}"
    $CLI lib install "$lib"
    
    # Add to libraries.txt if not already there
    local lib_name="${lib%%@*}"
    if ! grep -q "^${lib_name}" "$LIBRARIES_FILE" 2>/dev/null; then
        echo "$lib" >> "$LIBRARIES_FILE"
        echo -e "${GREEN}✓ Added $lib to libraries.txt${NC}"
    else
        # Update existing entry
        sed -i "s/^${lib_name}.*$/${lib}/" "$LIBRARIES_FILE"
        echo -e "${GREEN}✓ Updated $lib in libraries.txt${NC}"
    fi
}

# Remove a library
cmd_remove() {
    local lib="$1"
    if [ -z "$lib" ]; then
        echo -e "${RED}Error: Specify library name${NC}"
        exit 1
    fi
    
    echo -e "${CYAN}→ Removing $lib...${NC}"
    $CLI lib uninstall "$lib" || true
    
    # Remove from libraries.txt
    sed -i "/^${lib}/d" "$LIBRARIES_FILE"
    echo -e "${GREEN}✓ Removed $lib${NC}"
}

# Search for libraries
cmd_search() {
    local query="$1"
    if [ -z "$query" ]; then
        echo -e "${RED}Error: Specify search query${NC}"
        exit 1
    fi
    
    echo -e "${CYAN}→ Searching for \"$query\"...${NC}"
    $CLI lib search "$query"
}

# List installed libraries
cmd_list() {
    echo -e "${CYAN}→ Installed libraries:${NC}"
    $CLI lib list
}

# Show deps (what's in libraries.txt)
cmd_deps() {
    echo -e "${CYAN}→ Dependencies (libraries.txt):${NC}"
    parse_libraries | while IFS= read -r lib; do
        echo "  • $lib"
    done
}

# Show help
cmd_help() {
    echo ""
    echo "Water Tank Firmware - Library Manager"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  install          Install all libraries from libraries.txt"
    echo "  update           Update all installed libraries"
    echo "  add \"Lib@ver\"    Add and install a new library"
    echo "  remove \"LibName\" Remove a library"
    echo "  search \"query\"   Search for libraries"
    echo "  list             List installed libraries"
    echo "  deps             Show libraries.txt entries"
    echo "  help             Show this help"
    echo ""
}

# Main
case "${1:-help}" in
    install)
        cmd_install
        ;;
    update)
        cmd_update
        ;;
    add)
        cmd_add "$2"
        ;;
    remove)
        cmd_remove "$2"
        ;;
    search)
        cmd_search "$2"
        ;;
    list)
        cmd_list
        ;;
    deps)
        cmd_deps
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        cmd_help
        exit 1
        ;;
esac

```

Now let me create the modular firmware structure:

```cpp
/**
 * ============================================================================
 * WATER TANK MONITORING SYSTEM - Main Firmware
 * ============================================================================
 * 
 * A modular, low-power water level monitoring system for ESP8266.
 * 
 * Features:
 *   - Ultrasonic water level sensing
 *   - WiFi connectivity with auto-reconnect
 *   - HTTPS/MQTT data reporting
 *   - OTA firmware updates
 *   - Local audio alerts
 *   - Temperature monitoring
 *   - Battery level tracking
 * 
 * Author: Your Name
 * License: MIT
 * ============================================================================
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>

// Project modules
#include "modules/config.h"
#include "modules/wifi_manager.h"
#include "modules/sensor.h"
#include "modules/alerts.h"
#include "modules/data_reporter.h"
#include "modules/ota_handler.h"
#include "modules/storage.h"

// ============================================================================
// Global State
// ============================================================================

struct SystemState {
    float waterLevelCm;
    float volumeLiters;
    float temperatureC;
    float batteryVoltage;
    int wifiRssi;
    unsigned long lastMeasurement;
    unsigned long lastReport;
    bool wifiConnected;
    bool alertActive;
} state;

// ============================================================================
// Setup
// ============================================================================

void setup() {
    // Initialize serial for debugging
    Serial.begin(115200);
    delay(100);
    
    Serial.println();
    Serial.println(F("═══════════════════════════════════════════════════"));
    Serial.println(F("  WATER TANK MONITOR"));
    Serial.print(F("  Version: "));
    Serial.println(FIRMWARE_VERSION);
    Serial.println(F("═══════════════════════════════════════════════════"));
    Serial.println();

    // Initialize modules
    Storage::init();
    Config::load();
    
    Sensor::init();
    Alerts::init();
    
    // Connect to WiFi
    Serial.println(F("[WiFi] Connecting..."));
    WifiManager::init();
    
    if (WifiManager::connect()) {
        state.wifiConnected = true;
        state.wifiRssi = WiFi.RSSI();
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());
        
        // Initialize OTA after WiFi is connected
        OTAHandler::init();
        
        // Initialize data reporter
        DataReporter::init();
    } else {
        Serial.println(F("[WiFi] Connection failed, will retry..."));
        state.wifiConnected = false;
    }
    
    // Play startup sound
    Alerts::playStartupSound();
    
    Serial.println(F("[System] Setup complete!"));
    Serial.println();
}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
    unsigned long now = millis();
    
    // Handle OTA updates
    OTAHandler::handle();
    
    // Check WiFi connection
    if (!WifiManager::isConnected()) {
        if (state.wifiConnected) {
            Serial.println(F("[WiFi] Connection lost, reconnecting..."));
            state.wifiConnected = false;
        }
        WifiManager::reconnect();
    } else if (!state.wifiConnected) {
        state.wifiConnected = true;
        state.wifiRssi = WiFi.RSSI();
        Serial.println(F("[WiFi] Reconnected!"));
    }
    
    // Take measurements at configured interval
    if (now - state.lastMeasurement >= Config::measurementIntervalMs) {
        takeMeasurement();
        state.lastMeasurement = now;
    }
    
    // Report data at configured interval
    if (now - state.lastReport >= Config::reportIntervalMs) {
        if (state.wifiConnected) {
            reportData();
        } else {
            // Store locally for later upload
            Storage::bufferMeasurement(state);
        }
        state.lastReport = now;
    }
    
    // Check alert conditions
    checkAlerts();
    
    // Small delay to prevent tight loop
    delay(10);
}

// ============================================================================
// Measurement Functions
// ============================================================================

void takeMeasurement() {
    Serial.println(F("[Sensor] Taking measurement..."));
    
    // Read water level
    state.waterLevelCm = Sensor::readWaterLevel();
    state.volumeLiters = Sensor::calculateVolume(state.waterLevelCm);
    
    // Read temperature
    state.temperatureC = Sensor::readTemperature();
    
    // Read battery voltage
    state.batteryVoltage = Sensor::readBatteryVoltage();
    
    // Get WiFi signal strength
    if (state.wifiConnected) {
        state.wifiRssi = WiFi.RSSI();
    }
    
    // Log measurement
    Serial.printf("[Sensor] Level: %.1f cm, Volume: %.1f L, Temp: %.1f°C, Battery: %.2fV\n",
        state.waterLevelCm,
        state.volumeLiters,
        state.temperatureC,
        state.batteryVoltage
    );
}

void reportData() {
    Serial.println(F("[Report] Sending data..."));
    
    bool success = DataReporter::send(
        state.waterLevelCm,
        state.volumeLiters,
        state.temperatureC,
        state.batteryVoltage,
        state.wifiRssi
    );
    
    if (success) {
        Serial.println(F("[Report] Data sent successfully"));
        // Try to send any buffered data
        Storage::flushBuffer();
    } else {
        Serial.println(F("[Report] Failed to send, buffering locally"));
        Storage::bufferMeasurement(state);
    }
}

void checkAlerts() {
    // Check for tank full
    if (state.volumeLiters >= Config::tankFullThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Tank is FULL!"));
            Alerts::triggerTankFull();
            state.alertActive = true;
        }
    }
    // Check for tank low
    else if (state.volumeLiters <= Config::tankLowThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Tank is LOW!"));
            Alerts::triggerTankLow();
            state.alertActive = true;
        }
    }
    // Check for battery low
    else if (state.batteryVoltage < Config::batteryLowThreshold) {
        if (!state.alertActive) {
            Serial.println(F("[Alert] Battery LOW!"));
            Alerts::triggerBatteryLow();
            state.alertActive = true;
        }
    }
    else {
        state.alertActive = false;
    }
}

```

```cpp
/**
 * ============================================================================
 * Configuration Module
 * ============================================================================
 * Central configuration for the water tank monitoring system.
 * Edit these values or override via OTA config updates.
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ============================================================================
// Firmware Version
// ============================================================================

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.1.0"
#endif

// ============================================================================
// WiFi Configuration
// ============================================================================

// Primary WiFi credentials
#define WIFI_SSID           "YOUR_WIFI_SSID"
#define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"

// Fallback AP mode for configuration
#define AP_SSID             "WaterTank-Setup"
#define AP_PASSWORD         "watertank123"

// Connection settings
#define WIFI_CONNECT_TIMEOUT_MS     15000
#define WIFI_RECONNECT_INTERVAL_MS  30000

// ============================================================================
// Server Configuration
// ============================================================================

#define SERVER_HOST         "your-server.com"
#define SERVER_PORT         443
#define SERVER_ENDPOINT     "/api/v1/measurements"
#define DEVICE_TOKEN        "your-device-token"

// Use HTTPS (recommended)
#define USE_HTTPS           true

// MQTT (alternative to HTTP)
#define MQTT_ENABLED        false
#define MQTT_BROKER         "mqtt.your-server.com"
#define MQTT_PORT           8883
#define MQTT_USER           ""
#define MQTT_PASSWORD       ""
#define MQTT_TOPIC          "watertank/device1"

// ============================================================================
// Hardware Pin Configuration
// ============================================================================

// Ultrasonic Sensor (HC-SR04 or similar)
#define PIN_ULTRASONIC_TRIG     D1      // GPIO5
#define PIN_ULTRASONIC_ECHO     D2      // GPIO4

// Temperature Sensor (DS18B20)
#define PIN_TEMPERATURE         D3      // GPIO0

// Speaker/Buzzer
#define PIN_SPEAKER             D5      // GPIO14

// Battery ADC (through voltage divider)
#define PIN_BATTERY_ADC         A0      // ADC (0-1V input)

// Status LED
#define PIN_STATUS_LED          LED_BUILTIN

// ============================================================================
// Tank Configuration
// ============================================================================

// Tank dimensions (for volume calculation)
// Adjust these based on your tank geometry
#define TANK_HEIGHT_CM          150.0   // Total height in cm
#define TANK_LENGTH_CM          100.0   // Length in cm (for rectangular)
#define TANK_WIDTH_CM           100.0   // Width in cm (for rectangular)

// OR for cylindrical tank:
// #define TANK_DIAMETER_CM     100.0
// #define TANK_IS_CYLINDRICAL  true

// Sensor mounting offset (distance from sensor to max water level)
#define SENSOR_OFFSET_CM        10.0

// Empty/Full calibration
#define LEVEL_EMPTY_CM          140.0   // Distance when tank is empty
#define LEVEL_FULL_CM           20.0    // Distance when tank is full

// ============================================================================
// Alert Thresholds
// ============================================================================

#define TANK_FULL_THRESHOLD_L       900.0   // Alert when volume >= this
#define TANK_LOW_THRESHOLD_L        100.0   // Alert when volume <= this
#define BATTERY_LOW_THRESHOLD_V     3.3     // Battery voltage warning

// Hysteresis to prevent alert flapping
#define ALERT_HYSTERESIS_L          20.0

// Quiet hours (no audible alerts)
#define QUIET_HOURS_START           22      // 10 PM
#define QUIET_HOURS_END             7       // 7 AM

// ============================================================================
// Timing Configuration
// ============================================================================

// How often to take measurements (milliseconds)
#define MEASUREMENT_INTERVAL_MS     60000   // 1 minute

// How often to report to server (milliseconds)
#define REPORT_INTERVAL_MS          300000  // 5 minutes

// Sensor stabilization delay
#define SENSOR_WARMUP_MS            100

// ============================================================================
// OTA Configuration
// ============================================================================

#define OTA_HOSTNAME            "watertank"
#define OTA_PASSWORD            ""  // Leave empty for no password
#define OTA_PORT                8266

// Remote OTA update URL (for server-pushed updates)
#define OTA_UPDATE_URL          "https://your-server.com/api/v1/devices/ota"

// ============================================================================
// Runtime Config Class
// ============================================================================

namespace Config {
    // These can be modified at runtime and saved to flash
    extern unsigned long measurementIntervalMs;
    extern unsigned long reportIntervalMs;
    extern float tankFullThreshold;
    extern float tankLowThreshold;
    extern float batteryLowThreshold;
    extern float levelEmptyCm;
    extern float levelFullCm;
    
    // Load config from flash
    void load();
    
    // Save config to flash
    void save();
    
    // Reset to defaults
    void reset();
    
    // Apply config from JSON (for remote updates)
    bool applyFromJson(const char* json);
}

#endif // CONFIG_H

```

```cpp
/**
 * Configuration Module Implementation
 */

#include "config.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

#define CONFIG_FILE "/config.json"

namespace Config {
    // Runtime configuration with defaults
    unsigned long measurementIntervalMs = MEASUREMENT_INTERVAL_MS;
    unsigned long reportIntervalMs = REPORT_INTERVAL_MS;
    float tankFullThreshold = TANK_FULL_THRESHOLD_L;
    float tankLowThreshold = TANK_LOW_THRESHOLD_L;
    float batteryLowThreshold = BATTERY_LOW_THRESHOLD_V;
    float levelEmptyCm = LEVEL_EMPTY_CM;
    float levelFullCm = LEVEL_FULL_CM;

    void load() {
        Serial.println(F("[Config] Loading from flash..."));
        
        if (!LittleFS.begin()) {
            Serial.println(F("[Config] Failed to mount filesystem, using defaults"));
            return;
        }
        
        if (!LittleFS.exists(CONFIG_FILE)) {
            Serial.println(F("[Config] No config file, using defaults"));
            return;
        }
        
        File file = LittleFS.open(CONFIG_FILE, "r");
        if (!file) {
            Serial.println(F("[Config] Failed to open config file"));
            return;
        }
        
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, file);
        file.close();
        
        if (error) {
            Serial.printf("[Config] Parse error: %s\n", error.c_str());
            return;
        }
        
        // Load values
        measurementIntervalMs = doc["measurement_interval"] | MEASUREMENT_INTERVAL_MS;
        reportIntervalMs = doc["report_interval"] | REPORT_INTERVAL_MS;
        tankFullThreshold = doc["tank_full_threshold"] | TANK_FULL_THRESHOLD_L;
        tankLowThreshold = doc["tank_low_threshold"] | TANK_LOW_THRESHOLD_L;
        batteryLowThreshold = doc["battery_low_threshold"] | BATTERY_LOW_THRESHOLD_V;
        levelEmptyCm = doc["level_empty_cm"] | LEVEL_EMPTY_CM;
        levelFullCm = doc["level_full_cm"] | LEVEL_FULL_CM;
        
        Serial.println(F("[Config] Loaded successfully"));
    }

    void save() {
        Serial.println(F("[Config] Saving to flash..."));
        
        if (!LittleFS.begin()) {
            Serial.println(F("[Config] Failed to mount filesystem"));
            return;
        }
        
        File file = LittleFS.open(CONFIG_FILE, "w");
        if (!file) {
            Serial.println(F("[Config] Failed to create config file"));
            return;
        }
        
        JsonDocument doc;
        doc["measurement_interval"] = measurementIntervalMs;
        doc["report_interval"] = reportIntervalMs;
        doc["tank_full_threshold"] = tankFullThreshold;
        doc["tank_low_threshold"] = tankLowThreshold;
        doc["battery_low_threshold"] = batteryLowThreshold;
        doc["level_empty_cm"] = levelEmptyCm;
        doc["level_full_cm"] = levelFullCm;
        
        serializeJson(doc, file);
        file.close();
        
        Serial.println(F("[Config] Saved successfully"));
    }

    void reset() {
        Serial.println(F("[Config] Resetting to defaults..."));
        
        measurementIntervalMs = MEASUREMENT_INTERVAL_MS;
        reportIntervalMs = REPORT_INTERVAL_MS;
        tankFullThreshold = TANK_FULL_THRESHOLD_L;
        tankLowThreshold = TANK_LOW_THRESHOLD_L;
        batteryLowThreshold = BATTERY_LOW_THRESHOLD_V;
        levelEmptyCm = LEVEL_EMPTY_CM;
        levelFullCm = LEVEL_FULL_CM;
        
        // Delete config file
        if (LittleFS.begin()) {
            LittleFS.remove(CONFIG_FILE);
        }
        
        Serial.println(F("[Config] Reset complete"));
    }

    bool applyFromJson(const char* json) {
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, json);
        
        if (error) {
            Serial.printf("[Config] JSON parse error: %s\n", error.c_str());
            return false;
        }
        
        // Apply values (only if present in JSON)
        if (doc.containsKey("measurement_interval")) {
            measurementIntervalMs = doc["measurement_interval"];
        }
        if (doc.containsKey("report_interval")) {
            reportIntervalMs = doc["report_interval"];
        }
        if (doc.containsKey("tank_full_threshold")) {
            tankFullThreshold = doc["tank_full_threshold"];
        }
        if (doc.containsKey("tank_low_threshold")) {
            tankLowThreshold = doc["tank_low_threshold"];
        }
        if (doc.containsKey("battery_low_threshold")) {
            batteryLowThreshold = doc["battery_low_threshold"];
        }
        if (doc.containsKey("level_empty_cm")) {
            levelEmptyCm = doc["level_empty_cm"];
        }
        if (doc.containsKey("level_full_cm")) {
            levelFullCm = doc["level_full_cm"];
        }
        
        save();
        return true;
    }
}

```

```cpp
/**
 * ============================================================================
 * Sensor Module
 * ============================================================================
 * Handles all sensor readings: ultrasonic, temperature, battery
 */

#ifndef SENSOR_H
#define SENSOR_H

#include <Arduino.h>

namespace Sensor {
    /**
     * Initialize all sensors
     */
    void init();
    
    /**
     * Read water level using ultrasonic sensor
     * @return Distance from sensor to water surface in cm
     */
    float readWaterLevel();
    
    /**
     * Calculate water volume from level
     * @param levelCm Distance reading in cm
     * @return Volume in liters
     */
    float calculateVolume(float levelCm);
    
    /**
     * Read temperature
     * @return Temperature in Celsius
     */
    float readTemperature();
    
    /**
     * Read battery voltage
     * @return Voltage in V
     */
    float readBatteryVoltage();
    
    /**
     * Get percentage of tank filled
     * @param levelCm Distance reading
     * @return Percentage 0-100
     */
    float getPercentage(float levelCm);
    
    /**
     * Perform sensor calibration (reads empty and full points)
     */
    void calibrate();
}

#endif // SENSOR_H

```

```cpp
/**
 * Sensor Module Implementation
 */

#include "sensor.h"
#include "config.h"
#include <NewPing.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Ultrasonic sensor
static NewPing* sonar = nullptr;

// Temperature sensor
static OneWire* oneWire = nullptr;
static DallasTemperature* tempSensor = nullptr;

// Number of samples for averaging
#define NUM_SAMPLES         5
#define SAMPLE_DELAY_MS     50

// Max distance for ultrasonic (cm)
#define MAX_DISTANCE_CM     400

// ADC voltage divider ratio (adjust based on your circuit)
// If using 100k/100k divider: ratio = 2.0
// If using direct: ratio = 1.0 (ESP8266 ADC max is 1V!)
#define BATTERY_DIVIDER_RATIO   2.0

namespace Sensor {
    void init() {
        Serial.println(F("[Sensor] Initializing..."));
        
        // Initialize ultrasonic sensor
        sonar = new NewPing(PIN_ULTRASONIC_TRIG, PIN_ULTRASONIC_ECHO, MAX_DISTANCE_CM);
        
        // Initialize temperature sensor
        oneWire = new OneWire(PIN_TEMPERATURE);
        tempSensor = new DallasTemperature(oneWire);
        tempSensor->begin();
        
        // Warmup delay
        delay(SENSOR_WARMUP_MS);
        
        Serial.println(F("[Sensor] Initialized"));
    }

    float readWaterLevel() {
        if (!sonar) return -1;
        
        // Take multiple readings and use median
        float readings[NUM_SAMPLES];
        
        for (int i = 0; i < NUM_SAMPLES; i++) {
            unsigned int uS = sonar->ping();
            readings[i] = sonar->convert_cm(uS);
            
            // If reading is 0, sensor didn't get echo
            if (readings[i] == 0) {
                readings[i] = MAX_DISTANCE_CM;
            }
            
            delay(SAMPLE_DELAY_MS);
        }
        
        // Simple bubble sort for median
        for (int i = 0; i < NUM_SAMPLES - 1; i++) {
            for (int j = i + 1; j < NUM_SAMPLES; j++) {
                if (readings[j] < readings[i]) {
                    float temp = readings[i];
                    readings[i] = readings[j];
                    readings[j] = temp;
                }
            }
        }
        
        // Return median
        return readings[NUM_SAMPLES / 2];
    }

    float calculateVolume(float levelCm) {
        // Calculate water height from distance reading
        // levelCm is distance from sensor to water surface
        // waterHeight = emptyDistance - levelCm
        
        float waterHeightCm = Config::levelEmptyCm - levelCm;
        
        // Clamp to valid range
        if (waterHeightCm < 0) waterHeightCm = 0;
        float maxHeight = Config::levelEmptyCm - Config::levelFullCm;
        if (waterHeightCm > maxHeight) waterHeightCm = maxHeight;
        
        #ifdef TANK_IS_CYLINDRICAL
            // Cylindrical tank: V = π * r² * h
            float radiusCm = TANK_DIAMETER_CM / 2.0;
            float volumeCm3 = PI * radiusCm * radiusCm * waterHeightCm;
        #else
            // Rectangular tank: V = L * W * H
            float volumeCm3 = TANK_LENGTH_CM * TANK_WIDTH_CM * waterHeightCm;
        #endif
        
        // Convert cm³ to liters (1000 cm³ = 1 L)
        return volumeCm3 / 1000.0;
    }

    float readTemperature() {
        if (!tempSensor) return -127;
        
        tempSensor->requestTemperatures();
        float tempC = tempSensor->getTempCByIndex(0);
        
        // Check for error (-127 means no sensor or disconnected)
        if (tempC == DEVICE_DISCONNECTED_C) {
            Serial.println(F("[Sensor] Temperature sensor disconnected"));
            return -127;
        }
        
        return tempC;
    }

    float readBatteryVoltage() {
        // ESP8266 ADC is 10-bit (0-1023) with 0-1V range
        int rawAdc = analogRead(PIN_BATTERY_ADC);
        
        // Convert to voltage
        float voltage = (rawAdc / 1023.0) * BATTERY_DIVIDER_RATIO;
        
        // For LiPo: multiply by divider ratio to get actual battery voltage
        // Typical LiPo: 4.2V full, 3.0V empty
        
        return voltage;
    }

    float getPercentage(float levelCm) {
        float emptyDist = Config::levelEmptyCm;
        float fullDist = Config::levelFullCm;
        
        // Clamp level to valid range
        if (levelCm >= emptyDist) return 0;
        if (levelCm <= fullDist) return 100;
        
        // Linear interpolation
        float percentage = 100.0 * (emptyDist - levelCm) / (emptyDist - fullDist);
        
        return percentage;
    }

    void calibrate() {
        Serial.println(F("[Sensor] Calibration mode"));
        Serial.println(F("  1. Empty the tank completely"));
        Serial.println(F("  2. Press any key when ready..."));
        
        while (!Serial.available()) {
            delay(100);
        }
        Serial.read();
        
        float emptyReading = readWaterLevel();
        Serial.printf("  Empty level: %.1f cm\n", emptyReading);
        
        Serial.println(F("  3. Fill the tank to maximum level"));
        Serial.println(F("  4. Press any key when ready..."));
        
        while (!Serial.available()) {
            delay(100);
        }
        Serial.read();
        
        float fullReading = readWaterLevel();
        Serial.printf("  Full level: %.1f cm\n", fullReading);
        
        // Update config
        Config::levelEmptyCm = emptyReading;
        Config::levelFullCm = fullReading;
        Config::save();
        
        Serial.println(F("[Sensor] Calibration saved!"));
    }
}

```

```cpp
/**
 * ============================================================================
 * WiFi Manager Module
 * ============================================================================
 * Handles WiFi connection, reconnection, and AP fallback
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <Arduino.h>

namespace WifiManager {
    /**
     * Initialize WiFi
     */
    void init();
    
    /**
     * Connect to configured WiFi network
     * @return true if connected successfully
     */
    bool connect();
    
    /**
     * Check if WiFi is currently connected
     */
    bool isConnected();
    
    /**
     * Attempt to reconnect if disconnected
     */
    void reconnect();
    
    /**
     * Start AP mode for configuration
     */
    void startConfigPortal();
    
    /**
     * Get current RSSI (signal strength)
     */
    int getRssi();
    
    /**
     * Get IP address as string
     */
    String getIpAddress();
    
    /**
     * Get MAC address as string
     */
    String getMacAddress();
}

#endif // WIFI_MANAGER_H

```

```cpp
/**
 * WiFi Manager Module Implementation
 */

#include "wifi_manager.h"
#include "config.h"
#include <ESP8266WiFi.h>

static unsigned long lastReconnectAttempt = 0;

namespace WifiManager {
    void init() {
        WiFi.mode(WIFI_STA);
        WiFi.hostname(OTA_HOSTNAME);
        WiFi.setAutoReconnect(true);
        WiFi.persistent(true);
    }

    bool connect() {
        Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
        
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        
        unsigned long startTime = millis();
        while (WiFi.status() != WL_CONNECTED) {
            if (millis() - startTime > WIFI_CONNECT_TIMEOUT_MS) {
                Serial.println(F("[WiFi] Connection timeout"));
                return false;
            }
            delay(500);
            Serial.print(".");
        }
        Serial.println();
        
        return true;
    }

    bool isConnected() {
        return WiFi.status() == WL_CONNECTED;
    }

    void reconnect() {
        unsigned long now = millis();
        
        // Don't spam reconnect attempts
        if (now - lastReconnectAttempt < WIFI_RECONNECT_INTERVAL_MS) {
            return;
        }
        
        lastReconnectAttempt = now;
        
        Serial.println(F("[WiFi] Attempting reconnect..."));
        
        WiFi.disconnect();
        delay(100);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        
        // Non-blocking: just start the connection attempt
        // Loop will check status later
    }

    void startConfigPortal() {
        Serial.println(F("[WiFi] Starting configuration portal..."));
        
        WiFi.mode(WIFI_AP);
        WiFi.softAP(AP_SSID, AP_PASSWORD);
        
        Serial.print(F("[WiFi] AP IP: "));
        Serial.println(WiFi.softAPIP());
        
        // TODO: Start web server for configuration
        // For now, this is a placeholder
    }

    int getRssi() {
        if (isConnected()) {
            return WiFi.RSSI();
        }
        return 0;
    }

    String getIpAddress() {
        if (isConnected()) {
            return WiFi.localIP().toString();
        }
        return "0.0.0.0";
    }

    String getMacAddress() {
        return WiFi.macAddress();
    }
}

```

```cpp
/**
 * ============================================================================
 * Alerts Module
 * ============================================================================
 * Handles local audio alerts and LED indicators
 */

#ifndef ALERTS_H
#define ALERTS_H

#include <Arduino.h>

namespace Alerts {
    /**
     * Initialize alert system (speaker, LED)
     */
    void init();
    
    /**
     * Play startup sound
     */
    void playStartupSound();
    
    /**
     * Trigger tank full alert
     */
    void triggerTankFull();
    
    /**
     * Trigger tank low alert
     */
    void triggerTankLow();
    
    /**
     * Trigger battery low alert
     */
    void triggerBatteryLow();
    
    /**
     * Trigger generic alert
     * @param pattern Alert pattern (1=short, 2=long, 3=urgent)
     */
    void trigger(int pattern);
    
    /**
     * Stop any active alert
     */
    void stop();
    
    /**
     * Check if currently in quiet hours
     */
    bool isQuietHours();
    
    /**
     * Play a tone
     * @param frequency Frequency in Hz
     * @param duration Duration in ms
     */
    void playTone(int frequency, int duration);
    
    /**
     * Blink status LED
     * @param count Number of blinks
     * @param onTime On duration in ms
     * @param offTime Off duration in ms
     */
    void blinkLed(int count, int onTime = 100, int offTime = 100);
}

#endif // ALERTS_H

```

```cpp
/**
 * Alerts Module Implementation
 */

#include "alerts.h"
#include "config.h"
#include <time.h>

// Tone frequencies
#define TONE_LOW        440     // A4
#define TONE_MID        880     // A5
#define TONE_HIGH       1760    // A6
#define TONE_ALERT      2000

namespace Alerts {
    void init() {
        Serial.println(F("[Alerts] Initializing..."));
        
        pinMode(PIN_SPEAKER, OUTPUT);
        pinMode(PIN_STATUS_LED, OUTPUT);
        
        digitalWrite(PIN_SPEAKER, LOW);
        digitalWrite(PIN_STATUS_LED, HIGH);  // LED off (active low on most ESP8266)
        
        Serial.println(F("[Alerts] Initialized"));
    }

    void playStartupSound() {
        // Pleasant ascending startup melody
        playTone(523, 100);  // C5
        delay(50);
        playTone(659, 100);  // E5
        delay(50);
        playTone(784, 150);  // G5
        
        blinkLed(2, 200, 100);
    }

    void triggerTankFull() {
        if (isQuietHours()) {
            // During quiet hours, just blink LED
            blinkLed(5, 100, 100);
            return;
        }
        
        // Happy melody for tank full
        for (int i = 0; i < 3; i++) {
            playTone(784, 200);   // G5
            delay(100);
            playTone(988, 200);   // B5
            delay(100);
            playTone(1175, 300);  // D6
            delay(300);
        }
        
        blinkLed(3, 300, 200);
    }

    void triggerTankLow() {
        if (isQuietHours()) {
            blinkLed(10, 100, 100);
            return;
        }
        
        // Warning descending tone
        for (int i = 0; i < 4; i++) {
            playTone(880, 300);   // A5
            delay(100);
            playTone(440, 500);   // A4
            delay(200);
        }
        
        blinkLed(5, 500, 300);
    }

    void triggerBatteryLow() {
        if (isQuietHours()) {
            blinkLed(3, 50, 50);
            return;
        }
        
        // Short warning beeps
        for (int i = 0; i < 2; i++) {
            playTone(TONE_ALERT, 100);
            delay(100);
        }
    }

    void trigger(int pattern) {
        switch (pattern) {
            case 1:  // Short beep
                playTone(TONE_MID, 100);
                break;
            case 2:  // Long beep
                playTone(TONE_MID, 500);
                break;
            case 3:  // Urgent (rapid beeps)
                for (int i = 0; i < 5; i++) {
                    playTone(TONE_ALERT, 100);
                    delay(50);
                }
                break;
            default:
                playTone(TONE_LOW, 200);
        }
    }

    void stop() {
        noTone(PIN_SPEAKER);
        digitalWrite(PIN_SPEAKER, LOW);
    }

    bool isQuietHours() {
        time_t now = time(nullptr);
        struct tm* timeInfo = localtime(&now);
        
        if (timeInfo == nullptr) {
            // If time not set, assume not quiet hours
            return false;
        }
        
        int hour = timeInfo->tm_hour;
        
        // Handle overnight quiet hours
        if (QUIET_HOURS_START > QUIET_HOURS_END) {
            // e.g., 22:00 to 07:00
            return (hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END);
        } else {
            // e.g., 01:00 to 06:00
            return (hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END);
        }
    }

    void playTone(int frequency, int duration) {
        // Use tone() for ESP8266
        tone(PIN_SPEAKER, frequency, duration);
        delay(duration);
        noTone(PIN_SPEAKER);
    }

    void blinkLed(int count, int onTime, int offTime) {
        for (int i = 0; i < count; i++) {
            digitalWrite(PIN_STATUS_LED, LOW);   // LED on (active low)
            delay(onTime);
            digitalWrite(PIN_STATUS_LED, HIGH);  // LED off
            delay(offTime);
        }
    }
}

```

```cpp
/**
 * ============================================================================
 * Data Reporter Module
 * ============================================================================
 * Handles sending measurement data to the backend server
 */

#ifndef DATA_REPORTER_H
#define DATA_REPORTER_H

#include <Arduino.h>

namespace DataReporter {
    /**
     * Initialize the reporter
     */
    void init();
    
    /**
     * Send measurement data to server
     * @param levelCm Water level in cm
     * @param volumeL Volume in liters
     * @param tempC Temperature in Celsius
     * @param batteryV Battery voltage
     * @param rssi WiFi signal strength
     * @return true if sent successfully
     */
    bool send(float levelCm, float volumeL, float tempC, float batteryV, int rssi);
    
    /**
     * Send buffered measurement (from storage)
     * @param jsonData JSON string of measurement
     * @return true if sent successfully
     */
    bool sendBuffered(const char* jsonData);
    
    /**
     * Check server for config updates
     * @return true if new config received
     */
    bool checkConfigUpdate();
    
    /**
     * Set custom server endpoint (for testing)
     */
    void setEndpoint(const char* host, int port, const char* path);
}

#endif // DATA_REPORTER_H

```

```cpp
/**
 * Data Reporter Module Implementation
 */

#include "data_reporter.h"
#include "config.h"
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

static String serverHost = SERVER_HOST;
static int serverPort = SERVER_PORT;
static String serverEndpoint = SERVER_ENDPOINT;

// WiFi clients
static WiFiClient wifiClient;
static WiFiClientSecure wifiClientSecure;

namespace DataReporter {
    void init() {
        Serial.println(F("[Reporter] Initializing..."));
        
        #if USE_HTTPS
        // For testing, accept any certificate
        // In production, use certificate fingerprint or CA cert
        wifiClientSecure.setInsecure();
        #endif
        
        Serial.printf("[Reporter] Endpoint: %s://%s:%d%s\n",
            USE_HTTPS ? "https" : "http",
            serverHost.c_str(),
            serverPort,
            serverEndpoint.c_str()
        );
    }

    bool send(float levelCm, float volumeL, float tempC, float batteryV, int rssi) {
        HTTPClient http;
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + serverEndpoint;
        
        // Build JSON payload
        JsonDocument doc;
        doc["device_id"] = OTA_HOSTNAME;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["timestamp"] = millis();  // Server should use its own timestamp
        doc["level_cm"] = levelCm;
        doc["volume_l"] = volumeL;
        doc["temperature_c"] = tempC;
        doc["battery_v"] = batteryV;
        doc["rssi"] = rssi;
        
        String payload;
        serializeJson(doc, payload);
        
        Serial.printf("[Reporter] Sending to %s\n", url.c_str());
        Serial.printf("[Reporter] Payload: %s\n", payload.c_str());
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        
        int httpCode = http.POST(payload);
        
        if (httpCode > 0) {
            Serial.printf("[Reporter] Response: %d\n", httpCode);
            
            if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
                String response = http.getString();
                Serial.printf("[Reporter] Body: %s\n", response.c_str());
                
                // Check for config updates in response
                JsonDocument respDoc;
                if (deserializeJson(respDoc, response) == DeserializationError::Ok) {
                    if (respDoc.containsKey("config")) {
                        String configJson;
                        serializeJson(respDoc["config"], configJson);
                        Config::applyFromJson(configJson.c_str());
                    }
                }
                
                http.end();
                return true;
            }
        } else {
            Serial.printf("[Reporter] Error: %s\n", http.errorToString(httpCode).c_str());
        }
        
        http.end();
        return false;
    }

    bool sendBuffered(const char* jsonData) {
        HTTPClient http;
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + serverEndpoint;
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        http.addHeader("X-Buffered", "true");
        
        int httpCode = http.POST(jsonData);
        http.end();
        
        return (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED);
    }

    bool checkConfigUpdate() {
        HTTPClient http;
        
        String url = String(USE_HTTPS ? "https://" : "http://") +
                     serverHost + ":" + String(serverPort) + 
                     "/api/v1/devices/" + OTA_HOSTNAME + "/config";
        
        #if USE_HTTPS
        http.begin(wifiClientSecure, url);
        #else
        http.begin(wifiClient, url);
        #endif
        
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        
        int httpCode = http.GET();
        
        if (httpCode == HTTP_CODE_OK) {
            String response = http.getString();
            bool result = Config::applyFromJson(response.c_str());
            http.end();
            return result;
        }
        
        http.end();
        return false;
    }

    void setEndpoint(const char* host, int port, const char* path) {
        serverHost = host;
        serverPort = port;
        serverEndpoint = path;
    }
}

```

```cpp
/**
 * ============================================================================
 * OTA Handler Module
 * ============================================================================
 * Handles Over-The-Air firmware updates
 */

#ifndef OTA_HANDLER_H
#define OTA_HANDLER_H

#include <Arduino.h>

namespace OTAHandler {
    /**
     * Initialize OTA (requires WiFi to be connected)
     */
    void init();
    
    /**
     * Handle OTA events (call in loop)
     */
    void handle();
    
    /**
     * Check for updates from server
     * @return true if update available
     */
    bool checkForUpdate();
    
    /**
     * Download and install update from URL
     * @param url Full URL to firmware binary
     * @return true if update successful
     */
    bool updateFromUrl(const char* url);
}

#endif // OTA_HANDLER_H

```

```cpp
/**
 * OTA Handler Module Implementation
 */

#include "ota_handler.h"
#include "config.h"
#include <ArduinoOTA.h>
#include <ESP8266httpUpdate.h>

namespace OTAHandler {
    void init() {
        Serial.println(F("[OTA] Initializing..."));
        
        // Set hostname
        ArduinoOTA.setHostname(OTA_HOSTNAME);
        
        // Set password if configured
        #ifdef OTA_PASSWORD
        if (strlen(OTA_PASSWORD) > 0) {
            ArduinoOTA.setPassword(OTA_PASSWORD);
        }
        #endif
        
        // Set port
        ArduinoOTA.setPort(OTA_PORT);
        
        // Callbacks
        ArduinoOTA.onStart([]() {
            String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
            Serial.printf("[OTA] Start updating %s\n", type.c_str());
        });
        
        ArduinoOTA.onEnd([]() {
            Serial.println(F("\n[OTA] Update complete!"));
        });
        
        ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
            Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
        });
        
        ArduinoOTA.onError([](ota_error_t error) {
            Serial.printf("[OTA] Error[%u]: ", error);
            switch (error) {
                case OTA_AUTH_ERROR:
                    Serial.println(F("Auth Failed"));
                    break;
                case OTA_BEGIN_ERROR:
                    Serial.println(F("Begin Failed"));
                    break;
                case OTA_CONNECT_ERROR:
                    Serial.println(F("Connect Failed"));
                    break;
                case OTA_RECEIVE_ERROR:
                    Serial.println(F("Receive Failed"));
                    break;
                case OTA_END_ERROR:
                    Serial.println(F("End Failed"));
                    break;
            }
        });
        
        ArduinoOTA.begin();
        Serial.printf("[OTA] Ready at %s.local:%d\n", OTA_HOSTNAME, OTA_PORT);
    }

    void handle() {
        ArduinoOTA.handle();
    }

    bool checkForUpdate() {
        Serial.println(F("[OTA] Checking for updates..."));
        
        WiFiClient client;
        HTTPClient http;
        
        String url = String(OTA_UPDATE_URL) + "?device=" + OTA_HOSTNAME + 
                     "&version=" + FIRMWARE_VERSION;
        
        http.begin(client, url);
        http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
        
        int httpCode = http.GET();
        
        if (httpCode == HTTP_CODE_OK) {
            String response = http.getString();
            
            // Parse response for update info
            // Expected: {"update_available": true, "url": "...", "version": "..."}
            JsonDocument doc;
            if (deserializeJson(doc, response) == DeserializationError::Ok) {
                if (doc["update_available"] == true) {
                    const char* updateUrl = doc["url"];
                    const char* newVersion = doc["version"];
                    
                    Serial.printf("[OTA] Update available: v%s\n", newVersion);
                    Serial.printf("[OTA] URL: %s\n", updateUrl);
                    
                    http.end();
                    return updateFromUrl(updateUrl);
                }
            }
        }
        
        http.end();
        Serial.println(F("[OTA] No updates available"));
        return false;
    }

    bool updateFromUrl(const char* url) {
        Serial.printf("[OTA] Downloading from %s\n", url);
        
        WiFiClient client;
        
        // Configure LED indicator
        ESPhttpUpdate.setLedPin(PIN_STATUS_LED, LOW);
        
        // Reboot after update
        ESPhttpUpdate.rebootOnUpdate(true);
        
        t_httpUpdate_return ret = ESPhttpUpdate.update(client, url);
        
        switch (ret) {
            case HTTP_UPDATE_FAILED:
                Serial.printf("[OTA] Update failed (%d): %s\n",
                    ESPhttpUpdate.getLastError(),
                    ESPhttpUpdate.getLastErrorString().c_str()
                );
                return false;
                
            case HTTP_UPDATE_NO_UPDATES:
                Serial.println(F("[OTA] No update needed"));
                return false;
                
            case HTTP_UPDATE_OK:
                Serial.println(F("[OTA] Update OK (will reboot)"));
                return true;
        }
        
        return false;
    }
}

```

```cpp
/**
 * ============================================================================
 * Storage Module
 * ============================================================================
 * Handles local data storage (LittleFS) for buffering and persistence
 */

#ifndef STORAGE_H
#define STORAGE_H

#include <Arduino.h>

// Forward declare the state struct from main
struct SystemState;

namespace Storage {
    /**
     * Initialize filesystem
     */
    void init();
    
    /**
     * Format the filesystem (WARNING: erases all data)
     */
    void format();
    
    /**
     * Buffer a measurement for later upload
     * @param state Current system state
     */
    void bufferMeasurement(const SystemState& state);
    
    /**
     * Flush buffered measurements to server
     * @return Number of measurements sent
     */
    int flushBuffer();
    
    /**
     * Get number of buffered measurements
     */
    int getBufferCount();
    
    /**
     * Clear all buffered measurements
     */
    void clearBuffer();
    
    /**
     * Save arbitrary data to a file
     */
    bool writeFile(const char* path, const char* data);
    
    /**
     * Read data from a file
     */
    String readFile(const char* path);
    
    /**
     * Delete a file
     */
    bool deleteFile(const char* path);
    
    /**
     * Check if file exists
     */
    bool exists(const char* path);
    
    /**
     * Get filesystem info
     */
    void getInfo(size_t* totalBytes, size_t* usedBytes);
}

#endif // STORAGE_H

```

```cpp
/**
 * Storage Module Implementation
 */

#include "storage.h"
#include "config.h"
#include "data_reporter.h"
#include <LittleFS.h>
#include <ArduinoJson.h>

#define BUFFER_DIR      "/buffer"
#define MAX_BUFFER_FILES 100

// Counter for buffer files
static int bufferCounter = 0;

namespace Storage {
    void init() {
        Serial.println(F("[Storage] Initializing LittleFS..."));
        
        if (!LittleFS.begin()) {
            Serial.println(F("[Storage] Mount failed, formatting..."));
            LittleFS.format();
            if (!LittleFS.begin()) {
                Serial.println(F("[Storage] Format failed!"));
                return;
            }
        }
        
        // Create buffer directory if needed
        if (!LittleFS.exists(BUFFER_DIR)) {
            LittleFS.mkdir(BUFFER_DIR);
        }
        
        // Count existing buffer files
        Dir dir = LittleFS.openDir(BUFFER_DIR);
        while (dir.next()) {
            bufferCounter++;
        }
        
        size_t total, used;
        getInfo(&total, &used);
        Serial.printf("[Storage] Ready: %d/%d bytes used, %d buffered measurements\n",
            used, total, bufferCounter);
    }

    void format() {
        Serial.println(F("[Storage] Formatting..."));
        LittleFS.format();
        bufferCounter = 0;
        Serial.println(F("[Storage] Format complete"));
    }

    void bufferMeasurement(const SystemState& state) {
        if (bufferCounter >= MAX_BUFFER_FILES) {
            Serial.println(F("[Storage] Buffer full, dropping oldest"));
            // Delete oldest file
            Dir dir = LittleFS.openDir(BUFFER_DIR);
            if (dir.next()) {
                String oldestPath = String(BUFFER_DIR) + "/" + dir.fileName();
                LittleFS.remove(oldestPath);
                bufferCounter--;
            }
        }
        
        // Create JSON for this measurement
        JsonDocument doc;
        doc["device_id"] = OTA_HOSTNAME;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["timestamp"] = millis();
        doc["level_cm"] = state.waterLevelCm;
        doc["volume_l"] = state.volumeLiters;
        doc["temperature_c"] = state.temperatureC;
        doc["battery_v"] = state.batteryVoltage;
        doc["rssi"] = state.wifiRssi;
        doc["buffered"] = true;
        
        String json;
        serializeJson(doc, json);
        
        // Save to file
        String filename = String(BUFFER_DIR) + "/" + String(millis()) + ".json";
        
        File file = LittleFS.open(filename, "w");
        if (file) {
            file.print(json);
            file.close();
            bufferCounter++;
            Serial.printf("[Storage] Buffered measurement (%d total)\n", bufferCounter);
        } else {
            Serial.println(F("[Storage] Failed to buffer measurement"));
        }
    }

    int flushBuffer() {
        if (bufferCounter == 0) {
            return 0;
        }
        
        Serial.printf("[Storage] Flushing %d buffered measurements...\n", bufferCounter);
        
        int sent = 0;
        Dir dir = LittleFS.openDir(BUFFER_DIR);
        
        while (dir.next()) {
            String path = String(BUFFER_DIR) + "/" + dir.fileName();
            
            File file = LittleFS.open(path, "r");
            if (file) {
                String json = file.readString();
                file.close();
                
                if (DataReporter::sendBuffered(json.c_str())) {
                    LittleFS.remove(path);
                    sent++;
                    bufferCounter--;
                } else {
                    // Stop on first failure, try again later
                    Serial.println(F("[Storage] Send failed, will retry later"));
                    break;
                }
            }
            
            // Small delay between sends
            delay(100);
        }
        
        Serial.printf("[Storage] Sent %d buffered measurements\n", sent);
        return sent;
    }

    int getBufferCount() {
        return bufferCounter;
    }

    void clearBuffer() {
        Dir dir = LittleFS.openDir(BUFFER_DIR);
        while (dir.next()) {
            String path = String(BUFFER_DIR) + "/" + dir.fileName();
            LittleFS.remove(path);
        }
        bufferCounter = 0;
        Serial.println(F("[Storage] Buffer cleared"));
    }

    bool writeFile(const char* path, const char* data) {
        File file = LittleFS.open(path, "w");
        if (!file) {
            return false;
        }
        file.print(data);
        file.close();
        return true;
    }

    String readFile(const char* path) {
        File file = LittleFS.open(path, "r");
        if (!file) {
            return "";
        }
        String content = file.readString();
        file.close();
        return content;
    }

    bool deleteFile(const char* path) {
        return LittleFS.remove(path);
    }

    bool exists(const char* path) {
        return LittleFS.exists(path);
    }

    void getInfo(size_t* totalBytes, size_t* usedBytes) {
        FSInfo info;
        LittleFS.info(info);
        *totalBytes = info.totalBytes;
        *usedBytes = info.usedBytes;
    }
}

```

```ignore
# Build artifacts
build/
*.bin
*.elf

# arduino-cli data
.arduino15/

# IDE files
.vscode/
*.code-workspace

# OS files
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.bak
*~

# Credentials (don't commit these!)
secrets.h
credentials.h

```

```markdown
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

```

Done! I've created a complete **arduino-cli based build system** for your water tank project. Here's what you've got:

## Project Structure

```
firmware/
├── Makefile              # 🔧 Main build system
├── config.mk             # ⚙️  Board & project config
├── arduino-cli.yaml      # 📋 arduino-cli settings
├── libraries.txt         # 📦 Library dependencies
├── README.md             # 📖 Documentation
├── .gitignore
├── scripts/
│   ├── setup.sh          # Initial setup script
│   └── libs.sh           # Library manager
├── src/
│   ├── water_tank.ino    # Main firmware
│   └── modules/
│       ├── config.h/cpp      # Runtime configuration
│       ├── sensor.h/cpp      # Ultrasonic + temp + battery
│       ├── wifi_manager.h/cpp # WiFi connection
│       ├── alerts.h/cpp      # Audio alerts + LED
│       ├── data_reporter.h/cpp # HTTPS/MQTT reporting
│       ├── ota_handler.h/cpp # OTA updates
│       └── storage.h/cpp     # LittleFS buffering
├── lib/                  # Local libraries (empty)
└── build/                # Compiled binaries
```

## Quick Start

```bash
cd ~/WATER_TANK/firmware

# 1. Setup everything (installs arduino-cli + ESP8266 core + libraries)
make setup

# 2. Edit your WiFi credentials
nano src/modules/config.h   # Change WIFI_SSID, WIFI_PASSWORD

# 3. Build & upload
make upload

# 4. Monitor
make monitor
```

## Key Commands

| Command | What it does |
|---------|--------------|
| `make build` | Compile firmware |
| `make upload` | Flash to ESP8266 |
| `make monitor` | Serial monitor |
| `make run` | Build + upload + monitor |
| `make add-lib LIB="Name@ver"` | Add new library |
| `make help` | See all commands |

## Adding Sensor Libraries Later

```bash
# Search for libraries
make search-lib LIB="pressure sensor"

# Install
make add-lib LIB="Adafruit_BMP280@2.6.8"
```

The modular structure keeps things clean - each module (`sensor.cpp`, `alerts.cpp`, etc.) handles one concern. When you add new sensors, just create a new module or extend `sensor.cpp`.

```plaintext
firmware/
├── Makefile              # 🔧 Main build system
├── config.mk             # ⚙️  Board & project config
├── arduino-cli.yaml      # 📋 arduino-cli settings
├── libraries.txt         # 📦 Library dependencies
├── README.md             # 📖 Documentation
├── .gitignore
├── scripts/
│   ├── setup.sh          # Initial setup script
│   └── libs.sh           # Library manager
├── src/
│   ├── water_tank.ino    # Main firmware
│   └── modules/
│       ├── config.h/cpp      # Runtime configuration
│       ├── sensor.h/cpp      # Ultrasonic + temp + battery
│       ├── wifi_manager.h/cpp # WiFi connection
│       ├── alerts.h/cpp      # Audio alerts + LED
│       ├── data_reporter.h/cpp # HTTPS/MQTT reporting
│       ├── ota_handler.h/cpp # OTA updates
│       └── storage.h/cpp     # LittleFS buffering
├── lib/                  # Local libraries (empty)
└── build/                # Compiled binaries
```

```shellscript
cd ~/WATER_TANK/firmware

# 1. Setup everything (installs arduino-cli + ESP8266 core + libraries)
make setup

# 2. Edit your WiFi credentials
nano src/modules/config.h   # Change WIFI_SSID, WIFI_PASSWORD

# 3. Build & upload
make upload

# 4. Monitor
make monitor
```

```shellscript
# Search for libraries
make search-lib LIB="pressure sensor"

# Install
make add-lib LIB="Adafruit_BMP280@2.6.8"
```

