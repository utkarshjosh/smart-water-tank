#!/bin/bash
# ============================================================================
# Fix Serial Port Permissions
# ============================================================================
# Adds current user to dialout group to access serial ports

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Fix Serial Port Permissions${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

USER=$(whoami)
echo -e "User: ${CYAN}${USER}${NC}"
echo -e "Current groups: ${CYAN}$(groups)${NC}"
echo ""

# Check if already in dialout group
if groups | grep -q dialout; then
    echo -e "${GREEN}✓ You are already in the dialout group!${NC}"
    echo ""
    echo -e "${YELLOW}If you still can't access serial ports:${NC}"
    echo "  1. Log out and log back in, OR"
    echo "  2. Run: newgrp dialout"
    exit 0
fi

echo -e "${YELLOW}You are NOT in the dialout group.${NC}"
echo -e "${YELLOW}Adding you to the dialout group...${NC}"
echo ""

# Add user to dialout group
sudo usermod -a -G dialout "$USER"

echo ""
echo -e "${GREEN}✓ User added to dialout group successfully!${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "${YELLOW}You must log out and log back in for changes to take effect.${NC}"
echo ""
echo -e "${CYAN}Alternative (temporary for current session):${NC}"
echo -e "  ${YELLOW}newgrp dialout${NC}"
echo ""
echo -e "${CYAN}After logging back in, verify with:${NC}"
echo -e "  ${YELLOW}groups${NC}"
echo -e "  ${YELLOW}make monitor${NC}"

