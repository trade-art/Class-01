# 设计文档: Tenant Admin Console

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tenant Admin Console                               │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                              Views Layer                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │Dashboard │ │  Users   │ │ Trading  │ │ Reports  │ │ Settings │     │ │
│  │  │  View    │ │  View    │ │  Monitor │ │   View   │ │   View   │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           Components Layer                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │DataTable │ │ Charts   │ │StatusBadge│ │SearchBar │ │ Forms    │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                          Composables Layer                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │ useAuth  │ │useTrading│ │ useUsers │ │useReports│ │ useTheme │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                            Stores Layer (Pinia)                         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │authStore │ │usersStore│ │tradingStore│ │settingsStore│ │tenantStore│  │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                              API Layer                                  │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Axios Instance + Interceptors                  │  │ │
│  │  │  Request: Token注入, 租户标识                                      │  │ │
│  │  │  Response: 错误处理, 401重定向                                     │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│                        Platform Service API (/api/v1/tenant/*)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 项目结构

```
apps/tenant-console/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── uno.config.ts
├── package.json
├── public/
│   ├── favicon.ico
│   └── default-logo.png
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── api/                          # API 层
│   │   ├── index.ts                  # Axios 实例配置
│   │   ├── auth.ts                   # 认证 API
│   │   ├── users.ts                  # 交易用户 API
│   │   ├── trading.ts                # 交易数据 API
│   │   ├── positions.ts              # 持仓 API
│   │   ├── reports.ts                # 报表 API
│   │   ├── admins.ts                 # 管理员 API
│   │   ├── branding.ts               # 白标配置 API
│   │   ├── api-keys.ts               # API 密钥 API
│   │   └── settings.ts               # 设置 API
│   │
│   ├── components/                   # 公共组件
│   │   ├── common/
│   │   │   ├── DataTable.vue         # 通用表格
│   │   │   ├── StatusBadge.vue       # 状态标签
│   │   │   ├── SearchBar.vue         # 搜索栏
│   │   │   ├── ConfirmDialog.vue     # 确认对话框
│   │   │   ├── EmptyState.vue        # 空状态
│   │   │   ├── PageLoading.vue       # 骨架屏
│   │   │   └── ColorPicker.vue       # 颜色选择器
│   │   ├── charts/
│   │   │   ├── LineChart.vue         # 折线图
│   │   │   ├── BarChart.vue          # 柱状图
│   │   │   ├── PieChart.vue          # 饼图
│   │   │   └── AreaChart.vue         # 面积图
│   │   ├── trading/
│   │   │   ├── PositionCard.vue      # 持仓卡片
│   │   │   ├── QuoteCard.vue         # 报价卡片
│   │   │   ├── OrderRow.vue          # 订单行
│   │   │   └── RiskAlert.vue         # 风险预警
│   │   └── user/
│   │       ├── UserCard.vue          # 用户卡片
│   │       ├── BalanceInfo.vue       # 余额信息
│   │       └── UserForm.vue          # 用户表单
│   │
│   ├── composables/                  # 组合式函数
│   │   ├── useAuth.ts                # 认证逻辑
│   │   ├── useUsers.ts               # 用户管理
│   │   ├── useTrading.ts             # 交易数据
│   │   ├── usePositions.ts           # 持仓管理
│   │   ├── useReports.ts             # 报表逻辑
│   │   ├── useTheme.ts               # 主题切换
│   │   ├── useLocale.ts              # 国际化
│   │   ├── useTenant.ts              # 租户信息
│   │   ├── useWebSocket.ts           # WebSocket 连接
│   │   └── useExport.ts              # 数据导出
│   │
│   ├── layouts/                      # 布局组件
│   │   ├── AuthLayout.vue            # 登录布局
│   │   ├── DefaultLayout.vue         # 主布局
│   │   ├── AppSidebar.vue            # 侧边栏
│   │   ├── AppHeader.vue             # 顶栏
│   │   └── AppBreadcrumb.vue         # 面包屑
│   │
│   ├── locales/                      # 国际化
│   │   ├── index.ts                  # i18n 配置
│   │   ├── zh-CN/
│   │   │   ├── common.json
│   │   │   ├── auth.json
│   │   │   ├── users.json
│   │   │   ├── trading.json
│   │   │   ├── reports.json
│   │   │   └── settings.json
│   │   └── en-US/
│   │       ├── common.json
│   │       ├── auth.json
│   │       ├── users.json
│   │       ├── trading.json
│   │       ├── reports.json
│   │       └── settings.json
│   │
│   ├── router/                       # 路由
│   │   ├── index.ts                  # 路由配置
│   │   ├── routes.ts                 # 路由表
│   │   └── guards.ts                 # 路由守卫
│   │
│   ├── stores/                       # Pinia 状态管理
│   │   ├── index.ts                  # Store 配置
│   │   ├── auth.ts                   # 认证状态
│   │   ├── users.ts                  # 用户状态
│   │   ├── trading.ts                # 交易状态
│   │   ├── positions.ts              # 持仓状态
│   │   ├── tenant.ts                 # 租户信息
│   │   └── settings.ts               # 设置状态
│   │
│   ├── styles/                       # 样式
│   │   ├── variables.css             # CSS 变量
│   │   ├── global.css                # 全局样式
│   │   └── transitions.css           # 过渡动画
│   │
│   ├── types/                        # TypeScript 类型
│   │   ├── api.ts                    # API 响应类型
│   │   ├── user.ts                   # 用户类型
│   │   ├── trading.ts                # 交易类型
│   │   ├── position.ts               # 持仓类型
│   │   ├── report.ts                 # 报表类型
│   │   ├── admin.ts                  # 管理员类型
│   │   └── tenant.ts                 # 租户类型
│   │
│   ├── utils/                        # 工具函数
│   │   ├── format.ts                 # 格式化工具
│   │   ├── validation.ts             # 验证工具
│   │   ├── storage.ts                # 本地存储
│   │   ├── export.ts                 # 导出工具
│   │   └── tenant.ts                 # 租户工具
│   │
│   └── views/                        # 页面
│       ├── auth/
│       │   └── LoginView.vue
│       ├── dashboard/
│       │   └── DashboardView.vue
│       ├── users/
│       │   ├── UserListView.vue
│       │   └── UserDetailView.vue
│       ├── trading/
│       │   ├── PositionsView.vue
│       │   ├── QuotesView.vue
│       │   ├── HistoryView.vue
│       │   └── RiskMonitorView.vue
│       ├── reports/
│       │   ├── TradingReportView.vue
│       │   ├── UserReportView.vue
│       │   └── FinanceReportView.vue
│       └── settings/
│           ├── BrandingView.vue
│           ├── AdminsView.vue
│           ├── ApiKeysView.vue
│           ├── NotificationsView.vue
│           └── ProfileView.vue
│
├── Dockerfile
├── nginx.conf
└── docker-compose.yml
```

## API 层设计

### Axios 实例配置

```typescript
// src/api/index.ts
import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';
import router from '@/router';

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    const authStore = useAuthStore();
    const tenantStore = useTenantStore();

    // 注入 Token
    if (authStore.token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }

    // 注入租户标识
    if (tenantStore.tenantCode) {
      config.headers = config.headers || {};
      config.headers['X-Tenant-Code'] = tenantStore.tenantCode;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error) => {
    const { response } = error;

    if (response?.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();
      router.push({ name: 'Login' });
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

### API 模块

```typescript
// src/api/users.ts
import apiClient from './index';
import type { TradingUser, UserListQuery, UserListResponse } from '@/types/user';

export const usersApi = {
  getList(query: UserListQuery): Promise<UserListResponse> {
    return apiClient.get('/tenant/users', { params: query });
  },

  getDetail(login: number): Promise<TradingUser> {
    return apiClient.get(`/tenant/users/${login}`);
  },

  updateGroup(login: number, group: string): Promise<void> {
    return apiClient.patch(`/tenant/users/${login}/group`, { group });
  },

  updateLeverage(login: number, leverage: number): Promise<void> {
    return apiClient.patch(`/tenant/users/${login}/leverage`, { leverage });
  },

  toggleStatus(login: number, enabled: boolean): Promise<void> {
    return apiClient.patch(`/tenant/users/${login}/status`, { enabled });
  },

  getPositions(login: number): Promise<Position[]> {
    return apiClient.get(`/tenant/users/${login}/positions`);
  },

  getHistory(login: number, query: HistoryQuery): Promise<HistoryResponse> {
    return apiClient.get(`/tenant/users/${login}/history`, { params: query });
  },

  getTransactions(login: number, query: TransactionQuery): Promise<TransactionResponse> {
    return apiClient.get(`/tenant/users/${login}/transactions`, { params: query });
  },
};
```

```typescript
// src/api/trading.ts
import apiClient from './index';
import type {
  Position,
  Quote,
  Order,
  TradingStats,
  PositionQuery,
  HistoryQuery
} from '@/types/trading';

export const tradingApi = {
  // 实时持仓
  getPositions(query?: PositionQuery): Promise<Position[]> {
    return apiClient.get('/tenant/positions', { params: query });
  },

  // 实时报价
  getQuotes(symbols?: string[]): Promise<Quote[]> {
    return apiClient.get('/tenant/quotes', {
      params: { symbols: symbols?.join(',') }
    });
  },

  // 交易历史
  getHistory(query: HistoryQuery): Promise<{ data: Order[]; total: number }> {
    return apiClient.get('/tenant/trades/history', { params: query });
  },

  // 交易统计
  getStats(period: 'today' | 'week' | 'month'): Promise<TradingStats> {
    return apiClient.get('/tenant/trades/stats', { params: { period } });
  },

  // 品种列表
  getSymbols(): Promise<string[]> {
    return apiClient.get('/tenant/symbols');
  },
};
```

```typescript
// src/api/reports.ts
import apiClient from './index';
import type {
  TradingReport,
  UserReport,
  FinanceReport,
  ReportQuery
} from '@/types/report';

export const reportsApi = {
  // 交易报表
  getTradingReport(query: ReportQuery): Promise<TradingReport> {
    return apiClient.get('/tenant/reports/trading', { params: query });
  },

  // 用户报表
  getUserReport(query: ReportQuery): Promise<UserReport> {
    return apiClient.get('/tenant/reports/users', { params: query });
  },

  // 财务报表
  getFinanceReport(query: ReportQuery): Promise<FinanceReport> {
    return apiClient.get('/tenant/reports/finance', { params: query });
  },

  // 导出报表
  exportReport(type: string, query: ReportQuery, format: 'csv' | 'xlsx' | 'pdf'): Promise<Blob> {
    return apiClient.get(`/tenant/reports/${type}/export`, {
      params: { ...query, format },
      responseType: 'blob',
    });
  },
};
```

## Pinia Store 设计

### 认证 Store

```typescript
// src/stores/auth.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/api/auth';
import type { TenantAdmin, LoginCredentials } from '@/types/admin';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'));
  const admin = ref<TenantAdmin | null>(null);

  const isAuthenticated = computed(() => !!token.value);
  const isOwner = computed(() => admin.value?.role === 'owner');
  const isAdmin = computed(() => ['owner', 'admin'].includes(admin.value?.role || ''));

  async function login(credentials: LoginCredentials) {
    const response = await authApi.login(credentials);
    token.value = response.token;
    admin.value = response.admin;
    localStorage.setItem('token', response.token);

    if (credentials.rememberMe) {
      localStorage.setItem('rememberMe', 'true');
    }
  }

  async function fetchProfile() {
    if (!token.value) return;
    admin.value = await authApi.getProfile();
  }

  function logout() {
    token.value = null;
    admin.value = null;
    localStorage.removeItem('token');
    localStorage.removeItem('rememberMe');
  }

  return {
    token,
    admin,
    isAuthenticated,
    isOwner,
    isAdmin,
    login,
    fetchProfile,
    logout,
  };
});
```

### 交易 Store

```typescript
// src/stores/trading.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { tradingApi } from '@/api/trading';
import type { Position, Quote, TradingStats } from '@/types/trading';

export const useTradingStore = defineStore('trading', () => {
  const positions = ref<Position[]>([]);
  const quotes = ref<Map<string, Quote>>(new Map());
  const stats = ref<TradingStats | null>(null);
  const watchlist = ref<string[]>([]);
  const isLoading = ref(false);

  // 计算属性
  const totalPositions = computed(() => positions.value.length);
  const totalProfit = computed(() =>
    positions.value.reduce((sum, p) => sum + p.profit, 0)
  );
  const longPositions = computed(() =>
    positions.value.filter(p => p.type === 'BUY')
  );
  const shortPositions = computed(() =>
    positions.value.filter(p => p.type === 'SELL')
  );

  async function fetchPositions(query?: PositionQuery) {
    isLoading.value = true;
    try {
      positions.value = await tradingApi.getPositions(query);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchQuotes(symbols?: string[]) {
    const targetSymbols = symbols || watchlist.value;
    if (targetSymbols.length === 0) return;

    const data = await tradingApi.getQuotes(targetSymbols);
    data.forEach(quote => {
      quotes.value.set(quote.symbol, quote);
    });
  }

  async function fetchStats(period: 'today' | 'week' | 'month') {
    stats.value = await tradingApi.getStats(period);
  }

  function addToWatchlist(symbol: string) {
    if (!watchlist.value.includes(symbol)) {
      watchlist.value.push(symbol);
      localStorage.setItem('watchlist', JSON.stringify(watchlist.value));
    }
  }

  function removeFromWatchlist(symbol: string) {
    const index = watchlist.value.indexOf(symbol);
    if (index > -1) {
      watchlist.value.splice(index, 1);
      localStorage.setItem('watchlist', JSON.stringify(watchlist.value));
    }
  }

  // 初始化自选列表
  function initWatchlist() {
    const saved = localStorage.getItem('watchlist');
    if (saved) {
      watchlist.value = JSON.parse(saved);
    }
  }

  return {
    positions,
    quotes,
    stats,
    watchlist,
    isLoading,
    totalPositions,
    totalProfit,
    longPositions,
    shortPositions,
    fetchPositions,
    fetchQuotes,
    fetchStats,
    addToWatchlist,
    removeFromWatchlist,
    initWatchlist,
  };
});
```

### 租户 Store

```typescript
// src/stores/tenant.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { brandingApi } from '@/api/branding';
import type { TenantBranding } from '@/types/tenant';

export const useTenantStore = defineStore('tenant', () => {
  const tenantCode = ref<string>('');
  const branding = ref<TenantBranding | null>(null);
  const isLoading = ref(false);

  const logoUrl = computed(() => branding.value?.logoUrl || '/default-logo.png');
  const displayName = computed(() => branding.value?.displayName || 'Trading Platform');
  const primaryColor = computed(() => branding.value?.primaryColor || '#6366F1');

  // 从域名或路径解析租户编码
  function detectTenantCode() {
    const hostname = window.location.hostname;

    // 子域名模式: {tenant}.tenant.example.com
    const subdomainMatch = hostname.match(/^([^.]+)\.tenant\./);
    if (subdomainMatch) {
      tenantCode.value = subdomainMatch[1];
      return;
    }

    // 自定义域名模式: 从 API 获取
    // 或者从环境变量获取
    tenantCode.value = import.meta.env.VITE_TENANT_CODE || '';
  }

  async function fetchBranding() {
    if (!tenantCode.value) {
      detectTenantCode();
    }

    if (!tenantCode.value) return;

    isLoading.value = true;
    try {
      branding.value = await brandingApi.getBranding(tenantCode.value);
      applyBranding();
    } finally {
      isLoading.value = false;
    }
  }

  function applyBranding() {
    if (!branding.value) return;

    // 应用主题色
    if (branding.value.primaryColor) {
      document.documentElement.style.setProperty(
        '--primary-color',
        branding.value.primaryColor
      );
    }

    // 更新页面标题
    if (branding.value.displayName) {
      document.title = branding.value.displayName;
    }

    // 更新 Favicon
    if (branding.value.faviconUrl) {
      const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
      if (favicon) {
        favicon.href = branding.value.faviconUrl;
      }
    }
  }

  return {
    tenantCode,
    branding,
    isLoading,
    logoUrl,
    displayName,
    primaryColor,
    detectTenantCode,
    fetchBranding,
    applyBranding,
  };
});
```

## 路由设计

```typescript
// src/router/routes.ts
import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: {
      layout: 'auth',
      title: 'login',
      requiresAuth: false,
    },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: {
      title: 'dashboard',
      icon: 'dashboard',
    },
  },
  {
    path: '/users',
    name: 'Users',
    meta: {
      title: 'users.title',
      icon: 'users',
    },
    children: [
      {
        path: '',
        name: 'UserList',
        component: () => import('@/views/users/UserListView.vue'),
        meta: { title: 'users.list' },
      },
      {
        path: ':login',
        name: 'UserDetail',
        component: () => import('@/views/users/UserDetailView.vue'),
        meta: { title: 'users.detail' },
      },
    ],
  },
  {
    path: '/trading',
    name: 'Trading',
    meta: {
      title: 'trading.title',
      icon: 'chart',
    },
    children: [
      {
        path: 'positions',
        name: 'Positions',
        component: () => import('@/views/trading/PositionsView.vue'),
        meta: { title: 'trading.positions' },
      },
      {
        path: 'quotes',
        name: 'Quotes',
        component: () => import('@/views/trading/QuotesView.vue'),
        meta: { title: 'trading.quotes' },
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('@/views/trading/HistoryView.vue'),
        meta: { title: 'trading.history' },
      },
      {
        path: 'risk',
        name: 'RiskMonitor',
        component: () => import('@/views/trading/RiskMonitorView.vue'),
        meta: { title: 'trading.risk' },
      },
    ],
  },
  {
    path: '/reports',
    name: 'Reports',
    meta: {
      title: 'reports.title',
      icon: 'report',
    },
    children: [
      {
        path: 'trading',
        name: 'TradingReport',
        component: () => import('@/views/reports/TradingReportView.vue'),
        meta: { title: 'reports.trading' },
      },
      {
        path: 'users',
        name: 'UserReport',
        component: () => import('@/views/reports/UserReportView.vue'),
        meta: { title: 'reports.users' },
      },
      {
        path: 'finance',
        name: 'FinanceReport',
        component: () => import('@/views/reports/FinanceReportView.vue'),
        meta: { title: 'reports.finance' },
      },
    ],
  },
  {
    path: '/settings',
    name: 'Settings',
    meta: {
      title: 'settings.title',
      icon: 'settings',
    },
    children: [
      {
        path: 'branding',
        name: 'Branding',
        component: () => import('@/views/settings/BrandingView.vue'),
        meta: {
          title: 'settings.branding',
          roles: ['owner', 'admin'],
        },
      },
      {
        path: 'admins',
        name: 'Admins',
        component: () => import('@/views/settings/AdminsView.vue'),
        meta: {
          title: 'settings.admins',
          roles: ['owner'],
        },
      },
      {
        path: 'api-keys',
        name: 'ApiKeys',
        component: () => import('@/views/settings/ApiKeysView.vue'),
        meta: {
          title: 'settings.apiKeys',
          roles: ['owner', 'admin'],
        },
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: () => import('@/views/settings/NotificationsView.vue'),
        meta: { title: 'settings.notifications' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/settings/ProfileView.vue'),
        meta: { title: 'settings.profile' },
      },
    ],
  },
];
```

### 路由守卫

```typescript
// src/router/guards.ts
import type { Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';

export function setupRouterGuards(router: Router) {
  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore();
    const tenantStore = useTenantStore();

    // 加载租户信息
    if (!tenantStore.branding) {
      await tenantStore.fetchBranding();
    }

    // 检查认证
    const requiresAuth = to.meta.requiresAuth !== false;

    if (requiresAuth && !authStore.isAuthenticated) {
      return next({
        name: 'Login',
        query: { redirect: to.fullPath }
      });
    }

    // 检查角色权限
    const allowedRoles = to.meta.roles as string[] | undefined;
    if (allowedRoles && authStore.admin) {
      if (!allowedRoles.includes(authStore.admin.role)) {
        return next({ name: 'Dashboard' });
      }
    }

    // 已登录用户访问登录页
    if (to.name === 'Login' && authStore.isAuthenticated) {
      return next({ name: 'Dashboard' });
    }

    next();
  });

  router.afterEach((to) => {
    const tenantStore = useTenantStore();
    const baseTitle = tenantStore.displayName;
    const pageTitle = to.meta.title as string;

    document.title = pageTitle
      ? `${pageTitle} - ${baseTitle}`
      : baseTitle;
  });
}
```

## 国际化设计

```typescript
// src/locales/index.ts
import { createI18n } from 'vue-i18n';

// 语言包懒加载
const loadLocaleMessages = async (locale: string) => {
  const modules = import.meta.glob('./*/*.json');
  const messages: Record<string, any> = {};

  for (const path in modules) {
    if (path.includes(`/${locale}/`)) {
      const mod = await modules[path]() as any;
      const namespace = path.split('/').pop()?.replace('.json', '') || '';
      messages[namespace] = mod.default;
    }
  }

  return messages;
};

// 检测浏览器语言
const detectLanguage = (): string => {
  const stored = localStorage.getItem('locale');
  if (stored) return stored;

  const browserLang = navigator.language;
  if (browserLang.startsWith('zh')) return 'zh-CN';
  return 'en-US';
};

export const i18n = createI18n({
  legacy: false,
  locale: detectLanguage(),
  fallbackLocale: 'en-US',
  messages: {},
});

// 切换语言
export async function setLocale(locale: string) {
  const messages = await loadLocaleMessages(locale);
  i18n.global.setLocaleMessage(locale, messages);
  i18n.global.locale.value = locale;
  localStorage.setItem('locale', locale);
  document.documentElement.setAttribute('lang', locale);
}

// 初始化
export async function setupI18n() {
  const locale = detectLanguage();
  await setLocale(locale);
}
```

### 语言包示例

```json
// src/locales/zh-CN/trading.json
{
  "title": "交易监控",
  "positions": "实时持仓",
  "quotes": "实时报价",
  "history": "交易历史",
  "risk": "风控监控",
  "stats": {
    "totalPositions": "持仓总数",
    "totalProfit": "浮动盈亏",
    "longPositions": "多头持仓",
    "shortPositions": "空头持仓",
    "todayVolume": "今日交易量",
    "todayAmount": "今日交易额"
  },
  "position": {
    "login": "账号",
    "symbol": "品种",
    "type": "方向",
    "volume": "手数",
    "openPrice": "开仓价",
    "currentPrice": "当前价",
    "profit": "盈亏",
    "openTime": "开仓时间"
  },
  "order": {
    "ticket": "订单号",
    "closePrice": "平仓价",
    "closeTime": "平仓时间",
    "commission": "手续费",
    "swap": "库存费"
  },
  "direction": {
    "buy": "买入",
    "sell": "卖出"
  },
  "filter": {
    "all": "全部",
    "profitable": "盈利",
    "losing": "亏损"
  }
}
```

```json
// src/locales/en-US/trading.json
{
  "title": "Trading Monitor",
  "positions": "Open Positions",
  "quotes": "Live Quotes",
  "history": "Trade History",
  "risk": "Risk Monitor",
  "stats": {
    "totalPositions": "Total Positions",
    "totalProfit": "Floating P/L",
    "longPositions": "Long Positions",
    "shortPositions": "Short Positions",
    "todayVolume": "Today's Volume",
    "todayAmount": "Today's Amount"
  },
  "position": {
    "login": "Login",
    "symbol": "Symbol",
    "type": "Type",
    "volume": "Volume",
    "openPrice": "Open Price",
    "currentPrice": "Current Price",
    "profit": "Profit",
    "openTime": "Open Time"
  },
  "order": {
    "ticket": "Ticket",
    "closePrice": "Close Price",
    "closeTime": "Close Time",
    "commission": "Commission",
    "swap": "Swap"
  },
  "direction": {
    "buy": "Buy",
    "sell": "Sell"
  },
  "filter": {
    "all": "All",
    "profitable": "Profitable",
    "losing": "Losing"
  }
}
```

## 主题系统

### CSS 变量

```css
/* src/styles/variables.css */
:root {
  /* 主色调 - 可被租户白标覆盖 */
  --primary-color: #6366F1;
  --primary-hover: #4F46E5;
  --primary-active: #4338CA;
  --primary-light: #E0E7FF;

  /* 语义色 */
  --success-color: #10B981;
  --warning-color: #F59E0B;
  --error-color: #EF4444;
  --info-color: #3B82F6;

  /* 交易专用色 */
  --profit-color: #10B981;
  --loss-color: #EF4444;
  --buy-color: #3B82F6;
  --sell-color: #EF4444;

  /* 浅色主题 */
  --bg-color: #F8FAFC;
  --bg-elevated: #FFFFFF;
  --bg-card: #FFFFFF;
  --text-primary: #1E293B;
  --text-secondary: #64748B;
  --text-tertiary: #94A3B8;
  --border-color: #E2E8F0;
  --divider-color: #F1F5F9;

  /* 布局 */
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
  --header-height: 64px;

  /* 圆角 */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* 阴影 */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* 动画 */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;
}

/* 深色主题 */
[data-theme="dark"] {
  --bg-color: #0F172A;
  --bg-elevated: #1E293B;
  --bg-card: #1E293B;
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --text-tertiary: #64748B;
  --border-color: #334155;
  --divider-color: #1E293B;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
}
```

## 组件设计

### 持仓卡片组件

```vue
<!-- src/components/trading/PositionCard.vue -->
<template>
  <div class="position-card" :class="{ 'is-profit': position.profit > 0 }">
    <div class="position-header">
      <span class="symbol">{{ position.symbol }}</span>
      <n-tag :type="position.type === 'BUY' ? 'info' : 'error'" size="small">
        {{ t(`trading.direction.${position.type.toLowerCase()}`) }}
      </n-tag>
    </div>

    <div class="position-body">
      <div class="position-info">
        <span class="label">{{ t('trading.position.volume') }}</span>
        <span class="value">{{ position.volume }}</span>
      </div>
      <div class="position-info">
        <span class="label">{{ t('trading.position.openPrice') }}</span>
        <span class="value">{{ formatPrice(position.openPrice) }}</span>
      </div>
      <div class="position-info">
        <span class="label">{{ t('trading.position.currentPrice') }}</span>
        <span class="value">{{ formatPrice(position.currentPrice) }}</span>
      </div>
    </div>

    <div class="position-footer">
      <span class="profit" :class="profitClass">
        {{ formatProfit(position.profit) }}
      </span>
      <span class="time">{{ formatTime(position.openTime) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NTag } from 'naive-ui';
import type { Position } from '@/types/trading';
import { formatPrice, formatProfit, formatTime } from '@/utils/format';

interface Props {
  position: Position;
}

const props = defineProps<Props>();
const { t } = useI18n();

const profitClass = computed(() => ({
  'is-profit': props.position.profit > 0,
  'is-loss': props.position.profit < 0,
}));
</script>

<style scoped>
.position-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-fast);
}

.position-card:hover {
  box-shadow: var(--shadow-md);
}

.position-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.symbol {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-primary);
}

.position-body {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.position-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.value {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.position-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--divider-color);
}

.profit {
  font-size: 18px;
  font-weight: 600;
}

.profit.is-profit {
  color: var(--profit-color);
}

.profit.is-loss {
  color: var(--loss-color);
}

.time {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
```

### 报价卡片组件

```vue
<!-- src/components/trading/QuoteCard.vue -->
<template>
  <div class="quote-card" :class="{ 'is-up': isUp, 'is-down': !isUp }">
    <div class="quote-header">
      <span class="symbol">{{ quote.symbol }}</span>
      <n-button
        text
        :type="isInWatchlist ? 'warning' : 'default'"
        @click="toggleWatchlist"
      >
        <template #icon>
          <n-icon><StarIcon /></n-icon>
        </template>
      </n-button>
    </div>

    <div class="quote-prices">
      <div class="price sell">
        <span class="label">{{ t('common.sell') }}</span>
        <span class="value">{{ formatPrice(quote.bid) }}</span>
      </div>
      <div class="spread">{{ spread }}</div>
      <div class="price buy">
        <span class="label">{{ t('common.buy') }}</span>
        <span class="value">{{ formatPrice(quote.ask) }}</span>
      </div>
    </div>

    <div class="quote-footer">
      <span class="change" :class="{ 'is-up': isUp, 'is-down': !isUp }">
        {{ changePercent }}
      </span>
      <span class="range">
        L: {{ formatPrice(quote.low) }} / H: {{ formatPrice(quote.high) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NIcon } from 'naive-ui';
import { Star as StarIcon } from '@vicons/ionicons5';
import { useTradingStore } from '@/stores/trading';
import type { Quote } from '@/types/trading';
import { formatPrice } from '@/utils/format';

interface Props {
  quote: Quote;
}

const props = defineProps<Props>();
const { t } = useI18n();
const tradingStore = useTradingStore();

const isUp = computed(() => props.quote.change >= 0);
const spread = computed(() =>
  ((props.quote.ask - props.quote.bid) * 10000).toFixed(1)
);
const changePercent = computed(() => {
  const sign = props.quote.changePercent >= 0 ? '+' : '';
  return `${sign}${props.quote.changePercent.toFixed(2)}%`;
});

const isInWatchlist = computed(() =>
  tradingStore.watchlist.includes(props.quote.symbol)
);

function toggleWatchlist() {
  if (isInWatchlist.value) {
    tradingStore.removeFromWatchlist(props.quote.symbol);
  } else {
    tradingStore.addToWatchlist(props.quote.symbol);
  }
}
</script>

<style scoped>
.quote-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  border-left: 4px solid transparent;
}

.quote-card.is-up {
  border-left-color: var(--profit-color);
}

.quote-card.is-down {
  border-left-color: var(--loss-color);
}

.quote-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.symbol {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-primary);
}

.quote-prices {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.price {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price .label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.price .value {
  font-size: 20px;
  font-weight: 600;
}

.price.sell .value {
  color: var(--sell-color);
}

.price.buy .value {
  color: var(--buy-color);
}

.spread {
  background: var(--bg-elevated);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
}

.quote-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.change {
  font-weight: 500;
}

.change.is-up {
  color: var(--profit-color);
}

.change.is-down {
  color: var(--loss-color);
}

.range {
  color: var(--text-tertiary);
}
</style>
```

## WebSocket 设计

```typescript
// src/composables/useWebSocket.ts
import { ref, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';

interface WebSocketOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: WebSocketOptions = {}) {
  const {
    reconnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
  } = options;

  const ws = ref<WebSocket | null>(null);
  const isConnected = ref(false);
  const reconnectAttempts = ref(0);

  const authStore = useAuthStore();
  const tenantStore = useTenantStore();

  const messageHandlers = new Map<string, Set<(data: any) => void>>();

  function connect() {
    const baseUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
    const url = `${baseUrl}/ws?token=${authStore.token}&tenant=${tenantStore.tenantCode}`;

    ws.value = new WebSocket(url);

    ws.value.onopen = () => {
      isConnected.value = true;
      reconnectAttempts.value = 0;
      console.log('WebSocket connected');
    };

    ws.value.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        const handlers = messageHandlers.get(type);
        if (handlers) {
          handlers.forEach(handler => handler(data));
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };

    ws.value.onclose = () => {
      isConnected.value = false;
      console.log('WebSocket disconnected');

      if (reconnect && reconnectAttempts.value < maxReconnectAttempts) {
        reconnectAttempts.value++;
        setTimeout(connect, reconnectInterval);
      }
    };

    ws.value.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  function disconnect() {
    if (ws.value) {
      ws.value.close();
      ws.value = null;
    }
  }

  function subscribe(type: string, handler: (data: any) => void) {
    if (!messageHandlers.has(type)) {
      messageHandlers.set(type, new Set());
    }
    messageHandlers.get(type)!.add(handler);

    // 发送订阅消息
    send({ action: 'subscribe', type });
  }

  function unsubscribe(type: string, handler: (data: any) => void) {
    const handlers = messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        messageHandlers.delete(type);
        send({ action: 'unsubscribe', type });
      }
    }
  }

  function send(data: any) {
    if (ws.value && isConnected.value) {
      ws.value.send(JSON.stringify(data));
    }
  }

  onMounted(() => {
    if (authStore.isAuthenticated) {
      connect();
    }
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    isConnected,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    send,
  };
}
```

## 构建配置

### Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'naive-ui': ['naive-ui'],
          'echarts': ['echarts'],
          'i18n': ['vue-i18n'],
        },
      },
    },
  },
});
```

### Docker 配置

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

    # 支持租户子域名
    # 实际域名由反向代理层处理

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 代理
    location /api {
        proxy_pass http://platform-service:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://platform-service:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  tenant-console:
    build: .
    ports:
      - "5174:80"
    environment:
      - VITE_API_BASE_URL=/api/v1
    depends_on:
      - platform-service
    networks:
      - mt5-network

networks:
  mt5-network:
    external: true
```

## 类型定义

```typescript
// src/types/trading.ts
export interface Position {
  ticket: number;
  login: number;
  userName?: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  swap: number;
  commission: number;
  openTime: string;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  time: string;
}

export interface Order {
  ticket: number;
  login: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  closePrice: number;
  profit: number;
  swap: number;
  commission: number;
  openTime: string;
  closeTime: string;
}

export interface TradingStats {
  totalOrders: number;
  totalVolume: number;
  totalProfit: number;
  totalCommission: number;
  winRate: number;
  averageProfit: number;
  averageLoss: number;
  bySymbol: {
    symbol: string;
    orders: number;
    volume: number;
    profit: number;
  }[];
}

export interface PositionQuery {
  login?: number;
  symbol?: string;
  type?: 'BUY' | 'SELL';
  profitStatus?: 'profit' | 'loss' | 'all';
}

export interface HistoryQuery {
  login?: number;
  symbol?: string;
  type?: 'BUY' | 'SELL';
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}
```

```typescript
// src/types/user.ts
export interface TradingUser {
  login: number;
  name: string;
  email?: string;
  group: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  status: 'active' | 'disabled';
  lastLogin?: string;
  createdAt: string;
}

export interface UserListQuery {
  search?: string;
  status?: 'active' | 'disabled' | 'all';
  group?: string;
  balanceMin?: number;
  balanceMax?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UserListResponse {
  data: TradingUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

```typescript
// src/types/tenant.ts
export interface TenantBranding {
  tenantCode: string;
  displayName: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyName?: string;
  supportUrl?: string;
}

export interface TenantAdmin {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'operator';
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}
```
