# 🔒 SSL Certificate Setup with Certbot

## Prerequisites
1. Ensure your Nginx configuration is in place and linked to `sites-enabled`
2. Ensure your DNS records are pointing to this server's IP:
   - `aquamind.utkarshjoshi.com` → Server IP
   - `aquamind-api.utkarshjoshi.com` → Server IP
   - `mqtt.aquamind.utkarshjoshi.com` → Server IP (optional, for MQTT WebSocket)
3. Ensure ports 80 and 443 are open in your firewall

## 1. Install Certbot
If you haven't installed Certbot yet:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

## 2. Obtain and Install Certificates

### For Main Domains (Frontend + API)
```bash
sudo certbot --nginx -d aquamind.utkarshjoshi.com -d aquamind-api.utkarshjoshi.com
```

### If you want to include MQTT WebSocket domain:
```bash
sudo certbot --nginx -d aquamind.utkarshjoshi.com -d aquamind-api.utkarshjoshi.com -d mqtt.aquamind.utkarshjoshi.com
```

### Manual Certificate Only (without auto-configuring nginx):
```bash
sudo certbot certonly --nginx -d aquamind.utkarshjoshi.com -d aquamind-api.utkarshjoshi.com
```

## 3. Certbot will automatically:
- Obtain SSL certificates from Let's Encrypt
- Configure Nginx to use HTTPS
- Set up automatic redirects from HTTP to HTTPS
- Configure certificate auto-renewal

## 4. Verify Auto-Renewal
Certbot packages come with a cron job or systemd timer that will renew your certificates automatically before they expire. Test automatic renewal:

```bash
sudo certbot renew --dry-run
```

## 5. Manual Renewal (if needed)
```bash
sudo certbot renew
```

## 6. Check Certificate Status
```bash
sudo certbot certificates
```

## 7. Revoke a Certificate (if needed)
```bash
sudo certbot revoke --cert-path /etc/letsencrypt/live/aquamind.utkarshjoshi.com/cert.pem
```

## 8. Troubleshooting

### Firewall Issues
If Certbot fails, ensure ports 80 and 443 are open:
```bash
sudo ufw allow 'Nginx Full'
# or
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### DNS Issues
Verify that the domains resolve to your server IP:
```bash
dig aquamind.utkarshjoshi.com
dig aquamind-api.utkarshjoshi.com
```

### Nginx Config Issues
Test your Nginx configuration:
```bash
sudo nginx -t
```

### Check Certbot Logs
```bash
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

## 9. After SSL Setup

After Certbot configures SSL, your nginx configuration will be automatically updated with:
- SSL certificate paths
- HTTPS listeners on port 443
- HTTP to HTTPS redirects

You can verify the updated configuration at:
```bash
sudo cat /etc/nginx/sites-available/aquamind
```

## 10. MQTT TLS Certificate (Port 8883)

If you're using MQTT over TLS on port 8883, you can use the same certificate. The nginx stream configuration (if enabled) will reference:
- Certificate: `/etc/letsencrypt/live/aquamind.utkarshjoshi.com/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/aquamind.utkarshjoshi.com/privkey.pem`

## Notes

- Certificates expire every 90 days, but Certbot will auto-renew them
- Let's Encrypt has rate limits: 50 certificates per registered domain per week
- For production, ensure your server has a valid hostname and proper DNS setup

