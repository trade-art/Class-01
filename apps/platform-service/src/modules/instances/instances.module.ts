import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InstancesService } from './instances.service';
import { InstancesController } from './instances.controller';
import { InstanceEventRepository } from './instance-event.repository';
import { MiddlewareIntegrationModule } from '../middleware-integration/middleware-integration.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 3,
    }),
    MiddlewareIntegrationModule,
  ],
  controllers: [InstancesController],
  providers: [InstancesService, InstanceEventRepository],
  exports: [InstancesService, InstanceEventRepository],
})
export class InstancesModule {}
