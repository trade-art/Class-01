# Deployment Guide

## 架构说明

| 组件 | 开发环境 | 生产环境 |
|------|----------|----------|
| Platform Service | 本机 | 本机 |
| Tenant API | 本机 | 本机 |
| Platform Console | 本机 | 本机 (Nginx 托管) |
| Tenant Console | 本机 | 本机 (Nginx 托管) |
| PostgreSQL | Docker | 本机安装 |
| Redis | Docker | Docker |

## 开发环境

### 1. 启动依赖服务

```bash
# 启动 PostgreSQL + Redis
docker compose up -d
```

### 2. 配置环境变量

```bash
# 各服务目录下复制 .env.example 为 .env
cp apps/platform-service/.env.example apps/platform-service/.env
cp apps/tenant-api/.env.example apps/tenant-api/.env
```

### 3. 数据库迁移

```bash
# Platform Service
cd apps/platform-service
npx prisma migrate dev

# Tenant API
cd apps/tenant-api
npx prisma migrate dev
```

### 4. 启动服务

```bash
# 根目录
npm run dev
```

## 生产环境部署

### 1. 服务器准备

```bash
# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# 安装 PostgreSQL
apt install -y postgresql postgresql-contrib

# 安装 Docker (仅用于 Redis)
curl -fsSL https://get.docker.com | sh

# 安装 PM2 (进程管理)
npm install -g pm2

# 安装 Nginx
apt install -y nginx
```

### 2. 配置 PostgreSQL

```bash
# 切换到 postgres 用户
sudo -u postgres psql

# 创建数据库和用户
CREATE USER mt5admin WITH PASSWORD 'your_secure_password';
CREATE DATABASE mt5_platform OWNER mt5admin;
GRANT ALL PRIVILEGES ON DATABASE mt5_platform TO mt5admin;
\q
```

### 3. 启动 Redis

```bash
# 复制环境配置
cp .env.production.example .env.production
# 编辑 REDIS_PASSWORD

# 启动 Redis
docker compose -f docker-compose.prod.yml up -d
```

### 4. 部署后端服务

```bash
# 安装依赖
npm ci

# 构建
npm run build

# Platform Service
cd apps/platform-service
npx prisma migrate deploy
pm2 start dist/main.js --name platform-service

# Tenant API
cd apps/tenant-api
npx prisma migrate deploy
pm2 start dist/main.js --name tenant-api

# 保存 PM2 配置
pm2 save
pm2 startup
```

### 5. 部署前端

```bash
# 构建前端
cd apps/platform-console
npm run build

cd apps/tenant-console
npm run build

# 复制到 Nginx 目录
cp -r apps/platform-console/dist /var/www/platform-console
cp -r apps/tenant-console/dist /var/www/tenant-console
```

### 6. 配置 Nginx

```nginx
# /etc/nginx/sites-available/mt5-platform

# Platform Console
server {
    listen 80;
    server_name admin.yourdomain.com;
    root /var/www/platform-console;
    index index.html;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Tenant Console
server {
    listen 80;
    server_name app.yourdomain.com;
    root /var/www/tenant-console;
    index index.html;

    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# 启用站点
ln -s /etc/nginx/sites-available/mt5-platform /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 7. SSL 证书 (可选)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d admin.yourdomain.com -d app.yourdomain.com
```

## 维护命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs platform-service
pm2 logs tenant-api

# 重启服务
pm2 restart platform-service
pm2 restart tenant-api

# 更新部署
git pull
npm ci
npm run build
pm2 restart all

# 数据库备份
pg_dump -U mt5admin mt5_platform > backup_$(date +%Y%m%d).sql

# 数据库恢复
psql -U mt5admin mt5_platform < backup.sql
```
