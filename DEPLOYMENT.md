# Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- Domain name configured (optional for local testing)
- SSL certificates (for production HTTPS)

## Quick Start (Local)

```bash
# 1. Copy environment file
cp .env.production.example .env.production

# 2. Edit .env.production with your settings
# Generate secure passwords and JWT secrets

# 3. Start all services
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# 4. Run database migrations
docker exec mt5-platform-service npx prisma migrate deploy
docker exec mt5-tenant-api npx prisma migrate deploy

# 5. Access the applications
# Platform Console: http://admin.localhost
# Tenant Console: http://app.localhost
```

## Production Deployment

### 1. Server Setup

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin
```

### 2. SSL Certificates (Let's Encrypt)

```bash
# Install certbot
apt install certbot

# Generate certificates
certbot certonly --standalone -d admin.yourdomain.com -d app.yourdomain.com

# Copy certificates to nginx/ssl
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/
```

### 3. Configure Environment

```bash
cp .env.production.example .env.production
nano .env.production
```

Generate secure values:
```bash
# Generate random strings for JWT secrets
openssl rand -base64 48
```

### 4. Update Nginx for HTTPS

Edit `nginx/conf.d/default.conf`:
- Uncomment SSL redirect lines
- Add SSL server blocks

### 5. Deploy

```bash
# Build and start
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Run migrations
docker exec mt5-platform-service npx prisma migrate deploy
docker exec mt5-tenant-api npx prisma migrate deploy

# Check status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

## Maintenance

### View Logs
```bash
docker compose -f docker-compose.prod.yml logs -f [service-name]
```

### Restart Services
```bash
docker compose -f docker-compose.prod.yml restart [service-name]
```

### Update Application
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Backup Database
```bash
docker exec mt5-postgres pg_dump -U mt5admin mt5_platform > backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
docker exec -i mt5-postgres psql -U mt5admin mt5_platform < backup.sql
```

## Troubleshooting

### Check Service Health
```bash
curl http://localhost/health
docker compose -f docker-compose.prod.yml ps
```

### Database Connection Issues
```bash
docker exec mt5-postgres pg_isready -U mt5admin
docker logs mt5-postgres
```

### View Container Logs
```bash
docker logs mt5-platform-service
docker logs mt5-tenant-api
docker logs mt5-nginx
```
