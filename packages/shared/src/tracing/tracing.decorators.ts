/**
 * 追踪装饰器
 * 提供方法级别的追踪注解
 */

import { TracingService, SpanAttributes } from './tracing.service';

/**
 * 追踪服务实例存储
 */
let tracingServiceInstance: TracingService | null = null;

/**
 * 设置追踪服务实例
 */
export function setTracingService(service: TracingService): void {
  tracingServiceInstance = service;
}

/**
 * 获取追踪服务实例
 */
export function getTracingService(): TracingService | null {
  return tracingServiceInstance;
}

/**
 * @Traced 装饰器选项
 */
export interface TracedOptions {
  /** Span 名称（默认使用方法名） */
  name?: string;
  /** 附加属性 */
  attributes?: SpanAttributes;
  /** 是否记录参数 */
  recordArgs?: boolean;
  /** 是否记录返回值 */
  recordResult?: boolean;
  /** 参数名称列表（用于记录参数） */
  argNames?: string[];
}

/**
 * @Traced 方法装饰器
 * 自动为方法创建追踪 Span
 *
 * @example
 * ```typescript
 * class UserService {
 *   @Traced({ name: 'getUserById', recordArgs: true })
 *   async getUser(id: string) {
 *     // ...
 *   }
 * }
 * ```
 */
export function Traced(options: TracedOptions = {}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const methodName = String(propertyKey);
    const className = target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      const tracingService = getTracingService();

      // 如果追踪服务不可用，直接执行原方法
      if (!tracingService || !tracingService.isEnabled()) {
        return originalMethod.apply(this, args);
      }

      const spanName = options.name || `${className}.${methodName}`;
      const attributes: SpanAttributes = {
        'code.function': methodName,
        'code.namespace': className,
        ...options.attributes,
      };

      // 记录参数
      if (options.recordArgs && args.length > 0) {
        const argNames = options.argNames || args.map((_, i) => `arg${i}`);
        args.forEach((arg, i) => {
          const argName = argNames[i] || `arg${i}`;
          try {
            const argValue = typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            attributes[`arg.${argName}`] = argValue.substring(0, 200);
          } catch {
            attributes[`arg.${argName}`] = '[Unable to serialize]';
          }
        });
      }

      return tracingService.withSpan(spanName, async (span) => {
        const result = await originalMethod.apply(this, args);

        // 记录返回值
        if (options.recordResult && result !== undefined) {
          try {
            const resultValue = typeof result === 'object' ? JSON.stringify(result) : String(result);
            span.setAttribute('result', resultValue.substring(0, 500));
          } catch {
            span.setAttribute('result', '[Unable to serialize]');
          }
        }

        return result;
      }, attributes);
    };

    return descriptor;
  };
}

/**
 * @TracedSync 同步方法装饰器
 * 自动为同步方法创建追踪 Span
 */
export function TracedSync(options: TracedOptions = {}): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const methodName = String(propertyKey);
    const className = target.constructor.name;

    descriptor.value = function (...args: any[]) {
      const tracingService = getTracingService();

      // 如果追踪服务不可用，直接执行原方法
      if (!tracingService || !tracingService.isEnabled()) {
        return originalMethod.apply(this, args);
      }

      const spanName = options.name || `${className}.${methodName}`;
      const attributes: SpanAttributes = {
        'code.function': methodName,
        'code.namespace': className,
        ...options.attributes,
      };

      // 记录参数
      if (options.recordArgs && args.length > 0) {
        const argNames = options.argNames || args.map((_, i) => `arg${i}`);
        args.forEach((arg, i) => {
          const argName = argNames[i] || `arg${i}`;
          try {
            const argValue = typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            attributes[`arg.${argName}`] = argValue.substring(0, 200);
          } catch {
            attributes[`arg.${argName}`] = '[Unable to serialize]';
          }
        });
      }

      return tracingService.withSpanSync(spanName, (span) => {
        const result = originalMethod.apply(this, args);

        // 记录返回值
        if (options.recordResult && result !== undefined) {
          try {
            const resultValue = typeof result === 'object' ? JSON.stringify(result) : String(result);
            span.setAttribute('result', resultValue.substring(0, 500));
          } catch {
            span.setAttribute('result', '[Unable to serialize]');
          }
        }

        return result;
      }, attributes);
    };

    return descriptor;
  };
}

/**
 * @SpanAttribute 参数装饰器
 * 标记参数为 Span 属性
 */
export function SpanAttribute(name?: string): ParameterDecorator {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    if (propertyKey === undefined) {
      return;
    }

    const existingAttributes: Map<number, string> =
      Reflect.getOwnMetadata('tracing:spanAttributes', target, propertyKey) || new Map();

    existingAttributes.set(parameterIndex, name || `param${parameterIndex}`);

    Reflect.defineMetadata('tracing:spanAttributes', existingAttributes, target, propertyKey);
  };
}
