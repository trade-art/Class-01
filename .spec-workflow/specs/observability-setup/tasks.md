# Tasks Document: Observability Setup

## Phase 1: Logging Infrastructure

- [x] 1. 创建结构化日志服务
  - File: `packages/shared/src/logging/logger.service.ts`, `packages/shared/src/logging/logger.module.ts`
  - 使用 pino 日志库，JSON 格式输出，支持日志级别配置
  - 自动添加请求上下文，自动脱敏敏感字段
  - Purpose: 统一日志输出格式
  - _Leverage: NestJS Logger_
  - _Requirements: 1.1, 1.2, 1.3_
  - _Prompt: Role: NestJS Developer | Task: Create structured logger with pino, JSON format, context injection, field redaction | Restrictions: Performance-first, no sync writes | Success: Logs are structured, searchable, and secure_

- [x] 2. 创建 HTTP 日志拦截器
  - File: `packages/shared/src/logging/http-logging.interceptor.ts`
  - 记录请求方法、路径、状态码、响应时间
  - 记录租户 ID、用户 ID，关联 TraceID，错误详情
  - Purpose: 自动记录 HTTP 请求日志
  - _Leverage: Task 1, NestJS Interceptor_
  - _Requirements: 1.1, 1.3_
  - _Prompt: Role: NestJS Developer | Task: Create HTTP logging interceptor with method, path, status, duration, tenant/user context, traceId | Restrictions: Low overhead | Success: All requests logged with context_

- [x] 3. 配置 Loki 和 Promtail
  - File: `observability/loki/loki-config.yml`, `observability/promtail/promtail-config.yml`, `observability/docker-compose.observability.yml`
  - Loki 服务配置，Promtail 收集配置，日志标签策略，保留策略
  - Purpose: 集中式日志存储
  - _Requirements: 1.4, 1.5_
  - _Prompt: Role: DevOps Engineer | Task: Configure Loki and Promtail for log aggregation with labels and retention | Restrictions: 30-day retention for INFO | Success: Logs searchable in Grafana_

- [x] 4. 集成日志服务到应用
  - File: `apps/tenant-api/src/app.module.ts`, `apps/tenant-api/src/main.ts`
  - 替换默认 NestJS logger，全局异常过滤器使用新 logger
  - 数据库查询日志，启动日志配置
  - Purpose: 应用级日志集成
  - _Leverage: Task 1, Task 2_
  - _Requirements: 1.1, 1.2_
  - _Prompt: Role: NestJS Developer | Task: Replace default logger, integrate with exception filter, add DB query logging | Restrictions: Consistent log format | Success: All app logs go through structured logger_

## Phase 2: Metrics Collection

- [x] 5. 创建指标服务
  - File: `packages/shared/src/metrics/metrics.service.ts`, `packages/shared/src/metrics/metrics.module.ts`
  - HTTP 请求计数器、响应时间直方图、活跃连接数
  - 业务指标计数器，自定义标签支持
  - Purpose: Prometheus 指标收集
  - _Leverage: prom-client_
  - _Requirements: 2.1, 2.2_
  - _Prompt: Role: Backend Developer | Task: Create metrics service with counters, histograms, gauges for HTTP and business metrics | Restrictions: Low cardinality labels | Success: Metrics exported in Prometheus format_

- [x] 6. 创建指标中间件
  - File: `packages/shared/src/metrics/http-metrics.interceptor.ts`
  - 自动记录请求计数和响应时间
  - 按路由、方法、状态码分组，租户维度指标
  - Purpose: 自动 HTTP 指标收集
  - _Leverage: Task 5_
  - _Requirements: 2.1, 2.2_
  - _Prompt: Role: NestJS Developer | Task: Create metrics middleware for automatic HTTP metrics with route, method, status labels | Restrictions: Performance-first | Success: All requests measured automatically_

- [x] 7. 配置 Prometheus
  - File: `observability/prometheus/prometheus.yml`, `observability/prometheus/rules/alerts.yml`
  - Prometheus 配置，抓取目标，告警规则，数据保留策略
  - Purpose: 指标存储和告警
  - _Requirements: 2.3, 2.4_
  - _Prompt: Role: DevOps Engineer | Task: Configure Prometheus with scrape targets, alert rules, retention | Restrictions: 90-day retention | Success: Metrics scraped and alerts configured_

- [x] 8. 创建 /metrics 端点
  - File: `packages/shared/src/metrics/metrics.controller.ts`
  - GET /metrics 端点，Prometheus 格式输出
  - 默认 Node.js 指标，自定义应用指标
  - Purpose: 指标暴露端点
  - _Leverage: Task 5, Task 6_
  - _Requirements: 2.1_
  - _Prompt: Role: NestJS Developer | Task: Create /metrics endpoint exposing Prometheus format metrics | Restrictions: No auth for scraping | Success: Prometheus can scrape metrics_

## Phase 3: Distributed Tracing

- [x] 9. 配置 OpenTelemetry SDK
  - File: `packages/shared/src/tracing/tracing.service.ts`, `packages/shared/src/tracing/tracing.module.ts`
  - 初始化 OpenTelemetry SDK，配置服务名称
  - 配置 OTLP 导出器，自动 HTTP 追踪
  - Purpose: 分布式追踪基础设施
  - _Leverage: @opentelemetry/sdk-node_
  - _Requirements: 3.1, 3.2_
  - _Prompt: Role: Backend Developer | Task: Setup OpenTelemetry SDK with service name, OTLP exporter, auto HTTP tracing | Restrictions: Low overhead | Success: Traces exported to Tempo_

- [x] 10. 添加自动追踪
  - File: `packages/shared/src/tracing/http-tracing.interceptor.ts`, `packages/shared/src/tracing/tracing.decorators.ts`
  - HTTP 客户端追踪，数据库追踪
  - 自定义 span 创建，@Traced 装饰器
  - Purpose: 自动追踪关键操作
  - _Leverage: Task 9, OpenTelemetry instrumentations_
  - _Requirements: 3.2, 3.3_
  - _Prompt: Role: Backend Developer | Task: Add auto-instrumentation for HTTP, Prisma, Redis with custom spans | Restrictions: Minimal performance impact | Success: Full request traces visible_

- [x] 11. 配置 Tempo
  - File: `observability/tempo/tempo-config.yml`
  - Tempo 服务配置，OTLP 接收器，存储配置
  - Grafana 集成
  - Purpose: 追踪数据存储
  - _Requirements: 3.1_
  - _Prompt: Role: DevOps Engineer | Task: Configure Tempo for trace storage with OTLP receiver and Grafana integration | Restrictions: 7-day retention | Success: Traces searchable in Grafana_

- [x] 12. 实现追踪上下文传播
  - File: `packages/shared/src/tracing/tracing.service.ts` (W3C Trace Context)
  - 自动注入 traceparent 头，从请求提取 traceId
  - 日志关联 traceId，跨服务调用追踪
  - Purpose: 跨服务追踪关联
  - _Leverage: Task 9, W3C Trace Context_
  - _Requirements: 3.1, 3.4_
  - _Prompt: Role: Backend Developer | Task: Implement trace context propagation with traceparent header injection and extraction | Restrictions: W3C standard compliant | Success: Traces span multiple services_

## Phase 4: Visualization

- [x] 13. 配置 Grafana
  - File: `observability/grafana/provisioning/datasources/datasources.yml`
  - Grafana 服务配置，数据源自动配置（Loki, Prometheus, Tempo）
  - 用户认证配置，插件安装
  - Purpose: 可视化平台
  - _Requirements: 4.1_
  - _Prompt: Role: DevOps Engineer | Task: Configure Grafana with auto-provisioned datasources for Loki, Prometheus, Tempo | Restrictions: SSO ready | Success: Grafana connects to all backends_

- [x] 14. 创建应用监控仪表板
  - File: `observability/grafana/provisioning/dashboards/json/application-performance.json`
  - 请求速率、错误率、延迟分布面板
  - 服务健康状态，变量过滤器（租户、服务）
  - Purpose: 应用级监控视图
  - _Leverage: Task 13_
  - _Requirements: 4.2, 4.5_
  - _Prompt: Role: DevOps Engineer | Task: Create Grafana dashboard with request rate, error rate, latency panels, service health | Restrictions: Template variables for filtering | Success: Single pane of glass for app health_

- [x] 15. 创建基础设施仪表板
  - File: `observability/grafana/provisioning/dashboards/json/infrastructure.json`
  - CPU、内存使用率面板，网络 IO 面板，容器状态
  - Purpose: 基础设施监控视图
  - _Leverage: Task 13_
  - _Requirements: 4.3_
  - _Prompt: Role: DevOps Engineer | Task: Create infrastructure dashboard with CPU, memory, network, container metrics | Restrictions: Node and container level | Success: Infrastructure health visible_

- [x] 16. 创建租户分析仪表板
  - File: `observability/grafana/provisioning/dashboards/json/business-metrics.json`, `observability/grafana/provisioning/dashboards/json/security-monitoring.json`
  - 租户活跃度、API 使用量、错误趋势、资源消耗
  - 安全监控、认证事件
  - Purpose: 租户级分析视图
  - _Leverage: Task 13_
  - _Requirements: 4.4_
  - _Prompt: Role: DevOps Engineer | Task: Create tenant analytics dashboard with activity, API usage, errors, resources per tenant | Restrictions: Tenant-scoped queries | Success: Per-tenant insights available_

## Phase 5: Alerting

- [x] 17. 配置 Alertmanager
  - File: `observability/alertmanager/alertmanager.yml`
  - Alertmanager 服务配置，路由规则，告警聚合，抑制规则
  - Purpose: 告警管理
  - _Requirements: 5.1, 5.4_
  - _Prompt: Role: DevOps Engineer | Task: Configure Alertmanager with routing rules, aggregation, inhibition | Restrictions: Prevent alert storms | Success: Alerts routed correctly_

- [x] 18. 配置通知渠道
  - File: `observability/alertmanager/alertmanager.yml`, `observability/alertmanager/templates/default.tmpl`
  - 邮件通知、Slack webhook、钉钉机器人，通知模板
  - Purpose: 多渠道告警通知
  - _Leverage: Task 17_
  - _Requirements: 5.2, 5.5_
  - _Prompt: Role: DevOps Engineer | Task: Configure notification channels for email, Slack, DingTalk with custom templates | Restrictions: Clear and actionable messages | Success: Alerts delivered to appropriate channels_

- [x] 19. 创建告警规则
  - File: `observability/prometheus/rules/alerts.yml`
  - 服务不可用、高错误率、慢响应、资源使用告警
  - 恢复通知
  - Purpose: 主动问题检测
  - _Leverage: Task 7_
  - _Requirements: 5.1, 5.2, 5.3_
  - _Prompt: Role: DevOps Engineer | Task: Create alert rules for service down, high error rate, slow response, high resource usage | Restrictions: Appropriate thresholds, recovery alerts | Success: Issues detected before impact_

- [x] 20. 配置值班调度
  - File: `observability/alertmanager/alertmanager.yml` (update), `observability/README.md`
  - 值班轮换配置，升级策略，静默规则
  - Purpose: 告警响应流程
  - _Leverage: Task 17, Task 18_
  - _Requirements: 5.4_
  - _Prompt: Role: DevOps Engineer | Task: Configure on-call schedule with rotation, escalation, silencing rules | Restrictions: Clear escalation path | Success: Alerts reach right person at right time_

## Phase 6: Integration and Testing

- [x] 21. 集成可观测性组件
  - File: `observability/docker-compose.observability.yml`, `observability/scripts/start-observability.sh`, `observability/scripts/start-observability.bat`
  - Docker Compose 配置，网络配置，启动顺序，健康检查
  - 启动脚本（Linux/Mac 和 Windows）
  - Purpose: 统一部署配置
  - _Leverage: All previous tasks_
  - _Requirements: 6.1_
  - _Prompt: Role: DevOps Engineer | Task: Integrate observability stack into main docker-compose with networking and dependencies | Restrictions: Single command startup | Success: docker-compose up starts full observability stack_

- [x] 22. 创建可观测性测试
  - File: `packages/shared/src/logging/__tests__/logger.service.spec.ts`, `packages/shared/src/metrics/__tests__/metrics.service.spec.ts`, `packages/shared/src/tracing/__tests__/tracing.service.spec.ts`
  - 日志输出验证，指标服务验证，追踪服务验证
  - Purpose: 验证可观测性功能
  - _Leverage: Jest_
  - _Requirements: 6.2_
  - _Prompt: Role: QA Engineer | Task: Create unit tests for logging, metrics, tracing services | Restrictions: Automated verification | Success: Observability features verified in CI_

- [x] 23. 创建可观测性文档
  - File: `observability/README.md`
  - 架构说明，仪表板使用，告警响应，故障排查
  - Purpose: 运维文档
  - _Requirements: 6.3_
  - _Prompt: Role: Technical Writer | Task: Create observability documentation with architecture, dashboard usage, alert runbooks | Restrictions: Actionable and clear | Success: Team can operate observability stack_

## Summary

| Phase | Tasks | Count | Status |
|-------|-------|-------|--------|
| Phase 1: Logging Infrastructure | 1-4 | 4 | ✅ Complete |
| Phase 2: Metrics Collection | 5-8 | 4 | ✅ Complete |
| Phase 3: Distributed Tracing | 9-12 | 4 | ✅ Complete |
| Phase 4: Visualization | 13-16 | 4 | ✅ Complete |
| Phase 5: Alerting | 17-20 | 4 | ✅ Complete |
| Phase 6: Integration and Testing | 21-23 | 3 | ✅ Complete |
| **Total** | | **23** | **✅ All Complete** |
