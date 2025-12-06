#!/bin/bash

# Script to build and copy Next.js admin panel to nginx dist directory
# Usage: ./copy-build.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ADMIN_PANEL_DIR="$(cd "$(dirname "$0")/admin-panel" && pwd)"
DIST_DIR="/var/www/aquamind/dist"
BUILD_DIR="$ADMIN_PANEL_DIR/.next"
OUT_DIR="$ADMIN_PANEL_DIR/out"

echo -e "${BLUE}→ Building AquaMind Admin Panel...${NC}"

# Check if admin-panel directory exists
if [ ! -d "$ADMIN_PANEL_DIR" ]; then
    echo -e "${RED}✗ Error: Admin panel directory not found at $ADMIN_PANEL_DIR${NC}"
    exit 1
fi

# Navigate to admin-panel directory
cd "$ADMIN_PANEL_DIR"

# Check if node_modules exists, if not install dependencies
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}→ Installing dependencies...${NC}"
    npm install
fi

# Build the Next.js application
echo -e "${BLUE}→ Running Next.js build...${NC}"
npm run build

# Check if static export exists (out directory)
if [ -d "$OUT_DIR" ]; then
    echo -e "${GREEN}✓ Static export found in 'out' directory${NC}"
    SOURCE_DIR="$OUT_DIR"
elif [ -d "$BUILD_DIR" ]; then
    echo -e "${YELLOW}⚠ Warning: No static export found. Using .next directory.${NC}"
    echo -e "${YELLOW}  Note: For static files, configure Next.js with 'output: export' in next.config.js${NC}"
    echo -e "${YELLOW}  For now, you may need to run 'npm start' and proxy to port 3000 instead.${NC}"
    SOURCE_DIR="$BUILD_DIR"
else
    echo -e "${RED}✗ Error: Build output not found. Build may have failed.${NC}"
    exit 1
fi

# Create dist directory if it doesn't exist
echo -e "${BLUE}→ Creating dist directory...${NC}"
sudo mkdir -p "$DIST_DIR"

# Backup existing dist if it exists
if [ -d "$DIST_DIR" ] && [ "$(ls -A $DIST_DIR)" ]; then
    BACKUP_DIR="${DIST_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}→ Backing up existing dist to $BACKUP_DIR${NC}"
    sudo mv "$DIST_DIR" "$BACKUP_DIR"
    sudo mkdir -p "$DIST_DIR"
fi

# Copy build files to dist directory
echo -e "${BLUE}→ Copying build files to $DIST_DIR...${NC}"

if [ "$SOURCE_DIR" == "$OUT_DIR" ]; then
    # Static export - copy all files
    sudo cp -r "$SOURCE_DIR"/* "$DIST_DIR/"
    echo -e "${GREEN}✓ Static files copied successfully${NC}"
else
    # .next build - copy static files
    if [ -d "$BUILD_DIR/static" ]; then
        sudo mkdir -p "$DIST_DIR/_next/static"
        sudo cp -r "$BUILD_DIR/static"/* "$DIST_DIR/_next/static/"
    fi
    
    if [ -d "$BUILD_DIR/standalone" ]; then
        # Standalone build - copy standalone files
        sudo cp -r "$BUILD_DIR/standalone"/* "$DIST_DIR/"
    fi
    
    # Copy public files
    if [ -d "$ADMIN_PANEL_DIR/public" ]; then
        sudo cp -r "$ADMIN_PANEL_DIR/public"/* "$DIST_DIR/"
    fi
    
    echo -e "${YELLOW}⚠ Note: .next build requires Node.js server. Consider using static export.${NC}"
fi

# Set proper permissions
echo -e "${BLUE}→ Setting permissions...${NC}"
sudo chown -R www-data:www-data "$DIST_DIR"
sudo chmod -R 755 "$DIST_DIR"

echo -e "${GREEN}✓ Build copied successfully to $DIST_DIR${NC}"
echo -e "${GREEN}✓ Ready to serve via nginx${NC}"

# Test nginx configuration
echo -e "${BLUE}→ Testing nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
    echo -e "${YELLOW}→ To reload nginx, run: sudo systemctl reload nginx${NC}"
else
    echo -e "${RED}✗ Nginx configuration has errors. Please fix them before reloading.${NC}"
    exit 1
fi

