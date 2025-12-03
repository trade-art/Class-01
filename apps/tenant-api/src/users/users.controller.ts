import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { UsersService } from './users.service';
import { CurrentUser, JwtPayload, Roles } from '../auth';
import {
  UserListQueryDto,
  UserListResponseDto,
  UserDetailDto,
  UserGroupDto,
  UpdateUserGroupDto,
  UpdateUserLeverageDto,
  UpdateUserStatusDto,
  TransactionQueryDto,
  TransactionDto,
  LogQueryDto,
  UserLogDto,
  ExportUsersDto,
  UserDto,
} from './dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: '获取用户列表' })
  @ApiResponse({
    status: 200,
    description: '用户列表',
    type: UserListResponseDto,
  })
  async getList(
    @CurrentUser() user: JwtPayload,
    @Query() query: UserListQueryDto,
  ): Promise<UserListResponseDto> {
    return this.usersService.getList(user.instanceId, query);
  }

  @Get('groups')
  @ApiOperation({ summary: '获取组别列表' })
  @ApiResponse({
    status: 200,
    description: '组别列表',
    type: [UserGroupDto],
  })
  async getGroups(@CurrentUser() user: JwtPayload): Promise<UserGroupDto[]> {
    return this.usersService.getGroups(user.instanceId);
  }

  @Get(':login')
  @ApiOperation({ summary: '获取用户详情' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: 200,
    description: '用户详情',
    type: UserDetailDto,
  })
  async getDetail(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
  ): Promise<UserDetailDto> {
    return this.usersService.getDetail(user.instanceId, login);
  }

  @Put(':login/group')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '修改用户组别' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: 200,
    description: '更新后的用户信息',
    type: UserDto,
  })
  async updateGroup(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Body() dto: UpdateUserGroupDto,
  ): Promise<UserDto> {
    return this.usersService.updateGroup(user.instanceId, login, dto.group);
  }

  @Put(':login/leverage')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '修改用户杠杆' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: 200,
    description: '更新后的用户信息',
    type: UserDto,
  })
  async updateLeverage(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Body() dto: UpdateUserLeverageDto,
  ): Promise<UserDto> {
    return this.usersService.updateLeverage(user.instanceId, login, dto.leverage);
  }

  @Put(':login/status')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '修改用户状态' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: 200,
    description: '更新后的用户信息',
    type: UserDto,
  })
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserDto> {
    return this.usersService.updateStatus(user.instanceId, login, dto.status);
  }

  @Get(':login/transactions')
  @ApiOperation({ summary: '获取用户交易记录' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: 200,
    description: '交易记录列表',
  })
  async getTransactions(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Query() query: TransactionQueryDto,
  ): Promise<{ transactions: TransactionDto[]; total: number }> {
    return this.usersService.getTransactions(user.instanceId, login, query);
  }

  @Get(':login/logs')
  @ApiOperation({ summary: '获取用户操作日志' })
  @ApiParam({ name: 'login', description: '用户登录号' })
  @ApiResponse({
    status: 200,
    description: '操作日志列表',
  })
  async getLogs(
    @CurrentUser() user: JwtPayload,
    @Param('login', ParseIntPipe) login: number,
    @Query() query: LogQueryDto,
  ): Promise<{ logs: UserLogDto[]; total: number }> {
    return this.usersService.getLogs(user.instanceId, login, query);
  }

  @Post('export')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: '导出用户数据' })
  @ApiResponse({
    status: 200,
    description: 'CSV 文件',
  })
  async exportUsers(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ExportUsersDto,
    @Res() res: Response,
  ): Promise<void> {
    const { users } = await this.usersService.exportUsers(user.instanceId, dto);

    if (dto.format === 'xlsx') {
      // TODO: Excel 导出暂未实现
      res.status(501).json({
        success: false,
        error: { message: 'Excel 导出暂未实现' },
      });
      return;
    }

    // CSV 导出
    const headers = [
      '登录号',
      '姓名',
      '邮箱',
      '组别',
      '杠杆',
      '余额',
      '净值',
      '浮动盈亏',
      '保证金',
      '可用保证金',
      '状态',
      '注册时间',
      '最后登录',
    ];

    const rows = users.map((u) => [
      u.login,
      u.name,
      u.email || '',
      u.group,
      u.leverage,
      u.balance,
      u.equity,
      u.profit,
      u.margin,
      u.freeMargin,
      u.status,
      u.registrationTime,
      u.lastAccessTime || '',
    ]);

    const csvContent =
      '\uFEFF' + // BOM for UTF-8
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="users_${new Date().toISOString().split('T')[0]}.csv"`,
    );
    res.send(csvContent);
  }
}
