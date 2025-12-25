# MT5 Platform 部署指南

## 目录

1. [概述](#概述)
2. [环境要求](#环境要求)
3. [快速开始](#快速开始)
4. [环境配置](#环境配置)
5. [部署流程](#部署流程)
6. [数据库迁移](#数据库迁移)
7. [健康检查](#健康检查)
8. [回滚操作](#回滚操作)
9. [CI/CD 流水线](#cicd-流水线)
10. [监控与告警](#监控与告警)

---

## 概述

MT5 Platform 是一个多租户 SaaS 交易平台，采用微服务架构，支持多种部署环境：

- **Development**: 本地开发环境
- **Staging**: 预发布测试环境
- **Production**: 生产环境

### 架构组件

| 组件 | 描述 | 端口 |
|------|------|------|
| tenant-api | 租户 API 服务 (NestJS) | 3000 |
| platform-service | 平台核心服务 (NestJS) | 3001 |
| tenant-console | 租户管理控制台 (Vue.js) | 8080 |
| PostgreSQL | 主数据库 | 5432 |
| Redis | 缓存与会话存储 | 6379 |
| Nginx | 反向代理与负载均衡 | 80/443 |

---

## 环境要求

### 硬件要求

| 环境 | CPU | 内存 | 存储 |
|------|-----|------|------|
| Development | 2 核 | 4 GB | 20 GB |
| Staging | 4 核 | 8 GB | 50 GB |
| Production | 8+ 核 | 16+ GB | 100+ GB SSD |

### 软件要求

- **Docker**: 24.0+
- **Docker Compose**: 2.20+
- **Node.js**: 20.x LTS
- **PostgreSQL**: 15.x (容器化)
- **Redis**: 7.x (容器化)

### 网络要求

- 开放端口: 80, 443, 3000, 3001
- SSL 证书 (生产环境必需)
- 域名配置

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/mt5-platform.git
cd mt5-platform
```

### 2. 配置环境变量

```bash
# 复制环境配置模板
cp config/.env.example config/.env.development
cp config/.env.example config/.env.staging
cp config/.env.example config/.env.production

# 编辑配置文件
vim config/.env.production
```

### 3. 一键部署

```bash
# 开发环境
./scripts/deploy.sh --env development

# 预发布环境
./scripts/deploy.sh --env staging --version v1.0.0

# 生产环境
./scripts/deploy.sh --env production --version v1.0.0 --force
```

---

## 环境配置

### 配置文件结构

```
config/
├── .env.development     # 开发环境配置
├── .env.staging         # 预发布环境配置
├── .env.production      # 生产环境配置
└── .env.example         # 配置模板
```

### 必需的环境变量

```bash
# 应用配置
NODE_ENV=production
APP_VERSION=v1.0.0

# 数据库配置
DATABASE_URL=postgresql://user:password@host:5432/mt5_platform
DB_HOST=postgres
DB_PORT=5432
DB_USER=mt5_user
DB_PASSWORD=<secure-password>
DB_NAME=mt5_platform

# Redis 配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<secure-password>

# JWT 配置
JWT_SECRET=<256-bit-secret>
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d

# API 配置
TENANT_API_PORT=3000
PLATFORM_SERVICE_PORT=3001

# 日志配置
LOG_LEVEL=info
LOG_FORMAT=json
```

### 生产环境特殊配置

```bash
# SSL/TLS
SSL_CERT_PATH=/etc/nginx/ssl/cert.pem
SSL_KEY_PATH=/etc/nginx/ssl/key.pem

# 速率限制
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# CORS
CORS_ORIGINS=https://console.example.com,https://api.example.com

# 备份配置
BACKUP_S3_BUCKET=mt5-backups
BACKUP_RETENTION_DAYS=30
```

---

## 部署流程

### 手动部署

#### 步骤 1: 预检查

```bash
# 检查 Docker 状态
docker info

# 检查磁盘空间
df -h

# 验证配置文件
./scripts/deploy.sh --env production --dry-run
```

#### 步骤 2: 构建镜像

```bash
# 构建所有服务镜像
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

#### 步骤 3: 数据库迁移

```bash
# 创建备份
./scripts/db-backup.sh --env production

# 运行迁移
./scripts/db-migrate.sh --env production
```

#### 步骤 4: 部署服务

```bash
# 启动基础设施
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis

# 等待基础设施就绪
sleep 30

# 启动应用服务
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d tenant-api platform-service

# 启动前端和代理
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d tenant-console nginx
```

#### 步骤 5: 验证部署

```bash
# 检查服务状态
docker compose ps

# 健康检查
curl -f http://localhost:3000/health
curl -f http://localhost:3001/health

# 检查日志
docker compose logs -f tenant-api --tail=100
```

### 使用部署脚本

```bash
# 完整部署
./scripts/deploy.sh --env production --version v1.0.0

# 跳过构建 (使用预构建镜像)
./scripts/deploy.sh --env production --skip-build

# 跳过数据库迁移
./scripts/deploy.sh --env production --skip-migrate

# 跳过部署后测试
./scripts/deploy.sh --env production --skip-tests

# 预览模式 (不实际执行)
./scripts/deploy.sh --env production --dry-run
```

---

## 数据库迁移

### 迁移脚本使用

```bash
# 查看迁移状态
./scripts/db-migrate.sh --env production --dry-run

# 执行迁移
./scripts/db-migrate.sh --env production

# 跳过备份
./scripts/db-migrate.sh --env production --skip-backup

# 回滚到指定版本
./scripts/db-migrate.sh --env production --rollback --version 20240101000000
```

### 备份操作

```bash
# 创建备份
./scripts/db-backup.sh --env production

# 列出备份
./scripts/db-backup.sh --env production --list

# 恢复备份
./scripts/db-backup.sh --env production --restore --file backups/db/backup_20240101_120000.sql.gz

# 上传到 S3
./scripts/db-backup.sh --env production --s3-upload
```

### 验证数据库

```bash
# 完整验证
./scripts/db-verify.sh --env production --check all

# 仅检查 schema
./scripts/db-verify.sh --env production --check schema

# 检查数据完整性
./scripts/db-verify.sh --env production --check data

# 检查约束
./scripts/db-verify.sh --env production --check constraints

# 生成报告
./scripts/db-verify.sh --env production --report
```

---

## 健康检查

### 端点说明

| 端点 | 用途 | 认证 |
|------|------|------|
| `GET /health` | 基础健康检查 | 无 |
| `GET /health/live` | K8s 存活探针 | 无 |
| `GET /health/ready` | K8s 就绪探针 | 无 |
| `GET /health/system` | 系统详细状态 | JWT |
| `GET /health/servers` | 服务器状态 | JWT |

### 健康检查示例

```bash
# 基础检查
curl http://localhost:3000/health
# 响应: {"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}

# 存活检查
curl http://localhost:3000/health/live
# 响应: {"status":"alive","timestamp":"2024-01-01T00:00:00.000Z"}

# 就绪检查
curl http://localhost:3000/health/ready
# 响应: {"status":"ready","timestamp":"2024-01-01T00:00:00.000Z"}
```

### Docker 健康检查配置

```yaml
# docker-compose.yml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

---

## 回滚操作

### 快速回滚

```bash
# 自动回滚到上一版本
./scripts/rollback.sh --env production --force

# 回滚到指定版本
./scripts/rollback.sh --env production --version v1.0.0

# 预览回滚操作
./scripts/rollback.sh --env production --dry-run
```

### 查看可用版本

```bash
./scripts/rollback.sh --env production --list
```

输出示例:
```
Currently running:
  tenant-api: ghcr.io/org/mt5-platform/tenant-api:v1.1.0
  platform-service: ghcr.io/org/mt5-platform/platform-service:v1.1.0

Available local images:
  tenant-api:v1.0.0 (2 days ago)
  tenant-api:v0.9.0 (1 week ago)
  platform-service:v1.0.0 (2 days ago)
```

### 数据库回滚

```bash
# 回滚数据库迁移
./scripts/db-migrate.sh --env production --rollback --version 20240101000000

# 从备份恢复
./scripts/db-backup.sh --env production --restore --file <backup-file>
```

---

## CI/CD 流水线

### GitHub Actions 工作流

| 工作流 | 触发条件 | 说明 |
|--------|----------|------|
| `ci.yml` | PR / Push | 构建、测试、代码检查 |
| `docker-build.yml` | 被调用 | 构建 Docker 镜像 |
| `deploy-staging.yml` | Push to main | 自动部署到 Staging |
| `deploy-production.yml` | 手动触发 | 生产环境部署 |

### 触发生产部署

```bash
# 使用 GitHub CLI
gh workflow run deploy-production.yml \
  -f version=v1.0.0 \
  -f skip_tests=false \
  -f require_approval=true
```

### 部署审批

生产环境部署需要以下审批：

1. **代码审查**: PR 需要至少 2 个审批
2. **环境审批**: 需要 `production-deployers` 团队成员审批
3. **部署确认**: 工作流中需要手动确认

---

## 监控与告警

### 日志查看

```bash
# 实时日志
docker compose logs -f tenant-api

# 最近 100 行
docker compose logs --tail=100 tenant-api

# 指定时间范围
docker compose logs --since="2024-01-01T00:00:00" tenant-api
```

### 服务状态

```bash
# 所有服务状态
docker compose ps

# 资源使用
docker stats

# 容器详情
docker inspect tenant-api
```

### 告警配置

告警通过 Slack Webhook 发送：

```yaml
# 配置 Slack Webhook
SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

告警场景：
- 部署失败
- 健康检查失败
- E2E 测试失败
- 自动回滚触发

---

## 附录

### 常用命令速查

```bash
# 部署
./scripts/deploy.sh --env production --version v1.0.0

# 回滚
./scripts/rollback.sh --env production

# 数据库备份
./scripts/db-backup.sh --env production

# 数据库迁移
./scripts/db-migrate.sh --env production

# 健康检查
curl http://localhost:3000/health

# 查看日志
docker compose logs -f tenant-api

# 重启服务
docker compose restart tenant-api

# 扩容
docker compose up -d --scale tenant-api=3
```

### 相关文档

- [故障排查指南](./troubleshooting.md)
- [安全策略](./security-policy.md)
- [安全配置](./security-configuration.md)
- [事件响应](./incident-response.md)
- [架构文档](./SAAS_PLATFORM_ARCHITECTURE.md)
