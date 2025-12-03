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
import { TenantAdminsService } from './tenant-admins.service';
import {
  CreateTenantAdminDto,
  UpdateTenantAdminDto,
  ChangePasswordDto,
  TenantAdminQueryDto,
  TenantAdminResponseDto,
} from './dto/tenant-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

@ApiTags('tenant-admins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
@Controller('tenant-admins')
export class TenantAdminsController {
  constructor(private readonly tenantAdminsService: TenantAdminsService) {}

  @Post()
  @ApiOperation({ summary: '创建租户管理员' })
  @ApiResponse({ status: 201, description: '管理员已创建', type: TenantAdminResponseDto })
  @ApiResponse({ status: 409, description: '邮箱已存在' })
  @ApiResponse({ status: 422, description: '管理员配额已满' })
  create(@Body() dto: CreateTenantAdminDto) {
    return this.tenantAdminsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '获取管理员列表' })
  @ApiResponse({ status: 200, description: '管理员列表' })
  findAll(@Query() query: TenantAdminQueryDto) {
    return this.tenantAdminsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取管理员统计' })
  @ApiResponse({ status: 200, description: '管理员统计' })
  getStats(@Query('tenantId') tenantId?: string) {
    return this.tenantAdminsService.getStats(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取管理员详情' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: '管理员详情', type: TenantAdminResponseDto })
  findOne(@Param('id') id: string) {
    return this.tenantAdminsService.findOne(id);
  }

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: '获取租户的所有管理员' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: '管理员列表', type: [TenantAdminResponseDto] })
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.tenantAdminsService.findByTenant(tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新管理员' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: '管理员已更新', type: TenantAdminResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateTenantAdminDto) {
    return this.tenantAdminsService.update(id, dto);
  }

  @Patch(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '修改管理员密码' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 204, description: '密码已修改' })
  changePassword(@Param('id') id: string, @Body() dto: ChangePasswordDto) {
    return this.tenantAdminsService.changePassword(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除管理员' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 204, description: '管理员已删除' })
  @ApiResponse({ status: 422, description: '无法删除最后一个 Owner' })
  remove(@Param('id') id: string) {
    return this.tenantAdminsService.remove(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: '激活管理员' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: '管理员已激活', type: TenantAdminResponseDto })
  activate(@Param('id') id: string) {
    return this.tenantAdminsService.activate(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: '停用管理员' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: '管理员已停用', type: TenantAdminResponseDto })
  @ApiResponse({ status: 422, description: '无法停用最后一个活跃的 Owner' })
  deactivate(@Param('id') id: string) {
    return this.tenantAdminsService.deactivate(id);
  }
}
