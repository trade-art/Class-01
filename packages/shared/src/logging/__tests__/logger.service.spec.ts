/**
 * 结构化日志服务单元测试
 */

import { StructuredLoggerService, LoggerConfig, LogContext } from '../logger.service';

describe('StructuredLoggerService', () => {
  let logger: StructuredLoggerService;

  beforeEach(() => {
    logger = new StructuredLoggerService({
      serviceName: 'test-service',
      level: 'debug',
      prettyPrint: false,
    });
  });

  describe('基础日志功能', () => {
    it('应该正确创建日志记录器', () => {
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(StructuredLoggerService);
    });

    it('应该支持 log 方法', () => {
      expect(() => logger.log('测试消息')).not.toThrow();
    });

    it('应该支持 error 方法', () => {
      expect(() => logger.error('错误消息', 'stack trace')).not.toThrow();
    });

    it('应该支持 warn 方法', () => {
      expect(() => logger.warn('警告消息')).not.toThrow();
    });

    it('应该支持 debug 方法', () => {
      expect(() => logger.debug('调试消息')).not.toThrow();
    });

    it('应该支持 verbose 方法', () => {
      expect(() => logger.verbose('详细消息')).not.toThrow();
    });

    it('应该支持 fatal 方法', () => {
      expect(() => logger.fatal('致命错误')).not.toThrow();
    });
  });

  describe('上下文管理', () => {
    it('应该支持设置上下文', () => {
      const context: LogContext = {
        requestId: 'req-123',
        tenantId: 'tenant-456',
        userId: 'user-789',
      };

      logger.setContext(context);
      expect(() => logger.log('带上下文的消息')).not.toThrow();
    });

    it('应该支持清除上下文', () => {
      logger.setContext({ requestId: 'req-123' });
      logger.clearContext();
      expect(() => logger.log('清除上下文后的消息')).not.toThrow();
    });

    it('应该支持子日志记录器', () => {
      const childLogger = logger.child({
        module: 'TestModule',
        operation: 'testOperation',
      });

      expect(childLogger).toBeDefined();
      // child 返回的是 pino Logger，使用 info 方法
      expect(() => childLogger.info('子日志记录器消息')).not.toThrow();
    });
  });

  describe('HTTP 请求日志', () => {
    it('应该正确记录 HTTP 请求', () => {
      expect(() =>
        logger.logHttpRequest({
          method: 'GET',
          path: '/api/users',
          statusCode: 200,
          duration: 150,
          ip: '127.0.0.1',
          userAgent: 'Test Agent',
        }),
      ).not.toThrow();
    });

    it('应该处理带租户信息的 HTTP 请求', () => {
      expect(() =>
        logger.logHttpRequest({
          method: 'POST',
          path: '/api/orders',
          statusCode: 201,
          duration: 300,
          tenantId: 'tenant-123',
          userId: 'user-456',
        }),
      ).not.toThrow();
    });

    it('应该正确记录带错误的 HTTP 请求', () => {
      const error = new Error('Request failed');
      expect(() =>
        logger.logHttpRequest({
          method: 'GET',
          path: '/api/error',
          statusCode: 500,
          duration: 100,
          error,
        }),
      ).not.toThrow();
    });
  });

  describe('数据库查询日志', () => {
    it('应该正确记录成功的数据库查询', () => {
      expect(() =>
        logger.logDbQuery({
          query: 'SELECT * FROM users WHERE id = $1',
          duration: 50,
          params: ['user-123'],
        }),
      ).not.toThrow();
    });

    it('应该正确记录失败的数据库查询', () => {
      const error = new Error('Connection timeout');
      expect(() =>
        logger.logDbQuery({
          query: 'SELECT * FROM orders',
          duration: 5000,
          error,
        }),
      ).not.toThrow();
    });

    it('应该警告慢查询', () => {
      expect(() =>
        logger.logDbQuery({
          query: 'SELECT * FROM large_table',
          duration: 1500, // 超过 1000ms 阈值
        }),
      ).not.toThrow();
    });
  });

  describe('业务事件日志', () => {
    it('应该正确记录业务事件', () => {
      expect(() =>
        logger.logBusinessEvent({
          type: 'order',
          action: 'created',
          entityId: 'order-123',
          tenantId: 'tenant-456',
          data: { amount: 1000 },
        }),
      ).not.toThrow();
    });

    it('应该正确记录不带可选参数的业务事件', () => {
      expect(() =>
        logger.logBusinessEvent({
          type: 'user',
          action: 'login',
        }),
      ).not.toThrow();
    });
  });

  describe('安全事件日志', () => {
    it('应该正确记录低严重性安全事件', () => {
      expect(() =>
        logger.logSecurityEvent({
          type: 'authentication',
          severity: 'low',
          description: '普通登录尝试',
          userId: 'user-123',
          ip: '192.168.1.100',
        }),
      ).not.toThrow();
    });

    it('应该正确记录高严重性安全事件', () => {
      expect(() =>
        logger.logSecurityEvent({
          type: 'intrusion',
          severity: 'critical',
          description: '检测到 SQL 注入尝试',
          ip: '10.0.0.1',
          data: { payload: 'SELECT * FROM users--' },
        }),
      ).not.toThrow();
    });

    it('应该支持所有严重性级别', () => {
      const severities: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low',
        'medium',
        'high',
        'critical',
      ];

      severities.forEach((severity) => {
        expect(() =>
          logger.logSecurityEvent({
            type: 'test',
            severity,
            description: `${severity} 级别事件`,
          }),
        ).not.toThrow();
      });
    });
  });

  describe('配置验证', () => {
    it('应该使用默认配置创建日志记录器', () => {
      const defaultLogger = new StructuredLoggerService();
      expect(defaultLogger).toBeDefined();
    });

    it('应该正确处理自定义配置', () => {
      const customConfig: LoggerConfig = {
        serviceName: 'custom-service',
        level: 'warn',
        prettyPrint: false,
        redactFields: ['password', 'token'],
      };

      const customLogger = new StructuredLoggerService(customConfig);
      expect(customLogger).toBeDefined();
    });

    it('应该获取原始 pino logger', () => {
      const pinoLogger = logger.getPinoLogger();
      expect(pinoLogger).toBeDefined();
    });
  });
});
