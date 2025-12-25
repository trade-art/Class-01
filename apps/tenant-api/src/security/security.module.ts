/**
 * 安全模块
 * 提供 Cookie、加密、安全验证、IP 黑名单、账户锁定、密码安全、审计日志等服务
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CookieService } from './cookie.service';
import { RateLimiterService } from './rate-limiter.service';
import { IpBlacklistService } from './ip-blacklist.service';
import { IpBlacklistGuard } from './ip-blacklist.guard';
import { AccountLockoutService } from './account-lockout.service';
import { PasswordService } from './password.service';
import { AuditLoggerService } from './audit-logger.service';
import { AuditInterceptor } from './audit.interceptor';
import { DataSanitizerService } from './data-sanitizer.service';
import { EncryptionService } from './encryption.service';
import { InjectionDetectorService } from './injection-detector.service';
import { InjectionDetectorGuard } from './injection-detector.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    CookieService,
    RateLimiterService,
    IpBlacklistService,
    IpBlacklistGuard,
    AccountLockoutService,
    PasswordService,
    AuditLoggerService,
    AuditInterceptor,
    DataSanitizerService,
    EncryptionService,
    InjectionDetectorService,
    InjectionDetectorGuard,
  ],
  exports: [
    CookieService,
    RateLimiterService,
    IpBlacklistService,
    IpBlacklistGuard,
    AccountLockoutService,
    PasswordService,
    AuditLoggerService,
    AuditInterceptor,
    DataSanitizerService,
    EncryptionService,
    InjectionDetectorService,
    InjectionDetectorGuard,
  ],
})
export class SecurityModule {}
