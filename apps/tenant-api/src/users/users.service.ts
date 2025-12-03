import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareProxyService } from '../middleware-proxy';
import {
  UserListQueryDto,
  UserListResponseDto,
  UserDto,
  UserDetailDto,
  UserGroupDto,
  TransactionQueryDto,
  TransactionDto,
  LogQueryDto,
  UserLogDto,
  UserStatus,
} from './dto';

/**
 * 交易用户管理服务
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly middlewareProxy: MiddlewareProxyService) {}

  /**
   * 获取用户列表
   */
  async getList(
    instanceId: string,
    query: UserListQueryDto,
  ): Promise<UserListResponseDto> {
    const { page = 1, limit = 20, search, group, status, sortBy, sortOrder } = query;

    const params: Record<string, unknown> = {
      page,
      limit,
    };

    if (search) params.search = search;
    if (group) params.group = group;
    if (status) params.status = status;
    if (sortBy) params.sortBy = sortBy;
    if (sortOrder) params.sortOrder = sortOrder;

    const result = await this.middlewareProxy.request<{
      users: UserDto[];
      total: number;
    }>('get', '/account/users', instanceId, { params });

    return {
      users: result.users,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * 获取组别列表
   */
  async getGroups(instanceId: string): Promise<UserGroupDto[]> {
    const result = await this.middlewareProxy.request<{ groups: UserGroupDto[] }>(
      'get',
      '/account/groups',
      instanceId,
    );

    return result.groups;
  }

  /**
   * 获取用户详情
   */
  async getDetail(instanceId: string, login: number): Promise<UserDetailDto> {
    const result = await this.middlewareProxy.request<UserDetailDto>(
      'get',
      `/account/users/${login}`,
      instanceId,
    );

    return result;
  }

  /**
   * 更新用户组别
   */
  async updateGroup(
    instanceId: string,
    login: number,
    group: string,
  ): Promise<UserDto> {
    const result = await this.middlewareProxy.request<UserDto>(
      'put',
      `/account/users/${login}/group`,
      instanceId,
      { data: { group } },
    );

    this.logger.log(`用户 ${login} 组别已更新为 ${group}`);
    return result;
  }

  /**
   * 更新用户杠杆
   */
  async updateLeverage(
    instanceId: string,
    login: number,
    leverage: number,
  ): Promise<UserDto> {
    const result = await this.middlewareProxy.request<UserDto>(
      'put',
      `/account/users/${login}/leverage`,
      instanceId,
      { data: { leverage } },
    );

    this.logger.log(`用户 ${login} 杠杆已更新为 ${leverage}`);
    return result;
  }

  /**
   * 更新用户状态
   */
  async updateStatus(
    instanceId: string,
    login: number,
    status: UserStatus,
  ): Promise<UserDto> {
    const result = await this.middlewareProxy.request<UserDto>(
      'put',
      `/account/users/${login}/status`,
      instanceId,
      { data: { status } },
    );

    this.logger.log(`用户 ${login} 状态已更新为 ${status}`);
    return result;
  }

  /**
   * 获取用户交易记录
   */
  async getTransactions(
    instanceId: string,
    login: number,
    query: TransactionQueryDto,
  ): Promise<{ transactions: TransactionDto[]; total: number }> {
    const { page = 1, limit = 20, from, to, type } = query;

    const params: Record<string, unknown> = {
      page,
      limit,
    };

    if (from) params.from = from;
    if (to) params.to = to;
    if (type) params.type = type;

    const result = await this.middlewareProxy.request<{
      transactions: TransactionDto[];
      total: number;
    }>('get', `/account/users/${login}/transactions`, instanceId, { params });

    return result;
  }

  /**
   * 获取用户操作日志
   */
  async getLogs(
    instanceId: string,
    login: number,
    query: LogQueryDto,
  ): Promise<{ logs: UserLogDto[]; total: number }> {
    const { page = 1, limit = 20, from, to } = query;

    const params: Record<string, unknown> = {
      page,
      limit,
    };

    if (from) params.from = from;
    if (to) params.to = to;

    const result = await this.middlewareProxy.request<{
      logs: UserLogDto[];
      total: number;
    }>('get', `/account/users/${login}/logs`, instanceId, { params });

    return result;
  }

  /**
   * 导出用户数据
   */
  async exportUsers(
    instanceId: string,
    query: UserListQueryDto,
  ): Promise<{ users: UserDto[] }> {
    // 获取所有符合条件的用户数据 (不分页)
    const params: Record<string, unknown> = {
      page: 1,
      limit: 10000, // 获取所有数据
    };

    if (query.search) params.search = query.search;
    if (query.group) params.group = query.group;
    if (query.status) params.status = query.status;

    const result = await this.middlewareProxy.request<{
      users: UserDto[];
      total: number;
    }>('get', '/account/users', instanceId, { params });

    return { users: result.users };
  }
}
