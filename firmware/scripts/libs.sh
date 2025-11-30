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

