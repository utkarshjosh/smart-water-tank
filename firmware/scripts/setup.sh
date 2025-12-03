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


