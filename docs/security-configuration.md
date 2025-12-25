# Security Configuration Guide

## Overview

This guide provides detailed instructions for configuring security features in the MT5 Multi-Tenant SaaS Platform.

## Environment Variables

### Authentication

```env
# JWT Configuration
JWT_SECRET=your-strong-secret-key-minimum-32-characters
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Password Policy
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
PASSWORD_REQUIRE_SPECIAL=true
PASSWORD_HISTORY_COUNT=5
```

### Rate Limiting

```env
# Global API Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100

# Login Rate Limiting
RATE_LIMIT_LOGIN_TTL=900
RATE_LIMIT_LOGIN_MAX=5

# Registration Rate Limiting
RATE_LIMIT_REGISTER_TTL=3600
RATE_LIMIT_REGISTER_MAX=3
```

### Account Lockout

```env
# Lockout Configuration
LOCKOUT_MAX_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
LOCKOUT_PROGRESSIVE=true
LOCKOUT_MAX_DURATION_HOURS=24
```

### Encryption

```env
# Data Encryption
ENCRYPTION_KEY=your-32-byte-encryption-key-here
ENCRYPTION_ALGORITHM=aes-256-gcm
KEY_ROTATION_ENABLED=true
KEY_ROTATION_INTERVAL_DAYS=90
```

### TLS/SSL

```env
# TLS Configuration
TLS_ENABLED=true
TLS_MIN_VERSION=1.2
HSTS_ENABLED=true
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
```

### Redis (Required for Rate Limiting & Sessions)

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_TLS_ENABLED=false
```

## Helmet Security Headers

The platform uses Helmet.js for HTTP security headers. Configuration is in `security/helmet.config.ts`:

### Production Configuration

```typescript
// Content Security Policy
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    connectSrc: ["'self'"],
  },
}

// Other Headers
xFrameOptions: { action: 'deny' }
xContentTypeOptions: true
referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
```

### Development Configuration

Development mode relaxes some restrictions for debugging:

```typescript
contentSecurityPolicy: false,  // Disabled for hot reload
xFrameOptions: { action: 'sameorigin' }
```

## Rate Limiting Configuration

### Predefined Strategies

| Strategy | Window | Max Requests | Use Case |
|----------|--------|--------------|----------|
| general | 60s | 100 | Standard API endpoints |
| login | 15min | 5 | Authentication |
| register | 1hr | 3 | User registration |
| sensitive | 60s | 10 | Sensitive operations |
| passwordReset | 1hr | 3 | Password reset requests |
| export | 1hr | 5 | Data export operations |

### Custom Rate Limiting

Apply rate limiting to specific endpoints:

```typescript
import { RateLimit } from './security';

@Controller('api')
export class ApiController {
  @RateLimit('login')
  @Post('auth/login')
  async login() { ... }

  @RateLimit({ maxRequests: 20, windowSizeSeconds: 60 })
  @Get('sensitive-data')
  async getSensitiveData() { ... }
}
```

## Validation Configuration

### Global Validation Pipe

The platform uses enhanced validation with security checks:

```typescript
// In main.ts
app.useGlobalPipes(new EnhancedValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: false,
  },
}));
```

### Custom Validators

Available security validators:

```typescript
import {
  IsSafeString,
  IsSecurePassword,
  IsTenantId,
  IsNotSqlInjection,
  IsNotCommandInjection,
  IsSecureEmail,
  IsSecureInput,
} from './security';

class CreateUserDto {
  @IsSecureEmail()
  email: string;

  @IsSecurePassword()
  password: string;

  @IsSafeString()
  name: string;

  @IsTenantId()
  tenantId: string;
}
```

## Injection Detection

### Global Guard

Enable injection detection globally:

```typescript
// In app.module.ts
{
  provide: APP_GUARD,
  useClass: InjectionDetectorGuard,
}
```

### Skip Detection

For trusted endpoints:

```typescript
import { SkipInjectionDetection } from './security';

@SkipInjectionDetection()
@Post('internal-webhook')
async handleWebhook() { ... }
```

## Audit Logging

### Enable Audit Logging

```typescript
import { Audit, AuditAction, AuditContext } from './security';

@Audit(AuditAction.DATA_EXPORT)
@Post('export')
async exportData(@AuditContext() ctx: AuditContextType) {
  // Audit log automatically created
}
```

### Audit Configuration

```env
# Audit Logging
AUDIT_ENABLED=true
AUDIT_LOG_LEVEL=info
AUDIT_RETENTION_DAYS=730
AUDIT_REAL_TIME_OUTPUT=true
```

## IP Blacklist

### Automatic Blacklisting

IPs are automatically blacklisted after:
- 3 consecutive account lockouts
- Detected injection attacks
- Repeated rate limit violations

### Manual Blacklist Management

```typescript
// Add to blacklist
await ipBlacklistService.addToBlacklist({
  ipAddress: '192.168.1.100',
  reason: 'Suspicious activity',
  source: IpBlacklistSource.MANUAL,
  expiresInSeconds: 86400, // 24 hours
});

// Remove from blacklist
await ipBlacklistService.removeFromBlacklist('192.168.1.100');

// Check if blacklisted
const isBlocked = await ipBlacklistService.isBlacklisted('192.168.1.100');
```

## Cookie Security

### Secure Cookie Configuration

```typescript
// Cookie options (applied automatically)
{
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
}
```

## CORS Configuration

```typescript
// In main.ts
app.enableCors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  maxAge: 86400,
});
```

## Database Security

### Connection String

```env
# Use SSL for production
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

### Prisma Configuration

```typescript
// In schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## Docker Security

### Container Hardening

```yaml
# docker-compose.yml security best practices
services:
  api:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
```

## Nginx/Reverse Proxy

### SSL Configuration

```nginx
# Strong TLS configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:50m;
ssl_session_tickets off;

# HSTS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

## Monitoring & Alerts

### Prometheus Metrics

Security-related metrics are exposed at `/metrics`:
- `security_login_attempts_total`
- `security_login_failures_total`
- `security_rate_limit_hits_total`
- `security_injection_attempts_total`

### Alert Rules

```yaml
# prometheus/alert-rules.yml
groups:
  - name: security
    rules:
      - alert: HighLoginFailureRate
        expr: rate(security_login_failures_total[5m]) > 10
        for: 2m
        labels:
          severity: warning
```

## Troubleshooting

### Common Issues

1. **Rate limiting not working**
   - Verify Redis connection
   - Check Redis key prefix configuration

2. **JWT validation failures**
   - Ensure JWT_SECRET is identical across instances
   - Check token expiration times

3. **CORS errors**
   - Verify CORS_ORIGINS includes your frontend domain
   - Check for trailing slashes in origins

4. **Certificate issues**
   - Run certificate monitoring script
   - Check certificate chain validity

---

**Last Updated**: December 2025
**Version**: 1.0
