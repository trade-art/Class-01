# Tasks Document: Security Hardening

## Phase 1: HTTPS and Transport Security

- [x] 1. 配置 TLS/SSL
  - File: `docker/nginx/ssl.conf`, `config/tls.config.ts`
  - TLS 1.2+ 强制使用，强加密套件配置
  - HTTP 自动重定向 HTTPS，HSTS 头配置
  - Purpose: 传输层安全
  - _Requirements: 1.1, 1.2_
  - _Prompt: Role: DevOps Engineer | Task: Configure TLS 1.2+ with strong ciphers, HTTP redirect, HSTS | Restrictions: No weak ciphers | Success: All traffic encrypted_

- [x] 2. 配置安全 Cookie
  - File: `libs/shared/src/security/cookie.config.ts`, `apps/tenant-api/src/auth/auth.service.ts` (update)
  - HttpOnly、Secure、SameSite 属性，适当过期时间
  - Purpose: Cookie 安全加固
  - _Leverage: NestJS Cookie handling_
  - _Requirements: 1.3_
  - _Prompt: Role: Backend Developer | Task: Configure secure cookie options with HttpOnly, Secure, SameSite | Restrictions: Production-only Secure flag | Success: Cookies protected from XSS/CSRF_

- [x] 3. 实现证书监控
  - File: `scripts/check-ssl-cert.sh`, `observability/prometheus/alert-rules.yml` (add cert rules)
  - 证书过期检查脚本，30 天内过期告警
  - 自动续期支持，告警通知
  - Purpose: 证书生命周期管理
  - _Requirements: 1.4_
  - _Prompt: Role: DevOps Engineer | Task: Create certificate monitoring with expiry check, alerts, auto-renewal | Restrictions: 30-day warning threshold | Success: No certificate expiry surprises_

## Phase 2: Rate Limiting

- [x] 4. 创建限流服务
  - File: `libs/shared/src/security/rate-limiter.service.ts`
  - 滑动窗口算法，Redis 存储限流计数
  - 支持多种限流策略，返回限流状态信息
  - Purpose: API 限流基础设施
  - _Leverage: Redis, ioredis_
  - _Requirements: 2.1_
  - _Prompt: Role: Backend Developer | Task: Create rate limiter service with sliding window algorithm, Redis storage, multiple strategies | Restrictions: Low latency < 1ms | Success: Rate limiting works accurately_

- [x] 5. 创建限流守卫
  - File: `libs/shared/src/security/rate-limit.guard.ts`, `libs/shared/src/security/rate-limit.decorator.ts`
  - 装饰器配置限流规则，自动添加响应头
  - 429 状态码和 Retry-After，日志记录
  - Purpose: NestJS 限流集成
  - _Leverage: Task 4, NestJS Guards_
  - _Requirements: 2.1, 2.5_
  - _Prompt: Role: NestJS Developer | Task: Create rate limit guard and decorator with response headers, 429 status, logging | Restrictions: Configurable per endpoint | Success: Rate limit enforced with clear feedback_

- [x] 6. 配置限流规则
  - File: `apps/tenant-api/src/auth/auth.controller.ts` (add decorators), `apps/tenant-api/src/app.module.ts` (global guard)
  - 通用 API: 100次/分钟/IP，登录: 5次/15分钟
  - 注册: 3次/小时，敏感操作: 10次/分钟
  - Purpose: 各 API 限流配置
  - _Leverage: Task 5_
  - _Requirements: 2.1, 2.2_
  - _Prompt: Role: Backend Developer | Task: Apply rate limit decorators to endpoints with appropriate limits | Restrictions: Stricter for auth endpoints | Success: All endpoints have appropriate limits_

- [x] 7. 实现 IP 黑名单
  - File: `prisma/schema.prisma` (add IpBlacklist model), `apps/tenant-api/src/security/ip-blacklist.service.ts`, `apps/tenant-api/src/security/ip-blacklist.guard.ts`
  - 黑名单数据库表，检查中间件
  - 管理 API，自动过期机制
  - Purpose: IP 级访问控制
  - _Leverage: Prisma, Task 5_
  - _Requirements: 2.4_
  - _Prompt: Role: Backend Developer | Task: Create IP blacklist with DB storage, guard middleware, admin API, auto-expiry | Restrictions: Fast lookup | Success: Blacklisted IPs blocked immediately_

## Phase 3: Account Security

- [x] 8. 实现账户锁定
  - File: `apps/tenant-api/src/security/account-lockout.service.ts`, `apps/tenant-api/src/auth/auth.service.ts` (integrate)
  - 5 次失败后锁定 15 分钟，锁定状态检查
  - 成功登录重置计数，渐进式锁定时长倍增
  - Purpose: 暴力破解防护
  - _Leverage: Redis, Task 4_
  - _Requirements: 2.2_
  - _Prompt: Role: Backend Developer | Task: Create account lockout service with failure counting, lockout duration, reset on success | Restrictions: Clear lockout feedback | Success: Brute force attacks blocked_

- [x] 9. 增强密码安全
  - File: `apps/tenant-api/src/security/password.service.ts`, `apps/tenant-api/src/auth/auth.service.ts` (integrate)
  - bcrypt cost factor >= 12，密码强度验证
  - 密码历史检查，常见弱密码拒绝，强度评分
  - Purpose: 密码安全加固
  - _Leverage: bcrypt_
  - _Requirements: 3.1_
  - _Prompt: Role: Backend Developer | Task: Create password service with strong hashing, strength validation, optional history check | Restrictions: Minimum 12 cost factor | Success: Weak passwords rejected_

## Phase 4: Security Audit Logging

- [x] 10. 创建审计日志服务
  - File: `apps/tenant-api/src/security/audit-logger.service.ts`, `apps/platform-service/prisma/schema.prisma` (add AuditLog model)
  - 结构化审计日志格式，数据库持久化
  - 实时日志输出，查询和统计功能
  - Purpose: 安全事件记录
  - _Leverage: Prisma, Task 1 (logger)_
  - _Requirements: 4.1_
  - _Prompt: Role: Backend Developer | Task: Create audit logger service with structured format, DB persistence, real-time output, alerts | Restrictions: Complete audit trail | Success: All security events logged_

- [x] 11. 实现登录登出审计
  - File: `apps/tenant-api/src/auth/auth.service.ts` (add audit), `apps/tenant-api/src/auth/auth.controller.ts` (add audit)
  - 记录登录成功/失败、登出事件
  - 记录 IP 和设备信息，密码修改审计
  - Purpose: 认证事件审计
  - _Leverage: Task 10_
  - _Requirements: 4.1, 4.4_
  - _Prompt: Role: Backend Developer | Task: Add audit logging to auth flows for login, logout, with IP, device info, anomaly detection | Restrictions: All auth events logged | Success: Complete auth audit trail_

- [x] 12. 实现敏感操作审计
  - File: `apps/tenant-api/src/security/audit.decorator.ts`, `apps/tenant-api/src/security/audit.interceptor.ts`
  - 权限变更、数据导出、配置变更审计
  - 用户管理操作审计，预定义审计配置
  - Purpose: 敏感操作追踪
  - _Leverage: Task 10_
  - _Requirements: 4.2, 4.3_
  - _Prompt: Role: Backend Developer | Task: Create audit decorator and interceptor for sensitive operations with before/after state | Restrictions: Non-intrusive integration | Success: All sensitive ops audited_

- [x] 13. 创建审计查询 API
  - File: `apps/tenant-api/src/audit/audit.controller.ts`, `apps/tenant-api/src/audit/audit.service.ts`, `apps/tenant-api/src/audit/audit.module.ts`
  - 时间范围、用户、操作类型过滤
  - 分页和排序，统计和分布图表
  - Purpose: 审计日志访问
  - _Leverage: Task 10_
  - _Requirements: 4.5_
  - _Prompt: Role: NestJS Developer | Task: Create audit query API with time range, user, operation type filters, pagination | Restrictions: Admin only access | Success: Audit logs searchable via API_

## Phase 5: Data Protection

- [x] 14. 创建数据脱敏服务
  - File: `apps/tenant-api/src/security/data-sanitizer.service.ts`
  - 自动检测敏感字段，支持多种脱敏模式
  - 日志输出自动脱敏，API 响应可选脱敏
  - Purpose: 敏感数据保护
  - _Requirements: 3.3_
  - _Prompt: Role: Backend Developer | Task: Create data sanitizer with auto-detect sensitive fields, multiple redaction modes | Restrictions: No false negatives | Success: Sensitive data never exposed_

- [x] 15. 增强加密服务
  - File: `apps/tenant-api/src/security/encryption.service.ts`
  - AES-256-GCM 加密，密钥轮换支持
  - 加密审计日志，安全的密钥管理
  - Purpose: 数据加密加固
  - _Leverage: crypto_
  - _Requirements: 3.2_
  - _Prompt: Role: Backend Developer | Task: Enhance encryption service with AES-256-GCM, key rotation, audit logging, secure key management | Restrictions: HSM-ready design | Success: All sensitive data encrypted at rest_

- [x] 16. 实现安全数据导出
  - File: `apps/tenant-api/src/export/export.service.ts`, `apps/tenant-api/src/export/export.controller.ts`
  - 导出权限检查，导出审计日志
  - 可选加密导出，导出数量限制
  - Purpose: 安全的数据导出
  - _Leverage: Task 10, Task 14_
  - _Requirements: 3.4_
  - _Prompt: Role: Backend Developer | Task: Create secure export service with permission check, audit, optional encryption, limits | Restrictions: Rate limited exports | Success: Data exports are secure and audited_

## Phase 6: Input Validation and Security Headers

- [x] 17. 配置全局验证管道
  - File: `apps/tenant-api/src/security/validation.pipe.ts`, `apps/tenant-api/src/main.ts` (apply pipe)
  - 白名单验证，自动类型转换
  - 详细错误消息，阻止额外属性
  - Purpose: 输入验证基础设施
  - _Leverage: class-validator, class-transformer_
  - _Requirements: 6.1_
  - _Prompt: Role: NestJS Developer | Task: Configure global validation pipe with whitelist, transform, detailed errors | Restrictions: Fail on unknown properties | Success: All input validated_

- [x] 18. 创建自定义验证装饰器
  - File: `apps/tenant-api/src/security/validation.decorators.ts`
  - IsSafeString（防 XSS）、IsSecurePassword（密码强度）
  - IsTenantId（租户 ID 格式）、IsNotSqlInjection
  - Purpose: 安全验证装饰器
  - _Leverage: class-validator registerDecorator_
  - _Requirements: 6.1, 6.4_
  - _Prompt: Role: Backend Developer | Task: Create custom validation decorators for safe string, secure password, tenant ID, SQL injection detection | Restrictions: Comprehensive patterns | Success: Dangerous input rejected_

- [x] 19. 配置安全响应头
  - File: `apps/tenant-api/src/security/helmet.config.ts`, `apps/tenant-api/src/main.ts` (apply helmet)
  - Content-Security-Policy、X-Frame-Options
  - X-Content-Type-Options、Referrer-Policy
  - Purpose: HTTP 安全头
  - _Leverage: helmet_
  - _Requirements: 6.5_
  - _Prompt: Role: Backend Developer | Task: Configure Helmet with CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | Restrictions: Strict CSP | Success: All security headers present_

- [x] 20. 实现注入攻击检测
  - File: `apps/tenant-api/src/security/injection-detector.service.ts`, `apps/tenant-api/src/security/injection-detector.guard.ts`
  - SQL 注入、XSS、命令注入模式检测
  - 检测到时记录和阻断
  - Purpose: 注入攻击防护
  - _Leverage: Task 10_
  - _Requirements: 6.2, 6.3, 6.4_
  - _Prompt: Role: Backend Developer | Task: Create injection detector for SQL, XSS, command injection with logging and blocking | Restrictions: Low false positive rate | Success: Injection attempts blocked and logged_

## Phase 7: Vulnerability Scanning

- [x] 21. 配置 npm audit CI
  - File: `.github/workflows/security-scan.yml`
  - 每次构建运行 npm audit，高危漏洞阻断构建
  - 漏洞报告生成，Slack 通知
  - Purpose: 依赖漏洞扫描
  - _Requirements: 5.1, 5.2_
  - _Prompt: Role: DevOps Engineer | Task: Create security scan workflow with npm audit, high severity blocking, reports, notifications | Restrictions: Block on high/critical | Success: Vulnerable deps blocked from deploy_

- [x] 22. 集成 Snyk
  - File: `.github/workflows/security-scan.yml` (update), `.snyk`
  - Snyk CLI 配置，每日扫描调度
  - PR 检查集成，漏洞报告仪表板
  - Purpose: 高级安全扫描
  - _Leverage: Task 21_
  - _Requirements: 5.1, 5.3_
  - _Prompt: Role: DevOps Engineer | Task: Integrate Snyk for daily scans, PR checks, dashboard reporting | Restrictions: Daily scheduled scan | Success: Continuous vulnerability monitoring_

- [x] 23. 创建安全报告生成
  - File: `scripts/generate-security-report.sh`, `.github/workflows/security-report.yml`
  - 周报自动生成，漏洞统计和趋势
  - 修复建议，报告分发
  - Purpose: 安全态势报告
  - _Leverage: Task 21, Task 22_
  - _Requirements: 5.3, 5.4, 5.5_
  - _Prompt: Role: DevOps Engineer | Task: Create security report generation with weekly schedule, trends, recommendations, distribution | Restrictions: Actionable reports | Success: Weekly security visibility_

## Phase 8: Security Testing and Documentation

- [x] 24. 创建安全单元测试
  - File: `apps/tenant-api/src/security/__tests__/rate-limiter.spec.ts`, `apps/tenant-api/src/security/__tests__/account-lockout.spec.ts`, `apps/tenant-api/src/security/__tests__/validation.spec.ts`
  - 限流、账户锁定、输入验证、加密解密测试
  - Purpose: 安全功能测试
  - _Leverage: Jest_
  - _Requirements: 6.1_
  - _Prompt: Role: QA Engineer | Task: Create unit tests for rate limiter, account lockout, validation, encryption | Restrictions: Edge case coverage | Success: Security features fully tested_

- [x] 25. 创建安全集成测试
  - File: `apps/tenant-api/test/security/rate-limiting.e2e-spec.ts`, `apps/tenant-api/test/security/injection.e2e-spec.ts`, `apps/tenant-api/test/security/auth-bypass.e2e-spec.ts`
  - 端到端限流、跨租户访问、注入攻击、认证绕过测试
  - Purpose: 安全集成测试
  - _Leverage: Jest, supertest_
  - _Requirements: 6.1_
  - _Prompt: Role: QA Engineer | Task: Create E2E security tests for rate limiting, tenant isolation, injection, auth bypass | Restrictions: Penetration test style | Success: Security verified end-to-end_

- [x] 26. 创建安全文档
  - File: `docs/security-policy.md`, `docs/security-configuration.md`, `docs/incident-response.md`, `docs/owasp-checklist.md`
  - 安全策略、配置指南、事件响应流程、OWASP 合规检查表
  - Purpose: 安全文档
  - _Requirements: All_
  - _Prompt: Role: Technical Writer | Task: Create security documentation with policy, config guide, incident response, OWASP checklist | Restrictions: Compliance-ready | Success: Security practices documented_

## Summary

| Phase | Tasks | Count |
|-------|-------|-------|
| Phase 1: HTTPS and Transport Security | 1-3 | 3 |
| Phase 2: Rate Limiting | 4-7 | 4 |
| Phase 3: Account Security | 8-9 | 2 |
| Phase 4: Security Audit Logging | 10-13 | 4 |
| Phase 5: Data Protection | 14-16 | 3 |
| Phase 6: Input Validation and Security Headers | 17-20 | 4 |
| Phase 7: Vulnerability Scanning | 21-23 | 3 |
| Phase 8: Security Testing and Documentation | 24-26 | 3 |
| **Total** | | **26** |
