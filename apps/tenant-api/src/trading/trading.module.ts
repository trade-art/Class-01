import { Module } from '@nestjs/common';
import { TradingController } from './trading.controller';

/**
 * 交易模块
 * 提供统一的交易 API，支持 MT5/MT4 多平台
 *
 * 注意：TradingService 已在 MiddlewareProxyModule 中提供（全局模块），
 * 因此这里不需要重复引入
 */
@Module({
  controllers: [TradingController],
})
export class TradingModule {}
