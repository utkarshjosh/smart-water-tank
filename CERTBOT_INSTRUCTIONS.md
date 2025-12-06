# 🔒 SSL Certificate Setup with Certbot

## Prerequisites
Ensure your Nginx configuration is in place and linked to `sites-enabled`.
Ensure your DNS records for `aquamind.utkarshjoshi.com` and `aquamind-api.utkarshjoshi.com` are pointing to this server's IP.

## 1. Install Certbot
If you haven't installed Certbot yet:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

## 2. Obtain and Install Certificates
Run the following command to obtain certificates and automatically configure Nginx to use HTTPS:

```bash
sudo certbot --nginx -d aquamind.utkarshjoshi.com -d aquamind-api.utkarshjoshi.com
```

## 3. Verify Auto-Renewal
Certbot packages come with a cron job or systemd timer that will renew your certificates automatically before they expire. You can test automatic renewal for your certificates by running this command:

```bash
sudo certbot renew --dry-run
```

## 4. Troubleshooting
If Certbot fails, check:
- **Firewall**: Ensure ports 80 and 443 are open (`sudo ufw allow 'Nginx Full'`).
- **DNS**: Verify that the domains resolve to your server IP.
- **Nginx Config**: Ensure `sudo nginx -t` returns success.
