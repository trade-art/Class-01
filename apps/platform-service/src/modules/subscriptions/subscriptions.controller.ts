import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import {
  UpdateSubscriptionDto,
  SubscriptionStatusDto,
  SubscriptionChangePreviewDto,
  SubscriptionQueryDto,
  SubscriptionPlan,
  PlanConfigDto,
} from './dto/subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ==================== 计划配置 ====================

  @Get('plans')
  @ApiOperation({ summary: '获取所有订阅计划配置' })
  @ApiResponse({ status: 200, description: '订阅计划列表', type: [PlanConfigDto] })
  getPlanConfigs() {
    return this.subscriptionsService.getPlanConfigs();
  }

  @Get('plans/:plan')
  @ApiOperation({ summary: '获取指定计划配置' })
  @ApiParam({ name: 'plan', enum: SubscriptionPlan })
  @ApiResponse({ status: 200, description: '计划配置详情', type: PlanConfigDto })
  getPlanConfig(@Param('plan') plan: SubscriptionPlan) {
    return this.subscriptionsService.getPlanConfig(plan);
  }

  // ==================== 订阅列表与统计 ====================

  @Get()
  @ApiOperation({ summary: '获取所有租户订阅列表' })
  @ApiResponse({ status: 200, description: '订阅列表' })
  listSubscriptions(@Query() query: SubscriptionQueryDto) {
    return this.subscriptionsService.listSubscriptions(query);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取订阅统计数据' })
  @ApiResponse({ status: 200, description: '订阅统计' })
  getStats() {
    return this.subscriptionsService.getSubscriptionStats();
  }

  // ==================== 租户订阅管理 ====================

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: '获取租户订阅状态' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '订阅状态', type: SubscriptionStatusDto })
  getSubscriptionStatus(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.getSubscriptionStatus(tenantId);
  }

  @Get('tenant/:tenantId/preview/:targetPlan')
  @ApiOperation({ summary: '预览订阅变更' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiParam({ name: 'targetPlan', enum: SubscriptionPlan })
  @ApiResponse({ status: 200, description: '变更预览', type: SubscriptionChangePreviewDto })
  previewChange(
    @Param('tenantId') tenantId: string,
    @Param('targetPlan') targetPlan: SubscriptionPlan,
  ) {
    return this.subscriptionsService.previewSubscriptionChange(tenantId, targetPlan);
  }

  @Post('tenant/:tenantId')
  @ApiOperation({ summary: '更新租户订阅' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '更新后的订阅状态', type: SubscriptionStatusDto })
  updateSubscription(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.updateSubscription(tenantId, dto);
  }

  @Post('tenant/:tenantId/renew')
  @ApiOperation({ summary: '续订租户订阅' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '续订后的订阅状态', type: SubscriptionStatusDto })
  renewSubscription(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.renewSubscription(tenantId);
  }
}
