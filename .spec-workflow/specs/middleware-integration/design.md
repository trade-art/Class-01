# 设计文档: Middleware Integration (中间件集成层)

## 1. 架构概述

本设计文档涵盖两个部分的实现：
1. **MT5-Middleware SaaS 适配** - C++ 中间件的改动
2. **Platform Service 集成层** - NestJS 平台服务的新增模块

### 1.1 系统交互图

```
┌───────────────────────────────────────────────────────────────���─────────┐
│                         Platform Service (NestJS)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Health    │  │    Data     │  │  Middleware │  │   Webhook   │     │
│  │   Checker   │  │ Aggregator  │  │   Client    │  │  Receiver   │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                          ┌────────┴────────┐                            │
│                          │  Instance Pool  │                            │
│                          │ (HTTP Clients)  │                            │
│                          └────────┬────────┘                            │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
        │  Middleware   │ │  Middleware   │ │  Middleware   │
        │  Instance 1   │ │  Instance 2   │ │  Instance N   │
        │  (C++ Drogon) │ │  (C++ Drogon) │ │  (C++ Drogon) │
        │               │ │               │ │               │
        │ ┌───────────┐ │ │ ┌───────────┐ │ │ ┌───────────┐ │
        │ │ ApiKey    │ │ │ │ ApiKey    │ │ │ │ ApiKey    │ │
        │ │ Filter    │ │ │ │ Filter    │ │ │ │ Filter    │ │
        │ ├───────────┤ │ │ ├───────────┤ │ │ ├───────────┤ │
        │ │ Health    │ │ │ │ Health    │ │ │ │ Health    │ │
        │ │ Enhanced  │ │ │ │ Enhanced  │ │ │ │ Enhanced  │ │
        │ ├───────────┤ │ │ ├───────────┤ │ │ ├───────────┤ │
        │ │ Webhook   │ │ │ │ Webhook   │ │ │ │ Webhook   │ │
        │ │ Notifier  │ │ │ │ Notifier  │ │ │ │ Notifier  │ │
        │ ├───────────┤ │ │ ├───────────┤ │ │ ├───────────┤ │
        │ │ Admin API │ │ │ │ Admin API │ │ │ │ Admin API │ │
        │ └───────────┘ │ │ └───────────┘ │ │ └───────────┘ │
        └───────────────┘ └───────────────┘ └───────────────┘
```

### 1.2 通信流程

```
健康检查流程:
Platform ──GET /health──▶ Middleware ──▶ 返回增强健康数据
    │                                         │
    ▼                                         │
更新数据库 ◀──────────────────────────────────┘

事件回调流程:
Middleware ──事件发生──▶ WebhookNotifier ──POST──▶ Platform Webhook Receiver
                                                        │
                                                        ▼
                                              更新状态 + WebSocket推送

MT5服务器管理流程:
Platform ──POST /admin/servers──▶ Middleware ──▶ ManagerSessionPool
    │                                                    │
    ▼                                                    ▼
记录审计日志                                    动态添加服务器连接
```

---

## 2. MT5-Middleware 设计

### 2.1 目录结构

```
MT5-middleware/src/
├── filters/
│   ├── ApiKeyFilter.h          # 新增: API Key 认证过滤器
│   └── ApiKeyFilter.cpp
├── controllers/
│   ├── HealthController.h      # 修改: 增强健康检查
│   ├── HealthController.cpp
│   ├── AdminServerController.h # 已有: 需扩展
│   └── AdminServerController.cpp
├── services/
│   ├── WebhookNotifier.h       # 新增: Webhook 通知服务
│   ├── WebhookNotifier.cpp
│   └── ManagerSessionPool.cpp  # 已有: 无需修改
└── utils/
    └── ApiKeyValidator.h       # 新增: API Key 验证工具
```

### 2.2 ApiKeyFilter 设计

```cpp
// filters/ApiKeyFilter.h
#pragma once
#include <drogon/HttpFilter.h>
#include <unordered_set>
#include <mutex>

class ApiKeyFilter : public drogon::HttpFilter<ApiKeyFilter> {
public:
    ApiKeyFilter() = default;

    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& fcb,
                  drogon::FilterChainCallback&& fccb) override;

    // 静态配置方法
    static void initialize(const Json::Value& config);
    static void setEnabled(bool enabled);
    static bool addApiKey(const std::string& keyHash, const std::string& name);
    static bool revokeApiKey(const std::string& keyHash);

private:
    static bool s_enabled;
    static std::string s_headerName;
    static std::unordered_set<std::string> s_validKeyHashes;
    static std::unordered_set<std::string> s_exemptPaths;
    static std::mutex s_mutex;

    static std::string hashApiKey(const std::string& key);
    static bool isPathExempt(const std::string& path);
};
```

### 2.3 增强型 HealthController 设计

```cpp
// controllers/HealthController.h (修改)
#pragma once
#include <drogon/HttpController.h>

class HealthController : public drogon::HttpController<HealthController> {
public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(HealthController::health, "/health", drogon::Get);
    ADD_METHOD_TO(HealthController::healthDetailed, "/health/detailed", drogon::Get, "ApiKeyFilter");
    METHOD_LIST_END

    void health(const drogon::HttpRequestPtr& req,
                std::function<void(const drogon::HttpResponsePtr&)>&& callback);

    void healthDetailed(const drogon::HttpRequestPtr& req,
                        std::function<void(const drogon::HttpResponsePtr&)>&& callback);

    // 静态配置
    static void setInstanceId(const std::string& instanceId);
    static void setServices(
        std::shared_ptr<MT5Manager> mt5,
        std::shared_ptr<RedisService> redis,
        std::shared_ptr<DatabaseService> db
    );

private:
    static std::string s_instanceId;
    static std::shared_ptr<MT5Manager> s_mt5Manager;
    static std::shared_ptr<RedisService> s_redisService;
    static std::shared_ptr<DatabaseService> s_dbService;

    Json::Value buildComponentStatus();
    Json::Value buildCircuitBreakerStatus();
};
```

### 2.4 WebhookNotifier 设计

```cpp
// services/WebhookNotifier.h
#pragma once
#include <string>
#include <vector>
#include <queue>
#include <mutex>
#include <thread>
#include <atomic>
#include <json/json.h>

class WebhookNotifier {
public:
    struct WebhookConfig {
        bool enabled = false;
        std::string url;
        std::string secret;
        std::vector<std::string> events;
        int maxRetries = 3;
        int retryDelayMs = 1000;
    };

    // 单例模式
    static WebhookNotifier& getInstance();

    // 配置
    void configure(const WebhookConfig& config);
    void setInstanceId(const std::string& instanceId);

    // 事件通知方法
    void notifyStatusChange(const std::string& status, const std::string& detail = "");
    void notifyCircuitBreakerOpen(const std::string& service);
    void notifyCircuitBreakerClose(const std::string& service);
    void notifyMT5Disconnect(const std::string& serverId, const std::string& reason);
    void notifyMT5Reconnect(const std::string& serverId);
    void notifyError(const std::string& errorType, const std::string& message);

    // 生命周期
    void start();
    void stop();

private:
    WebhookNotifier() = default;
    ~WebhookNotifier();

    // 禁止拷贝
    WebhookNotifier(const WebhookNotifier&) = delete;
    WebhookNotifier& operator=(const WebhookNotifier&) = delete;

    // 内部事件结构
    struct WebhookEvent {
        std::string eventType;
        Json::Value data;
        int64_t timestamp;
        int retryCount = 0;
    };

    // 发送逻辑
    void sendEvent(const std::string& eventType, const Json::Value& data);
    void workerLoop();
    bool sendRequest(const WebhookEvent& event);
    std::string signPayload(const std::string& payload);

    // 成员变量
    WebhookConfig m_config;
    std::string m_instanceId;
    std::queue<WebhookEvent> m_eventQueue;
    std::mutex m_queueMutex;
    std::thread m_workerThread;
    std::atomic<bool> m_running{false};
    std::condition_variable m_cv;
};
```

### 2.5 配置文件扩展

```json
{
  "app": {
    "instance_id": "inst_xxxxxx",
    "log_level": "INFO"
  },
  "security": {
    "enable_api_key": true,
    "api_key_header": "X-API-Key",
    "api_keys": [
      {
        "key_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "name": "platform-service-primary",
        "created_at": "2025-01-01T00:00:00Z",
        "active": true
      }
    ],
    "exempt_paths": ["/health", "/"]
  },
  "platform_callback": {
    "enabled": true,
    "url": "https://platform-service.example.com/api/v1/webhooks/middleware",
    "secret": "webhook_signing_secret_change_in_production",
    "events": ["status_change", "circuit_breaker_open", "circuit_breaker_close",
               "mt5_disconnect", "mt5_reconnect", "error"],
    "max_retries": 3,
    "retry_delay_ms": 1000
  }
}
```

---

## 3. Platform Service 设计

### 3.1 模块结构

```
apps/platform-service/src/
├── modules/
│   ├── middleware-integration/
│   │   ├── middleware-integration.module.ts
│   │   ├── controllers/
│   │   │   ├── health-check.controller.ts
│   │   │   ├── trading-data.controller.ts
│   │   │   ├── mt5-servers.controller.ts
│   │   │   └── webhook.controller.ts
│   │   ├── services/
│   │   │   ├── health-checker.service.ts
│   │   │   ├── middleware-client.service.ts
│   │   │   ├── data-aggregator.service.ts
│   │   │   ├── circuit-breaker.service.ts
│   │   │   ├── event-emitter.service.ts
│   │   │   └── cache.service.ts
│   │   ├── dto/
│   │   │   ├── health-check.dto.ts
│   │   │   ├── trading-data.dto.ts
│   │   │   └── webhook-event.dto.ts
│   │   ├── interfaces/
│   │   │   ├── middleware-health.interface.ts
│   │   │   └── circuit-breaker.interface.ts
│   │   └── constants/
│   │       └── middleware.constants.ts
```

### 3.2 MiddlewareIntegrationModule

```typescript
// middleware-integration.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';

import { HealthCheckController } from './controllers/health-check.controller';
import { TradingDataController } from './controllers/trading-data.controller';
import { MT5ServersController } from './controllers/mt5-servers.controller';
import { WebhookController } from './controllers/webhook.controller';

import { HealthCheckerService } from './services/health-checker.service';
import { MiddlewareClientService } from './services/middleware-client.service';
import { DataAggregatorService } from './services/data-aggregator.service';
import { CircuitBreakerService } from './services/circuit-breaker.service';
import { EventEmitterService } from './services/event-emitter.service';
import { CacheService } from './services/cache.service';

import { InstancesModule } from '../instances/instances.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'health-check',
    }),
    InstancesModule,
    TenantsModule,
  ],
  controllers: [
    HealthCheckController,
    TradingDataController,
    MT5ServersController,
    WebhookController,
  ],
  providers: [
    HealthCheckerService,
    MiddlewareClientService,
    DataAggregatorService,
    CircuitBreakerService,
    EventEmitterService,
    CacheService,
  ],
  exports: [
    HealthCheckerService,
    MiddlewareClientService,
    DataAggregatorService,
  ],
})
export class MiddlewareIntegrationModule {}
```

### 3.3 MiddlewareClientService

```typescript
// services/middleware-client.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MiddlewareInstance } from '../interfaces/middleware-instance.interface';

interface RequestConfig {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

@Injectable()
export class MiddlewareClientService {
  private readonly logger = new Logger(MiddlewareClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  /**
   * 发送 GET 请求到中间件实例
   */
  async get<T>(
    instance: MiddlewareInstance,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('GET', instance, path, undefined, config);
  }

  /**
   * 发送 POST 请求到中间件实例
   */
  async post<T>(
    instance: MiddlewareInstance,
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('POST', instance, path, data, config);
  }

  /**
   * 发送 PUT 请求到中间件实例
   */
  async put<T>(
    instance: MiddlewareInstance,
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('PUT', instance, path, data, config);
  }

  /**
   * 发送 DELETE 请求到中间件实例
   */
  async delete<T>(
    instance: MiddlewareInstance,
    path: string,
    config?: RequestConfig,
  ): Promise<T> {
    return this.request<T>('DELETE', instance, path, undefined, config);
  }

  /**
   * 通用请求方法
   */
  private async request<T>(
    method: string,
    instance: MiddlewareInstance,
    path: string,
    data?: any,
    config?: RequestConfig,
  ): Promise<T> {
    const instanceId = instance.id;

    // 检查熔断器状态
    if (this.circuitBreaker.isOpen(instanceId)) {
      throw new Error(`Circuit breaker is open for instance ${instanceId}`);
    }

    const url = `${this.getBaseUrl(instance)}${path}`;
    const timeout = config?.timeout ?? 5000;
    const retries = config?.retries ?? 3;
    const retryDelay = config?.retryDelay ?? 1000;

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();

        const response = await this.httpService.axiosRef.request({
          method,
          url,
          data,
          timeout,
          headers: {
            'X-API-Key': this.decryptApiKey(instance.apiKey),
            'Content-Type': 'application/json',
          },
        });

        const latency = Date.now() - startTime;
        this.logger.debug(`${method} ${url} completed in ${latency}ms`);

        // 成功，重置熔断器
        this.circuitBreaker.recordSuccess(instanceId);

        return response.data;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `${method} ${url} failed (attempt ${attempt + 1}/${retries + 1}): ${error.message}`,
        );

        // 记录失败
        this.circuitBreaker.recordFailure(instanceId);

        // 如果还有重试次数，等待后重试
        if (attempt < retries) {
          await this.sleep(retryDelay * Math.pow(2, attempt)); // 指数退避
        }
      }
    }

    throw lastError;
  }

  private getBaseUrl(instance: MiddlewareInstance): string {
    const protocol = instance.useTls ? 'https' : 'http';
    return `${protocol}://${instance.host}:${instance.port}`;
  }

  private decryptApiKey(encryptedKey: string): string {
    // TODO: 实现解密逻辑
    return encryptedKey;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3.4 HealthCheckerService

```typescript
// services/health-checker.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MiddlewareClientService } from './middleware-client.service';
import { InstancesService } from '../../instances/instances.service';
import { EventEmitterService } from './event-emitter.service';
import { CacheService } from './cache.service';
import { MiddlewareHealth, InstanceStatus } from '../interfaces/middleware-health.interface';

@Injectable()
export class HealthCheckerService implements OnModuleInit {
  private readonly logger = new Logger(HealthCheckerService.name);
  private failureCountMap = new Map<string, number>();

  constructor(
    private readonly middlewareClient: MiddlewareClientService,
    private readonly instancesService: InstancesService,
    private readonly eventEmitter: EventEmitterService,
    private readonly cache: CacheService,
    @InjectQueue('health-check') private readonly healthQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('HealthCheckerService initialized');
  }

  /**
   * 定时健康检查 - 每分钟执行
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledHealthCheck() {
    this.logger.debug('Running scheduled health check');
    await this.checkAllInstances();
  }

  /**
   * 检查所有实例
   */
  async checkAllInstances(): Promise<{
    total: number;
    online: number;
    offline: number;
    error: number;
    degraded: number;
  }> {
    const instances = await this.instancesService.findAllActive();

    const results = await Promise.allSettled(
      instances.map(instance => this.checkInstance(instance.id)),
    );

    let online = 0, offline = 0, error = 0, degraded = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        switch (result.value.status) {
          case 'ONLINE': online++; break;
          case 'OFFLINE': offline++; break;
          case 'ERROR': error++; break;
          case 'DEGRADED': degraded++; break;
        }
      } else {
        offline++;
      }
    });

    return { total: instances.length, online, offline, error, degraded };
  }

  /**
   * 检查单个实例
   */
  async checkInstance(instanceId: string): Promise<{
    status: InstanceStatus;
    latencyMs: number;
    data: MiddlewareHealth | null;
  }> {
    const instance = await this.instancesService.findOne(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const previousStatus = instance.status;
    const startTime = Date.now();

    try {
      const healthData = await this.middlewareClient.get<MiddlewareHealth>(
        instance,
        '/health',
        { timeout: 5000, retries: 0 },
      );

      const latencyMs = Date.now() - startTime;

      // 判断状态
      let status: InstanceStatus = 'ONLINE';
      if (healthData.status === 'unhealthy') {
        status = 'ERROR';
      } else if (healthData.status === 'degraded') {
        status = 'DEGRADED';
      }

      // 重置失败计数
      this.failureCountMap.set(instanceId, 0);

      // 更新数据库
      await this.instancesService.updateHealth(instanceId, {
        status,
        lastHealthCheck: new Date(),
        healthData,
        latencyMs,
      });

      // 缓存结果
      await this.cache.setHealthStatus(instanceId, { status, latencyMs, data: healthData });

      // 状态变更事件
      if (previousStatus !== status) {
        this.eventEmitter.emitStatusChange(instanceId, previousStatus, status);
      }

      return { status, latencyMs, data: healthData };

    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // 增加失败计数
      const failureCount = (this.failureCountMap.get(instanceId) || 0) + 1;
      this.failureCountMap.set(instanceId, failureCount);

      // 更新数据库
      await this.instancesService.updateHealth(instanceId, {
        status: 'OFFLINE',
        lastHealthCheck: new Date(),
        healthData: null,
        latencyMs,
        errorMessage: error.message,
      });

      // 连续失败告警
      if (failureCount >= 3) {
        this.eventEmitter.emitHealthCheckAlert(instanceId, failureCount);
      }

      // 状态变更事件
      if (previousStatus !== 'OFFLINE') {
        this.eventEmitter.emitStatusChange(instanceId, previousStatus, 'OFFLINE');
      }

      return { status: 'OFFLINE', latencyMs, data: null };
    }
  }

  /**
   * 批量检查实例
   */
  async checkBatch(instanceIds: string[]): Promise<Map<string, any>> {
    const results = new Map();

    await Promise.all(
      instanceIds.map(async (id) => {
        try {
          const result = await this.checkInstance(id);
          results.set(id, result);
        } catch (error) {
          results.set(id, { error: error.message });
        }
      }),
    );

    return results;
  }
}
```

### 3.5 DataAggregatorService

```typescript
// services/data-aggregator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareClientService } from './middleware-client.service';
import { InstancesService } from '../../instances/instances.service';
import { CacheService } from './cache.service';

interface AggregateQuery {
  tenantId?: string;
  instanceId?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
  login?: number;
  symbol?: string;
}

@Injectable()
export class DataAggregatorService {
  private readonly logger = new Logger(DataAggregatorService.name);

  constructor(
    private readonly middlewareClient: MiddlewareClientService,
    private readonly instancesService: InstancesService,
    private readonly cache: CacheService,
  ) {}

  /**
   * 聚合交易历史
   */
  async aggregateTradeHistory(query: AggregateQuery) {
    const instances = await this.getTargetInstances(query);

    const results = await Promise.allSettled(
      instances.map(instance =>
        this.middlewareClient.get(instance, '/api/v1/trading/history', {
          timeout: 10000,
        }),
      ),
    );

    // 合并结果
    const allTrades = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.data) {
        allTrades.push(...result.value.data);
      }
    }

    // 按时间排序
    allTrades.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    // 分页
    const page = query.page || 1;
    const limit = query.limit || 50;
    const start = (page - 1) * limit;
    const paged = allTrades.slice(start, start + limit);

    return {
      data: paged,
      total: allTrades.length,
      page,
      limit,
      totalPages: Math.ceil(allTrades.length / limit),
    };
  }

  /**
   * 聚合持仓数据
   */
  async aggregatePositions(query: AggregateQuery) {
    const instances = await this.getTargetInstances(query);

    const results = await Promise.allSettled(
      instances.map(async (instance) => {
        const data = await this.middlewareClient.get(instance, '/api/v1/trading/positions', {
          timeout: 5000,
        });
        return { instanceId: instance.id, ...data };
      }),
    );

    const positions = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.data) {
        for (const pos of result.value.data) {
          positions.push({
            ...pos,
            instanceId: result.value.instanceId,
          });
        }
      }
    }

    return { data: positions, total: positions.length };
  }

  /**
   * 聚合账户余额
   */
  async aggregateBalances(query: AggregateQuery) {
    const instances = await this.getTargetInstances(query);

    const results = await Promise.allSettled(
      instances.map(async (instance) => {
        const data = await this.middlewareClient.get(instance, '/api/v1/accounts/balances', {
          timeout: 5000,
        });
        return { instanceId: instance.id, ...data };
      }),
    );

    let totalAccounts = 0;
    let totalBalance = 0;
    let totalEquity = 0;
    const accounts = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value?.data) {
        for (const acc of result.value.data) {
          accounts.push({
            ...acc,
            instanceId: result.value.instanceId,
          });
          totalAccounts++;
          totalBalance += acc.balance || 0;
          totalEquity += acc.equity || 0;
        }
      }
    }

    return {
      data: accounts,
      summary: {
        totalAccounts,
        totalBalance,
        totalEquity,
      },
    };
  }

  /**
   * 获取平台概览
   */
  async getPlatformOverview() {
    const cacheKey = 'platform:overview';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const instances = await this.instancesService.findAllActive();

    // 并行获取各实例统计
    const stats = await Promise.allSettled(
      instances.map(instance =>
        this.middlewareClient.get(instance, '/api/v1/monitor/metrics', { timeout: 5000 }),
      ),
    );

    // 汇总统计
    const overview = {
      totalInstances: instances.length,
      onlineInstances: instances.filter(i => i.status === 'ONLINE').length,
      // ... 其他统计
      generatedAt: new Date(),
    };

    await this.cache.set(cacheKey, overview, 60); // 缓存 60 秒

    return overview;
  }

  /**
   * 获取目标实例列表
   */
  private async getTargetInstances(query: AggregateQuery) {
    if (query.instanceId) {
      const instance = await this.instancesService.findOne(query.instanceId);
      return instance ? [instance] : [];
    }

    if (query.tenantId) {
      return this.instancesService.findByTenant(query.tenantId);
    }

    return this.instancesService.findAllActive();
  }
}
```

### 3.6 WebhookController

```typescript
// controllers/webhook.controller.ts
import { Controller, Post, Body, Headers, HttpCode, Logger, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EventEmitterService } from '../services/event-emitter.service';
import { InstancesService } from '../../instances/instances.service';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';

interface WebhookPayload {
  event: string;
  timestamp: number;
  instance_id: string;
  data: any;
}

@ApiTags('Webhooks')
@Controller('api/v1/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly instancesService: InstancesService,
    private readonly configService: ConfigService,
  ) {}

  @Post('middleware')
  @HttpCode(200)
  @ApiOperation({ summary: '接收中间件回调事件' })
  async handleMiddlewareWebhook(
    @Body() payload: WebhookPayload,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-instance-id') instanceId: string,
  ) {
    this.logger.log(`Received webhook: ${payload.event} from ${instanceId}`);

    // 1. 验证实例存在
    const instance = await this.instancesService.findOne(instanceId);
    if (!instance) {
      this.logger.warn(`Unknown instance: ${instanceId}`);
      throw new UnauthorizedException('Unknown instance');
    }

    // 2. 验证签名
    if (!this.verifySignature(payload, signature, instance.webhookSecret)) {
      this.logger.warn(`Invalid signature for instance: ${instanceId}`);
      throw new UnauthorizedException('Invalid signature');
    }

    // 3. 处理事件
    await this.processEvent(instanceId, payload);

    return { received: true };
  }

  private verifySignature(payload: WebhookPayload, signature: string, secret: string): boolean {
    const expectedSignature = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return signature === `sha256=${expectedSignature}`;
  }

  private async processEvent(instanceId: string, payload: WebhookPayload) {
    const { event, data } = payload;

    switch (event) {
      case 'status_change':
        await this.handleStatusChange(instanceId, data);
        break;
      case 'circuit_breaker_open':
        await this.handleCircuitBreakerOpen(instanceId, data);
        break;
      case 'circuit_breaker_close':
        await this.handleCircuitBreakerClose(instanceId, data);
        break;
      case 'mt5_disconnect':
        await this.handleMT5Disconnect(instanceId, data);
        break;
      case 'mt5_reconnect':
        await this.handleMT5Reconnect(instanceId, data);
        break;
      case 'error':
        await this.handleError(instanceId, data);
        break;
      default:
        this.logger.warn(`Unknown event type: ${event}`);
    }
  }

  private async handleStatusChange(instanceId: string, data: any) {
    this.logger.log(`Instance ${instanceId} status changed: ${data.status}`);
    // 更新实例状态
    await this.instancesService.updateStatus(instanceId, data.status);
    // 发送 WebSocket 通知
    this.eventEmitter.emitToWebSocket('instance:status', { instanceId, ...data });
  }

  private async handleCircuitBreakerOpen(instanceId: string, data: any) {
    this.logger.warn(`Circuit breaker opened for ${instanceId}: ${data.service}`);
    this.eventEmitter.emitToWebSocket('instance:circuit-breaker', {
      instanceId,
      state: 'open',
      ...data
    });
  }

  private async handleCircuitBreakerClose(instanceId: string, data: any) {
    this.logger.log(`Circuit breaker closed for ${instanceId}: ${data.service}`);
    this.eventEmitter.emitToWebSocket('instance:circuit-breaker', {
      instanceId,
      state: 'closed',
      ...data
    });
  }

  private async handleMT5Disconnect(instanceId: string, data: any) {
    this.logger.warn(`MT5 disconnected for ${instanceId}: ${data.serverId}`);
    this.eventEmitter.emitToWebSocket('instance:mt5', {
      instanceId,
      event: 'disconnect',
      ...data
    });
  }

  private async handleMT5Reconnect(instanceId: string, data: any) {
    this.logger.log(`MT5 reconnected for ${instanceId}: ${data.serverId}`);
    this.eventEmitter.emitToWebSocket('instance:mt5', {
      instanceId,
      event: 'reconnect',
      ...data
    });
  }

  private async handleError(instanceId: string, data: any) {
    this.logger.error(`Error from ${instanceId}: ${data.message}`);
    this.eventEmitter.emitToWebSocket('instance:error', { instanceId, ...data });
  }
}
```

### 3.7 CircuitBreakerService

```typescript
// services/circuit-breaker.service.ts
import { Injectable, Logger } from '@nestjs/common';

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerConfig {
  failureThreshold: number;     // 触发熔断的失败次数
  successThreshold: number;     // 恢复需要的成功次数
  openTimeout: number;          // 熔断持续时间 (ms)
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastStateChange: Date;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private circuits = new Map<string, CircuitStats>();

  private readonly config: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 3,
    openTimeout: 30000, // 30 seconds
  };

  /**
   * 检查熔断器是否打开
   */
  isOpen(instanceId: string): boolean {
    const circuit = this.getCircuit(instanceId);

    if (circuit.state === CircuitState.OPEN) {
      // 检查是否应该进入半开状态
      const elapsed = Date.now() - circuit.lastStateChange.getTime();
      if (elapsed >= this.config.openTimeout) {
        this.setState(instanceId, CircuitState.HALF_OPEN);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * 记录成功
   */
  recordSuccess(instanceId: string): void {
    const circuit = this.getCircuit(instanceId);

    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.successes++;
      if (circuit.successes >= this.config.successThreshold) {
        this.setState(instanceId, CircuitState.CLOSED);
        circuit.failures = 0;
        circuit.successes = 0;
      }
    } else if (circuit.state === CircuitState.CLOSED) {
      // 成功时重置失败计数
      circuit.failures = 0;
    }
  }

  /**
   * 记录失败
   */
  recordFailure(instanceId: string): void {
    const circuit = this.getCircuit(instanceId);
    circuit.failures++;
    circuit.lastFailure = new Date();

    if (circuit.state === CircuitState.HALF_OPEN) {
      // 半开状态下失败，重新打开
      this.setState(instanceId, CircuitState.OPEN);
      circuit.successes = 0;
    } else if (circuit.state === CircuitState.CLOSED) {
      if (circuit.failures >= this.config.failureThreshold) {
        this.setState(instanceId, CircuitState.OPEN);
        this.logger.warn(`Circuit breaker opened for instance ${instanceId}`);
      }
    }
  }

  /**
   * 获取熔断器状态
   */
  getState(instanceId: string): CircuitStats {
    return this.getCircuit(instanceId);
  }

  /**
   * 获取所有熔断器状态
   */
  getAllStates(): Map<string, CircuitStats> {
    return new Map(this.circuits);
  }

  private getCircuit(instanceId: string): CircuitStats {
    if (!this.circuits.has(instanceId)) {
      this.circuits.set(instanceId, {
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastStateChange: new Date(),
      });
    }
    return this.circuits.get(instanceId)!;
  }

  private setState(instanceId: string, state: CircuitState): void {
    const circuit = this.getCircuit(instanceId);
    const previousState = circuit.state;
    circuit.state = state;
    circuit.lastStateChange = new Date();

    this.logger.log(
      `Circuit breaker for ${instanceId}: ${previousState} -> ${state}`,
    );
  }
}
```

---

## 4. 数据库 Schema 更新

### 4.1 Instance 表更新

```prisma
// schema.prisma 更新

model MiddlewareInstance {
  // ... 现有字段 ...

  // 新增字段
  instanceIdentifier String?         @map("instance_identifier")  // 中间件配置的 instance_id
  webhookSecret      String?         @map("webhook_secret")       // Webhook 签名密钥
  latencyMs          Int?            @map("latency_ms")           // 最后检查延迟
  healthData         Json?           @map("health_data")          // 详细健康数据
  errorMessage       String?         @map("error_message")        // 最后错误信息
  circuitBreakerState String?        @map("circuit_breaker_state") @default("CLOSED")

  @@map("middleware_instances")
}
```

### 4.2 InstanceEvent 表

```prisma
model InstanceEvent {
  id          String   @id @default(cuid())
  instanceId  String   @map("instance_id")
  eventType   String   @map("event_type")
  eventData   Json     @map("event_data")
  severity    String   @default("info")  // info, warning, error, critical
  createdAt   DateTime @default(now()) @map("created_at")

  instance    MiddlewareInstance @relation(fields: [instanceId], references: [id])

  @@index([instanceId, createdAt])
  @@map("instance_events")
}
```

---

## 5. 缓存策略

### 5.1 缓存键设计

```
健康状态缓存:
  key: instance:health:{instanceId}
  ttl: 30s
  value: { status, latencyMs, data }

实例信息缓存:
  key: instance:info:{instanceId}
  ttl: 5m
  value: { ...instanceData }

平台概览缓存:
  key: platform:overview
  ttl: 60s
  value: { ...overviewData }

租户概览缓存:
  key: tenant:overview:{tenantId}
  ttl: 60s
  value: { ...tenantOverviewData }
```

### 5.2 缓存失效策略

1. **主动失效**: 配置变更时删除相关缓存
2. **TTL 过期**: 自动过期刷新
3. **强制刷新**: API 支持 `?refresh=true` 参数

---

## 6. 安全设计

### 6.1 API Key 管理

1. **生成**: 使用 `crypto.randomBytes(32).toString('hex')`
2. **存储**:
   - 平台侧: AES-256-GCM 加密存储
   - 中间件侧: SHA-256 哈希存储
3. **轮换**: 支持多 Key 并存，逐步切换

### 6.2 Webhook 签名

```typescript
// 签名生成
const signature = createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

// 请求头
headers['X-Webhook-Signature'] = `sha256=${signature}`;
```

### 6.3 通信安全

1. 生产环境强制 HTTPS
2. 请求头包含 `X-Instance-Id` 用于追踪
3. 所有敏感数据加密传输
