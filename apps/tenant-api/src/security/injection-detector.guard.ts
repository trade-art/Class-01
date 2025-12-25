/**
 * 注入攻击检测守卫
 * 自动检测和阻断注入攻击
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  InjectionDetectorService,
  InjectionType,
  InjectionDetectionResult,
} from './injection-detector.service';

/**
 * 注入检测配置元数据键
 */
export const INJECTION_DETECTION_KEY = 'injection_detection';

/**
 * 注入检测配置选项
 */
export interface InjectionDetectionOptions {
  /** 启用的检测类型 */
  types?: InjectionType[];
  /** 最低风险等级（低于此等级的不阻断） */
  minRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
  /** 是否检查查询参数 */
  checkQuery?: boolean;
  /** 是否检查请求体 */
  checkBody?: boolean;
  /** 是否检查路径参数 */
  checkParams?: boolean;
  /** 是否检查请求头 */
  checkHeaders?: boolean;
  /** 排除的字段 */
  excludeFields?: string[];
  /** 仅记录不阻断 */
  logOnly?: boolean;
}

/**
 * 跳过注入检测装饰器
 */
export const SkipInjectionDetection = () => SetMetadata(INJECTION_DETECTION_KEY, { skip: true });

/**
 * 自定义注入检测配置装饰器
 */
export const InjectionDetection = (options: InjectionDetectionOptions) =>
  SetMetadata(INJECTION_DETECTION_KEY, options);

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: InjectionDetectionOptions = {
  types: [
    InjectionType.SQL,
    InjectionType.XSS,
    InjectionType.COMMAND,
    InjectionType.PATH_TRAVERSAL,
  ],
  minRiskLevel: 'medium',
  checkQuery: true,
  checkBody: true,
  checkParams: true,
  checkHeaders: false, // 默认不检查 headers，可能误报
  excludeFields: ['password', 'token', 'authorization'],
  logOnly: false,
};

/**
 * 需要检查的请求头
 */
const HEADERS_TO_CHECK = [
  'x-custom-header',
  'x-request-id',
  'x-correlation-id',
];

@Injectable()
export class InjectionDetectorGuard implements CanActivate {
  private readonly logger = new Logger(InjectionDetectorGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly injectionDetector: InjectionDetectorService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取配置
    const metadata = this.reflector.getAllAndOverride<
      InjectionDetectionOptions & { skip?: boolean }
    >(INJECTION_DETECTION_KEY, [context.getHandler(), context.getClass()]);

    // 跳过检测
    if (metadata?.skip) {
      return true;
    }

    const options = { ...DEFAULT_OPTIONS, ...metadata };
    const request = context.switchToHttp().getRequest<Request>();

    // 收集所有检测结果
    const detections: Array<{
      location: string;
      field: string;
      result: InjectionDetectionResult;
    }> = [];

    // 检查查询参数
    if (options.checkQuery && request.query) {
      const queryResults = this.injectionDetector.detectInObject(
        request.query as Record<string, unknown>,
        {
          types: options.types,
          minRiskLevel: options.minRiskLevel,
          excludeFields: options.excludeFields,
        }
      );

      for (const [field, result] of queryResults) {
        detections.push({ location: 'query', field, result });
      }
    }

    // 检查请求体
    if (options.checkBody && request.body) {
      const bodyResults = this.injectionDetector.detectInObject(
        request.body as Record<string, unknown>,
        {
          types: options.types,
          minRiskLevel: options.minRiskLevel,
          excludeFields: options.excludeFields,
        }
      );

      for (const [field, result] of bodyResults) {
        detections.push({ location: 'body', field, result });
      }
    }

    // 检查路径参数
    if (options.checkParams && request.params) {
      const paramsResults = this.injectionDetector.detectInObject(
        request.params as Record<string, unknown>,
        {
          types: options.types,
          minRiskLevel: options.minRiskLevel,
          excludeFields: options.excludeFields,
        }
      );

      for (const [field, result] of paramsResults) {
        detections.push({ location: 'params', field, result });
      }
    }

    // 检查请求头
    if (options.checkHeaders) {
      for (const headerName of HEADERS_TO_CHECK) {
        const headerValue = request.headers[headerName];
        if (typeof headerValue === 'string') {
          const result = this.injectionDetector.detect(headerValue, {
            types: options.types,
            minRiskLevel: options.minRiskLevel,
          });

          if (result.detected) {
            detections.push({
              location: 'headers',
              field: headerName,
              result,
            });
          }
        }
      }
    }

    // 处理检测结果
    if (detections.length > 0) {
      // 获取最高风险等级
      const riskLevels = ['low', 'medium', 'high', 'critical'];
      let maxRiskLevel = 'low';
      for (const detection of detections) {
        const riskIndex = riskLevels.indexOf(detection.result.riskLevel);
        if (riskIndex > riskLevels.indexOf(maxRiskLevel)) {
          maxRiskLevel = detection.result.riskLevel;
        }
      }

      // 构建错误信息
      const attackTypes = new Set<InjectionType>();
      for (const detection of detections) {
        for (const type of detection.result.types) {
          attackTypes.add(type);
        }
      }

      // 获取请求信息
      const ipAddress = this.getClientIp(request);
      const tenantId = (request as any).tenantId || 'unknown';
      const userId = (request as any).user?.sub;

      // 记录攻击尝试
      for (const detection of detections) {
        await this.injectionDetector.logAttackAttempt(
          tenantId,
          userId,
          detection.result,
          {
            endpoint: request.originalUrl,
            method: request.method,
            ipAddress,
            field: `${detection.location}.${detection.field}`,
          }
        );
      }

      // 仅记录模式：不阻断请求
      if (options.logOnly) {
        this.logger.warn(
          `注入攻击检测 (仅记录): ${Array.from(attackTypes).join(', ')}, ` +
            `IP: ${ipAddress}, URL: ${request.originalUrl}`
        );
        return true;
      }

      // 阻断请求
      this.logger.warn(
        `注入攻击已阻断: ${Array.from(attackTypes).join(', ')}, ` +
          `IP: ${ipAddress}, URL: ${request.originalUrl}, ` +
          `Risk: ${maxRiskLevel}`
      );

      throw new ForbiddenException({
        statusCode: 403,
        error: 'Security Violation',
        message: '检测到潜在的安全威胁，请求已被阻止',
        attackTypes: Array.from(attackTypes),
        riskLevel: maxRiskLevel,
      });
    }

    return true;
  }

  /**
   * 获取客户端 IP
   */
  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || request.socket.remoteAddress || '0.0.0.0';
  }
}
