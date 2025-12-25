import { Injectable, HttpStatus } from '@nestjs/common';
import { BusinessException, ErrorCodes, ErrorCode } from '../../common';

/**
 * MT5 中间件响应格式
 * 中间件返回的原始响应结构
 *
 * 注意：中间件有两种响应格式：
 * 1. 传统格式: { code: 0, data: {...}, message: "...", timestamp: ... }
 * 2. 新格式: { success: true, data: {...} }
 *
 * 需要兼容两种格式
 */
export interface MiddlewareRawResponse<T = unknown> {
  /** 状态码: 0=成功, >0=错误 (传统格式) */
  code?: number;
  /** 消息说明 */
  message?: string;
  /** 响应数据 */
  data: T;
  /** 时间戳 (Unix milliseconds) */
  timestamp?: number;
  /** 成功标志 (新格式) */
  success?: boolean;
  /** 错误信息 (新格式错误响应) */
  error?: {
    type?: string;
    detail?: string;
  };
}

/**
 * 平台统一响应格式 - 成功
 */
export interface PlatformSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * 平台统一响应格式 - 错误
 */
export interface PlatformErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

/**
 * 平台统一响应格式
 */
export type PlatformResponse<T = unknown> =
  | PlatformSuccessResponse<T>
  | PlatformErrorResponse;

/**
 * 中间件错误码到平台错误码的映射
 */
interface ErrorMapping {
  /** HTTP 状态码 */
  httpStatus: HttpStatus;
  /** 平台错误码 */
  errorCode: ErrorCode;
  /** 默认错误消息 */
  defaultMessage: string;
}

/**
 * 中间件错误码常量
 * 来自 MT5-middleware 的错误码定义
 */
export const MiddlewareErrorCodes = {
  /** 成功 (中间件实际返回 0，旧版本返回 1000) */
  SUCCESS: 0,
  /** 成功 (旧版本兼容) */
  SUCCESS_LEGACY: 1000,
  /** 成功 (HTTP 200 风格，部分端点使用) */
  SUCCESS_HTTP_200: 200,

  // === 参数验证错误 (1001-1099) ===
  /** 参数验证失败 */
  VALIDATION_ERROR: 1001,
  /** 资源未找到 */
  NOT_FOUND: 1002,
  /** 无效的请求格式 */
  INVALID_REQUEST: 1003,

  // === 认证授权错误 (2001-2099) ===
  /** 未认证 */
  UNAUTHORIZED: 2001,
  /** 权限不足 */
  FORBIDDEN: 2002,
  /** Token 过期 */
  TOKEN_EXPIRED: 2003,
  /** 无效的 Token */
  INVALID_TOKEN: 2004,

  // === MT5 连接错误 (3001-3099) ===
  /** MT5 连接失败 */
  MT5_CONNECTION_FAILED: 3001,
  /** MT5 操作失败 */
  MT5_OPERATION_FAILED: 3002,
  /** MT5 服务器错误 */
  MT5_SERVER_ERROR: 3003,
  /** MT5 认证失败 */
  MT5_AUTH_FAILED: 3004,

  // === 数据库错误 (4001-4099) ===
  /** 数据库错误 */
  DATABASE_ERROR: 4001,
  /** 数据库连接失败 */
  DATABASE_CONNECTION_FAILED: 4002,

  // === 系统错误 (5001-5099) ===
  /** 内部错误 */
  INTERNAL_ERROR: 5001,
  /** 服务暂不可用 */
  SERVICE_UNAVAILABLE: 5002,
  /** 请求超时 */
  REQUEST_TIMEOUT: 5003,
} as const;

/**
 * 响应转换器
 * 负责将 MT5 中间件响应格式转换为平台统一格式
 */
@Injectable()
export class ResponseTransformer {
  /**
   * 中间件错误码到平台错误的映射表
   */
  private readonly errorMappings: Map<number, ErrorMapping> = new Map([
    // 参数验证错误
    [
      MiddlewareErrorCodes.VALIDATION_ERROR,
      {
        httpStatus: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.VALIDATION_400_001,
        defaultMessage: '请求参数验证失败',
      },
    ],
    [
      MiddlewareErrorCodes.NOT_FOUND,
      {
        httpStatus: HttpStatus.NOT_FOUND,
        errorCode: ErrorCodes.NOT_FOUND_404_001,
        defaultMessage: '请求的资源不存在',
      },
    ],
    [
      MiddlewareErrorCodes.INVALID_REQUEST,
      {
        httpStatus: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.VALIDATION_400_002,
        defaultMessage: '无效的请求格式',
      },
    ],

    // 认证授权错误
    [
      MiddlewareErrorCodes.UNAUTHORIZED,
      {
        httpStatus: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.AUTH_401_001,
        defaultMessage: '未认证，请先登录',
      },
    ],
    [
      MiddlewareErrorCodes.FORBIDDEN,
      {
        httpStatus: HttpStatus.FORBIDDEN,
        errorCode: ErrorCodes.AUTH_403_002,
        defaultMessage: '权限不足，无法执行此操作',
      },
    ],
    [
      MiddlewareErrorCodes.TOKEN_EXPIRED,
      {
        httpStatus: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.AUTH_401_002,
        defaultMessage: 'Token 已过期，请重新登录',
      },
    ],
    [
      MiddlewareErrorCodes.INVALID_TOKEN,
      {
        httpStatus: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.AUTH_401_002,
        defaultMessage: '无效的 Token',
      },
    ],

    // MT5 连接错误
    [
      MiddlewareErrorCodes.MT5_CONNECTION_FAILED,
      {
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: ErrorCodes.INSTANCE_503_001,
        defaultMessage: 'MT5 服务器连接失败',
      },
    ],
    [
      MiddlewareErrorCodes.MT5_OPERATION_FAILED,
      {
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCodes.MIDDLEWARE_500_001,
        defaultMessage: 'MT5 操作执行失败',
      },
    ],
    [
      MiddlewareErrorCodes.MT5_SERVER_ERROR,
      {
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCodes.MIDDLEWARE_500_003,
        defaultMessage: 'MT5 服务器错误',
      },
    ],
    [
      MiddlewareErrorCodes.MT5_AUTH_FAILED,
      {
        httpStatus: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.AUTH_401_001,
        defaultMessage: 'MT5 认证失败',
      },
    ],

    // 数据库错误
    [
      MiddlewareErrorCodes.DATABASE_ERROR,
      {
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCodes.INTERNAL_500_002,
        defaultMessage: '数据库操作失败',
      },
    ],
    [
      MiddlewareErrorCodes.DATABASE_CONNECTION_FAILED,
      {
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: ErrorCodes.INSTANCE_503_001,
        defaultMessage: '数据库连接失败',
      },
    ],

    // 系统错误
    [
      MiddlewareErrorCodes.INTERNAL_ERROR,
      {
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCodes.INTERNAL_500_001,
        defaultMessage: '服务器内部错误',
      },
    ],
    [
      MiddlewareErrorCodes.SERVICE_UNAVAILABLE,
      {
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: ErrorCodes.INSTANCE_503_001,
        defaultMessage: '服务暂不可用',
      },
    ],
    [
      MiddlewareErrorCodes.REQUEST_TIMEOUT,
      {
        httpStatus: HttpStatus.GATEWAY_TIMEOUT,
        errorCode: ErrorCodes.MIDDLEWARE_504_001,
        defaultMessage: '请求超时',
      },
    ],
  ]);

  /**
   * 转换中间件响应为平台格式
   * @param response 中间件原始响应
   * @returns 平台格式响应数据
   * @throws BusinessException 当中间件返回错误时
   */
  transform<T>(response: MiddlewareRawResponse<T>): T {
    // 处理 null 或 undefined 响应
    if (!response) {
      throw new BusinessException({
        code: ErrorCodes.MIDDLEWARE_500_002,
        message: '中间件响应为空',
      });
    }

    // 检查响应是否成功 (兼容两种格式)
    if (this.isSuccessResponse(response)) {
      return response.data;
    }

    // 错误响应 - 转换为 BusinessException
    this.throwMappedException(response);
  }

  /**
   * 检查响应是否成功
   * 兼容两种中间件响应格式：
   * 1. 传统格式: { code: 0, data: {...} }
   * 2. 新格式: { success: true, data: {...} }
   * @param response 中间件响应
   * @returns 是否成功
   */
  private isSuccessResponse(response: MiddlewareRawResponse<unknown>): boolean {
    // 新格式: 检查 success 字段
    if (response.success === true) {
      return true;
    }

    // 传统格式: 检查 code 字段
    if (response.code !== undefined) {
      return this.isSuccessCode(response.code);
    }

    // 如果有 data 但没有 code 也没有 success，检查是否有 error 字段
    // 没有 error 字段且有 data 则认为成功
    if (response.data !== undefined && !response.error) {
      return true;
    }

    return false;
  }

  /**
   * 检查是否为成功状态码 (传统格式)
   * @param code 响应码
   * @returns 是否成功
   */
  private isSuccessCode(code: number): boolean {
    return (
      code === MiddlewareErrorCodes.SUCCESS ||
      code === MiddlewareErrorCodes.SUCCESS_LEGACY ||
      code === MiddlewareErrorCodes.SUCCESS_HTTP_200
    );
  }

  /**
   * 转换中间件响应为平台完整响应格式
   * 用于需要完整响应结构的场景
   * @param response 中间件原始响应
   * @returns 平台格式完整响应
   */
  transformToFullResponse<T>(
    response: MiddlewareRawResponse<T>,
  ): PlatformResponse<T> {
    // 处理 null 或 undefined 响应
    if (!response) {
      return {
        success: false,
        error: {
          code: ErrorCodes.MIDDLEWARE_500_002,
          message: '中间件响应为空',
        },
      };
    }

    // 成功响应 (兼容两种格式)
    if (this.isSuccessResponse(response)) {
      return {
        success: true,
        data: response.data,
      };
    }

    // 错误响应
    const mapping = this.getErrorMapping(response.code ?? 0);
    return {
      success: false,
      error: {
        code: mapping.errorCode,
        message: response.message || response.error?.detail || mapping.defaultMessage,
      },
    };
  }

  /**
   * 检查中间件响应是否成功
   * @param response 中间件原始响应
   * @returns 是否成功
   */
  isSuccess(response: MiddlewareRawResponse<unknown>): boolean {
    return response ? this.isSuccessResponse(response) : false;
  }

  /**
   * 获取错误映射
   * @param code 中间件错误码
   * @returns 错误映射信息
   */
  getErrorMapping(code: number): ErrorMapping {
    const mapping = this.errorMappings.get(code);

    if (mapping) {
      return mapping;
    }

    // 根据错误码范围推断错误类型
    if (code >= 1001 && code < 2000) {
      return {
        httpStatus: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCodes.VALIDATION_400_001,
        defaultMessage: '请求参数错误',
      };
    }

    if (code >= 2001 && code < 3000) {
      return {
        httpStatus: HttpStatus.UNAUTHORIZED,
        errorCode: ErrorCodes.AUTH_401_001,
        defaultMessage: '认证失败',
      };
    }

    if (code >= 3001 && code < 4000) {
      return {
        httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: ErrorCodes.INSTANCE_503_001,
        defaultMessage: 'MT5 服务错误',
      };
    }

    if (code >= 4001 && code < 5000) {
      return {
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCodes.INTERNAL_500_002,
        defaultMessage: '数据库错误',
      };
    }

    // 默认为内部错误
    return {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCodes.MIDDLEWARE_500_002,
      defaultMessage: '中间件服务错误',
    };
  }

  /**
   * 抛出映射后的业务异常
   * @param response 中间件错误响应
   * @throws BusinessException
   */
  private throwMappedException(response: MiddlewareRawResponse<unknown>): never {
    const mapping = this.getErrorMapping(response.code ?? 0);

    throw new BusinessException({
      code: mapping.errorCode,
      message: response.message || response.error?.detail || mapping.defaultMessage,
      status: mapping.httpStatus,
      details: {
        middlewareCode: response.code,
        timestamp: response.timestamp,
      },
    });
  }

  /**
   * 将 HTTP 状态码转换为中间件错误码范围
   * 用于反向映射 (平台 → 中间件)
   * @param httpStatus HTTP 状态码
   * @returns 中间件错误码范围起始值
   */
  getMiddlewareCodeRangeFromHttpStatus(httpStatus: HttpStatus): number {
    switch (httpStatus) {
      case HttpStatus.BAD_REQUEST:
        return 1000; // 1001-1099
      case HttpStatus.UNAUTHORIZED:
        return 2000; // 2001-2099
      case HttpStatus.FORBIDDEN:
        return 2000; // 2001-2099
      case HttpStatus.NOT_FOUND:
        return 1000; // 1002
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 3000; // 3001-3099 或 5002
      case HttpStatus.GATEWAY_TIMEOUT:
        return 5000; // 5003
      default:
        return 5000; // 5001-5099
    }
  }
}
