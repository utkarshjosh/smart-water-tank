# ============================================================================
# WATER TANK FIRMWARE - Board & Project Configuration
# ============================================================================

# Project Settings
PROJECT_NAME    := water_tank
VERSION         := 0.1.1

# Board Configuration (ESP8266)
BOARD_FQBN      := esp8266:esp8266:nodemcuv2
BOARD_PLATFORM  := esp8266:esp8266
PLATFORM_URL    := https://arduino.esp8266.com/stable/package_esp8266com_index.json

# Serial Port (auto-detect or override)
# Leave empty for auto-detection, or set manually:
# SERIAL_PORT   := /dev/ttyUSB0
# Auto-detect: tries ttyUSB first, then ttyACM
SERIAL_PORT     ?= $(shell { ls /dev/ttyUSB* 2>/dev/null || ls /dev/ttyACM* 2>/dev/null; } | head -1)

# Upload Settings
UPLOAD_SPEED    := 921600

# Build Settings
BUILD_FLAGS     := \
    -DVERSION=\"$(VERSION)\" \
    -DFIRMWARE_VERSION=\"$(VERSION)\" \
    -DPROJECT_NAME=\"$(PROJECT_NAME)\"

# Optional command-line compile flags. The checked-in defaults are production
# MQTT/TLS. Plaintext MQTT is only for an intentional local development build:
#   make build MQTT_HOST=192.168.1.10 MQTT_PORT=1883 MQTT_TLS=0
EXTRA_BUILD_FLAGS ?=
BUILD_FLAGS += $(EXTRA_BUILD_FLAGS)

# MQTT build overrides. These only affect the binary being compiled.
MQTT_BUILD ?= 1
MQTT_HOST  ?=
MQTT_PORT  ?=
MQTT_TLS   ?=
ifeq ($(MQTT_BUILD),1)
    BUILD_FLAGS += -DMQTT_ENABLED=1
endif
ifneq ($(MQTT_HOST),)
    BUILD_FLAGS += -DMQTT_BROKER=\"$(MQTT_HOST)\"
endif
ifneq ($(MQTT_PORT),)
    BUILD_FLAGS += -DMQTT_PORT=$(MQTT_PORT)
endif
ifneq ($(MQTT_TLS),)
    BUILD_FLAGS += -DMQTT_USE_TLS=$(MQTT_TLS)
endif

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
