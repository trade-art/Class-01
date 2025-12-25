import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { MiddlewareIntegrationModule } from '../middleware-integration/middleware-integration.module';

@Module({
  imports: [MiddlewareIntegrationModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
