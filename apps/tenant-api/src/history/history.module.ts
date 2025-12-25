import { Module } from '@nestjs/common';
import { CommonModule } from '../common';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

@Module({
  imports: [CommonModule],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
