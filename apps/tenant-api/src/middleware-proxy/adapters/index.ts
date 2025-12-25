// 类型导出
export * from './types';

// 适配器基类
export { TradingPlatformAdapter } from './trading-platform.adapter';

// 具体适配器实现
export { MT5Adapter } from './mt5.adapter';
export { MT4Adapter } from './mt4.adapter';

// 适配器工厂
export { AdapterFactory } from './adapter.factory';
