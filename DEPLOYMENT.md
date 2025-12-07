# Water Tank System - Deployment Guide

## Overview

This guide covers deploying the Water Tank Monitoring System with the following architecture:

- **Frontend/Admin Panel**: `aquamind.utkarshjoshi.com` (Next.js app)
  - Public landing page at `/`
  - Admin panel at `/admin/*`
  
- **Backend API**: `aquamind-api.utkarshjoshi.com` (Express.js API)

---

## Prerequisites

### 1. Infrastructure Requirements

**Option A: VPS/Cloud Server (Recommended)**
- Ubuntu 20.04+ or Debian 11+ server
- Minimum 2GB RAM, 2 CPU cores
- 20GB+ storage
- Public IP address
- Root/sudo access

**Option B: Cloud Platform**
- Vercel (for Next.js) + Railway/Render (for backend)
- Or AWS/GCP/Azure with container services

**For this guide, we'll assume Option A (VPS deployment)**

### 2. Domain Configuration

You'll need DNS access to `utkarshjoshi.com` to create:
- `aquamind.utkarshjoshi.com` → A record pointing to your server IP
- `aquamind-api.utkarshjoshi.com` → A record pointing to your server IP

### 3. Required Services

- PostgreSQL database (can be on same server or managed service)
- Node.js 18+ and npm
- Nginx (reverse proxy)
- PM2 or systemd (process manager)
- Certbot (for SSL certificates)

---

## Step 1: Server Setup

### 1.1 Initial Server Configuration

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
sudo apt install -y nginx

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Certbot (for SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### 1.2 Create Application User

```bash
# Create a non-root user for the application
sudo adduser aquamind
sudo usermod -aG sudo watertank
sudo su - aquamind
```

---

## Step 2: Database Setup

### 2.1 PostgreSQL Configuration

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE aquamind_db;
CREATE USER aquamind_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE aquamind_db TO aquamind_user;
\q
```

### 2.2 Run Database Migrations

```bash
# After deploying backend code, run:
cd /path/to/backend
npm run build
npm run migrate
```

---

## Step 3: Backend Deployment

### 3.1 Clone/Deploy Backend Code

```bash
# Create directory structure
mkdir -p /home/aquamind/apps
cd /home/aquamind/apps

# Clone your repository or upload code
# git clone your-repo.git aquamind-backend
# OR copy your backend folder here

cd aquamind-backend
```

### 3.2 Install Dependencies

```bash
npm install
npm run build
```

### 3.3 Environment Variables

Create `/home/aquamind/apps/aquamind-backend/.env`:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Database Configuration
DATABASE_URL=postgresql://aquamind_user:your_secure_password_here@localhost:5432/aquamind_db

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# CORS Configuration
CORS_ORIGIN=https://aquamind.utkarshjoshi.com

# API Base URL
API_BASE_URL=https://aquamind-api.utkarshjoshi.com

# File Storage
FIRMWARE_STORAGE_PATH=/home/aquamind/apps/aquamind-backend/storage/firmware

# Alert Configuration
ALERT_OFFLINE_THRESHOLD_MINUTES=15
LEAK_DETECTION_THRESHOLD_L_PER_HOUR=50
```

### 3.4 Create Storage Directories

```bash
mkdir -p /home/aquamind/apps/aquamind-backend/storage/firmware
chmod 755 /home/aquamind/apps/aquamind-backend/storage
```

### 3.5 Setup PM2

Create `/home/aquamind/apps/aquamind-backend/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'aquamind-api',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/home/aquamind/logs/api-error.log',
    out_file: '/home/aquamind/logs/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M'
  }]
};
```

```bash
# Create logs directory
mkdir -p /home/aquamind/logs

# Start the application
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start on boot
```

---

## Step 4: Frontend/Admin Panel Deployment

### 4.1 Clone/Deploy Admin Panel Code

```bash
cd /home/aquamind/apps
# Clone or copy admin-panel folder here
cd admin-panel
```

### 4.2 Install Dependencies

```bash
npm install
```

### 4.3 Environment Variables

Create `/home/aquamind/apps/admin-panel/.env.production`:

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=https://aquamind-api.utkarshjoshi.com

# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
```

### 4.4 Build Next.js App

```bash
npm run build
```

### 4.5 Setup PM2 for Next.js

Create `/home/aquamind/apps/admin-panel/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'aquamind-admin',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/home/aquamind/apps/admin-panel',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '/home/aquamind/logs/admin-error.log',
    out_file: '/home/aquamind/logs/admin-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M'
  }]
};
```

```bash
pm2 start ecosystem.config.js
pm2 save
```

---

## Step 5: Nginx Configuration

### 5.1 Backend API Nginx Config

Create `/etc/nginx/sites-available/aquamind-api`:

```nginx
server {
    listen 80;
    server_name aquamind-api.utkarshjoshi.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aquamind-api.utkarshjoshi.com;

    # SSL Configuration (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/aquamind-api.utkarshjoshi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aquamind-api.utkarshjoshi.com/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logging
    access_log /var/log/nginx/api-access.log;
    error_log /var/log/nginx/api-error.log;

    # Proxy to backend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

### 5.2 Frontend Nginx Config

Create `/etc/nginx/sites-available/watertank`:

```nginx
server {
    listen 80;
    server_name aquamind.utkarshjoshi.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name aquamind.utkarshjoshi.com;

    # SSL Configuration (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/aquamind.utkarshjoshi.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aquamind.utkarshjoshi.com/privkey.pem;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logging
    access_log /var/log/nginx/admin-access.log;
    error_log /var/log/nginx/admin-error.log;

    # Proxy to Next.js
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 5.3 Enable Sites

```bash
sudo ln -s /etc/nginx/sites-available/aquamind-api /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/watertank /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 6: SSL Certificates (Let's Encrypt)

### 6.1 Obtain Certificates

```bash
# For backend API
sudo certbot --nginx -d aquamind-api.utkarshjoshi.com

# For frontend
sudo certbot --nginx -d aquamind.utkarshjoshi.com

# Auto-renewal is set up automatically, but test it:
sudo certbot renew --dry-run
```

---

## Step 7: DNS Configuration

### 7.1 DNS Records

Add these A records in your DNS provider (for `utkarshjoshi.com`):

```
Type: A
Name: watertank
Value: <your-server-ip>
TTL: 3600

Type: A
Name: aquamind-api
Value: <your-server-ip>
TTL: 3600
```

Wait for DNS propagation (can take a few minutes to 48 hours).

---

## Step 8: Security Hardening

### 8.1 Firewall Configuration

```bash
# Install UFW
sudo apt install -y ufw

# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### 8.2 Update Backend CORS

Make sure your backend `.env` has:
```bash
CORS_ORIGIN=https://aquamind.utkarshjoshi.com
```

And update `backend/src/index.ts` to use it properly (remove the wildcard `*` in production).

### 8.3 Environment File Permissions

```bash
# Secure environment files
chmod 600 /home/aquamind/apps/aquamind-backend/.env
chmod 600 /home/aquamind/apps/admin-panel/.env.production
```

---

## Step 9: Monitoring & Maintenance

### 9.1 PM2 Monitoring

```bash
# View logs
pm2 logs

# Monitor resources
pm2 monit

# View status
pm2 status

# Restart services
pm2 restart aquamind-api
pm2 restart aquamind-admin
```

### 9.2 Database Backups

Create a backup script `/home/aquamind/scripts/backup-db.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/home/aquamind/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U aquamind_user aquamind_db > $BACKUP_DIR/aquamind_db_$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "aquamind_db_*.sql" -mtime +7 -delete
```

```bash
chmod +x /home/aquamind/scripts/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/aquamind/scripts/backup-db.sh
```

### 9.3 Log Rotation

```bash
# Install logrotate config
sudo nano /etc/logrotate.d/water-tank

# Add:
/home/aquamind/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 watertank watertank
}
```

---

## Step 10: Deployment Scripts

### 10.1 Deploy Script

Create `/home/aquamind/scripts/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Backend deployment
echo "📦 Deploying backend..."
cd /home/aquamind/apps/aquamind-backend
git pull origin main  # or your branch
npm install
npm run build
pm2 restart aquamind-api

# Frontend deployment
echo "📦 Deploying frontend..."
cd /home/aquamind/apps/admin-panel
git pull origin main  # or your branch
npm install
npm run build
pm2 restart aquamind-admin

echo "✅ Deployment complete!"
pm2 status
```

---

## Additional Considerations

### 1. **Environment-Specific Configurations**
   - Separate `.env` files for staging/production
   - Use environment variables, never commit secrets

### 2. **Database Migrations**
   - Always run migrations before deploying new code
   - Test migrations on staging first

### 3. **Firmware Updates**
   - Ensure `/storage/firmware` directory has proper permissions
   - Consider using cloud storage (S3, etc.) for production

### 4. **Rate Limiting**
   - Backend already has rate limiting via `express-rate-limit`
   - Consider adding Nginx rate limiting for additional protection

### 5. **CDN for Static Assets** (Optional)
   - Consider using Cloudflare or similar for static assets
   - Can improve performance globally

### 6. **Monitoring Services** (Optional)
   - Set up UptimeRobot or similar for uptime monitoring
   - Consider Sentry for error tracking
   - Use PM2 Plus for advanced monitoring

### 7. **Backup Strategy**
   - Database backups (automated daily)
   - Code repository (Git)
   - Environment variable backups (secure storage)

---

## Troubleshooting

### Backend not starting
```bash
# Check logs
pm2 logs aquamind-api

# Check environment variables
cd /home/aquamind/apps/aquamind-backend
cat .env

# Test database connection
psql -U aquamind_user -d aquamind_db -c "SELECT 1;"
```

### Frontend not loading
```bash
# Check logs
pm2 logs aquamind-admin

# Verify build
cd /home/aquamind/apps/admin-panel
npm run build
```

### SSL Certificate Issues
```bash
# Renew certificates manually
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

### Nginx Issues
```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Reload Nginx
sudo systemctl reload nginx
```

---

## Quick Reference

### Service Management
```bash
# PM2
pm2 start ecosystem.config.js
pm2 stop <app-name>
pm2 restart <app-name>
pm2 logs <app-name>
pm2 status

# Nginx
sudo systemctl status nginx
sudo systemctl reload nginx
sudo nginx -t

# PostgreSQL
sudo systemctl status postgresql
sudo systemctl restart postgresql
```

### Important Paths
- Backend: `/home/aquamind/apps/aquamind-backend`
- Frontend: `/home/aquamind/apps/admin-panel`
- Logs: `/home/aquamind/logs`
- Backups: `/home/aquamind/backups`
- Nginx configs: `/etc/nginx/sites-available/`

---

## Next Steps After Deployment

1. ✅ Test all endpoints
2. ✅ Verify SSL certificates
3. ✅ Test admin login flow
4. ✅ Verify device data ingestion
5. ✅ Set up monitoring alerts
6. ✅ Configure automated backups
7. ✅ Document any custom configurations
8. ✅ Set up staging environment (optional but recommended)

---

## Support

For issues or questions:
- Check PM2 logs: `pm2 logs`
- Check Nginx logs: `/var/log/nginx/`
- Check system logs: `journalctl -u nginx` or `journalctl -u postgresql`






