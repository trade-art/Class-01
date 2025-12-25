# Design Document: Production Deployment

## Overview

本设计文档描述SaaS多租户平台的生产环境部署架构，包括Docker容器化、CI/CD流水线、多环境配置管理和数据库迁移策略。

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Production Environment                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  Load Balancer  │────▶│   Nginx/Traefik │────▶│   SSL/TLS       │   │
│  │  (HAProxy)      │     │   Reverse Proxy │     │   Termination   │   │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                    │                                    │
│           ┌────────────────────────┼────────────────────────┐          │
│           ▼                        ▼                        ▼          │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  tenant-api     │     │  tenant-api     │     │  platform-svc   │   │
│  │  Instance 1     │     │  Instance 2     │     │  (Admin)        │   │
│  │  :3000          │     │  :3000          │     │  :3001          │   │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘   │
│           │                       │                       │            │
│           └───────────────────────┼───────────────────────┘            │
│                                   ▼                                    │
│           ┌─────────────────────────────────────────────┐              │
│           │              Shared Services                 │              │
│           ├──────────────────┬──────────────────────────┤              │
│           │                  │                          │              │
│           ▼                  ▼                          ▼              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐   │
│  │   PostgreSQL    │ │     Redis       │ │    MT5-Middleware       │   │
│  │   (Primary)     │ │   (Cluster)     │ │    (External)           │   │
│  │   :5432         │ │   :6379         │ │    :8080                │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## CI/CD Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        GitHub Actions Workflow                            │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌────────┐ │
│  │  Push   │───▶│  Build  │───▶│  Test   │───▶│  Docker │───▶│ Deploy │ │
│  │  Code   │    │  & Lint │    │  Suite  │    │  Build  │    │        │ │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    └────────┘ │
│                                                                          │
│  Trigger:                                                                │
│  ├── main branch    → staging deployment                                 │
│  ├── release tag    → production deployment                              │
│  └── PR             → build & test only                                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Docker Configuration

#### Dockerfile Structure (Multi-stage Build)

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/tenant-api/package*.json ./apps/tenant-api/
RUN npm ci --only=production

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

#### Docker Compose Services

| Service | Image | Ports | Replicas | Health Check |
|---------|-------|-------|----------|--------------|
| tenant-api | mt5-platform/tenant-api | 3000 | 2 | /health |
| platform-service | mt5-platform/platform-svc | 3001 | 1 | /health |
| postgres | postgres:15-alpine | 5432 | 1 | pg_isready |
| redis | redis:7-alpine | 6379 | 1 | redis-cli ping |
| nginx | nginx:alpine | 80, 443 | 1 | curl localhost |

### 2. Environment Configuration

#### Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                  Configuration Sources                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Priority (High → Low):                                 │
│  1. Environment Variables (runtime)                     │
│  2. Secrets Manager (AWS/Azure/Vault)                   │
│  3. .env.{environment} files                            │
│  4. Default values in code                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Environment Files

| Environment | File | Purpose |
|-------------|------|---------|
| Development | .env.development | Local development settings |
| Staging | .env.staging | Pre-production testing |
| Production | .env.production | Production settings (secrets from env vars) |

#### Required Environment Variables

| Variable | Description | Required | Secret |
|----------|-------------|----------|--------|
| DATABASE_URL | PostgreSQL connection string | Yes | Yes |
| REDIS_URL | Redis connection string | Yes | No |
| JWT_SECRET | JWT signing key | Yes | Yes |
| AES_KEY | AES encryption key | Yes | Yes |
| MT5_MIDDLEWARE_URL | Middleware service URL | Yes | No |
| NODE_ENV | Environment name | Yes | No |

### 3. Database Migration Strategy

#### Migration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration Process                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Pre-deployment Check                                    │
│     ├── Verify database connectivity                        │
│     ├── Check pending migrations                            │
│     └── Backup current schema                               │
│                                                             │
│  2. Migration Execution                                     │
│     ├── Run: prisma migrate deploy                          │
│     ├── Apply schema changes                                │
│     └── Execute data migrations (if any)                    │
│                                                             │
│  3. Post-deployment Verification                            │
│     ├── Verify schema integrity                             │
│     ├── Run smoke tests                                     │
│     └── Monitor for errors                                  │
│                                                             │
│  4. Rollback (if needed)                                    │
│     ├── Restore from backup                                 │
│     └── Deploy previous version                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4. Health Check Design

#### Health Check Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| GET /health | Basic health | `{ "status": "ok" }` |
| GET /health/ready | Readiness probe | Dependencies status |
| GET /health/live | Liveness probe | Process alive |

#### Health Check Response Schema

```typescript
interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    middleware: DependencyStatus;
  };
}

interface DependencyStatus {
  status: 'ok' | 'error';
  latency?: number;
  message?: string;
}
```

### 5. Deployment Strategy

#### Rolling Update Configuration

```yaml
deployment:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1

  healthCheck:
    initialDelaySeconds: 10
    periodSeconds: 5
    failureThreshold: 3
    successThreshold: 1
```

#### Deployment Phases

| Phase | Action | Rollback Trigger |
|-------|--------|------------------|
| 1. Build | Docker image creation | Build failure |
| 2. Test | Run test suite | Test failure |
| 3. Deploy Staging | Deploy to staging | Health check fail |
| 4. Smoke Test | Verify staging | Test failure |
| 5. Deploy Prod | Rolling update | Health check fail |
| 6. Verify | Monitor metrics | Error rate > 5% |

## File Structure

```
├── docker/
│   ├── Dockerfile.tenant-api
│   ├── Dockerfile.platform-service
│   └── nginx/
│       ├── nginx.conf
│       └── ssl/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-staging.yml
│       └── deploy-production.yml
├── scripts/
│   ├── deploy.sh
│   ├── rollback.sh
│   └── health-check.sh
└── config/
    ├── .env.example
    ├── .env.development
    ├── .env.staging
    └── .env.production.example
```

## Error Handling

### Deployment Failure Scenarios

| Scenario | Detection | Recovery Action |
|----------|-----------|-----------------|
| Build failure | CI job fails | Block deployment, notify team |
| Test failure | Test job fails | Block deployment, notify team |
| Container crash | Health check fails | Rollback to previous version |
| Database migration fail | Migration returns error | Restore backup, deploy previous |
| Network issues | Connection timeout | Retry with backoff, alert |

### Rollback Procedure

1. **Automatic Rollback**: Triggered by 3 consecutive health check failures
2. **Manual Rollback**: `./scripts/rollback.sh <previous-version>`
3. **Database Rollback**: Restore from pre-migration backup

## Security Considerations

1. **Secrets Management**: All secrets via environment variables or Secrets Manager
2. **Image Security**: Non-root user in containers, minimal base image
3. **Network Security**: Internal network isolation, TLS for all traffic
4. **Access Control**: Deployment requires approval for production

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Docker | 24.x | Container runtime |
| Docker Compose | 2.x | Local orchestration |
| GitHub Actions | - | CI/CD platform |
| Node.js | 20.x | Runtime |
| PostgreSQL | 15.x | Database |
| Redis | 7.x | Cache/Session |
