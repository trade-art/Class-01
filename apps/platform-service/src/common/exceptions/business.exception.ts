import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorCodes, ErrorMessages } from './error-codes';

/**
 * 业务异常选项
 */
export interface BusinessExceptionOptions {
  /** 错误码 */
  code: ErrorCode;
  /** 自定义消息 (覆盖默认消息) */
  message?: string;
  /** HTTP 状态码 (从错误码自动推断) */
  status?: HttpStatus;
  /** 详细信息 */
  details?: Record<string, any>;
}

/**
 * 业务异常类
 * 支持自定义错误码，与 HttpExceptionFilter 配合使用
 */
export class BusinessException extends HttpException {
  constructor(options: BusinessExceptionOptions) {
    const { code, message, status, details } = options;

    // 从错误码推断 HTTP 状态码
    const httpStatus = status || BusinessException.getStatusFromCode(code);

    // 获取消息 (优先使用自定义消息)
    const errorMessage = message || ErrorMessages[code] || 'Unknown error';

    super(
      {
        code,
        message: errorMessage,
        details,
      },
      httpStatus,
    );
  }

  /**
   * 从错误码推断 HTTP 状态码
   * 错误码格式: MODULE_HTTP_SEQ
   */
  private static getStatusFromCode(code: string): HttpStatus {
    const match = code.match(/_(\d{3})_/);
    if (match) {
      const statusCode = parseInt(match[1], 10);
      if (Object.values(HttpStatus).includes(statusCode)) {
        return statusCode as HttpStatus;
      }
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * 创建认证错误
   */
  static unauthorized(
    code: ErrorCode = ErrorCodes.AUTH_401_001,
    message?: string,
    details?: Record<string, any>,
  ): BusinessException {
    return new BusinessException({
      code,
      message,
      status: HttpStatus.UNAUTHORIZED,
      details,
    });
  }

  /**
   * 创建禁止访问错误
   */
  static forbidden(
    code: ErrorCode = ErrorCodes.AUTH_403_003,
    message?: string,
    details?: Record<string, any>,
  ): BusinessException {
    return new BusinessException({
      code,
      message,
      status: HttpStatus.FORBIDDEN,
      details,
    });
  }

  /**
   * 创建资源不存在错误
   */
  static notFound(
    code: ErrorCode = ErrorCodes.NOT_FOUND_404_001,
    message?: string,
    details?: Record<string, any>,
  ): BusinessException {
    return new BusinessException({
      code,
      message,
      status: HttpStatus.NOT_FOUND,
      details,
    });
  }

  /**
   * 创建资源冲突错误
   */
  static conflict(
    code: ErrorCode,
    message?: string,
    details?: Record<string, any>,
  ): BusinessException {
    return new BusinessException({
      code,
      message,
      status: HttpStatus.CONFLICT,
      details,
    });
  }

  /**
   * 创建业务验证错误
   */
  static unprocessable(
    code: ErrorCode,
    message?: string,
    details?: Record<string, any>,
  ): BusinessException {
    return new BusinessException({
      code,
      message,
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }

  /**
   * 创建参数验证错误
   */
  static badRequest(
    code: ErrorCode = ErrorCodes.VALIDATION_400_001,
    message?: string,
    details?: Record<string, any>,
  ): BusinessException {
    return new BusinessException({
      code,
      message,
      status: HttpStatus.BAD_REQUEST,
      details,
    });
  }

  /**
   * 创建内部错误
   */
  static internal(
    code: ErrorCode = ErrorCodes.INTERNAL_500_001,
    message?: string,
    details?: Record<string, any>,
  ): BusinessException {
    return new BusinessException({
      code,
      message,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      details,
    });
  }
}
