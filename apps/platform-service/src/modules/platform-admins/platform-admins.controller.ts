import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PlatformAdminsService } from './platform-admins.service';
import {
  CreatePlatformAdminDto,
  UpdatePlatformAdminDto,
  ChangePasswordDto,
  ResetPasswordDto,
  PlatformAdminResponseDto,
} from './dto/platform-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, UserTypes } from '../auth/guards/roles.guard';
import { UserType } from '../auth/dto/login.dto';

@ApiTags('platform-admins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UserTypes(UserType.PLATFORM_ADMIN)
@Controller('platform-admins')
export class PlatformAdminsController {
  constructor(private readonly platformAdminsService: PlatformAdminsService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new platform admin (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Admin created', type: PlatformAdminResponseDto })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(@Body() createDto: CreatePlatformAdminDto) {
    return this.platformAdminsService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all platform admins' })
  @ApiResponse({ status: 200, description: 'List of admins', type: [PlatformAdminResponseDto] })
  async findAll() {
    return this.platformAdminsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get platform admin by ID' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Admin details', type: PlatformAdminResponseDto })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async findOne(@Param('id') id: string) {
    return this.platformAdminsService.findOne(id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Update platform admin (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Admin updated', type: PlatformAdminResponseDto })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdatePlatformAdminDto,
    @Request() req: any,
  ) {
    return this.platformAdminsService.update(id, updateDto, req.user.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete platform admin (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 204, description: 'Admin deleted' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.platformAdminsService.remove(id, req.user.sub);
  }

  @Post(':id/change-password')
  @ApiOperation({ summary: 'Change own password' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 400, description: 'Current password incorrect' })
  async changePassword(
    @Param('id') id: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.platformAdminsService.changePassword(id, changePasswordDto);
  }

  @Post(':id/reset-password')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Reset admin password (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Admin ID' })
  @ApiResponse({ status: 200, description: 'Password reset' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async resetPassword(
    @Param('id') id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.platformAdminsService.resetPassword(id, resetPasswordDto);
  }
}
