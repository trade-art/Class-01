import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TradingDataService } from './trading-data.service';
import { TradingDataController } from './trading-data.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
  ],
  controllers: [TradingDataController],
  providers: [TradingDataService],
  exports: [TradingDataService],
})
export class TradingDataModule {}
