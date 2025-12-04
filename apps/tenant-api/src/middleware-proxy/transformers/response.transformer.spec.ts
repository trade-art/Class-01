import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import {
  ResponseTransformer,
  MiddlewareRawResponse,
  MiddlewareErrorCodes,
} from './response.transformer';
import { BusinessException, ErrorCodes } from '../../common';

describe('ResponseTransformer', () => {
  let transformer: ResponseTransformer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponseTransformer],
    }).compile();

    transformer = module.get<ResponseTransformer>(ResponseTransformer);
  });

  it('should be defined', () => {
    expect(transformer).toBeDefined();
  });

  describe('transform', () => {
    it('成功响应应返回数据', () => {
      const response: MiddlewareRawResponse<{ result: string }> = {
        code: MiddlewareErrorCodes.SUCCESS,
        message: 'success',
        data: { result: 'test' },
        timestamp: Date.now(),
      };

      const result = transformer.transform(response);

      expect(result).toEqual({ result: 'test' });
    });

    it('null 响应应抛出 BusinessException', () => {
      expect(() => transformer.transform(null as any)).toThrow(BusinessException);
    });

    it('undefined 响应应抛出 BusinessException', () => {
      expect(() => transformer.transform(undefined as any)).toThrow(BusinessException);
    });

    it('成功响应但数据为 null 应返回 null', () => {
      const response: MiddlewareRawResponse<null> = {
        code: MiddlewareErrorCodes.SUCCESS,
        message: 'success',
        data: null,
        timestamp: Date.now(),
      };

      const result = transformer.transform(response);

      expect(result).toBeNull();
    });

    it('成功响应但数据为空数组应返回空数组', () => {
      const response: MiddlewareRawResponse<any[]> = {
        code: MiddlewareErrorCodes.SUCCESS,
        message: 'success',
        data: [],
        timestamp: Date.now(),
      };

      const result = transformer.transform(response);

      expect(result).toEqual([]);
    });

    describe('错误码映射', () => {
      it('VALIDATION_ERROR (1001) 应映射到 BAD_REQUEST', () => {
        const response: MiddlewareRawResponse<null> = {
          code: MiddlewareErrorCodes.VALIDATION_ERROR,
          message: '参数验证失败',
          data: null,
          timestamp: Date.now(),
        };

        try {
          transformer.transform(response);
          fail('应抛出异常');
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessException);
          const businessError = error as BusinessException;
          const errorResponse = businessError.getResponse() as { code: string };
          expect(errorResponse.code).toBe(ErrorCodes.VALIDATION_400_001);
        }
      });

      it('NOT_FOUND (1002) 应映射到 NOT_FOUND', () => {
        const response: MiddlewareRawResponse<null> = {
          code: MiddlewareErrorCodes.NOT_FOUND,
          message: '资源不存在',
          data: null,
          timestamp: Date.now(),
        };

        try {
          transformer.transform(response);
          fail('应抛出异常');
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessException);
          const businessError = error as BusinessException;
          const errorResponse = businessError.getResponse() as { code: string };
          expect(errorResponse.code).toBe(ErrorCodes.NOT_FOUND_404_001);
        }
      });

      it('UNAUTHORIZED (2001) 应映射到 UNAUTHORIZED', () => {
        const response: MiddlewareRawResponse<null> = {
          code: MiddlewareErrorCodes.UNAUTHORIZED,
          message: '未认证',
          data: null,
          timestamp: Date.now(),
        };

        try {
          transformer.transform(response);
          fail('应抛出异常');
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessException);
          const businessError = error as BusinessException;
          const errorResponse = businessError.getResponse() as { code: string };
          expect(errorResponse.code).toBe(ErrorCodes.AUTH_401_001);
        }
      });

      it('TOKEN_EXPIRED (2003) 应映射到 AUTH_401_002', () => {
        const response: MiddlewareRawResponse<null> = {
          code: MiddlewareErrorCodes.TOKEN_EXPIRED,
          message: 'Token 已过期',
          data: null,
          timestamp: Date.now(),
        };

        try {
          transformer.transform(response);
          fail('应抛出异常');
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessException);
          const businessError = error as BusinessException;
          const errorResponse = businessError.getResponse() as { code: string };
          expect(errorResponse.code).toBe(ErrorCodes.AUTH_401_002);
        }
      });

      it('MT5_CONNECTION_FAILED (3001) 应映射到 SERVICE_UNAVAILABLE', () => {
        const response: MiddlewareRawResponse<null> = {
          code: MiddlewareErrorCodes.MT5_CONNECTION_FAILED,
          message: 'MT5 连接失败',
          data: null,
          timestamp: Date.now(),
        };

        try {
          transformer.transform(response);
          fail('应抛出异常');
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessException);
          const businessError = error as BusinessException;
          const errorResponse = businessError.getResponse() as { code: string };
          expect(errorResponse.code).toBe(ErrorCodes.INSTANCE_503_001);
        }
      });

      it('INTERNAL_ERROR (5001) 应映射到 INTERNAL_SERVER_ERROR', () => {
        const response: MiddlewareRawResponse<null> = {
          code: MiddlewareErrorCodes.INTERNAL_ERROR,
          message: '服务器内部错误',
          data: null,
          timestamp: Date.now(),
        };

        try {
          transformer.transform(response);
          fail('应抛出异常');
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessException);
          const businessError = error as BusinessException;
          const errorResponse = businessError.getResponse() as { code: string };
          expect(errorResponse.code).toBe(ErrorCodes.INTERNAL_500_001);
        }
      });

      it('REQUEST_TIMEOUT (5003) 应映射到 GATEWAY_TIMEOUT', () => {
        const response: MiddlewareRawResponse<null> = {
          code: MiddlewareErrorCodes.REQUEST_TIMEOUT,
          message: '请求超时',
          data: null,
          timestamp: Date.now(),
        };

        try {
          transformer.transform(response);
          fail('应抛出异常');
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessException);
          const businessError = error as BusinessException;
          const errorResponse = businessError.getResponse() as { code: string };
          expect(errorResponse.code).toBe(ErrorCodes.MIDDLEWARE_504_001);
        }
      });
    });
  });

  describe('transformToFullResponse', () => {
    it('成功响应应返回 success: true', () => {
      const response: MiddlewareRawResponse<{ result: string }> = {
        code: MiddlewareErrorCodes.SUCCESS,
        message: 'success',
        data: { result: 'test' },
        timestamp: Date.now(),
      };

      const result = transformer.transformToFullResponse(response);

      expect(result).toEqual({
        success: true,
        data: { result: 'test' },
      });
    });

    it('错误响应应返回 success: false', () => {
      const response: MiddlewareRawResponse<null> = {
        code: MiddlewareErrorCodes.VALIDATION_ERROR,
        message: '参数错误',
        data: null,
        timestamp: Date.now(),
      };

      const result = transformer.transformToFullResponse(response);

      expect(result.success).toBe(false);
      expect('error' in result).toBe(true);
      if (!result.success) {
        expect(result.error.code).toBe(ErrorCodes.VALIDATION_400_001);
        expect(result.error.message).toBe('参数错误');
      }
    });

    it('null 响应应返回 success: false', () => {
      const result = transformer.transformToFullResponse(null as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ErrorCodes.MIDDLEWARE_500_002);
      }
    });

    it('错误响应使用默认消息当 message 为空', () => {
      const response: MiddlewareRawResponse<null> = {
        code: MiddlewareErrorCodes.NOT_FOUND,
        message: '',
        data: null,
        timestamp: Date.now(),
      };

      const result = transformer.transformToFullResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('请求的资源不存在');
      }
    });
  });

  describe('isSuccess', () => {
    it('code 为 1000 应返回 true', () => {
      const response: MiddlewareRawResponse<null> = {
        code: MiddlewareErrorCodes.SUCCESS,
        message: 'success',
        data: null,
        timestamp: Date.now(),
      };

      expect(transformer.isSuccess(response)).toBe(true);
    });

    it('code 不为 1000 应返回 false', () => {
      const response: MiddlewareRawResponse<null> = {
        code: MiddlewareErrorCodes.VALIDATION_ERROR,
        message: 'error',
        data: null,
        timestamp: Date.now(),
      };

      expect(transformer.isSuccess(response)).toBe(false);
    });

    it('null 响应应返回 false', () => {
      expect(transformer.isSuccess(null as any)).toBe(false);
    });
  });

  describe('getErrorMapping', () => {
    it('已知错误码应返回正确映射', () => {
      const mapping = transformer.getErrorMapping(MiddlewareErrorCodes.UNAUTHORIZED);

      expect(mapping.httpStatus).toBe(HttpStatus.UNAUTHORIZED);
      expect(mapping.errorCode).toBe(ErrorCodes.AUTH_401_001);
    });

    it('未知错误码 1xxx 应映射到 BAD_REQUEST', () => {
      const mapping = transformer.getErrorMapping(1099);

      expect(mapping.httpStatus).toBe(HttpStatus.BAD_REQUEST);
    });

    it('未知错误码 2xxx 应映射到 UNAUTHORIZED', () => {
      const mapping = transformer.getErrorMapping(2099);

      expect(mapping.httpStatus).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('未知错误码 3xxx 应映射到 SERVICE_UNAVAILABLE', () => {
      const mapping = transformer.getErrorMapping(3099);

      expect(mapping.httpStatus).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('未知错误码 4xxx 应映射到 INTERNAL_SERVER_ERROR', () => {
      const mapping = transformer.getErrorMapping(4099);

      expect(mapping.httpStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('完全未知错误码应映射到 INTERNAL_SERVER_ERROR', () => {
      const mapping = transformer.getErrorMapping(9999);

      expect(mapping.httpStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mapping.errorCode).toBe(ErrorCodes.MIDDLEWARE_500_002);
    });
  });

  describe('getMiddlewareCodeRangeFromHttpStatus', () => {
    it('BAD_REQUEST 应返回 1000', () => {
      const range = transformer.getMiddlewareCodeRangeFromHttpStatus(HttpStatus.BAD_REQUEST);
      expect(range).toBe(1000);
    });

    it('UNAUTHORIZED 应返回 2000', () => {
      const range = transformer.getMiddlewareCodeRangeFromHttpStatus(HttpStatus.UNAUTHORIZED);
      expect(range).toBe(2000);
    });

    it('SERVICE_UNAVAILABLE 应返回 3000', () => {
      const range = transformer.getMiddlewareCodeRangeFromHttpStatus(HttpStatus.SERVICE_UNAVAILABLE);
      expect(range).toBe(3000);
    });

    it('GATEWAY_TIMEOUT 应返回 5000', () => {
      const range = transformer.getMiddlewareCodeRangeFromHttpStatus(HttpStatus.GATEWAY_TIMEOUT);
      expect(range).toBe(5000);
    });

    it('未知状态码应返回 5000', () => {
      const range = transformer.getMiddlewareCodeRangeFromHttpStatus(HttpStatus.I_AM_A_TEAPOT);
      expect(range).toBe(5000);
    });
  });
});
