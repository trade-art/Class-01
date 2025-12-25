在我们通过claude客户端交互时我希望你按下面这些注意事项执行

1.用中文输出信息

2.todos列表用中文显示

3.使用edit工具时请始终使用完整的绝对 Windows 路径(带有驱动器号和反斜杠)

---

## Docker 资源清单

### Docker 容器

| 容器名称 | 镜像 | 端口映射 | 用途 |
|---------|------|---------|------|
| `mt5-platform-service` | `mt5-platform-service:latest` | `3001:3001` | Platform Service API (平台管理服务) |
| `mt5-postgres` | `postgres:15-alpine` | `5433:5432` | PostgreSQL 数据库 |
| `mt5-redis` | `redis:7-alpine` | `6380:6379` | Redis 缓存和会话存储 |

### Docker 数据卷

| 卷名称 | 用途 | 类型 |
|-------|------|------|
| `mt5-platform_postgres_data` | PostgreSQL 数据持久化 | external |
| `mt5-platform_redis_data` | Redis 数据持久化 | external |

### Docker 网络

| 网络名称 | 驱动 | 用途 |
|---------|------|------|
| `mt5-backend` | bridge | 后端服务间通信 |
| `mt5-frontend` | bridge | 前后端通信 |

### Docker 镜像

| 镜像名称 | 基础镜像 | 说明 |
|---------|---------|------|
| `mt5-platform-service:latest` | `node:20-alpine3.18` | Platform Service 生产镜像 |

### 常用命令

```bash
# 启动所有服务
docker compose up -d

# 仅启动后端服务
docker compose up postgres redis platform-service -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f platform-service

# 重新构建镜像
docker compose build platform-service --no-cache

# 停止所有服务
docker compose down
```

### 健康检查端点

- Platform Service: `http://localhost:3001/health`
- Tenant API: `http://localhost:3000/api/v1/health`

### 默认凭据 (开发环境)

- **PostgreSQL**
  - 主机: `localhost:5433`
  - 用户: `mt5admin`
  - 密码: `mt5platform2024`
  - 数据库: `mt5_platform`

- **Redis**
  - 主机: `localhost:6380`
  - 密码: `redis123`

- **Platform Admin** (平台管理员)
  - 邮箱: `admin@mt5platform.com`
  - 密码: `Admin@123456`