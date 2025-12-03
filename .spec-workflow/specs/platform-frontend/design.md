# 设计文档: Platform Admin Console (平台管理前端)

## 概述

本文档描述 Platform Admin Console 的技术设计，包括项目结构、组件架构、状态管理、API 集成、国际化和主题系统。

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Platform Admin Console                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      Views (Pages)                            │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │    │
│  │  │ Login   │ │Dashboard│ │ Tenants │ │Instances│ ...        │    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘            │    │
│  └───────┼───────────┼───────────┼───────────┼──────────────────┘    │
│          │           │           │           │                        │
│  ┌───────┴───────────┴───────────┴───────────┴──────────────────┐    │
│  │                    Composables (Hooks)                         │    │
│  │  useAuth, useTenants, useInstances, useInvoices, useI18n...   │    │
│  └───────────────────────────┬───────────────────────────────────┘    │
│                              │                                        │
│  ┌───────────────────────────┴───────────────────────────────────┐    │
│  │                      Pinia Stores                               │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │    │
│  │  │  auth   │ │ tenants │ │instances│ │ invoices│ ...          │    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘              │    │
│  └───────┼───────────┼───────────┼───────────┼────────────────────┘    │
│          │           │           │           │                        │
│  ┌───────┴───────────┴───────────┴───────────┴────────────────────┐   │
│  │                      API Layer (Axios)                           │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │  Request Interceptor │ Response Interceptor │ Error Handler│   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                      │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │ HTTPS
                                  ▼
                    ┌─────────────────────────┐
                    │   Platform Service API   │
                    │   (NestJS Backend)       │
                    │   /api/v1/*              │
                    └─────────────────────────┘
```

## 项目结构

```
apps/platform-admin/
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── api/                          # API 请求层
│   │   ├── index.ts                  # Axios 实例配置
│   │   ├── auth.ts                   # 认证 API
│   │   ├── tenants.ts                # 租户 API
│   │   ├── instances.ts              # 实例 API
│   │   ├── subscriptions.ts          # 订阅 API
│   │   ├── invoices.ts               # 账单 API
│   │   ├── tenant-admins.ts          # 租户管理员 API
│   │   ├── trading-data.ts           # 交易数据 API
│   │   └── platform-admins.ts        # 平台管理员 API
│   │
│   ├── assets/                       # 静态资源
│   │   ├── fonts/
│   │   ├── images/
│   │   └── styles/
│   │       ├── variables.css         # CSS 变量 (主题)
│   │       ├── transitions.css       # 过渡动画
│   │       └── global.css            # 全局样式
│   │
│   ├── components/                   # 通用组件
│   │   ├── common/                   # 基础组件
│   │   │   ├── AppHeader.vue         # 顶部导航
│   │   │   ├── AppSidebar.vue        # 侧边栏
│   │   │   ├── AppBreadcrumb.vue     # 面包屑
│   │   │   ├── DataTable.vue         # 数据表格封装
│   │   │   ├── SearchBar.vue         # 搜索栏
│   │   │   ├── StatusBadge.vue       # 状态标签
│   │   │   ├── ConfirmDialog.vue     # 确认对话框
│   │   │   ├── PageLoading.vue       # 页面加载
│   │   │   └── EmptyState.vue        # 空状态
│   │   │
│   │   ├── charts/                   # 图表组件
│   │   │   ├── LineChart.vue         # 折线图
│   │   │   ├── PieChart.vue          # 饼图
│   │   │   ├── BarChart.vue          # 柱状图
│   │   │   └── StatsCard.vue         # 统计卡片
│   │   │
│   │   └── forms/                    # 表单组件
│   │       ├── TenantForm.vue        # 租户表单
│   │       ├── InstanceForm.vue      # 实例表单
│   │       ├── AdminForm.vue         # 管理员表单
│   │       └── MT5ServerForm.vue     # MT5服务器配置表单
│   │
│   ├── composables/                  # 组合式函数
│   │   ├── useAuth.ts                # 认证逻辑
│   │   ├── useTheme.ts               # 主题切换
│   │   ├── useLocale.ts              # 语言切换
│   │   ├── usePagination.ts          # 分页逻辑
│   │   ├── useConfirm.ts             # 确认对话框
│   │   └── useNotification.ts        # 通知提示
│   │
│   ├── layouts/                      # 布局组件
│   │   ├── DefaultLayout.vue         # 默认布局 (侧边栏+顶栏)
│   │   └── AuthLayout.vue            # 认证布局 (登录页)
│   │
│   ├── locales/                      # 国际化
│   │   ├── index.ts                  # i18n 配置
│   │   ├── zh-CN/                    # 中文
│   │   │   ├── common.json
│   │   │   ├── auth.json
│   │   │   ├── tenants.json
│   │   │   ├── instances.json
│   │   │   ├── invoices.json
│   │   │   └── ...
│   │   └── en-US/                    # 英文
│   │       ├── common.json
│   │       ├── auth.json
│   │       ├── tenants.json
│   │       ├── instances.json
│   │       ├── invoices.json
│   │       └── ...
│   │
│   ├── router/                       # 路由配置
│   │   ├── index.ts                  # 路由主文件
│   │   ├── guards.ts                 # 路由守卫
│   │   └── routes.ts                 # 路由定义
│   │
│   ├── stores/                       # Pinia 状态管理
│   │   ├── auth.ts                   # 认证状态
│   │   ├── tenants.ts                # 租户状态
│   │   ├── instances.ts              # 实例状态
│   │   ├── invoices.ts               # 账单状态
│   │   ├── subscriptions.ts          # 订阅状态
│   │   ├── settings.ts               # 设置状态 (主题/语言)
│   │   └── trading.ts                # 交易数据状态
│   │
│   ├── types/                        # TypeScript 类型
│   │   ├── api.ts                    # API 响应类型
│   │   ├── tenant.ts                 # 租户类型
│   │   ├── instance.ts               # 实例类型
│   │   ├── invoice.ts                # 账单类型
│   │   ├── subscription.ts           # 订阅类型
│   │   ├── admin.ts                  # 管理员类型
│   │   └── trading.ts                # 交易数据类型
│   │
│   ├── utils/                        # 工具函数
│   │   ├── format.ts                 # 格式化函数
│   │   ├── validation.ts             # 表单验证
│   │   ├── storage.ts                # 本地存储
│   │   └── constants.ts              # 常量定义
│   │
│   ├── views/                        # 页面视图
│   │   ├── auth/
│   │   │   └── LoginView.vue         # 登录页
│   │   │
│   │   ├── dashboard/
│   │   │   └── DashboardView.vue     # Dashboard
│   │   │
│   │   ├── tenants/
│   │   │   ├── TenantListView.vue    # 租户列表
│   │   │   ├── TenantDetailView.vue  # 租户详情
│   │   │   └── TenantCreateView.vue  # 创建租户
│   │   │
│   │   ├── instances/
│   │   │   ├── InstanceListView.vue  # 实例列表
│   │   │   ├── InstanceDetailView.vue# 实例详情
│   │   │   └── InstanceCreateView.vue# 创建实例
│   │   │
│   │   ├── subscriptions/
│   │   │   └── SubscriptionListView.vue # 订阅计划
│   │   │
│   │   ├── invoices/
│   │   │   ├── InvoiceListView.vue   # 账单列表
│   │   │   └── InvoiceDetailView.vue # 账单详情
│   │   │
│   │   ├── trading/
│   │   │   └── TradingOverviewView.vue # 交易数据概览
│   │   │
│   │   └── settings/
│   │       ├── ProfileView.vue       # 个人设置
│   │       └── AdminsView.vue        # 管理员管理
│   │
│   ├── App.vue                       # 根组件
│   └── main.ts                       # 入口文件
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── uno.config.ts                     # UnoCSS 配置
└── package.json
```

## 核心模块设计

### 1. API 层设计

#### Axios 实例配置

```typescript
// src/api/index.ts
import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加 Token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();
      router.push('/login');
    }
    return Promise.reject(error);
  }
);

export default api;
```

#### API 模块示例

```typescript
// src/api/tenants.ts
import api from './index';
import type { Tenant, TenantCreateDto, TenantUpdateDto, PaginatedResponse } from '@/types';

export const tenantsApi = {
  // 获取租户列表
  getList(params: {
    page?: number;
    limit?: number;
    status?: string;
    plan?: string;
    search?: string;
  }): Promise<PaginatedResponse<Tenant>> {
    return api.get('/tenants', { params });
  },

  // 获取单个租户
  getById(id: string): Promise<Tenant> {
    return api.get(`/tenants/${id}`);
  },

  // 创建租户
  create(data: TenantCreateDto): Promise<Tenant> {
    return api.post('/tenants', data);
  },

  // 更新租户
  update(id: string, data: TenantUpdateDto): Promise<Tenant> {
    return api.patch(`/tenants/${id}`, data);
  },

  // 更新租户状态
  updateStatus(id: string, status: string): Promise<Tenant> {
    return api.patch(`/tenants/${id}/status`, { status });
  },

  // 更新白标配置
  updateBranding(id: string, branding: {
    displayName?: string;
    logoUrl?: string;
    primaryColor?: string;
  }): Promise<Tenant> {
    return api.patch(`/tenants/${id}/branding`, branding);
  },
};
```

### 2. 状态管理设计 (Pinia)

#### Auth Store

```typescript
// src/stores/auth.ts
import { defineStore } from 'pinia';
import { authApi } from '@/api/auth';
import { storage } from '@/utils/storage';

interface AuthState {
  token: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    role: 'super_admin' | 'admin' | 'operator';
  } | null;
  isAuthenticated: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: storage.get('token'),
    user: storage.get('user'),
    isAuthenticated: !!storage.get('token'),
  }),

  getters: {
    isSuperAdmin: (state) => state.user?.role === 'super_admin',
    canManageAdmins: (state) => state.user?.role === 'super_admin',
  },

  actions: {
    async login(email: string, password: string) {
      const response = await authApi.login({ email, password });
      this.token = response.token;
      this.user = response.user;
      this.isAuthenticated = true;
      storage.set('token', response.token);
      storage.set('user', response.user);
    },

    logout() {
      this.token = null;
      this.user = null;
      this.isAuthenticated = false;
      storage.remove('token');
      storage.remove('user');
    },
  },
});
```

#### Tenants Store

```typescript
// src/stores/tenants.ts
import { defineStore } from 'pinia';
import { tenantsApi } from '@/api/tenants';
import type { Tenant, TenantCreateDto } from '@/types';

interface TenantsState {
  list: Tenant[];
  current: Tenant | null;
  total: number;
  loading: boolean;
  filters: {
    status: string;
    plan: string;
    search: string;
  };
  pagination: {
    page: number;
    limit: number;
  };
}

export const useTenantsStore = defineStore('tenants', {
  state: (): TenantsState => ({
    list: [],
    current: null,
    total: 0,
    loading: false,
    filters: {
      status: '',
      plan: '',
      search: '',
    },
    pagination: {
      page: 1,
      limit: 10,
    },
  }),

  actions: {
    async fetchList() {
      this.loading = true;
      try {
        const response = await tenantsApi.getList({
          ...this.pagination,
          ...this.filters,
        });
        this.list = response.data;
        this.total = response.total;
      } finally {
        this.loading = false;
      }
    },

    async fetchById(id: string) {
      this.loading = true;
      try {
        this.current = await tenantsApi.getById(id);
      } finally {
        this.loading = false;
      }
    },

    async create(data: TenantCreateDto) {
      const tenant = await tenantsApi.create(data);
      await this.fetchList();
      return tenant;
    },

    setFilters(filters: Partial<TenantsState['filters']>) {
      this.filters = { ...this.filters, ...filters };
      this.pagination.page = 1;
      this.fetchList();
    },

    setPage(page: number) {
      this.pagination.page = page;
      this.fetchList();
    },
  },
});
```

### 3. 路由设计

```typescript
// src/router/routes.ts
import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { layout: 'auth', requiresAuth: false },
  },
  {
    path: '/',
    redirect: '/dashboard',
    meta: { requiresAuth: true },
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: { title: 'menu.dashboard', icon: 'dashboard' },
  },
  {
    path: '/tenants',
    name: 'Tenants',
    meta: { title: 'menu.tenants', icon: 'building' },
    children: [
      {
        path: '',
        name: 'TenantList',
        component: () => import('@/views/tenants/TenantListView.vue'),
      },
      {
        path: 'create',
        name: 'TenantCreate',
        component: () => import('@/views/tenants/TenantCreateView.vue'),
      },
      {
        path: ':id',
        name: 'TenantDetail',
        component: () => import('@/views/tenants/TenantDetailView.vue'),
      },
    ],
  },
  {
    path: '/instances',
    name: 'Instances',
    meta: { title: 'menu.instances', icon: 'server' },
    children: [
      {
        path: '',
        name: 'InstanceList',
        component: () => import('@/views/instances/InstanceListView.vue'),
      },
      {
        path: 'create',
        name: 'InstanceCreate',
        component: () => import('@/views/instances/InstanceCreateView.vue'),
      },
      {
        path: ':id',
        name: 'InstanceDetail',
        component: () => import('@/views/instances/InstanceDetailView.vue'),
      },
    ],
  },
  {
    path: '/subscriptions',
    name: 'Subscriptions',
    component: () => import('@/views/subscriptions/SubscriptionListView.vue'),
    meta: { title: 'menu.subscriptions', icon: 'credit-card' },
  },
  {
    path: '/invoices',
    name: 'Invoices',
    meta: { title: 'menu.invoices', icon: 'file-invoice' },
    children: [
      {
        path: '',
        name: 'InvoiceList',
        component: () => import('@/views/invoices/InvoiceListView.vue'),
      },
      {
        path: ':id',
        name: 'InvoiceDetail',
        component: () => import('@/views/invoices/InvoiceDetailView.vue'),
      },
    ],
  },
  {
    path: '/trading',
    name: 'Trading',
    component: () => import('@/views/trading/TradingOverviewView.vue'),
    meta: { title: 'menu.trading', icon: 'chart-line' },
  },
  {
    path: '/settings',
    name: 'Settings',
    meta: { title: 'menu.settings', icon: 'cog' },
    children: [
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/settings/ProfileView.vue'),
      },
      {
        path: 'admins',
        name: 'Admins',
        component: () => import('@/views/settings/AdminsView.vue'),
        meta: { requiresRole: 'super_admin' },
      },
    ],
  },
];
```

#### 路由守卫

```typescript
// src/router/guards.ts
import type { Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

export function setupRouterGuards(router: Router) {
  router.beforeEach((to, from, next) => {
    const authStore = useAuthStore();

    // 需要认证的页面
    if (to.meta.requiresAuth !== false && !authStore.isAuthenticated) {
      return next({ name: 'Login', query: { redirect: to.fullPath } });
    }

    // 已登录用户访问登录页
    if (to.name === 'Login' && authStore.isAuthenticated) {
      return next({ name: 'Dashboard' });
    }

    // 角色权限检查
    if (to.meta.requiresRole && authStore.user?.role !== to.meta.requiresRole) {
      return next({ name: 'Dashboard' });
    }

    next();
  });
}
```

### 4. 国际化设计

#### i18n 配置

```typescript
// src/locales/index.ts
import { createI18n } from 'vue-i18n';
import { storage } from '@/utils/storage';

// 懒加载语言包
const loadLocaleMessages = async (locale: string) => {
  const modules = import.meta.glob('./*/*.json');
  const messages: Record<string, any> = {};

  for (const path in modules) {
    if (path.includes(`/${locale}/`)) {
      const module = await modules[path]() as { default: Record<string, any> };
      const namespace = path.split('/').pop()?.replace('.json', '') || '';
      messages[namespace] = module.default;
    }
  }

  return messages;
};

// 检测浏览器语言
const detectBrowserLocale = (): string => {
  const browserLang = navigator.language;
  if (browserLang.startsWith('zh')) return 'zh-CN';
  return 'en-US';
};

// 获取存储的语言或检测浏览器语言
const getInitialLocale = (): string => {
  return storage.get('locale') || detectBrowserLocale();
};

export const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en-US',
  messages: {},
});

// 动态加载语言包
export async function setLocale(locale: string) {
  if (!i18n.global.availableLocales.includes(locale)) {
    const messages = await loadLocaleMessages(locale);
    i18n.global.setLocaleMessage(locale, messages);
  }
  i18n.global.locale.value = locale;
  storage.set('locale', locale);
  document.documentElement.setAttribute('lang', locale);
}

// 初始化加载
export async function initI18n() {
  await setLocale(getInitialLocale());
}
```

#### 语言文件示例

```json
// src/locales/zh-CN/common.json
{
  "app": {
    "name": "MT5 平台管理",
    "loading": "加载中...",
    "confirm": "确认",
    "cancel": "取消",
    "save": "保存",
    "create": "创建",
    "edit": "编辑",
    "delete": "删除",
    "search": "搜索",
    "reset": "重置",
    "export": "导出",
    "success": "操作成功",
    "error": "操作失败"
  },
  "menu": {
    "dashboard": "控制台",
    "tenants": "租户管理",
    "instances": "实例管理",
    "subscriptions": "订阅计划",
    "invoices": "账单管理",
    "trading": "交易数据",
    "settings": "系统设置"
  },
  "status": {
    "active": "活跃",
    "suspended": "暂停",
    "terminated": "终止",
    "online": "在线",
    "offline": "离线",
    "maintenance": "维护中",
    "error": "异常"
  }
}
```

```json
// src/locales/en-US/common.json
{
  "app": {
    "name": "MT5 Platform Admin",
    "loading": "Loading...",
    "confirm": "Confirm",
    "cancel": "Cancel",
    "save": "Save",
    "create": "Create",
    "edit": "Edit",
    "delete": "Delete",
    "search": "Search",
    "reset": "Reset",
    "export": "Export",
    "success": "Operation successful",
    "error": "Operation failed"
  },
  "menu": {
    "dashboard": "Dashboard",
    "tenants": "Tenants",
    "instances": "Instances",
    "subscriptions": "Subscriptions",
    "invoices": "Invoices",
    "trading": "Trading Data",
    "settings": "Settings"
  },
  "status": {
    "active": "Active",
    "suspended": "Suspended",
    "terminated": "Terminated",
    "online": "Online",
    "offline": "Offline",
    "maintenance": "Maintenance",
    "error": "Error"
  }
}
```

### 5. 主题系统设计

#### CSS 变量定义

```css
/* src/assets/styles/variables.css */

/* 浅色主题 */
:root {
  /* 主色 */
  --color-primary: #6366F1;
  --color-primary-hover: #4F46E5;
  --color-primary-light: #EEF2FF;

  /* 语义色 */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;

  /* 中性色 */
  --color-bg-page: #F8FAFC;
  --color-bg-container: #FFFFFF;
  --color-bg-elevated: #FFFFFF;
  --color-border: #E2E8F0;
  --color-border-light: #F1F5F9;

  /* 文字色 */
  --color-text-primary: #1E293B;
  --color-text-secondary: #64748B;
  --color-text-tertiary: #94A3B8;
  --color-text-disabled: #CBD5E1;

  /* 阴影 */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* 间距 */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* 过渡 */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;
}

/* 深色主题 */
[data-theme="dark"] {
  --color-primary: #818CF8;
  --color-primary-hover: #6366F1;
  --color-primary-light: #312E81;

  --color-bg-page: #0F172A;
  --color-bg-container: #1E293B;
  --color-bg-elevated: #334155;
  --color-border: #334155;
  --color-border-light: #475569;

  --color-text-primary: #F8FAFC;
  --color-text-secondary: #CBD5E1;
  --color-text-tertiary: #94A3B8;
  --color-text-disabled: #64748B;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4);
}
```

#### 主题切换 Composable

```typescript
// src/composables/useTheme.ts
import { ref, watch, onMounted } from 'vue';
import { storage } from '@/utils/storage';

type Theme = 'light' | 'dark' | 'system';

const theme = ref<Theme>(storage.get('theme') || 'system');
const isDark = ref(false);

// 检测系统主题
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

function updateTheme() {
  if (theme.value === 'system') {
    isDark.value = prefersDark.matches;
  } else {
    isDark.value = theme.value === 'dark';
  }
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}

export function useTheme() {
  onMounted(() => {
    updateTheme();
    prefersDark.addEventListener('change', updateTheme);
  });

  watch(theme, (newTheme) => {
    storage.set('theme', newTheme);
    updateTheme();
  });

  function setTheme(newTheme: Theme) {
    theme.value = newTheme;
  }

  function toggleTheme() {
    if (theme.value === 'light') {
      theme.value = 'dark';
    } else if (theme.value === 'dark') {
      theme.value = 'system';
    } else {
      theme.value = 'light';
    }
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  };
}
```

### 6. 通用组件设计

#### DataTable 组件

```vue
<!-- src/components/common/DataTable.vue -->
<template>
  <div class="data-table">
    <!-- 工具栏 -->
    <div class="data-table__toolbar" v-if="$slots.toolbar">
      <slot name="toolbar" />
    </div>

    <!-- 表格 -->
    <n-data-table
      :columns="columns"
      :data="data"
      :loading="loading"
      :pagination="paginationConfig"
      :row-key="rowKey"
      :scroll-x="scrollX"
      @update:page="handlePageChange"
      @update:page-size="handlePageSizeChange"
    >
      <template #empty>
        <EmptyState :description="t('common.noData')" />
      </template>
    </n-data-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NDataTable } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import EmptyState from './EmptyState.vue';

interface Props {
  columns: any[];
  data: any[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  rowKey?: string | ((row: any) => string);
  scrollX?: number;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  total: 0,
  page: 1,
  pageSize: 10,
  rowKey: 'id',
});

const emit = defineEmits<{
  'update:page': [page: number];
  'update:pageSize': [size: number];
}>();

const { t } = useI18n();

const paginationConfig = computed(() => ({
  page: props.page,
  pageSize: props.pageSize,
  pageCount: Math.ceil(props.total / props.pageSize),
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  prefix: ({ itemCount }: { itemCount: number }) => t('common.total', { count: itemCount }),
}));

function handlePageChange(page: number) {
  emit('update:page', page);
}

function handlePageSizeChange(size: number) {
  emit('update:pageSize', size);
}
</script>
```

#### StatusBadge 组件

```vue
<!-- src/components/common/StatusBadge.vue -->
<template>
  <n-tag :type="tagType" :bordered="false" round size="small">
    <template #icon>
      <div class="status-dot" :style="{ backgroundColor: dotColor }" />
    </template>
    {{ label }}
  </n-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NTag } from 'naive-ui';
import { useI18n } from 'vue-i18n';

interface Props {
  status: string;
  type?: 'tenant' | 'instance' | 'invoice';
}

const props = withDefaults(defineProps<Props>(), {
  type: 'tenant',
});

const { t } = useI18n();

const statusConfig: Record<string, { type: string; color: string }> = {
  // Tenant status
  active: { type: 'success', color: '#10B981' },
  suspended: { type: 'warning', color: '#F59E0B' },
  terminated: { type: 'error', color: '#EF4444' },
  // Instance status
  online: { type: 'success', color: '#10B981' },
  offline: { type: 'default', color: '#94A3B8' },
  maintenance: { type: 'warning', color: '#F59E0B' },
  error: { type: 'error', color: '#EF4444' },
  // Invoice status
  pending: { type: 'info', color: '#3B82F6' },
  paid: { type: 'success', color: '#10B981' },
  overdue: { type: 'error', color: '#EF4444' },
  cancelled: { type: 'default', color: '#94A3B8' },
};

const config = computed(() => statusConfig[props.status] || { type: 'default', color: '#94A3B8' });
const tagType = computed(() => config.value.type as any);
const dotColor = computed(() => config.value.color);
const label = computed(() => t(`status.${props.status}`));
</script>

<style scoped>
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
}
</style>
```

### 7. 布局设计

#### DefaultLayout

```vue
<!-- src/layouts/DefaultLayout.vue -->
<template>
  <n-layout has-sider class="app-layout">
    <!-- 侧边栏 -->
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="collapsed"
      show-trigger
      @collapse="collapsed = true"
      @expand="collapsed = false"
    >
      <AppSidebar :collapsed="collapsed" />
    </n-layout-sider>

    <!-- 主内容区 -->
    <n-layout>
      <!-- 顶部导航 -->
      <n-layout-header bordered class="app-header">
        <AppHeader />
      </n-layout-header>

      <!-- 内容区 -->
      <n-layout-content class="app-content">
        <AppBreadcrumb />
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <keep-alive :include="cachedViews">
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { NLayout, NLayoutSider, NLayoutHeader, NLayoutContent } from 'naive-ui';
import AppSidebar from '@/components/common/AppSidebar.vue';
import AppHeader from '@/components/common/AppHeader.vue';
import AppBreadcrumb from '@/components/common/AppBreadcrumb.vue';

const collapsed = ref(false);
const cachedViews = ref(['Dashboard', 'TenantList', 'InstanceList']);
</script>

<style scoped>
.app-layout {
  height: 100vh;
}

.app-header {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-lg);
  background: var(--color-bg-container);
}

.app-content {
  padding: var(--spacing-lg);
  background: var(--color-bg-page);
  overflow-y: auto;
}

/* 页面过渡动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity var(--transition-normal), transform var(--transition-normal);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
```

## 页面设计规范

### Dashboard 页面

```
┌──────────────────────────────────────────────────────────────────┐
│  Dashboard                                              [刷新]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │   租户数    │ │   实例数    │ │  今日交易量  │ │  待处理账单  ││
│  │    128      │ │     45      │ │   12,345    │ │      8      ││
│  │ ↑12 本月新增│ │ 42 在线     │ │ ↑5.2%       │ │ 3 逾期      ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
│                                                                  │
│  ┌────────────────────────────────┐ ┌────────────────────────┐  │
│  │      近7天交易趋势              │ │    订阅计划分布        │  │
│  │   ╭─────────────────────╮     │ │      [饼图]           │  │
│  │   │    [折线图]         │     │ │  Trial: 20%           │  │
│  │   ╰─────────────────────╯     │ │  Basic: 45%           │  │
│  │                               │ │  Pro: 30%             │  │
│  │                               │ │  Enterprise: 5%       │  │
│  └────────────────────────────────┘ └────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────┐ ┌────────────────────────┐  │
│  │      最近系统事件               │ │    实例健康状态        │  │
│  │  ● 租户 ABC 已暂停    2分钟前  │ │  ● Instance-Asia  在线 │  │
│  │  ● 新租户 XYZ 创建    1小时前  │ │  ● Instance-EU    在线 │  │
│  │  ● 账单 INV-001 已付  2小时前  │ │  ● Instance-US    维护 │  │
│  │  ○ 实例健康检查失败   3小时前  │ │  ○ Instance-Test  离线 │  │
│  └────────────────────────────────┘ └────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 租户列表页面

```
┌──────────────────────────────────────────────────────────────────┐
│  租户管理                                         [+ 创建租户]   │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [搜索...]        [状态 ▼]  [计划 ▼]    [重置] [导出]      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 编码     │ 名称      │ 状态  │ 计划   │ 实例 │ 创建时间   │  │
│  ├──────────┼───────────┼───────┼────────┼──────┼────────────┤  │
│  │ broker_a │ 券商A     │ ●活跃 │ Pro    │  3   │ 2024-01-15 │  │
│  │ broker_b │ 券商B     │ ●活跃 │ Basic  │  1   │ 2024-02-20 │  │
│  │ broker_c │ 券商C     │ ○暂停 │ Trial  │  1   │ 2024-03-10 │  │
│  │ ...      │ ...       │ ...   │ ...    │ ...  │ ...        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ◀ 1  2  3  4  5 ... 10 ▶                    共 98 条          │
└──────────────────────────────────────────────────────────────────┘
```

## 构建与部署

### Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'naive-ui': ['naive-ui'],
          'echarts': ['echarts'],
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },
});
```

### Docker 部署

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://platform-service:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
```

## 依赖清单

```json
{
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.5",
    "pinia": "^2.1.7",
    "naive-ui": "^2.38.0",
    "axios": "^1.6.2",
    "vue-i18n": "^9.8.0",
    "echarts": "^5.4.3",
    "vue-echarts": "^6.6.5",
    "@vueuse/core": "^10.7.0",
    "dayjs": "^1.11.10"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^4.5.2",
    "vite": "^5.0.10",
    "typescript": "^5.3.3",
    "unocss": "^0.58.0",
    "@unocss/preset-uno": "^0.58.0",
    "@unocss/preset-icons": "^0.58.0",
    "vue-tsc": "^1.8.25"
  }
}
```
