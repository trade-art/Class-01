# MT5 Platform 可观测性基础设施

本目录包含 MT5 Platform 的完整可观测性基础设施，提供日志、指标、追踪和告警功能。

## 目录结构

```
observability/
├── alertmanager/           # Alertmanager 告警配置
│   ├── alertmanager.yml    # 告警路由配置
│   └── templates/          # 告警通知模板
├── grafana/                # Grafana 可视化配置
│   └── provisioning/
│       ├── datasources/    # 数据源配置
│       └── dashboards/     # 仪表板配置
├── loki/                   # Loki 日志存储配置
│   └── loki-config.yml
├── prometheus/             # Prometheus 指标配置
│   ├── prometheus.yml      # Prometheus 主配置
│   └── rules/              # 告警规则
├── promtail/               # Promtail 日志收集配置
│   └── promtail-config.yml
├── tempo/                  # Tempo 追踪存储配置
│   └── tempo-config.yml
├── scripts/                # 管理脚本
│   ├── start-observability.sh   # Linux/Mac 启动脚本
│   └── start-observability.bat  # Windows 启动脚本
├── docker-compose.observability.yml  # Docker Compose 配置
└── README.md               # 本文档
```

## 快速开始

### 启动可观测性堆栈

**Linux/Mac:**
```bash
./observability/scripts/start-observability.sh --start
```

**Windows:**
```cmd
observability\scripts\start-observability.bat --start
```

**或使用 Docker Compose:**
```bash
cd observability
docker compose -f docker-compose.observability.yml up -d
```

### 服务端点

| 服务 | 端口 | 用途 | 默认凭据 |
|------|------|------|----------|
| Grafana | 3001 | 可视化仪表板 | admin/admin |
| Prometheus | 9090 | 指标存储与查询 | - |
| Alertmanager | 9093 | 告警管理 | - |
| Loki | 3100 | 日志存储 | - |
| Tempo | 3200 | 追踪存储 | - |

## 组件说明

### 1. 结构化日志 (Loki + Promtail)

**功能:**
- 多租户日志隔离
- 结构化 JSON 日志格式
- 日志级别过滤
- 上下文追踪 (requestId, traceId)

**日志类型:**
- HTTP 请求日志
- 数据库查询日志
- 业务事件日志
- 安全事件日志

**使用示例:**
```typescript
import { StructuredLoggerService } from '@mt5-platform/shared';

@Injectable()
export class MyService {
  constructor(private readonly logger: StructuredLoggerService) {}

  async doSomething() {
    this.logger.log('Processing request', { tenantId: 'xxx' });

    this.logger.logBusinessEvent({
      type: 'order',
      action: 'created',
      entityId: 'order-123',
      tenantId: 'tenant-456',
    });
  }
}
```

### 2. 指标收集 (Prometheus)

**功能:**
- HTTP 请求速率和延迟
- 数据库查询性能
- 业务事件计数
- 安全事件监控

**核心指标:**
| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mt5_tenant_http_requests_total` | Counter | HTTP 请求总数 |
| `mt5_tenant_http_request_duration_seconds` | Histogram | 请求延迟 |
| `mt5_tenant_db_query_duration_seconds` | Histogram | 数据库查询延迟 |
| `mt5_tenant_business_events_total` | Counter | 业务事件总数 |
| `mt5_tenant_auth_attempts_total` | Counter | 认证尝试次数 |
| `mt5_tenant_auth_failures_total` | Counter | 认证失败次数 |

**使用示例:**
```typescript
import { MetricsService } from '@mt5-platform/shared';

@Injectable()
export class MyService {
  constructor(private readonly metrics: MetricsService) {}

  async processOrder() {
    const start = Date.now();
    try {
      // 处理订单...
      this.metrics.recordBusinessEvent('order', 'success', 'tenant-123');
    } catch (error) {
      this.metrics.recordBusinessEvent('order', 'error', 'tenant-123');
      throw error;
    } finally {
      this.metrics.recordDbQuery('INSERT', 'orders', Date.now() - start, true);
    }
  }
}
```

### 3. 分布式追踪 (Tempo)

**功能:**
- W3C Trace Context 标准
- 跨服务追踪
- 数据库查询追踪
- HTTP 请求追踪

**使用示例:**
```typescript
import { TracingService, Traced } from '@mt5-platform/shared';

@Injectable()
export class MyService {
  constructor(private readonly tracing: TracingService) {}

  @Traced('processOrder')
  async processOrder(orderId: string) {
    return await this.tracing.withSpan('validateOrder', async () => {
      // 验证订单...
    });
  }
}
```

### 4. 可视化仪表板 (Grafana)

**预置仪表板:**

1. **应用性能监控** (`mt5-app-performance`)
   - 请求速率
   - 错误率
   - P95/P99 响应时间
   - 热门端点

2. **业务指标监控** (`mt5-business-metrics`)
   - 活跃租户数
   - 交易事件速率
   - 订单处理状态
   - 租户请求分布

3. **安全监控** (`mt5-security-monitoring`)
   - 认证失败率
   - 账户锁定事件
   - 速率限制触发
   - 安全事件趋势

4. **基础设施监控** (`mt5-infrastructure`)
   - CPU/内存使用率
   - 磁盘使用率
   - 网络流量
   - 数据库连接池

### 5. 告警系统 (Alertmanager)

**告警类别:**

1. **应用告警**
   - 高错误率 (>5%)
   - 高响应延迟 (P95 > 2s)
   - 服务不可用

2. **安全告警**
   - 大量认证失败
   - 账户锁定激增
   - 速率限制触发异常

3. **基础设施告警**
   - CPU 使用率过高 (>90%)
   - 内存不足 (>90%)
   - 磁盘空间不足 (>85%)

4. **业务告警**
   - 业务错误率上升
   - 交易处理延迟

**配置告警通知:**

编辑 `alertmanager/alertmanager.yml` 配置通知渠道:

```yaml
receivers:
  - name: 'slack-notifications'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/xxx'
        channel: '#alerts'

  - name: 'email-notifications'
    email_configs:
      - to: 'ops@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
```

## 应用集成

### NestJS 应用集成

```typescript
// app.module.ts
import {
  LoggerModule,
  MetricsModule,
  TracingModule,
  HttpLoggingInterceptor,
  HttpMetricsInterceptor,
  HttpTracingInterceptor,
} from '@mt5-platform/shared';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tenant-api',
        environment: configService.get('NODE_ENV'),
        level: configService.get('LOG_LEVEL', 'info'),
      }),
      inject: [ConfigService],
    }),
    MetricsModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tenant-api',
        enabled: configService.get('METRICS_ENABLED', true),
        defaultLabels: {
          env: configService.get('NODE_ENV'),
          version: configService.get('APP_VERSION'),
        },
      }),
      inject: [ConfigService],
    }),
    TracingModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        serviceName: 'tenant-api',
        enabled: configService.get('TRACING_ENABLED', true),
        collectorEndpoint: configService.get('TEMPO_ENDPOINT'),
        samplingRate: configService.get('TRACING_SAMPLE_RATE', 1.0),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: HttpTracingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
```

### 环境变量

```env
# 日志配置
LOG_LEVEL=info
LOG_PRETTY_PRINT=false

# 指标配置
METRICS_ENABLED=true

# 追踪配置
TRACING_ENABLED=true
TRACING_SAMPLE_RATE=1.0
TEMPO_ENDPOINT=http://tempo:4317
```

## 运维操作

### 启动/停止服务

```bash
# 启动
./observability/scripts/start-observability.sh --start

# 停止
./observability/scripts/start-observability.sh --stop

# 重启
./observability/scripts/start-observability.sh --restart

# 查看状态
./observability/scripts/start-observability.sh --status
```

### 查看日志

```bash
# 查看所有服务日志
./observability/scripts/start-observability.sh --logs

# 查看特定服务日志
./observability/scripts/start-observability.sh --logs prometheus
```

### 数据清理

```bash
# 清理所有数据 (慎用)
./observability/scripts/start-observability.sh --clean
```

## 故障排查

### 常见问题

**1. Grafana 无法连接数据源**
- 检查 Prometheus/Loki/Tempo 服务是否正常运行
- 验证 Docker 网络配置
- 检查端口是否被占用

**2. 日志未显示在 Loki**
- 确认 Promtail 正在运行
- 检查日志文件路径配置
- 验证日志格式是否正确

**3. 指标未收集**
- 确认应用已暴露 `/metrics` 端点
- 检查 Prometheus 抓取配置
- 验证服务发现配置

**4. 追踪数据缺失**
- 确认 Tempo 服务运行正常
- 检查应用追踪配置
- 验证采样率设置

### 健康检查端点

```bash
# Prometheus
curl http://localhost:9090/-/healthy

# Loki
curl http://localhost:3100/ready

# Tempo
curl http://localhost:3200/ready

# Alertmanager
curl http://localhost:9093/-/healthy

# Grafana
curl http://localhost:3001/api/health
```

## 扩展配置

### 自定义告警规则

在 `prometheus/rules/` 目录下添加新的规则文件:

```yaml
# custom-alerts.yml
groups:
  - name: custom-alerts
    rules:
      - alert: CustomHighLatency
        expr: histogram_quantile(0.99, sum(rate(my_metric_bucket[5m])) by (le)) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Custom high latency detected"
```

### 添加新仪表板

1. 在 Grafana UI 中创建仪表板
2. 导出为 JSON
3. 保存到 `grafana/provisioning/dashboards/json/`
4. 重启 Grafana 服务

## 安全注意事项

1. **生产环境配置:**
   - 修改 Grafana 默认密码
   - 启用 HTTPS
   - 配置适当的网络策略

2. **数据保留:**
   - 配置合适的日志保留策略
   - 定期备份重要数据

3. **访问控制:**
   - 限制管理界面访问
   - 使用身份认证
