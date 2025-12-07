# 🚀 Nginx Setup Guide for AquaMind

## Overview
This guide covers setting up Nginx to serve:
- **Frontend**: `aquamind.utkarshjoshi.com` → Static files from `/var/www/aquamind/dist`
- **Backend API**: `aquamind-api.utkarshjoshi.com` → Proxy to `localhost:3011`
- **MQTT WebSocket**: `mqtt.aquamind.utkarshjoshi.com` → Proxy to `localhost:9001` (optional)

## Prerequisites
- Nginx installed (`sudo apt install nginx`)
- Backend API running on port 3011
- MQTT broker running (if using MQTT features)
- DNS records pointing to your server IP

## Step 1: Copy Nginx Configuration

```bash
# Copy the nginx config to sites-available
sudo cp aquamind.nginx.conf /etc/nginx/sites-available/aquamind

# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/aquamind /etc/nginx/sites-enabled/

# Remove default nginx site (optional)
sudo rm /etc/nginx/sites-enabled/default
```

## Step 2: Create Dist Directory

```bash
# Create the directory for static files
sudo mkdir -p /var/www/aquamind/dist

# Set proper permissions
sudo chown -R www-data:www-data /var/www/aquamind
sudo chmod -R 755 /var/www/aquamind
```

## Step 3: Build and Copy Frontend

```bash
# Run the build and copy script
./copy-build.sh
```

This script will:
- Build the Next.js admin panel
- Copy static files to `/var/www/aquamind/dist`
- Set proper permissions
- Test nginx configuration

## Step 4: Update Backend Port

Ensure your backend is configured to run on port 3011. The `ecosystem.config.js` has been updated, but you may need to:

```bash
# Update environment variable if using .env file
# PORT=3011

# Restart the backend
cd backend
pm2 restart aquamind-api
# or
pm2 start ecosystem.config.js
```

## Step 5: Test Nginx Configuration

```bash
# Test the configuration
sudo nginx -t

# If successful, reload nginx
sudo systemctl reload nginx
```

## Step 6: Set Up SSL with Certbot

See `CERTBOT_COMMANDS.md` for detailed instructions. Quick command:

```bash
sudo certbot --nginx -d aquamind.utkarshjoshi.com -d aquamind-api.utkarshjoshi.com
```

## MQTT Setup

### Option 1: MQTT WebSocket (via Nginx)
The nginx config includes a WebSocket proxy for MQTT at `mqtt.aquamind.utkarshjoshi.com`. This requires:
- An MQTT broker with WebSocket support on port 9001 (e.g., Mosquitto with WebSocket)

### Option 2: Direct MQTT TCP/TLS
For direct MQTT connections (ports 1883/8883), you have two options:

#### A. Direct Access (Firewall)
Open ports directly in your firewall:
```bash
sudo ufw allow 1883/tcp   # MQTT
sudo ufw allow 8883/tcp   # MQTT over TLS
```

#### B. Nginx Stream Module (Advanced)
If you want nginx to proxy MQTT traffic, you need to:
1. Enable nginx stream module
2. Uncomment the stream blocks in `aquamind.nginx.conf`
3. Configure your MQTT broker to listen on localhost

### MQTT Broker Setup (Mosquitto Example)

```bash
# Install Mosquitto
sudo apt install mosquitto mosquitto-clients

# Configure Mosquitto for WebSocket
sudo nano /etc/mosquitto/conf.d/websocket.conf
```

Add:
```
listener 1883
listener 9001
protocol websockets
allow_anonymous true  # Change to false and add auth for production
```

```bash
# Restart Mosquitto
sudo systemctl restart mosquitto
```

## Troubleshooting

### Frontend not loading
- Check if files exist: `ls -la /var/www/aquamind/dist`
- Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`
- Verify permissions: `sudo chown -R www-data:www-data /var/www/aquamind`

### API not accessible
- Verify backend is running: `pm2 list` or `ps aux | grep node`
- Check backend logs: `pm2 logs aquamind-api`
- Test backend directly: `curl http://localhost:3011/health`
- Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`

### MQTT not working
- Verify MQTT broker is running: `sudo systemctl status mosquitto`
- Test MQTT connection: `mosquitto_pub -h localhost -t test -m "hello"`
- Check firewall: `sudo ufw status`
- Review MQTT broker logs: `sudo journalctl -u mosquitto -f`

### SSL Issues
- Ensure DNS records are correct
- Verify ports 80 and 443 are open
- Check certbot logs: `sudo tail -f /var/log/letsencrypt/letsencrypt.log`

## Updating Frontend

After making changes to the admin panel:

```bash
# Rebuild and copy
./copy-build.sh

# Nginx will automatically serve the new files (no reload needed for static files)
```

## File Structure

```
/var/www/aquamind/
└── dist/              # Static frontend files (served by nginx)
    ├── index.html
    ├── _next/
    └── ...

/etc/nginx/
├── sites-available/
│   └── aquamind      # Nginx configuration
└── sites-enabled/
    └── aquamind -> ../sites-available/aquamind
```

## Ports Summary

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| Frontend | 80/443 | HTTP/HTTPS | Nginx serving static files |
| API | 3011 | HTTP | Backend API (proxied via nginx) |
| MQTT | 1883 | TCP | MQTT broker (direct or proxied) |
| MQTT TLS | 8883 | TCP/TLS | MQTT over TLS (direct or proxied) |
| MQTT WS | 9001 | WebSocket | MQTT WebSocket (proxied via nginx) |



