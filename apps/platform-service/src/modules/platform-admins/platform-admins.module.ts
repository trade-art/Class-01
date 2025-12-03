import { Module } from '@nestjs/common';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformAdminsController } from './platform-admins.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PlatformAdminsController],
  providers: [PlatformAdminsService],
  exports: [PlatformAdminsService],
})
export class PlatformAdminsModule {}
