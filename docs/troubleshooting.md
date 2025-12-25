# MT5 Platform 故障排查指南

## 目录

1. [快速诊断](#快速诊断)
2. [常见问题](#常见问题)
3. [服务故障](#服务故障)
4. [数据库问题](#数据库问题)
5. [网络问题](#网络问题)
6. [性能问题](#性能问题)
7. [部署问题](#部署问题)
8. [日志分析](#日志分析)
9. [紧急恢复](#紧急恢复)

---

## 快速诊断

### 系统状态检查清单

```bash
# 1. 检查所有服务状态
docker compose ps

# 2. 检查健康端点
curl -sf http://localhost:3000/health && echo "tenant-api: OK" || echo "tenant-api: FAILED"
curl -sf http://localhost:3001/health && echo "platform-service: OK" || echo "platform-service: FAILED"

# 3. 检查数据库连接
docker compose exec postgres pg_isready -U mt5_user -d mt5_platform

# 4. 检查 Redis 连接
docker compose exec redis redis-cli ping

# 5. 检查磁盘空间
df -h

# 6. 检查内存使用
docker stats --no-stream

# 7. 检查最近日志
docker compose logs --tail=50 tenant-api
```

### 快速诊断脚本

```bash
#!/bin/bash
echo "=== MT5 Platform 系统诊断 ==="

echo -e "\n[服务状态]"
docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Health}}"

echo -e "\n[健康检查]"
for port in 3000 3001; do
    if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
        echo "  Port $port: OK"
    else
        echo "  Port $port: FAILED"
    fi
done

echo -e "\n[资源使用]"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

echo -e "\n[最近错误]"
docker compose logs --tail=10 2>&1 | grep -i "error\|exception\|fatal" || echo "  无错误"
```

---

## 常见问题

### Q1: 服务无法启动

**症状**: `docker compose up` 后服务状态为 `exited` 或 `restarting`

**诊断步骤**:
```bash
# 查看服务状态
docker compose ps

# 查看启动日志
docker compose logs tenant-api --tail=100

# 检查退出码
docker inspect tenant-api --format='{{.State.ExitCode}}'
```

**常见原因及解决方案**:

| 原因 | 解决方案 |
|------|----------|
| 数据库未就绪 | 等待 postgres 健康后再启动应用 |
| 端口占用 | `lsof -i :3000` 检查并释放端口 |
| 环境变量缺失 | 检查 `.env` 文件配置 |
| 镜像构建失败 | 重新构建: `docker compose build --no-cache` |

### Q2: 健康检查失败

**症状**: `/health` 端点返回 503 或超时

**诊断步骤**:
```bash
# 直接检查容器内部
docker compose exec tenant-api curl -v http://localhost:3000/health

# 检查应用日志
docker compose logs tenant-api --tail=50 | grep -i health

# 检查依赖服务
docker compose exec tenant-api curl -sf http://postgres:5432 || echo "DB unreachable"
docker compose exec tenant-api curl -sf http://redis:6379 || echo "Redis unreachable"
```

**解决方案**:
```bash
# 重启服务
docker compose restart tenant-api

# 如果依赖服务问题，先重启依赖
docker compose restart postgres redis
sleep 30
docker compose restart tenant-api
```

### Q3: 数据库连接失败

**症状**: `Error: connect ECONNREFUSED` 或 `Connection refused`

**诊断步骤**:
```bash
# 检查数据库容器
docker compose ps postgres

# 测试连接
docker compose exec postgres psql -U mt5_user -d mt5_platform -c "SELECT 1"

# 检查连接数
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = 'mt5_platform'"
```

**解决方案**:
```bash
# 重启数据库
docker compose restart postgres

# 如果连接数过多，终止空闲连接
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '1 hour'"
```

### Q4: Redis 连接问题

**症状**: `Error: Redis connection lost` 或缓存失效

**诊断步骤**:
```bash
# 检查 Redis 状态
docker compose exec redis redis-cli ping

# 检查内存使用
docker compose exec redis redis-cli info memory

# 检查连接数
docker compose exec redis redis-cli info clients
```

**解决方案**:
```bash
# 重启 Redis
docker compose restart redis

# 清理过期键
docker compose exec redis redis-cli --scan --pattern '*' | head -100

# 如果内存不足，清理缓存
docker compose exec redis redis-cli FLUSHDB
```

### Q5: JWT 认证失败

**症状**: `401 Unauthorized` 或 `Invalid token`

**诊断步骤**:
```bash
# 检查 JWT 配置
docker compose exec tenant-api printenv | grep JWT

# 验证 token 格式
echo "your-token" | cut -d'.' -f2 | base64 -d

# 检查时钟同步
docker compose exec tenant-api date
date
```

**解决方案**:
- 确保 `JWT_SECRET` 在所有服务间一致
- 检查 token 过期时间
- 同步容器时钟

---

## 服务故障

### tenant-api 服务不可用

```bash
# 完整诊断
docker compose logs tenant-api --tail=200
docker compose exec tenant-api node -e "console.log('Node OK')"
docker compose exec tenant-api curl -v http://localhost:3000/health

# 重启流程
docker compose stop tenant-api
docker compose rm -f tenant-api
docker compose up -d tenant-api
```

### platform-service 服务不可用

```bash
# 检查服务依赖
docker compose exec platform-service curl -sf http://postgres:5432 || echo "DB DOWN"
docker compose exec platform-service curl -sf http://redis:6379 || echo "Redis DOWN"

# 重建服务
docker compose build platform-service
docker compose up -d --force-recreate platform-service
```

### Nginx 代理问题

```bash
# 检查 Nginx 配置
docker compose exec nginx nginx -t

# 检查上游服务
docker compose exec nginx curl -sf http://tenant-api:3000/health

# 查看 Nginx 日志
docker compose logs nginx --tail=100

# 重载配置
docker compose exec nginx nginx -s reload
```

---

## 数据库问题

### 迁移失败

**症状**: `prisma migrate deploy` 失败

```bash
# 检查迁移状态
cd apps/platform-service
npx prisma migrate status

# 查看待执行迁移
ls -la prisma/migrations/

# 手动修复后重试
npx prisma migrate deploy

# 如果需要回滚
npx prisma migrate resolve --rolled-back <migration-name>
```

### 连接池耗尽

**症状**: `too many connections` 或连接超时

```bash
# 检查当前连接
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "SELECT pid, usename, application_name, state, query_start
   FROM pg_stat_activity
   WHERE datname = 'mt5_platform'"

# 终止空闲连接
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND query_start < now() - interval '10 minutes'"

# 调整连接池配置
# 在 DATABASE_URL 中添加: ?connection_limit=20&pool_timeout=30
```

### 数据损坏

```bash
# 运行完整性检查
./scripts/db-verify.sh --env production --check all

# 检查表完整性
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'"

# 从备份恢复
./scripts/db-backup.sh --env production --list
./scripts/db-backup.sh --env production --restore --file <backup-file>
```

### 性能慢查询

```bash
# 启用慢查询日志
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "ALTER SYSTEM SET log_min_duration_statement = 1000"

# 查看慢查询
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "SELECT query, calls, mean_time, total_time
   FROM pg_stat_statements
   ORDER BY mean_time DESC
   LIMIT 10"

# 分析查询计划
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "EXPLAIN ANALYZE SELECT * FROM your_table WHERE condition"
```

---

## 网络问题

### 服务间通信失败

```bash
# 检查 Docker 网络
docker network ls
docker network inspect mt5-platform_default

# 测试服务间连接
docker compose exec tenant-api ping -c 3 platform-service
docker compose exec tenant-api curl -v http://platform-service:3001/health

# 重建网络
docker compose down
docker network prune
docker compose up -d
```

### 外部访问失败

```bash
# 检查端口映射
docker compose ps --format "table {{.Name}}\t{{.Ports}}"

# 检查防火墙
sudo iptables -L -n | grep 3000

# 检查 Nginx 代理
docker compose logs nginx --tail=50
```

### SSL/TLS 问题

```bash
# 检查证书
openssl x509 -in /path/to/cert.pem -text -noout

# 检查证书过期
openssl x509 -in /path/to/cert.pem -enddate -noout

# 测试 SSL 连接
openssl s_client -connect localhost:443 -servername your-domain.com
```

---

## 性能问题

### 高 CPU 使用

```bash
# 查看资源使用
docker stats

# 查看进程
docker compose exec tenant-api top

# 生成 CPU profile
docker compose exec tenant-api node --prof app.js

# 检查事件循环延迟
docker compose exec tenant-api node -e \
  "setInterval(() => console.log('lag:', Date.now() - (Date.now() - 1000)), 1000)"
```

### 高内存使用

```bash
# 检查内存使用
docker stats --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# 生成 heap snapshot
docker compose exec tenant-api node --heapsnapshot-signal=SIGUSR2 -e "process.kill(process.pid, 'SIGUSR2')"

# 检查内存泄漏
docker compose logs tenant-api | grep -i "heap\|memory\|oom"

# 调整内存限制
# 在 docker-compose.yml 中设置:
# deploy:
#   resources:
#     limits:
#       memory: 2G
```

### 响应时间慢

```bash
# 检查 API 响应时间
time curl -s http://localhost:3000/health

# 检查数据库延迟
docker compose exec postgres psql -U mt5_user -d mt5_platform -c \
  "SELECT * FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT 5"

# 检查 Redis 延迟
docker compose exec redis redis-cli --latency

# 启用请求日志
# 在应用中添加请求计时中间件
```

---

## 部署问题

### 构建失败

```bash
# 清理构建缓存
docker builder prune -a

# 重新构建
docker compose build --no-cache tenant-api

# 检查 Dockerfile
docker compose config

# 查看构建日志
docker compose build tenant-api 2>&1 | tee build.log
```

### 镜像拉取失败

```bash
# 检查镜像仓库认证
docker login ghcr.io

# 手动拉取镜像
docker pull ghcr.io/your-org/mt5-platform/tenant-api:latest

# 检查镜像存在
docker images | grep mt5
```

### 回滚失败

```bash
# 列出可用版本
./scripts/rollback.sh --env production --list

# 手动回滚
export APP_VERSION=v1.0.0
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 从备份恢复数据库
./scripts/db-backup.sh --env production --restore --file <backup-file>
```

---

## 日志分析

### 日志位置

| 服务 | 日志位置 |
|------|----------|
| tenant-api | `docker compose logs tenant-api` |
| platform-service | `docker compose logs platform-service` |
| Nginx | `docker compose logs nginx` |
| PostgreSQL | `docker compose logs postgres` |
| 部署日志 | `logs/deployments/` |
| 迁移日志 | `logs/migrations/` |

### 日志过滤

```bash
# 按时间过滤
docker compose logs --since="2024-01-01T00:00:00" tenant-api

# 按关键字过滤
docker compose logs tenant-api 2>&1 | grep -i error

# 按级别过滤 (JSON 日志)
docker compose logs tenant-api 2>&1 | jq 'select(.level == "error")'

# 统计错误类型
docker compose logs tenant-api 2>&1 | grep -oP '"error":"[^"]*"' | sort | uniq -c | sort -rn
```

### 日志导出

```bash
# 导出到文件
docker compose logs tenant-api > tenant-api.log 2>&1

# 导出最近 24 小时
docker compose logs --since="24h" > last-24h.log 2>&1

# 压缩归档
tar -czf logs-$(date +%Y%m%d).tar.gz logs/
```

---

## 紧急恢复

### 服务完全不可用

```bash
# 1. 停止所有服务
docker compose down

# 2. 清理环境
docker system prune -f

# 3. 检查磁盘空间
df -h

# 4. 重新启动
docker compose up -d

# 5. 等待服务就绪
sleep 60

# 6. 验证健康
curl http://localhost:3000/health
```

### 数据库不可恢复

```bash
# 1. 停止应用服务
docker compose stop tenant-api platform-service

# 2. 查找最新备份
./scripts/db-backup.sh --env production --list

# 3. 恢复数据库
./scripts/db-backup.sh --env production --restore --file <latest-backup>

# 4. 验证数据
./scripts/db-verify.sh --env production --check all

# 5. 重启应用
docker compose up -d tenant-api platform-service
```

### 回滚到稳定版本

```bash
# 1. 确定稳定版本
./scripts/rollback.sh --env production --list

# 2. 创建当前状态备份
./scripts/db-backup.sh --env production

# 3. 执行回滚
./scripts/rollback.sh --env production --version v1.0.0 --force

# 4. 验证
curl http://localhost:3000/health
```

### 灾难恢复清单

- [ ] 停止所有服务
- [ ] 评估影响范围
- [ ] 获取最新备份
- [ ] 恢复数据库
- [ ] 验证数据完整性
- [ ] 部署稳定版本
- [ ] 验证服务健康
- [ ] 通知相关人员
- [ ] 记录事件报告

---

## 联系支持

如果以上步骤无法解决问题，请联系技术支持：

- **紧急热线**: +86-xxx-xxxx-xxxx
- **邮件**: support@example.com
- **Slack**: #mt5-platform-support

提交问题时请提供：
1. 问题描述
2. 错误日志 (`docker compose logs --tail=200`)
3. 系统状态 (`docker compose ps`)
4. 环境信息 (`docker version`, `docker compose version`)
5. 重现步骤
