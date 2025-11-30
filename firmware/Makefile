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
SKETCH_DIR      := $(BUILD_DIR)/$(PROJECT_NAME)

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
	@ls -lh $(BINARY) 2>/dev/null || true

## Compile only (alias for build)
compile: check-sketch prepare-sketch
	@echo "$(CYAN)→ Compiling $(PROJECT_NAME)...$(NC)"
	@mkdir -p $(BUILD_DIR)
	$(CLI) compile \
		--fqbn $(BOARD_FQBN) \
		--output-dir $(BUILD_DIR) \
		--libraries $(LIB_DIR) \
		--warnings $(WARNINGS) \
		$(SKETCH_DIR)

## Upload firmware to device
upload: build
	@echo "$(CYAN)→ Uploading to $(SERIAL_PORT)...$(NC)"
	$(CLI) upload \
		--fqbn $(BOARD_FQBN) \
		--port $(SERIAL_PORT) \
		--input-dir $(BUILD_DIR) \
		$(SKETCH_DIR)
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
	else \
		echo "$(YELLOW)Binary not found. Run 'make build' first$(NC)"; \
	fi

## Prepare sketch directory for arduino-cli (flattens structure)
prepare-sketch: check-sketch
	@mkdir -p $(SKETCH_DIR)
	@echo "$(CYAN)→ Preparing sketch directory...$(NC)"
	@cp $(SKETCH) $(SKETCH_DIR)/$(PROJECT_NAME).ino
	@if [ -d "$(SRC_DIR)/modules" ]; then \
		cp $(SRC_DIR)/modules/*.cpp $(SRC_DIR)/modules/*.h $(SKETCH_DIR)/ 2>/dev/null || true; \
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

