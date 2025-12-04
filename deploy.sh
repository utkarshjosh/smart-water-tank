#!/bin/bash
# Quick deployment script for Water Tank System
# Usage: ./deploy.sh [backend|frontend|all]

set -e

DEPLOY_TARGET=${1:-all}

echo "🚀 AquaMind Deployment Script"
echo "=============================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to deploy backend
deploy_backend() {
    echo -e "${YELLOW}📦 Deploying Backend API...${NC}"
    cd backend
    
    echo "  → Installing dependencies..."
    npm ci
    
    echo "  → Building TypeScript..."
    npm run build
    
    echo "  → Running database migrations..."
    npm run migrate || echo "  ⚠️  Migration failed or already up to date"
    
    echo "  → Restarting PM2 process..."
    pm2 restart aquamind-api || pm2 start ecosystem.config.js --only aquamind-api
    
    echo -e "${GREEN}✅ Backend deployed successfully!${NC}"
    cd ..
}

# Function to deploy frontend
deploy_frontend() {
    echo -e "${YELLOW}📦 Deploying Admin Panel...${NC}"
    cd admin-panel
    
    echo "  → Installing dependencies..."
    npm ci
    
    echo "  → Building Next.js app..."
    npm run build
    
    echo "  → Restarting PM2 process..."
    pm2 restart aquamind-admin || pm2 start ecosystem.config.js --only aquamind-admin
    
    echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
    cd ..
}

# Main deployment logic
case $DEPLOY_TARGET in
    backend)
        deploy_backend
        ;;
    frontend)
        deploy_frontend
        ;;
    all)
        deploy_backend
        echo ""
        deploy_frontend
        ;;
    *)
        echo -e "${RED}❌ Invalid target: $DEPLOY_TARGET${NC}"
        echo "Usage: ./deploy.sh [backend|frontend|all]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}📊 PM2 Status:${NC}"
pm2 status

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"

