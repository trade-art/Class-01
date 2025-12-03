import { Module } from '@nestjs/common';
import { TenantAdminsService } from './tenant-admins.service';
import { TenantAdminsController } from './tenant-admins.controller';

@Module({
  controllers: [TenantAdminsController],
  providers: [TenantAdminsService],
  exports: [TenantAdminsService],
})
export class TenantAdminsModule {}
