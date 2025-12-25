# Design Document: Observability Setup

## Overview

本设计文档描述SaaS平台的可观测性基础设施，包括集中式日志收集、应用性能监控（APM）、指标收集和告警机制。

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Observability Stack                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Application Layer                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ tenant-api  │  │ platform-   │  │   MT5-      │                  │   │
│  │  │             │  │ service     │  │ middleware  │                  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │   │
│  │         │                │                │                          │   │
│  │         └────────────────┼────────────────┘                          │   │
│  │                          │                                           │   │
│  │                    OpenTelemetry SDK                                 │   │
│  │                          │                                           │   │
│  └──────────────────────────┼───────────────────────────────────────────┘   │
│                             │                                               │
│  ┌──────────────────────────┼───────────────────────────────────────────┐   │
│  │                   Collection Layer                                    │   │
│  │         ┌────────────────┼────────────────┐                          │   │
│  │         │                │                │                          │   │
│  │         ▼                ▼                ▼                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │   Loki      │  │ Prometheus  │  │   Tempo     │                  │   │
│  │  │   (Logs)    │  │  (Metrics)  │  │  (Traces)   │                  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │   │
│  │         │                │                │                          │   │
│  └─────────┼────────────────┼────────────────┼──────────────────────────┘   │
│            │                │                │                              │
│  ┌─────────┼────────────────┼────────────────┼──────────────────────────┐   │
│  │         │      Visualization Layer        │                          │   │
│  │         └────────────────┼────────────────┘                          │   │
│  │                          ▼                                           │   │
│  │                   ┌─────────────┐                                    │   │
│  │                   │   Grafana   │                                    │   │
│  │                   │  Dashboard  │                                    │   │
│  │                   └──────┬──────┘                                    │   │
│  │                          │                                           │   │
│  │                   ┌──────┴──────┐                                    │   │
│  │                   │ Alertmanager│                                    │   │
│  │                   └─────────────┘                                    │   │
│  │                          │                                           │   │
│  │         ┌────────────────┼────────────────┐                          │   │
│  │         ▼                ▼                ▼                          │   │
│  │     [Email]         [Slack]         [DingTalk]                       │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Logging System (Loki + Promtail)

#### Log Format (Structured JSON)

```typescript
interface LogEntry {
  timestamp: string;          // ISO 8601 format
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service: string;            // tenant-api, platform-service
  traceId?: string;           // OpenTelemetry trace ID
  spanId?: string;            // OpenTelemetry span ID
  tenantId?: string;          // Multi-tenant context
  userId?: string;
  requestId?: string;
  context: {
    method?: string;          // HTTP method
    path?: string;            // Request path
    statusCode?: number;
    duration?: number;        // Response time in ms
    error?: {
      name: string;
      message: string;
      stack?: string;
    };
  };
}
```

#### Logger Service Implementation

```typescript
// libs/shared/src/logging/logger.service.ts
@Injectable()
export class LoggerService {
  private logger: pino.Logger;

  constructor(private configService: ConfigService) {
    this.logger = pino({
      level: configService.get('LOG_LEVEL', 'info'),
      formatters: {
        level: (label) => ({ level: label }),
      },
      redact: {
        paths: ['password', 'token', 'authorization', 'apiKey'],
        censor: '[REDACTED]',
      },
    });
  }

  log(message: string, context?: Record<string, any>) {
    this.logger.info({ ...context, message });
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    this.logger.error({
      ...context,
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }
}
```

#### Log Retention Policy

| Log Level | Retention | Storage |
|-----------|-----------|---------|
| ERROR | 90 days | Hot storage |
| WARN | 60 days | Hot storage |
| INFO | 30 days | Warm storage |
| DEBUG | 7 days | Cold storage |

### 2. Metrics System (Prometheus)

#### Custom Metrics

```typescript
// libs/shared/src/metrics/metrics.service.ts
@Injectable()
export class MetricsService {
  private httpRequestDuration: Histogram<string>;
  private httpRequestTotal: Counter<string>;
  private activeConnections: Gauge<string>;
  private businessMetrics: Counter<string>;

  constructor() {
    // HTTP Request Duration
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code', 'tenant_id'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    // HTTP Request Counter
    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'tenant_id'],
    });

    // Active Connections
    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['service', 'type'],
    });

    // Business Metrics
    this.businessMetrics = new Counter({
      name: 'business_operations_total',
      help: 'Business operation counter',
      labelNames: ['operation', 'tenant_id', 'status'],
    });
  }
}
```

#### Default Metrics Collected

| Metric | Type | Description |
|--------|------|-------------|
| http_request_duration_seconds | Histogram | Request latency distribution |
| http_requests_total | Counter | Total HTTP requests |
| nodejs_heap_size_bytes | Gauge | Node.js heap memory |
| nodejs_active_handles | Gauge | Active handles count |
| prisma_query_duration_seconds | Histogram | Database query latency |
| redis_operations_total | Counter | Redis operations count |

### 3. Distributed Tracing (OpenTelemetry + Tempo)

#### Tracing Configuration

```typescript
// libs/shared/src/tracing/tracing.module.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTLP_ENDPOINT || 'http://tempo:4318/v1/traces',
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PrismaInstrumentation(),
      new RedisInstrumentation(),
    ],
  });

  sdk.start();
  return sdk;
}
```

#### Trace Context Propagation

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Request Flow with Tracing                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Client Request                                                     │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────┐                                                │
│  │   tenant-api    │  TraceID: abc123                               │
│  │   Span: root    │  SpanID: span-001                              │
│  └────────┬────────┘                                                │
│           │                                                         │
│           │  traceparent: 00-abc123-span-001-01                     │
│           ▼                                                         │
│  ┌─────────────────┐                                                │
│  │ MT5-middleware  │  TraceID: abc123                               │
│  │ Span: child     │  SpanID: span-002, ParentID: span-001          │
│  └────────┬────────┘                                                │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐                                                │
│  │   MT5 Server    │  TraceID: abc123                               │
│  │   Span: leaf    │  SpanID: span-003, ParentID: span-002          │
│  └─────────────────┘                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Alerting System (Alertmanager)

#### Alert Rules Configuration

```yaml
# prometheus/alert-rules.yml
groups:
  - name: application
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: SlowResponseTime
        expr: |
          histogram_quantile(0.95,
            rate(http_request_duration_seconds_bucket[5m])
          ) > 3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow response time"
          description: "P95 latency is {{ $value }}s"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "{{ $labels.instance }} is unreachable"

      - alert: HighMemoryUsage
        expr: |
          nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
```

#### Notification Channels

| Channel | Use Case | Configuration |
|---------|----------|---------------|
| Email | All alerts | SMTP configuration |
| Slack | Critical alerts | Webhook URL |
| DingTalk | On-call team | Robot webhook |
| PagerDuty | P0 incidents | Integration key |

### 5. Grafana Dashboards

#### Pre-configured Dashboards

| Dashboard | Purpose | Panels |
|-----------|---------|--------|
| Application Overview | System health | Request rate, error rate, latency |
| Tenant Analytics | Per-tenant metrics | Active users, API usage, errors |
| Infrastructure | System resources | CPU, memory, network, disk |
| Database | PostgreSQL metrics | Query time, connections, locks |
| Redis | Cache performance | Hit rate, memory, operations |

#### Dashboard Variables

```json
{
  "variables": [
    {
      "name": "tenant_id",
      "type": "query",
      "query": "label_values(http_requests_total, tenant_id)"
    },
    {
      "name": "service",
      "type": "custom",
      "options": ["tenant-api", "platform-service", "mt5-middleware"]
    },
    {
      "name": "interval",
      "type": "interval",
      "options": ["1m", "5m", "15m", "1h"]
    }
  ]
}
```

## File Structure

```
├── observability/
│   ├── docker-compose.observability.yml
│   ├── prometheus/
│   │   ├── prometheus.yml
│   │   └── alert-rules.yml
│   ├── loki/
│   │   └── loki-config.yml
│   ├── promtail/
│   │   └── promtail-config.yml
│   ├── tempo/
│   │   └── tempo-config.yml
│   ├── alertmanager/
│   │   └── alertmanager.yml
│   └── grafana/
│       ├── provisioning/
│       │   ├── datasources/
│       │   │   └── datasources.yml
│       │   └── dashboards/
│       │       ├── dashboards.yml
│       │       ├── application-overview.json
│       │       ├── tenant-analytics.json
│       │       └── infrastructure.json
│       └── grafana.ini
├── libs/shared/src/
│   ├── logging/
│   │   ├── logger.service.ts
│   │   └── logger.module.ts
│   ├── metrics/
│   │   ├── metrics.service.ts
│   │   └── metrics.module.ts
│   └── tracing/
│       ├── tracing.service.ts
│       └── tracing.module.ts
```

## Integration Points

### NestJS Application Integration

```typescript
// apps/tenant-api/src/app.module.ts
@Module({
  imports: [
    LoggerModule,
    MetricsModule,
    TracingModule.forRoot({
      serviceName: 'tenant-api',
      endpoint: process.env.OTLP_ENDPOINT,
    }),
    // ... other modules
  ],
})
export class AppModule {}
```

### HTTP Request Logging Interceptor

```typescript
// libs/shared/src/logging/http-logging.interceptor.ts
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log('HTTP Request', {
            method: request.method,
            path: request.url,
            statusCode: context.switchToHttp().getResponse().statusCode,
            duration: Date.now() - startTime,
            tenantId: request.user?.tenantId,
            traceId: request.headers['x-trace-id'],
          });
        },
        error: (error) => {
          this.logger.error('HTTP Request Failed', error, {
            method: request.method,
            path: request.url,
            duration: Date.now() - startTime,
          });
        },
      }),
    );
  }
}
```

## Security Considerations

1. **Log Sanitization**: Automatic redaction of sensitive fields
2. **Access Control**: Grafana RBAC for dashboard access
3. **Data Retention**: Automated cleanup per retention policy
4. **Network Security**: Internal-only access to metrics endpoints

## Performance Requirements

| Component | Requirement |
|-----------|-------------|
| Log ingestion | < 5s delay |
| Metric scrape interval | 15s |
| Dashboard load time | < 3s |
| Alert notification | < 1min |

## Dependencies

| Component | Version | Purpose |
|-----------|---------|---------|
| Loki | 2.9.x | Log aggregation |
| Prometheus | 2.47.x | Metrics collection |
| Grafana | 10.x | Visualization |
| Tempo | 2.3.x | Distributed tracing |
| Alertmanager | 0.26.x | Alert management |
| OpenTelemetry | 1.x | Instrumentation SDK |
| pino | 8.x | Structured logging |
| prom-client | 15.x | Prometheus metrics |
