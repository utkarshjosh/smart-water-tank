# Deployment Checklist

Use this checklist to ensure a smooth deployment of the AquaMind Water Monitoring System.

## Pre-Deployment

### Infrastructure
- [ ] Server provisioned (VPS/Cloud)
- [ ] Server has public IP address
- [ ] Domain DNS access configured
- [ ] SSH access to server verified

### DNS Configuration
- [ ] A record created for `aquamind.utkarshjoshi.com`
- [ ] A record created for `aquamind-api.utkarshjoshi.com`
- [ ] DNS propagation verified (use `dig` or `nslookup`)

### Server Setup
- [ ] Node.js 18+ installed
- [ ] PostgreSQL installed and running
- [ ] Nginx installed
- [ ] PM2 installed globally
- [ ] Certbot installed
- [ ] Firewall configured (UFW)

## Backend Deployment

### Database
- [ ] PostgreSQL database created
- [ ] Database user (aquamind_user) created with proper permissions
- [ ] Database migrations run successfully
- [ ] Seed data loaded (if needed)

### Backend Application
- [ ] Code deployed to server
- [ ] Dependencies installed (`npm install`)
- [ ] TypeScript compiled (`npm run build`)
- [ ] Environment variables configured (`.env`)
- [ ] Storage directories created (`storage/firmware`)
- [ ] PM2 ecosystem config created
- [ ] Backend service started with PM2
- [ ] Health check endpoint working (`/health`)

### Backend Environment Variables
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `DATABASE_URL` configured correctly
- [ ] Firebase Admin SDK credentials configured
- [ ] `CORS_ORIGIN` set to frontend URL
- [ ] `API_BASE_URL` set to backend URL
- [ ] All other required variables set

## Frontend Deployment

### Admin Panel Application
- [ ] Code deployed to server
- [ ] Dependencies installed (`npm install`)
- [ ] Next.js app built (`npm run build`)
- [ ] Environment variables configured (`.env.production`)
- [ ] PM2 ecosystem config created
- [ ] Frontend service started with PM2

### Frontend Environment Variables
- [ ] `NEXT_PUBLIC_API_URL` set to backend API URL
- [ ] All Firebase client config variables set
- [ ] All variables prefixed with `NEXT_PUBLIC_` are correct

## Nginx Configuration

### Backend API Nginx
- [ ] Nginx config file created (`/etc/nginx/sites-available/aquamind-api`)
- [ ] Config file symlinked to `sites-enabled`
- [ ] Nginx config tested (`sudo nginx -t`)
- [ ] Nginx reloaded

### Frontend Nginx
- [ ] Nginx config file created (`/etc/nginx/sites-available/aquamind`)
- [ ] Config file symlinked to `sites-enabled`
- [ ] Nginx config tested (`sudo nginx -t`)
- [ ] Nginx reloaded

## SSL Certificates

### Certificates
- [ ] SSL certificate obtained for `aquamind-api.utkarshjoshi.com`
- [ ] SSL certificate obtained for `aquamind.utkarshjoshi.com`
- [ ] Certificates auto-renewal configured
- [ ] Certificate renewal tested (`sudo certbot renew --dry-run`)

## Security

### Firewall
- [ ] UFW enabled
- [ ] SSH port (22) allowed
- [ ] HTTP port (80) allowed
- [ ] HTTPS port (443) allowed
- [ ] Unnecessary ports closed

### File Permissions
- [ ] Environment files have restricted permissions (600)
- [ ] Storage directories have correct permissions
- [ ] Log directories have correct permissions

### CORS Configuration
- [ ] Backend CORS configured for production domain only
- [ ] No wildcard CORS in production

## Testing

### Backend API
- [ ] Health check endpoint accessible: `https://aquamind-api.utkarshjoshi.com/health`
- [ ] API endpoints responding correctly
- [ ] Authentication working
- [ ] Database queries working
- [ ] Device data ingestion working (if testing with device)

### Frontend
- [ ] Landing page loads: `https://aquamind.utkarshjoshi.com`
- [ ] Admin login page accessible: `https://aquamind.utkarshjoshi.com/login`
- [ ] Admin panel accessible after login: `https://aquamind.utkarshjoshi.com/admin`
- [ ] API calls from frontend working
- [ ] Firebase authentication working
- [ ] All pages load without errors

### Integration
- [ ] Frontend can communicate with backend API
- [ ] Authentication flow works end-to-end
- [ ] Data displays correctly in admin panel
- [ ] Device data appears in admin panel (if testing)

## Monitoring & Maintenance

### Logging
- [ ] PM2 logs accessible
- [ ] Nginx logs accessible
- [ ] Log rotation configured

### Monitoring
- [ ] PM2 monitoring set up
- [ ] Process auto-restart configured
- [ ] Health checks configured (optional)

### Backups
- [ ] Database backup script created
- [ ] Backup cron job configured
- [ ] Backup storage location verified
- [ ] Backup restoration tested

## Post-Deployment

### Documentation
- [ ] Deployment process documented
- [ ] Environment variables documented
- [ ] Access credentials securely stored
- [ ] Team members have access (if applicable)

### Verification
- [ ] All services running (`pm2 status`)
- [ ] Nginx running (`sudo systemctl status nginx`)
- [ ] PostgreSQL running (`sudo systemctl status postgresql`)
- [ ] SSL certificates valid (check browser)
- [ ] No errors in logs

### Performance
- [ ] Page load times acceptable
- [ ] API response times acceptable
- [ ] No memory leaks observed
- [ ] Resource usage within limits

## Rollback Plan

- [ ] Previous version backup available
- [ ] Rollback procedure documented
- [ ] Database migration rollback plan (if needed)

## Additional Notes

- [ ] Staging environment set up (optional but recommended)
- [ ] CI/CD pipeline configured (optional)
- [ ] Error tracking service configured (optional, e.g., Sentry)
- [ ] Uptime monitoring configured (optional, e.g., UptimeRobot)

---

## Quick Health Check Commands

```bash
# Check PM2 status
pm2 status

# Check Nginx status
sudo systemctl status nginx

# Check PostgreSQL status
sudo systemctl status postgresql

# Test backend health
curl https://aquamind-api.utkarshjoshi.com/health

# Check SSL certificates
sudo certbot certificates

# View recent logs
pm2 logs --lines 50
```

---

**Last Updated**: $(date)
**Deployed By**: ________________
**Deployment Date**: ________________





