# Design Document: Security Hardening

## Overview

本设计文档描述SaaS平台的安全加固措施，包括HTTPS配置、API限流、敏感数据加密、安全审计和漏洞扫描。

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Security Architecture                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Edge Layer                                    │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │ WAF / DDoS  │──│ TLS 1.2+    │──│ IP          │                  │   │
│  │  │ Protection  │  │ Termination │  │ Blacklist   │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  │                                                                      │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────┼───────────────────────────────────────┐   │
│  │                    Application Layer                                  │   │
│  │                              │                                        │   │
│  │  ┌─────────────┐  ┌─────────┴─────────┐  ┌─────────────┐            │   │
│  │  │ Rate        │──│ Input             │──│ Auth        │            │   │
│  │  │ Limiter     │  │ Validation        │  │ Guard       │            │   │
│  │  └─────────────┘  └───────────────────┘  └─────────────┘            │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────────────┐  ┌─────────────┐          │   │
│  │  │ Security    │──│ Audit Logger        │──│ Data        │          │   │
│  │  │ Headers     │  │ (All Operations)    │  │ Sanitizer   │          │   │
│  │  └─────────────┘  └─────────────────────┘  └─────────────┘          │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Data Layer                                        │   │
│  │                                                                       │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │ Encryption      │  │ Secure          │  │ Access          │      │   │
│  │  │ at Rest         │  │ Connections     │  │ Control         │      │   │
│  │  │ (AES-256-GCM)   │  │ (TLS/mTLS)      │  │ (RBAC)          │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. HTTPS and Transport Security

#### TLS Configuration

```typescript
// config/tls.config.ts
export const tlsConfig = {
  minVersion: 'TLSv1.2',
  ciphers: [
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
  ].join(':'),
  honorCipherOrder: true,
};
```

#### Nginx SSL Configuration

```nginx
# nginx/ssl.conf
server {
    listen 443 ssl http2;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # HTTP to HTTPS redirect
    if ($scheme != "https") {
        return 301 https://$server_name$request_uri;
    }
}
```

#### Secure Cookie Configuration

```typescript
// libs/shared/src/security/cookie.config.ts
export const secureCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/',
};
```

### 2. Rate Limiting

#### Rate Limiter Implementation

```typescript
// libs/shared/src/security/rate-limiter.service.ts
@Injectable()
export class RateLimiterService {
  constructor(private redis: RedisService) {}

  async checkLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const currentCount = await this.redis.incr(key);

    if (currentCount === 1) {
      await this.redis.expire(key, Math.ceil(windowMs / 1000));
    }

    const remaining = Math.max(0, limit - currentCount);
    const ttl = await this.redis.ttl(key);

    return {
      allowed: currentCount <= limit,
      remaining,
      resetTime: Date.now() + ttl * 1000,
      retryAfter: currentCount > limit ? ttl : 0,
    };
  }
}
```

#### Rate Limit Configuration

| Endpoint Type | Limit | Window | Key |
|---------------|-------|--------|-----|
| General API | 100 req | 1 min | IP |
| Login | 5 req | 15 min | IP + Email |
| Password Reset | 3 req | 1 hour | Email |
| Registration | 3 req | 1 hour | IP |

#### Rate Limit Guard

```typescript
// libs/shared/src/security/rate-limit.guard.ts
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private rateLimiter: RateLimiterService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const config = this.reflector.get<RateLimitConfig>(
      'rateLimit',
      context.getHandler(),
    ) || { limit: 100, windowMs: 60000 };

    const key = `ratelimit:${request.ip}:${request.path}`;
    const result = await this.rateLimiter.checkLimit(
      key,
      config.limit,
      config.windowMs,
    );

    response.setHeader('X-RateLimit-Limit', config.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader('X-RateLimit-Reset', result.resetTime);

    if (!result.allowed) {
      response.setHeader('Retry-After', result.retryAfter);
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
```

### 3. Account Lockout

```typescript
// libs/shared/src/security/account-lockout.service.ts
@Injectable()
export class AccountLockoutService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60; // 15 minutes

  constructor(private redis: RedisService) {}

  async recordFailedAttempt(email: string): Promise<LockoutStatus> {
    const key = `lockout:${email}`;
    const attempts = await this.redis.incr(key);

    if (attempts === 1) {
      await this.redis.expire(key, this.LOCKOUT_DURATION);
    }

    const isLocked = attempts >= this.MAX_ATTEMPTS;
    const ttl = await this.redis.ttl(key);

    if (isLocked) {
      await this.auditLog.log({
        event: 'ACCOUNT_LOCKED',
        email,
        reason: 'Too many failed login attempts',
      });
    }

    return {
      isLocked,
      remainingAttempts: Math.max(0, this.MAX_ATTEMPTS - attempts),
      lockoutEndsAt: isLocked ? Date.now() + ttl * 1000 : null,
    };
  }

  async clearAttempts(email: string): Promise<void> {
    await this.redis.del(`lockout:${email}`);
  }

  async isLocked(email: string): Promise<boolean> {
    const attempts = await this.redis.get(`lockout:${email}`);
    return parseInt(attempts || '0') >= this.MAX_ATTEMPTS;
  }
}
```

### 4. Security Audit Logging

#### Audit Log Schema

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: 'info' | 'warning' | 'critical';
  actor: {
    userId?: string;
    email?: string;
    ip: string;
    userAgent: string;
  };
  resource: {
    type: string;
    id?: string;
    tenantId?: string;
  };
  action: string;
  outcome: 'success' | 'failure';
  details: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
}

enum AuditEventType {
  // Authentication
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',

  // Authorization
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  ACCESS_DENIED = 'ACCESS_DENIED',

  // Data Access
  DATA_READ = 'DATA_READ',
  DATA_CREATE = 'DATA_CREATE',
  DATA_UPDATE = 'DATA_UPDATE',
  DATA_DELETE = 'DATA_DELETE',
  DATA_EXPORT = 'DATA_EXPORT',

  // Security Events
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}
```

#### Audit Logger Service

```typescript
// libs/shared/src/security/audit-logger.service.ts
@Injectable()
export class AuditLoggerService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
  ) {}

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry = {
      id: ulid(),
      timestamp: new Date(),
      ...entry,
    };

    // Store in database
    await this.prisma.auditLog.create({
      data: {
        ...auditEntry,
        details: JSON.stringify(auditEntry.details),
        changes: auditEntry.changes ? JSON.stringify(auditEntry.changes) : null,
      },
    });

    // Also log to structured logger for real-time monitoring
    this.logger.log('Audit Event', {
      auditEvent: auditEntry.eventType,
      severity: auditEntry.severity,
      actor: auditEntry.actor,
      resource: auditEntry.resource,
    });

    // Trigger alerts for critical events
    if (auditEntry.severity === 'critical') {
      await this.triggerAlert(auditEntry);
    }
  }

  async query(filters: AuditQueryFilters): Promise<AuditLogEntry[]> {
    return this.prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: filters.startDate,
          lte: filters.endDate,
        },
        eventType: filters.eventType,
        'actor.userId': filters.userId,
        'resource.tenantId': filters.tenantId,
      },
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 100,
    });
  }
}
```

### 5. Data Sanitization

#### Sensitive Data Redaction

```typescript
// libs/shared/src/security/data-sanitizer.service.ts
@Injectable()
export class DataSanitizerService {
  private readonly sensitiveFields = [
    'password',
    'token',
    'apiKey',
    'secret',
    'authorization',
    'creditCard',
    'ssn',
    'mtPassword',
    'mtInvestorPassword',
  ];

  private readonly patterns = [
    { name: 'creditCard', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
    { name: 'jwt', regex: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*/g },
    { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  ];

  sanitize(data: any, options?: SanitizeOptions): any {
    if (!data) return data;

    if (typeof data === 'string') {
      return this.sanitizeString(data, options);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item, options));
    }

    if (typeof data === 'object') {
      return this.sanitizeObject(data, options);
    }

    return data;
  }

  private sanitizeObject(obj: Record<string, any>, options?: SanitizeOptions) {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = this.sanitize(value, options);
      }
    }

    return result;
  }

  private isSensitiveField(fieldName: string): boolean {
    const lowerField = fieldName.toLowerCase();
    return this.sensitiveFields.some(
      sensitive => lowerField.includes(sensitive.toLowerCase())
    );
  }
}
```

### 6. Security Headers

```typescript
// libs/shared/src/security/helmet.config.ts
import helmet from 'helmet';

export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'same-site' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
});
```

### 7. Input Validation

#### Validation Pipe Configuration

```typescript
// libs/shared/src/security/validation.pipe.ts
export const validationPipeConfig = new ValidationPipe({
  whitelist: true,           // Strip properties not in DTO
  forbidNonWhitelisted: true, // Throw error for extra properties
  transform: true,            // Auto-transform payloads
  transformOptions: {
    enableImplicitConversion: true,
  },
  exceptionFactory: (errors) => {
    const messages = errors.map(error => ({
      field: error.property,
      constraints: error.constraints,
    }));
    return new BadRequestException({
      message: 'Validation failed',
      errors: messages,
    });
  },
});
```

#### Common Validation Decorators

```typescript
// libs/shared/src/decorators/validation.decorators.ts
import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsSafeString(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isSafeString',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;
          // Reject dangerous patterns
          const dangerousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+=/i,
            /data:/i,
          ];
          return !dangerousPatterns.some(pattern => pattern.test(value));
        },
        defaultMessage() {
          return 'String contains potentially dangerous content';
        },
      },
    });
  };
}
```

### 8. Vulnerability Scanning

#### npm audit Integration

```yaml
# .github/workflows/security-scan.yml
security-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Run npm audit
      run: npm audit --audit-level=high
      continue-on-error: true

    - name: Run Snyk security scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high

    - name: Run OWASP dependency check
      uses: dependency-check/Dependency-Check_Action@main
      with:
        project: 'mt5-platform'
        path: '.'
        format: 'HTML'
```

#### Security Scan Schedule

| Scan Type | Frequency | Trigger |
|-----------|-----------|---------|
| npm audit | Every build | CI/CD |
| Snyk scan | Daily | Scheduled |
| OWASP check | Weekly | Scheduled |
| Penetration test | Quarterly | Manual |

## Database Schema

```prisma
// prisma/schema.prisma

model AuditLog {
  id          String   @id @default(uuid())
  timestamp   DateTime @default(now())
  eventType   String
  severity    String
  actorUserId String?
  actorEmail  String?
  actorIp     String
  userAgent   String?
  resourceType String
  resourceId   String?
  tenantId     String?
  action       String
  outcome      String
  details      Json
  changes      Json?

  @@index([timestamp])
  @@index([eventType])
  @@index([tenantId])
  @@index([actorUserId])
}

model IpBlacklist {
  id        String   @id @default(uuid())
  ip        String   @unique
  reason    String
  expiresAt DateTime?
  createdAt DateTime @default(now())
  createdBy String
}

model SecurityAlert {
  id          String   @id @default(uuid())
  type        String
  severity    String
  message     String
  details     Json
  status      String   @default("open")
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?
  resolvedBy  String?
}
```

## File Structure

```
├── libs/shared/src/security/
│   ├── rate-limiter.service.ts
│   ├── rate-limit.guard.ts
│   ├── account-lockout.service.ts
│   ├── audit-logger.service.ts
│   ├── data-sanitizer.service.ts
│   ├── helmet.config.ts
│   ├── validation.pipe.ts
│   ├── cookie.config.ts
│   └── security.module.ts
├── config/
│   ├── tls.config.ts
│   └── security.config.ts
├── nginx/
│   ├── ssl.conf
│   └── security-headers.conf
├── .github/workflows/
│   └── security-scan.yml
└── docs/
    ├── security-policy.md
    └── incident-response.md
```

## Error Handling

### Security-Related Errors

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| SEC001 | 429 | Rate limit exceeded |
| SEC002 | 401 | Invalid credentials |
| SEC003 | 403 | Account locked |
| SEC004 | 403 | Access denied |
| SEC005 | 400 | Invalid input |
| SEC006 | 403 | IP blacklisted |

### Error Response Format

```typescript
interface SecurityErrorResponse {
  error: {
    code: string;
    message: string;
    details?: {
      retryAfter?: number;      // For rate limiting
      lockoutEndsAt?: number;   // For account lockout
      remainingAttempts?: number;
    };
  };
}
```

## Security Checklist

### OWASP Top 10 Coverage

| Risk | Mitigation | Status |
|------|------------|--------|
| A01 Broken Access Control | RBAC, tenant isolation | ✓ |
| A02 Cryptographic Failures | AES-256-GCM, TLS 1.2+ | ✓ |
| A03 Injection | Prisma ORM, input validation | ✓ |
| A04 Insecure Design | Security by design | ✓ |
| A05 Security Misconfiguration | Helmet, secure defaults | ✓ |
| A06 Vulnerable Components | npm audit, Snyk | ✓ |
| A07 Auth Failures | JWT, account lockout | ✓ |
| A08 Integrity Failures | CSP, SRI | ✓ |
| A09 Logging Failures | Audit logging | ✓ |
| A10 SSRF | Input validation, allowlist | ✓ |

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| helmet | 7.x | Security headers |
| rate-limiter-flexible | 3.x | Rate limiting |
| class-validator | 0.14.x | Input validation |
| class-transformer | 0.5.x | DTO transformation |
| @nestjs/throttler | 5.x | NestJS rate limiting |
| bcrypt | 5.x | Password hashing |
| crypto-js | 4.x | Encryption utilities |
