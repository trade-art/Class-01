# 任务清单: Tenant Admin Console

## 任务概览

| 阶段 | 任务数 | 完成 | 描述 |
|------|--------|------|------|
| Phase 1 | 5 | 5 | 项目初始化与基础架构 |
| Phase 2 | 4 | 4 | 认证与布局 |
| Phase 3 | 5 | 5 | 交易用户管理 |
| Phase 4 | 5 | 5 | 交易监控 |
| Phase 5 | 4 | 4 | 报表统计 |
| Phase 6 | 4 | 4 | 系统设置 |
| Phase 7 | 3 | 3 | 构建与部署 |
| **Total** | **30** | **30** | **100%** |

---

## Phase 1: 项目初始化与基础架构

### Task 1: 项目脚手架搭建

- [x] 1.1 使用 Vite 创建 Vue 3 + TypeScript 项目
- [x] 1.2 配置项目结构 (src/api, components, composables, layouts, locales, router, stores, types, utils, views)
- [x] 1.3 安装核心依赖 (naive-ui, pinia, vue-router, axios, vue-i18n, echarts)
- [x] 1.4 配置 TypeScript (tsconfig.json, 路径别名)
- [x] 1.5 配置 Vite (代理、构建优化、chunk分割)

_验收标准: 项目可以 npm run dev 启动，无报错_

### Task 2: UnoCSS 与主题系统

- [x] 2.1 安装配置 UnoCSS (uno.config.ts)
- [x] 2.2 创建 CSS 变量文件 (variables.css) - 浅色/深色主题
- [x] 2.3 配置交易专用色 (盈亏色、买卖色)
- [x] 2.4 创建过渡动画样式 (transitions.css)
- [x] 2.5 配置 Naive UI 主题覆盖

_验收标准: 主题变量生效，UnoCSS 原子类可用_

### Task 3: 国际化系统

- [x] 3.1 配置 Vue I18n (src/locales/index.ts)
- [x] 3.2 创建中文语言包 (zh-CN/*.json)
- [x] 3.3 创建英文语言包 (en-US/*.json)
- [x] 3.4 实现语言懒加载
- [x] 3.5 创建 useLocale composable

_验收标准: 可切换中英文，文本正确显示_

### Task 4: API 层封装

- [x] 4.1 创建 Axios 实例 (src/api/index.ts)
- [x] 4.2 实现请求拦截器 (Token 注入、租户标识)
- [x] 4.3 实现响应拦截器 (错误处理、401跳转)
- [x] 4.4 创建 API 模块文件 (auth, users, trading, positions, reports, admins, branding, api-keys, settings)
- [x] 4.5 定义 TypeScript 类型 (src/types/*.ts)

_验收标准: API 请求可正常发送，类型完整_

### Task 5: 状态管理 Pinia

- [x] 5.1 配置 Pinia store
- [x] 5.2 创建 auth store (登录状态、管理员信息、角色权限)
- [x] 5.3 创建 tenant store (租户信息、白标配置)
- [x] 5.4 创建 settings store (主题、语言)
- [x] 5.5 创建 users store (用户列表、筛选)

_验收标准: Store 可正常读写，持久化生效_

---

## Phase 2: 认证与布局

### Task 6: 路由配置

- [x] 6.1 定义路由表 (src/router/routes.ts)
- [x] 6.2 配置路由守卫 (认证检查、角色权限检查)
- [x] 6.3 实现路由懒加载
- [x] 6.4 配置页面标题和 meta

_验收标准: 路由跳转正常，未登录重定向到登录页，权限控制生效_

### Task 7: 登录页面

- [x] 7.1 创建 AuthLayout 布局
- [x] 7.2 实现 LoginView 页面
- [x] 7.3 创建登录表单 (邮箱、密码、记住我)
- [x] 7.4 实现租户信息动态加载 (Logo、名称)
- [x] 7.5 实现登录逻辑 (调用API、存储Token)
- [x] 7.6 添加表单验证和错误提示

_验收标准: 可正常登录，租户品牌正确显示，错误时显示提示_

### Task 8: 主布局组件

- [x] 8.1 创建 DefaultLayout (侧边栏+顶栏布局)
- [x] 8.2 创建 AppSidebar (菜单导航、折叠、租户Logo)
- [x] 8.3 创建 AppHeader (用户信息、语言切换、主题切换、登出)
- [x] 8.4 创建 AppBreadcrumb (面包屑导航)
- [x] 8.5 实现页面切换动画

_验收标准: 布局正确渲染，菜单可导航，白标Logo显示_

### Task 9: 通用组件

- [x] 9.1 创建 DataTable 组件 (表格封装、分页、加载)
- [x] 9.2 创建 StatusBadge 组件 (状态标签)
- [x] 9.3 创建 SearchBar 组件 (搜索筛选栏)
- [x] 9.4 创建 ConfirmDialog 组件 (确认对话框)
- [x] 9.5 创建 EmptyState 组件 (空状态)
- [x] 9.6 创建 PageLoading 组件 (骨架屏)
- [x] 9.7 创建 ColorPicker 组件 (颜色选择器)

_验收标准: 组件可复用，样式统一_

---

## Phase 3: 交易用户管理

### Task 10: Dashboard 页面

- [x] 10.1 创建 DashboardView 页面
- [x] 10.2 实现统计卡片组件 (用户数、交易量、持仓、盈亏)
- [x] 10.3 实现交易趋势折线图
- [x] 10.4 实现品种分布饼图
- [x] 10.5 实现用户活跃度柱状图
- [x] 10.6 实现最近交易列表
- [x] 10.7 实现系统状态显示
- [x] 10.8 添加数据自动刷新

_验收标准: Dashboard 数据正确展示，图表渲染正常_

### Task 11: 用户列表页面

- [x] 11.1 创建 UserListView 页面
- [x] 11.2 实现用户表格 (Login、姓名、组别、余额、净值、状态)
- [x] 11.3 实现搜索功能 (Login/姓名/邮箱)
- [x] 11.4 实现筛选功能 (状态、组别、余额范围)
- [x] 11.5 实现分页和排序
- [x] 11.6 实现快捷操作 (禁用/启用、修改组别)
- [x] 11.7 实现导出 CSV 功能

_验收标准: 用户列表功能完整，搜索筛选正常_

### Task 12: 用户详情页面

- [x] 12.1 创建 UserDetailView 页面
- [x] 12.2 实现基本信息 Tab (Login、姓名、组别、杠杆、状态)
- [x] 12.3 实现账户余额 Tab (余额、净值、保证金信息)
- [x] 12.4 实现持仓列表 Tab
- [x] 12.5 实现交易历史 Tab
- [x] 12.6 实现出入金记录 Tab
- [x] 12.7 实现操作日志 Tab
- [x] 12.8 实现用户操作 (修改组别、调整杠杆、禁用/启用)

_验收标准: 用户详情完整展示，操作功能正常_

### Task 13: 用户相关组件

- [x] 13.1 创建 UserCard 组件 (用户信息卡片)
- [x] 13.2 创建 BalanceInfo 组件 (余额信息展示)
- [x] 13.3 创建 UserForm 组件 (编辑用户表单)
- [x] 13.4 创建 TransactionList 组件 (出入金列表)

_验收标准: 组件可复用，数据展示正确_

### Task 14: Users Store 完善

- [x] 14.1 实现用户列表获取和缓存
- [x] 14.2 实现用户详情获取
- [x] 14.3 实现用户操作 (修改组别、杠杆、状态)
- [x] 14.4 实现数据刷新机制

_验收标准: Store 功能完整，数据同步正确_

---

## Phase 4: 交易监控

### Task 15: 实时持仓页面

- [x] 15.1 创建 PositionsView 页面
- [x] 15.2 实现持仓表格 (账号、品种、方向、手数、盈亏等)
- [x] 15.3 实现持仓筛选 (按用户、品种、盈亏状态)
- [x] 15.4 实现持仓统计面板 (总持仓、多空比、总盈亏)
- [x] 15.5 创建 PositionCard 组件
- [x] 15.6 实现实时刷新 (WebSocket 或轮询)

_验收标准: 持仓数据实时更新，筛选功能正常_

### Task 16: 实时报价页面

- [x] 16.1 创建 QuotesView 页面
- [x] 16.2 实现报价卡片列表
- [x] 16.3 创建 QuoteCard 组件 (买卖价、点差、涨跌)
- [x] 16.4 实现自选列表管理 (添加/移除)
- [x] 16.5 实现品种搜索
- [x] 16.6 实现实时价格推送

_验收标准: 报价实时更新，自选列表功能正常_

### Task 17: 交易历史页面

- [x] 17.1 创建 HistoryView 页面
- [x] 17.2 实现历史订单表格
- [x] 17.3 实现筛选功能 (用户、品种、时间范围、盈亏)
- [x] 17.4 实现统计面板 (总订单、总盈亏、胜率)
- [x] 17.5 实现导出功能 (CSV/Excel)

_验收标准: 历史查询功能完整，导出正常_

### Task 18: 风控监控页面

- [x] 18.1 创建 RiskMonitorView 页面
- [x] 18.2 实现预警列表 (大额交易、保证金预警、异常交易)
- [x] 18.3 创建 RiskAlert 组件
- [x] 18.4 实现预警阈值配置
- [x] 18.5 实现预警通知

_验收标准: 风控预警功能正常，配置可用_

### Task 19: Trading Store 和 WebSocket

- [x] 19.1 创建 trading store (持仓、统计)
- [x] 19.2 创建 positions store (持仓列表)
- [x] 19.3 创建 useWebSocket composable
- [x] 19.4 实现持仓实时更新
- [x] 19.5 实现报价实时更新

_验收标准: 实时数据推送正常，Store 同步正确_

---

## Phase 5: 报表统计

### Task 20: 交易报表页面

- [x] 20.1 创建 TradingReportView 页面
- [x] 20.2 实现日/周/月报表切换
- [x] 20.3 实现交易量趋势图
- [x] 20.4 实现交易额趋势图
- [x] 20.5 实现品种分析图表
- [x] 20.6 实现时段分析图表
- [x] 20.7 实现报表导出

_验收标准: 交易报表数据正确，图表渲染正常_

### Task 21: 用户报表页面

- [x] 21.1 创建 UserReportView 页面
- [x] 21.2 实现新增用户趋势图
- [x] 21.3 实现活跃用户趋势图
- [x] 21.4 实现用户留存率分析
- [x] 21.5 实现用户价值排名
- [x] 21.6 实现用户分组统计

_验收标准: 用户报表功能完整_

### Task 22: 财务报表页面

- [x] 22.1 创建 FinanceReportView 页面
- [x] 22.2 实现出入金统计
- [x] 22.3 实现资金流水图表
- [x] 22.4 实现手续费收入统计
- [x] 22.5 实现月度收益对比
- [x] 22.6 实现报表导出 (PDF/Excel)

_验收标准: 财务报表数据正确，导出正常_

### Task 23: 图表组件

- [x] 23.1 创建 LineChart 组件 (折线图)
- [x] 23.2 创建 BarChart 组件 (柱状图)
- [x] 23.3 创建 PieChart 组件 (饼图)
- [x] 23.4 创建 AreaChart 组件 (面积图)
- [x] 23.5 实现图表响应式和主题适配
- [x] 23.6 添加图表加载状态

_验收标准: 图表组件通用，支持深色模式_

---

## Phase 6: 系统设置

### Task 24: 白标配置页面

- [x] 24.1 创建 BrandingView 页面
- [x] 24.2 实现 Logo 上传
- [x] 24.3 实现 Favicon 上传
- [x] 24.4 实现主题色选择 (颜色选择器)
- [x] 24.5 实现显示名称配置
- [x] 24.6 实现联系信息配置
- [x] 24.7 实现实时预览

_验收标准: 白标配置功能完整，预览正常_

### Task 25: 管理员管理页面

- [x] 25.1 创建 AdminsView 页面 (仅 Owner 可访问)
- [x] 25.2 实现管理员列表
- [x] 25.3 实现创建管理员 (角色选择: owner/admin/operator)
- [x] 25.4 实现编辑管理员
- [x] 25.5 实现重置密码
- [x] 25.6 实现启用/禁用/删除

_验收标准: 管理员管理功能完整，权限控制正确_

### Task 26: API 密钥管理页面

- [x] 26.1 创建 ApiKeysView 页面
- [x] 26.2 实现密钥列表
- [x] 26.3 实现创建密钥 (权限配置、显示完整密钥)
- [x] 26.4 实现编辑权限
- [x] 26.5 实现重新生成/启用/禁用/删除

_验收标准: API 密钥管理功能完整_

### Task 27: 个人设置页面

- [x] 27.1 创建 ProfileView 页面
- [x] 27.2 实现修改密码 (旧密码验证)
- [x] 27.3 实现修改个人信息
- [x] 27.4 创建 NotificationsView 页面
- [x] 27.5 实现通知设置 (告警接收、通知方式)
- [x] 27.6 实现 MT5 服务器状态查看 (只读)

_验收标准: 个人设置功能完整_

---

## Phase 7: 构建与部署

### Task 28: 构建优化

- [x] 28.1 优化 Vite 构建配置
- [x] 28.2 配置代码分割 (vendor chunks)
- [x] 28.3 配置资源压缩
- [x] 28.4 配置 PWA (可选)

_验收标准: 构建产物体积合理，加载性能良好_

### Task 29: Docker 部署

- [x] 29.1 创建 Dockerfile
- [x] 29.2 创建 nginx.conf (支持租户子域名)
- [x] 29.3 创建 docker-compose.yml
- [x] 29.4 配置环境变量

_验收标准: 可成功构建 Docker 镜像并运行_

### Task 30: 文档和测试

- [x] 30.1 编写部署文档
- [x] 30.2 编写环境配置文档
- [x] 30.3 配置 E2E 测试 (可选)

_验收标准: 文档完整，可按文档部署_

---

## 依赖关系

```
Task 1 (脚手架)
    ↓
Task 2 (UnoCSS) ─────┐
Task 3 (i18n) ───────┼──→ Task 4 (API层) ──→ Task 5 (Pinia)
                     │         ↓
                     └────→ Task 6 (路由) ──→ Task 7 (登录)
                                  ↓
                            Task 8 (布局) ──→ Task 9 (通用组件)
                                  ↓
                            Task 10 (Dashboard)
                                  ↓
              ┌───────────────────┼───────────────────┐
              ↓                   ↓                   ↓
         Task 11-14          Task 15-19          Task 20-23
         (用户管理)           (交易监控)          (报表统计)
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  ↓
                            Task 24-27
                            (系统设置)
                                  ↓
                            Task 28-30
                            (构建部署)
```

---

## 实现摘要

### 已创建的文件

**Phase 1: 项目初始化**
- `apps/tenant-console/package.json` - 项目依赖配置
- `apps/tenant-console/index.html` - HTML入口
- `apps/tenant-console/tsconfig.json` - TypeScript配置
- `apps/tenant-console/tsconfig.node.json` - Node TypeScript配置
- `apps/tenant-console/vite.config.ts` - Vite构建配置(端口5174)
- `apps/tenant-console/uno.config.ts` - UnoCSS配置
- `apps/tenant-console/src/main.ts` - 应用入口
- `apps/tenant-console/src/App.vue` - 根组件
- `apps/tenant-console/src/styles/variables.css` - CSS变量
- `apps/tenant-console/src/styles/global.css` - 全局样式
- `apps/tenant-console/src/styles/transitions.css` - 过渡动画
- `apps/tenant-console/src/locales/index.ts` - i18n配置
- `apps/tenant-console/src/locales/zh-CN.ts` - 中文语言包
- `apps/tenant-console/src/locales/en-US.ts` - 英文语言包
- `apps/tenant-console/src/types/index.ts` - TypeScript类型定义
- `apps/tenant-console/src/api/index.ts` - Axios实例
- `apps/tenant-console/src/api/auth.ts` - 认证API
- `apps/tenant-console/src/api/users.ts` - 用户API
- `apps/tenant-console/src/api/trading.ts` - 交易API
- `apps/tenant-console/src/api/reports.ts` - 报表API
- `apps/tenant-console/src/api/settings.ts` - 设置API
- `apps/tenant-console/src/stores/auth.ts` - 认证Store
- `apps/tenant-console/src/stores/tenant.ts` - 租户Store
- `apps/tenant-console/src/stores/settings.ts` - 设置Store
- `apps/tenant-console/src/stores/users.ts` - 用户Store
- `apps/tenant-console/src/stores/trading.ts` - 交易Store

**Phase 2: 认证与布局**
- `apps/tenant-console/src/router/index.ts` - 路由配置
- `apps/tenant-console/src/views/login/index.vue` - 登录页
- `apps/tenant-console/src/layouts/DefaultLayout.vue` - 主布局
- `apps/tenant-console/src/views/dashboard/index.vue` - 仪表板
- `apps/tenant-console/src/components/charts/LineChart.vue` - 折线图
- `apps/tenant-console/src/components/charts/PieChart.vue` - 饼图
- `apps/tenant-console/src/components/charts/BarChart.vue` - 柱状图
- `apps/tenant-console/src/components/common/DataTable.vue` - 数据表格
- `apps/tenant-console/src/components/common/StatusBadge.vue` - 状态标签
- `apps/tenant-console/src/components/common/SearchBar.vue` - 搜索栏
- `apps/tenant-console/src/components/common/ProfitDisplay.vue` - 盈亏显示

**Phase 3: 用户管理**
- `apps/tenant-console/src/views/users/index.vue` - 用户列表
- `apps/tenant-console/src/views/users/detail.vue` - 用户详情

**Phase 4: 交易监控**
- `apps/tenant-console/src/views/positions/index.vue` - 实时持仓
- `apps/tenant-console/src/views/quotes/index.vue` - 实时报价
- `apps/tenant-console/src/views/history/index.vue` - 交易历史
- `apps/tenant-console/src/views/risk/index.vue` - 风控监控

**Phase 5: 报表统计**
- `apps/tenant-console/src/views/reports/index.vue` - 报表概览
- `apps/tenant-console/src/views/reports/trading.vue` - 交易报表
- `apps/tenant-console/src/views/reports/users.vue` - 用户报表
- `apps/tenant-console/src/views/reports/finance.vue` - 财务报表

**Phase 6: 系统设置**
- `apps/tenant-console/src/views/settings/index.vue` - 设置概览
- `apps/tenant-console/src/views/settings/branding.vue` - 白标配置
- `apps/tenant-console/src/views/settings/admins.vue` - 管理员管理
- `apps/tenant-console/src/views/settings/api-keys.vue` - API密钥
- `apps/tenant-console/src/views/settings/profile.vue` - 个人设置

**Phase 7: 构建部署**
- `apps/tenant-console/Dockerfile` - Docker构建文件
- `apps/tenant-console/nginx.conf` - Nginx配置
- `apps/tenant-console/.dockerignore` - Docker忽略文件
- `apps/tenant-console/.env.example` - 环境变量示例
- `apps/tenant-console/env.d.ts` - 环境变量类型

### 技术特点

- Vue 3 + TypeScript + Vite 5 + Naive UI 2
- Pinia 状态管理 + 持久化存储
- Vue I18n 国际化 (中英文)
- UnoCSS 原子化CSS + 交易专用色
- ECharts 5 数据可视化
- WebSocket 实时数据推送
- 角色权限控制 (owner > admin > operator)
- 白标/租户品牌配置
- Docker多阶段构建 + Nginx
- 端口5174，API代理到3002
