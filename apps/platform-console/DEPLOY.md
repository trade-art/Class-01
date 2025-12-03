# Platform Admin Console 部署文档

## 目录

- [环境要求](#环境要求)
- [本地开发](#本地开发)
- [生产构建](#生产构建)
- [Docker 部署](#docker-部署)
- [Nginx 配置](#nginx-配置)
- [环境变量](#环境变量)

---

## 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Docker >= 20.0 (可选，用于容器化部署)

## 本地开发

### 1. 安装依赖

```bash
# 在 monorepo 根目录
pnpm install

# 或单独在 platform-console 目录
cd apps/platform-console
pnpm install
```

### 2. 启动开发服务器

```bash
pnpm dev
```

开发服务器默认运行在 `http://localhost:5173`

### 3. API 代理配置

开发环境下，API 请求会被代理到后端服务。在 `vite.config.ts` 中配置：

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
  },
}
```

---

## 生产构建

### 1. 构建项目

```bash
pnpm build
```

构建产物位于 `dist/` 目录。

### 2. 预览构建结果

```bash
pnpm preview
```

---

## Docker 部署

### 方式一：使用 Docker Compose（推荐）

```bash
# 在 platform-console 目录下
docker-compose up -d
```

这将：
- 构建前端镜像
- 启动 Nginx 容器服务前端静态文件
- 配置 API 代理到后端服务

### 方式二：手动构建镜像

```bash
# 构建镜像
docker build -t mt5-platform-console .

# 运行容器
docker run -d \
  -p 80:80 \
  --name platform-console \
  mt5-platform-console
```

### Docker 网络配置

如果后端 API 服务也在 Docker 中运行，确保两个容器在同一网络：

```bash
# 创建网络
docker network create mt5-network

# 运行容器时指定网络
docker run -d \
  -p 80:80 \
  --network mt5-network \
  --name platform-console \
  mt5-platform-console
```

---

## Nginx 配置

### 配置说明

`nginx.conf` 包含以下关键配置：

1. **Gzip 压缩** - 优化传输性能
2. **静态资源缓存** - JS/CSS/图片等缓存1年
3. **API 代理** - 将 `/api/` 请求转发到后端
4. **SPA 路由** - 所有路由回退到 `index.html`

### 自定义 API 地址

修改 `nginx.conf` 中的 upstream：

```nginx
location /api/ {
    proxy_pass http://your-api-server:3000/api/;
    # ...
}
```

### 生产环境 Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # API 代理
    location /api/ {
        proxy_pass http://platform-api:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 环境变量

### 构建时环境变量

在 `.env.production` 文件中配置：

```env
# API 基础路径（相对路径，由 Nginx 代理）
VITE_API_BASE_URL=/api

# 应用标题
VITE_APP_TITLE=MT5 Platform Admin
```

### 运行时配置

对于需要运行时修改的配置，可以使用 `window.__CONFIG__`：

1. 创建 `public/config.js`：
```javascript
window.__CONFIG__ = {
  API_BASE_URL: '/api',
  APP_TITLE: 'MT5 Platform Admin',
};
```

2. 在应用中读取配置：
```typescript
const config = window.__CONFIG__ || {};
const apiBaseUrl = config.API_BASE_URL || '/api';
```

---

## 健康检查

### 前端健康检查

访问根路径 `/` 返回 200 即表示前端服务正常。

### Docker 健康检查

Dockerfile 已配置健康检查：

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
```

---

## 故障排查

### 1. 页面空白

- 检查浏览器控制台是否有 JavaScript 错误
- 确认静态资源路径正确
- 检查 Nginx 配置的 `root` 路径

### 2. API 请求失败

- 检查 Nginx 代理配置
- 确认后端服务运行正常
- 检查网络连接和防火墙规则

### 3. 路由 404

- 确认 Nginx 配置了 `try_files $uri $uri/ /index.html`
- 确认 `index.html` 文件存在

### 4. 静态资源 404

- 检查 `dist/assets/` 目录是否包含构建产物
- 确认 Nginx `root` 指向正确的目录

---

## 性能优化建议

1. **启用 HTTP/2** - 提升并发请求性能
2. **启用 Brotli 压缩** - 比 Gzip 更高压缩率
3. **使用 CDN** - 加速静态资源分发
4. **配置 Service Worker** - 实现离线缓存

---

## 版本信息

- Vue: 3.x
- Vite: 5.x
- Naive UI: 2.x
- ECharts: 5.x
