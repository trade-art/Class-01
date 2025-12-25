/**
 * 注入攻击检测服务
 * 检测 SQL 注入、XSS、命令注入等攻击模式
 */

import { Injectable, Logger } from '@nestjs/common';
import { AuditLoggerService, AuditAction } from './audit-logger.service';

/**
 * 注入类型
 */
export enum InjectionType {
  /** SQL 注入 */
  SQL = 'sql',
  /** XSS 跨站脚本 */
  XSS = 'xss',
  /** 命令注入 */
  COMMAND = 'command',
  /** 路径遍历 */
  PATH_TRAVERSAL = 'path_traversal',
  /** LDAP 注入 */
  LDAP = 'ldap',
  /** XML 注入 */
  XML = 'xml',
}

/**
 * 检测结果
 */
export interface InjectionDetectionResult {
  /** 是否检测到注入 */
  detected: boolean;
  /** 检测到的注入类型 */
  types: InjectionType[];
  /** 匹配的模式 */
  patterns: string[];
  /** 原始值（脱敏） */
  sanitizedValue: string;
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 检测模式定义
 */
interface DetectionPattern {
  type: InjectionType;
  pattern: RegExp;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * SQL 注入检测模式
 */
const SQL_INJECTION_PATTERNS: DetectionPattern[] = [
  // 高危模式
  {
    type: InjectionType.SQL,
    pattern: /(\bUNION\b\s+\bSELECT\b)/gi,
    description: 'UNION SELECT 注入',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bDROP\b\s+\bTABLE\b)/gi,
    description: 'DROP TABLE 注入',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bDELETE\b\s+\bFROM\b)/gi,
    description: 'DELETE FROM 注入',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bINSERT\b\s+\bINTO\b)/gi,
    description: 'INSERT INTO 注入',
    riskLevel: 'high',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bUPDATE\b\s+\w+\s+\bSET\b)/gi,
    description: 'UPDATE SET 注入',
    riskLevel: 'high',
  },
  // 中危模式
  {
    type: InjectionType.SQL,
    pattern: /(--|\#|\/\*)/g,
    description: 'SQL 注释符号',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/gi,
    description: 'OR 条件绕过',
    riskLevel: 'high',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bAND\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?)/gi,
    description: 'AND 条件绕过',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.SQL,
    pattern: /(;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER))/gi,
    description: '分号拼接 SQL',
    riskLevel: 'high',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bWAITFOR\b\s+\bDELAY\b)/gi,
    description: '时间盲注',
    riskLevel: 'high',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bBENCHMARK\b\s*\()/gi,
    description: 'MySQL 时间盲注',
    riskLevel: 'high',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bSLEEP\b\s*\()/gi,
    description: '时间盲注 SLEEP',
    riskLevel: 'high',
  },
  {
    type: InjectionType.SQL,
    pattern: /(\bINFORMATION_SCHEMA\b)/gi,
    description: '信息探测',
    riskLevel: 'medium',
  },
];

/**
 * XSS 检测模式
 */
const XSS_PATTERNS: DetectionPattern[] = [
  {
    type: InjectionType.XSS,
    pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    description: 'Script 标签',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.XSS,
    pattern: /<script\b/gi,
    description: 'Script 标签开始',
    riskLevel: 'high',
  },
  {
    type: InjectionType.XSS,
    pattern: /javascript\s*:/gi,
    description: 'JavaScript 协议',
    riskLevel: 'high',
  },
  {
    type: InjectionType.XSS,
    pattern: /on(click|load|error|mouseover|submit|focus|blur|change|input)\s*=/gi,
    description: '事件处理器属性',
    riskLevel: 'high',
  },
  {
    type: InjectionType.XSS,
    pattern: /<iframe\b/gi,
    description: 'iframe 注入',
    riskLevel: 'high',
  },
  {
    type: InjectionType.XSS,
    pattern: /<object\b/gi,
    description: 'object 标签',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.XSS,
    pattern: /<embed\b/gi,
    description: 'embed 标签',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.XSS,
    pattern: /expression\s*\(/gi,
    description: 'CSS expression',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.XSS,
    pattern: /vbscript\s*:/gi,
    description: 'VBScript 协议',
    riskLevel: 'high',
  },
  {
    type: InjectionType.XSS,
    pattern: /data\s*:\s*text\/html/gi,
    description: 'Data URI HTML',
    riskLevel: 'high',
  },
];

/**
 * 命令注入检测模式
 */
const COMMAND_INJECTION_PATTERNS: DetectionPattern[] = [
  {
    type: InjectionType.COMMAND,
    pattern: /[;&|`$]/,
    description: '命令分隔符',
    riskLevel: 'high',
  },
  {
    type: InjectionType.COMMAND,
    pattern: /\$\([^)]+\)/,
    description: '命令替换',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.COMMAND,
    pattern: /`[^`]+`/,
    description: '反引号命令替换',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.COMMAND,
    pattern: /\|\s*\w+/,
    description: '管道命令',
    riskLevel: 'high',
  },
  {
    type: InjectionType.COMMAND,
    pattern: />\s*[\/\w]+/,
    description: '输出重定向',
    riskLevel: 'high',
  },
  {
    type: InjectionType.COMMAND,
    pattern: /<\s*[\/\w]+/,
    description: '输入重定向',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.COMMAND,
    pattern: /\brm\s+-rf\b/i,
    description: '危险删除命令',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.COMMAND,
    pattern: /\b(curl|wget|nc|netcat|bash|sh|zsh)\b/i,
    description: '危险命令',
    riskLevel: 'high',
  },
];

/**
 * 路径遍历检测模式
 */
const PATH_TRAVERSAL_PATTERNS: DetectionPattern[] = [
  {
    type: InjectionType.PATH_TRAVERSAL,
    pattern: /\.\.\//g,
    description: '相对路径遍历',
    riskLevel: 'high',
  },
  {
    type: InjectionType.PATH_TRAVERSAL,
    pattern: /\.\.\\+/g,
    description: 'Windows 路径遍历',
    riskLevel: 'high',
  },
  {
    type: InjectionType.PATH_TRAVERSAL,
    pattern: /%2e%2e[/\\]/gi,
    description: 'URL 编码路径遍历',
    riskLevel: 'high',
  },
  {
    type: InjectionType.PATH_TRAVERSAL,
    pattern: /\/etc\/(passwd|shadow)/i,
    description: '系统文件访问',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.PATH_TRAVERSAL,
    pattern: /C:\\Windows\\System32/i,
    description: 'Windows 系统目录',
    riskLevel: 'critical',
  },
];

/**
 * LDAP 注入检测模式
 */
const LDAP_INJECTION_PATTERNS: DetectionPattern[] = [
  {
    type: InjectionType.LDAP,
    pattern: /[()\\*]/g,
    description: 'LDAP 特殊字符',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.LDAP,
    pattern: /\|\([^)]+\)/g,
    description: 'LDAP OR 注入',
    riskLevel: 'high',
  },
];

/**
 * XML 注入检测模式
 */
const XML_INJECTION_PATTERNS: DetectionPattern[] = [
  {
    type: InjectionType.XML,
    pattern: /<!DOCTYPE\s+[^>]*\[/gi,
    description: 'DOCTYPE 实体定义',
    riskLevel: 'high',
  },
  {
    type: InjectionType.XML,
    pattern: /<!ENTITY\s+/gi,
    description: 'ENTITY 声明',
    riskLevel: 'critical',
  },
  {
    type: InjectionType.XML,
    pattern: /<!ELEMENT\s+/gi,
    description: 'ELEMENT 声明',
    riskLevel: 'medium',
  },
  {
    type: InjectionType.XML,
    pattern: /<!\[CDATA\[/gi,
    description: 'CDATA 注入',
    riskLevel: 'medium',
  },
];

/**
 * 所有检测模式
 */
const ALL_PATTERNS: DetectionPattern[] = [
  ...SQL_INJECTION_PATTERNS,
  ...XSS_PATTERNS,
  ...COMMAND_INJECTION_PATTERNS,
  ...PATH_TRAVERSAL_PATTERNS,
  ...LDAP_INJECTION_PATTERNS,
  ...XML_INJECTION_PATTERNS,
];

@Injectable()
export class InjectionDetectorService {
  private readonly logger = new Logger(InjectionDetectorService.name);

  constructor(private readonly auditLogger: AuditLoggerService) {}

  /**
   * 检测字符串中的注入攻击
   */
  detect(
    value: string,
    options?: {
      types?: InjectionType[];
      minRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): InjectionDetectionResult {
    if (!value || typeof value !== 'string') {
      return {
        detected: false,
        types: [],
        patterns: [],
        sanitizedValue: '',
        riskLevel: 'low',
      };
    }

    const allowedTypes = options?.types || Object.values(InjectionType);
    const minRiskLevel = options?.minRiskLevel || 'low';
    const riskLevels = ['low', 'medium', 'high', 'critical'];
    const minRiskIndex = riskLevels.indexOf(minRiskLevel);

    const detectedTypes = new Set<InjectionType>();
    const matchedPatterns: string[] = [];
    let maxRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // 检查所有模式
    for (const patternDef of ALL_PATTERNS) {
      // 过滤类型
      if (!allowedTypes.includes(patternDef.type)) {
        continue;
      }

      // 过滤风险等级
      const patternRiskIndex = riskLevels.indexOf(patternDef.riskLevel);
      if (patternRiskIndex < minRiskIndex) {
        continue;
      }

      // 重置正则表达式状态
      patternDef.pattern.lastIndex = 0;

      if (patternDef.pattern.test(value)) {
        detectedTypes.add(patternDef.type);
        matchedPatterns.push(patternDef.description);

        // 更新最高风险等级
        if (patternRiskIndex > riskLevels.indexOf(maxRiskLevel)) {
          maxRiskLevel = patternDef.riskLevel;
        }
      }
    }

    return {
      detected: detectedTypes.size > 0,
      types: Array.from(detectedTypes),
      patterns: matchedPatterns,
      sanitizedValue: this.sanitizeForLog(value),
      riskLevel: maxRiskLevel,
    };
  }

  /**
   * 检测对象中所有字符串字段的注入攻击
   */
  detectInObject(
    obj: Record<string, unknown>,
    options?: {
      types?: InjectionType[];
      minRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
      excludeFields?: string[];
    }
  ): Map<string, InjectionDetectionResult> {
    const results = new Map<string, InjectionDetectionResult>();
    const excludeFields = new Set(options?.excludeFields || []);

    const checkValue = (value: unknown, path: string): void => {
      if (excludeFields.has(path)) {
        return;
      }

      if (typeof value === 'string') {
        const result = this.detect(value, options);
        if (result.detected) {
          results.set(path, result);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          checkValue(item, `${path}[${index}]`);
        });
      } else if (value && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, path ? `${path}.${key}` : key);
        }
      }
    };

    checkValue(obj, '');
    return results;
  }

  /**
   * 记录注入攻击尝试
   */
  async logAttackAttempt(
    tenantId: string,
    userId: string | undefined,
    result: InjectionDetectionResult,
    context: {
      endpoint?: string;
      method?: string;
      ipAddress?: string;
      field?: string;
    }
  ): Promise<void> {
    this.logger.warn(
      `检测到注入攻击尝试: types=${result.types.join(',')}, ` +
        `patterns=${result.patterns.join(',')}, ` +
        `risk=${result.riskLevel}, ` +
        `ip=${context.ipAddress || 'unknown'}, ` +
        `endpoint=${context.endpoint || 'unknown'}`
    );

    await this.auditLogger.log({
      tenantId,
      userId,
      action: AuditAction.IP_BLACKLIST_ADD, // 使用 IP 黑名单作为安全警报的记录类型
      resource: 'injection-detector',
      description: `检测到${result.types.join('/')}注入攻击尝试`,
      ipAddress: context.ipAddress,
      status: 'FAILURE', // 请求被阻断
      metadata: {
        types: result.types,
        patterns: result.patterns,
        riskLevel: result.riskLevel,
        endpoint: context.endpoint,
        method: context.method,
        field: context.field,
        sanitizedValue: result.sanitizedValue,
      },
    });
  }

  /**
   * 脱敏日志值
   */
  private sanitizeForLog(value: string): string {
    if (value.length <= 100) {
      // 替换潜在的敏感内容
      return value.replace(/[<>'"&;|`$]/g, '?');
    }
    return value.slice(0, 50).replace(/[<>'"&;|`$]/g, '?') + '...(truncated)';
  }

  /**
   * 获取检测统计信息
   */
  getPatternStatistics(): {
    totalPatterns: number;
    byType: Record<InjectionType, number>;
    byRiskLevel: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};

    for (const pattern of ALL_PATTERNS) {
      byType[pattern.type] = (byType[pattern.type] || 0) + 1;
      byRiskLevel[pattern.riskLevel] = (byRiskLevel[pattern.riskLevel] || 0) + 1;
    }

    return {
      totalPatterns: ALL_PATTERNS.length,
      byType: byType as Record<InjectionType, number>,
      byRiskLevel,
    };
  }
}
