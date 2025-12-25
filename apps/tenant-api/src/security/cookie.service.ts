/**
 * Cookie 服务
 * 处理安全 Cookie 的设置、读取和清除
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import {
  getCookieConfig,
  getClearCookieOptions,
  CookieConfigType,
  SecureCookieOptions,
} from './cookie.config';

@Injectable()
export class CookieService {
  private readonly logger = new Logger(CookieService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * 设置 Refresh Token Cookie
   * @param res Express Response 对象
   * @param refreshToken Refresh Token 值
   */
  setRefreshTokenCookie(res: Response, refreshToken: string): void {
    const config = this.getConfiguredOptions('refresh');

    this.setCookie(res, config.name, refreshToken, config);
    this.logger.debug(`Set refresh token cookie: ${config.name}`);
  }

  /**
   * 从请求中获取 Refresh Token
   * @param req Express Request 对象
   */
  getRefreshTokenFromCookie(req: Request): string | undefined {
    const config = getCookieConfig('refresh');
    return req.cookies?.[config.name];
  }

  /**
   * 清除 Refresh Token Cookie
   * @param res Express Response 对象
   */
  clearRefreshTokenCookie(res: Response): void {
    const config = getCookieConfig('refresh');
    res.clearCookie(config.name, getClearCookieOptions(config));
    this.logger.debug(`Cleared refresh token cookie: ${config.name}`);
  }

  /**
   * 设置 Session Cookie
   * @param res Express Response 对象
   * @param sessionId Session ID
   */
  setSessionCookie(res: Response, sessionId: string): void {
    const config = this.getConfiguredOptions('session');

    this.setCookie(res, config.name, sessionId, config);
    this.logger.debug(`Set session cookie: ${config.name}`);
  }

  /**
   * 从请求中获取 Session ID
   * @param req Express Request 对象
   */
  getSessionFromCookie(req: Request): string | undefined {
    const config = getCookieConfig('session');
    return req.cookies?.[config.name];
  }

  /**
   * 清除 Session Cookie
   * @param res Express Response 对象
   */
  clearSessionCookie(res: Response): void {
    const config = getCookieConfig('session');
    res.clearCookie(config.name, getClearCookieOptions(config));
    this.logger.debug(`Cleared session cookie: ${config.name}`);
  }

  /**
   * 设置 CSRF Token Cookie
   * @param res Express Response 对象
   * @param csrfToken CSRF Token
   */
  setCsrfTokenCookie(res: Response, csrfToken: string): void {
    const config = this.getConfiguredOptions('csrf');

    this.setCookie(res, config.name, csrfToken, config);
    this.logger.debug(`Set CSRF token cookie: ${config.name}`);
  }

  /**
   * 从请求中获取 CSRF Token
   * @param req Express Request 对象
   */
  getCsrfTokenFromCookie(req: Request): string | undefined {
    const config = getCookieConfig('csrf');
    return req.cookies?.[config.name];
  }

  /**
   * 清除所有认证相关 Cookie
   * @param res Express Response 对象
   */
  clearAllAuthCookies(res: Response): void {
    this.clearRefreshTokenCookie(res);
    this.clearSessionCookie(res);

    const csrfConfig = getCookieConfig('csrf');
    res.clearCookie(csrfConfig.name, getClearCookieOptions(csrfConfig));

    this.logger.debug('Cleared all auth cookies');
  }

  /**
   * 通用设置 Cookie 方法
   * @param res Express Response 对象
   * @param name Cookie 名称
   * @param value Cookie 值
   * @param options Cookie 选项
   */
  private setCookie(
    res: Response,
    name: string,
    value: string,
    options: SecureCookieOptions,
  ): void {
    // 移除自定义属性
    const { name: _name, secureInProductionOnly, ...cookieOptions } = options;

    res.cookie(name, value, cookieOptions);
  }

  /**
   * 获取配置化的 Cookie 选项
   * 从 ConfigService 读取可能的覆盖值
   */
  private getConfiguredOptions(type: CookieConfigType): SecureCookieOptions {
    const baseConfig = getCookieConfig(type);

    // 从配置中读取可能的覆盖
    const domain = this.configService.get<string>('cookie.domain');
    const secure = this.configService.get<boolean>('cookie.secure');

    if (domain) {
      baseConfig.domain = domain;
    }

    if (secure !== undefined) {
      baseConfig.secure = secure;
    }

    return baseConfig;
  }
}
