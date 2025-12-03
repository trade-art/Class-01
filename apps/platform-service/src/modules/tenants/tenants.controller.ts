import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import {
  CreateTenantDto,
  UpdateTenantDto,
  UpdateBrandingDto,
  TenantQueryDto,
  TenantResponseDto,
  PaginatedTenantsResponseDto,
  BrandingResponseDto,
} from './dto/tenant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully', type: TenantResponseDto })
  @ApiResponse({ status: 409, description: 'Tenant code already exists' })
  async create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tenants with pagination' })
  @ApiResponse({ status: 200, description: 'List of tenants', type: PaginatedTenantsResponseDto })
  async findAll(@Query() query: TenantQueryDto) {
    return this.tenantsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get tenant statistics' })
  @ApiResponse({ status: 200, description: 'Tenant statistics' })
  async getStats() {
    return this.tenantsService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant details', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant updated', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 204, description: 'Tenant deleted' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant activated', type: TenantResponseDto })
  async activate(@Param('id') id: string) {
    return this.tenantsService.activate(id);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant suspended', type: TenantResponseDto })
  async suspend(@Param('id') id: string) {
    return this.tenantsService.suspend(id);
  }

  // ==================== REQ-3: 白标配置端点 ====================

  @Get(':id/branding')
  @ApiOperation({ summary: '获取租户白标配置' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '白标配置', type: BrandingResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getBranding(@Param('id') id: string) {
    return this.tenantsService.getBranding(id);
  }

  @Patch(':id/branding')
  @ApiOperation({ summary: '更新租户白标配置' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '白标配置已更新', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async updateBranding(
    @Param('id') id: string,
    @Body() updateBrandingDto: UpdateBrandingDto,
  ) {
    return this.tenantsService.updateBranding(id, updateBrandingDto);
  }

  // ==================== REQ-2: 状态管理端点 ====================

  @Post(':id/terminate')
  @ApiOperation({ summary: '终止租户 (设置为 CANCELLED)' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '租户已终止', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 422, description: '无效的状态转换' })
  async terminate(@Param('id') id: string) {
    return this.tenantsService.terminate(id);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: '恢复租户 (从 SUSPENDED/EXPIRED 恢复为 ACTIVE)' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '租户已恢复', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 422, description: '无效的状态转换' })
  async restore(@Param('id') id: string) {
    return this.tenantsService.restore(id);
  }

  @Post(':id/expire')
  @ApiOperation({ summary: '设置租户过期' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '租户已过期', type: TenantResponseDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 422, description: '无效的状态转换' })
  async expire(@Param('id') id: string) {
    return this.tenantsService.expire(id);
  }
}
