# ============================================================================
# WATER TANK FIRMWARE - Board & Project Configuration
# ============================================================================

# Project Settings
PROJECT_NAME    := water_tank
VERSION         := 1.1.7

# Board Configuration (ESP8266)
BOARD_FQBN      := esp8266:esp8266:nodemcuv2
BOARD_PLATFORM  := esp8266:esp8266
PLATFORM_URL    := https://arduino.esp8266.com/stable/package_esp8266com_index.json

# Serial Port (auto-detect or override)
# Leave empty for auto-detection, or set manually:
# SERIAL_PORT   := /dev/ttyUSB0
# Auto-detect: tries ttyUSB first, then ttyACM
# Linux exposes ttyUSB/ttyACM; macOS exposes cu.usbserial/cu.usbmodem. Checking
# both means `make upload` works on either without passing SERIAL_PORT by hand.
SERIAL_PORT     ?= $(shell { ls /dev/ttyUSB* 2>/dev/null || ls /dev/ttyACM* 2>/dev/null || ls /dev/cu.usbserial* 2>/dev/null || ls /dev/cu.usbmodem* 2>/dev/null; } | head -1)

# Upload Settings
UPLOAD_SPEED    := 921600

# Display build. `make build DISPLAY=1` produces the mains-powered LCD variant:
# I2C panel, two panel buttons, WiFi light sleep instead of deep sleep, and no
# speaker or status LED (their pins are the I2C clock and a button). The default
# build is untouched and compiles none of it.
#
# It is declared here, above BUILD_FLAGS, because the variant changes the
# version the device reports.
DISPLAY ?= 0

# The version a device reports to the OTA server. The display variant carries
# the suffix because the two binaries for one release are NOT interchangeable
# and the backend cannot tell them apart on its own: FirmwareBinary has no
# variant column and `version` is UNIQUE, so both images cannot be uploaded as
# "1.1.5". Making the reported version match the uploaded one keeps the update
# check's "already on this version" guard working for both builds; without it a
# display device would be told to reinstall its own firmware forever whenever
# an install report failed to land.
REPORTED_VERSION := $(VERSION)
ifeq ($(DISPLAY),1)
    REPORTED_VERSION := $(VERSION)-display
endif

# Build Settings
BUILD_FLAGS     := \
    -DVERSION=\"$(VERSION)\" \
    -DFIRMWARE_VERSION=\"$(REPORTED_VERSION)\" \
    -DPROJECT_NAME=\"$(PROJECT_NAME)\"

# Optional command-line compile flags. The checked-in defaults are production
# MQTT/TLS. Plaintext MQTT is only for an intentional local development build:
#   make build MQTT_HOST=192.168.1.10 MQTT_PORT=1883 MQTT_TLS=0
EXTRA_BUILD_FLAGS ?=
BUILD_FLAGS += $(EXTRA_BUILD_FLAGS)

ifeq ($(DISPLAY),1)
    BUILD_FLAGS += -DDISPLAY_ENABLED=1
endif

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
