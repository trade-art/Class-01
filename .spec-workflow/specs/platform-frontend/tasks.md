# 任务清单: Platform Admin Console

## 任务概览

| 阶段 | 任务数 | 完成 | 描述 |
|------|--------|------|------|
| Phase 1 | 5 | ✅ 5/5 | 项目初始化与基础架构 |
| Phase 2 | 4 | ✅ 4/4 | 认证与布局 |
| Phase 3 | 5 | ✅ 5/5 | 核心功能页面 |
| Phase 4 | 4 | ✅ 4/4 | 账单与交易数据 |
| Phase 5 | 3 | ✅ 3/3 | 系统设置与优化 |
| **Total** | **21** | **21/21** | **100% 完成** |

---

## Phase 1: 项目初始化与基础架构

### Task 1: 项目脚手架搭建

- [x] 1.1 使用 Vite 创建 Vue 3 + TypeScript 项目
- [x] 1.2 配置项目结构 (src/api, components, composables, layouts, locales, router, stores, types, utils, views)
- [x] 1.3 安装核心依赖 (naive-ui, pinia, vue-router, axios, vue-i18n, echarts)
- [x] 1.4 配置 TypeScript (tsconfig.json, 路径别名)
- [x] 1.5 配置 Vite (代理、构建优化、chunk分割)

_验收标准: 项目可以 npm run dev 启动，无报错_ ✅

### Task 2: UnoCSS 与主题系统

- [x] 2.1 安装配置 UnoCSS (uno.config.ts)
- [x] 2.2 创建 CSS 变量文件 (variables.css) - 浅色/深色主题
- [x] 2.3 配置全局样式 (global.css) - 字体、重置样式
- [x] 2.4 创建过渡动画样式 (transitions.css)
- [x] 2.5 配置 Naive UI 主题覆盖

_验收标准: 主题变量生效，UnoCSS 原子类可用_ ✅

### Task 3: 国际化系统

- [x] 3.1 配置 Vue I18n (src/locales/index.ts)
- [x] 3.2 创建中文语言包 (zh-CN.ts)
- [x] 3.3 创建英文语言包 (en-US.ts)
- [x] 3.4 实现语言切换 (settings store集成)
- [x] 3.5 在 MainLayout 添加语言切换器

_验收标准: 可切换中英文，文本正确显示_ ✅

### Task 4: API 层封装

- [x] 4.1 创建 Axios 实例 (src/api/index.ts)
- [x] 4.2 实现请求拦截器 (Token 注入)
- [x] 4.3 实现响应拦截器 (错误处理、401跳转)
- [x] 4.4 创建 API 模块文件 (auth, tenants, instances, platformAdmins)
- [x] 4.5 定义 TypeScript 类型 (LoginResponse, RefreshResponse)

_验收标准: API 请求可正常发送，类型完整_ ✅

### Task 5: 状态管理 Pinia

- [x] 5.1 配置 Pinia store (pinia-plugin-persistedstate)
- [x] 5.2 创建 user store (登录状态、用户信息、Token管理)
- [x] 5.3 创建 settings store (主题、语言、侧边栏)
- [x] 5.4 创建 tenants store (租户列表、筛选)
- [x] 5.5 创建 instances store (实例列表、状态)

_验收标准: Store 可正常读写，持久化生效_ ✅

---

## Phase 2: 认证与布局

### Task 6: 路由配置

- [x] 6.1 定义路由表 (src/router/index.ts)
- [x] 6.2 配置路由守卫 (认证检查)
- [x] 6.3 实现路由懒加载
- [x] 6.4 配置页面标题和 meta

_验收标准: 路由跳转正常，未登录重定向到登录页_ ✅

### Task 7: 登录页面

- [x] 7.1 创建登录页面布局 (渐变背景)
- [x] 7.2 实现 LoginView 页面 (src/views/login/index.vue)
- [x] 7.3 创建登录表单 (邮箱、密码)
- [x] 7.4 实现登录逻辑 (调用API、存储Token)
- [x] 7.5 添加表单验证和错误提示 (i18n支持)

_验收标准: 可正常登录，错误时显示提示_ ✅

### Task 8: 主布局组件

- [x] 8.1 创建 MainLayout (侧边栏+顶栏布局)
- [x] 8.2 实现侧边栏 (菜单导航、折叠、Logo)
- [x] 8.3 实现顶栏 (用户头像、语言切换、主题切换、登出)
- [x] 8.4 实现面包屑导航
- [x] 8.5 实现页面切换动画 (slide-fade)

_验收标准: 布局正确渲染，菜单可导航_ ✅

### Task 9: 通用组件

- [x] 9.1 使用 NDataTable 组件 (表格、分页、加载)
- [x] 9.2 使用 NTag 作为状态标签
- [x] 9.3 使用 NInput + NSelect 作为搜索筛选
- [x] 9.4 使用 useDialog 作为确认对话框
- [x] 9.5 使用 NEmpty 作为空状态
- [x] 9.6 使用 NSpin 作为加载状态

_验收标准: 组件可复用，样式统一_ ✅ (使用 Naive UI 原生组件)

---

## Phase 3: 核心功能页面

### Task 10: Dashboard 页面

- [x] 10.1 创建 DashboardView 页面 (src/views/dashboard/index.vue)
- [x] 10.2 实现统计卡片组件 (NStatistic)
- [x] 10.3 实现交易趋势折线图 (LineChart)
- [x] 10.4 实现订阅分布饼图 (PieChart)
- [x] 10.5 实现最近事件列表
- [x] 10.6 实现租户/实例状态分布 (NProgress)
- [x] 10.7 添加数据自动刷新

_验收标准: Dashboard 数据正确展示，图表渲染正常_ ✅

### Task 11: 租户管理

- [x] 11.1 创建 TenantListView (src/views/tenants/index.vue)
- [x] 11.2 实现租户搜索和筛选
- [x] 11.3 实现租户创建弹窗 (NModal)
- [x] 11.4 创建租户表单组件 (NForm)
- [x] 11.5 创建 TenantDetailView (src/views/tenants/detail.vue)
- [x] 11.6 实现详情页展示 (基本信息、实例列表、管理员列表、统计)
- [x] 11.7 实现白标配置 (Logo上传、颜色选择器)
- [x] 11.8 实现状态变更操作 (激活/暂停/删除)

_验收标准: 租户CRUD功能完整，白标配置可用_ ✅

### Task 12: 中间件实例管理

- [x] 12.1 创建 InstanceListView (src/views/instances/index.vue)
- [x] 12.2 实现健康状态可视化 (NTag颜色)
- [x] 12.3 在租户详情实现添加实例
- [x] 12.4 创建实例表单组件 (NForm)
- [x] 12.5 显示 MT5 服务器配置列表
- [x] 12.6 创建 InstanceDetailView (src/views/instances/detail.vue)
- [x] 12.7 实现健康数据展示 (运行时间、会话数、连接数)
- [x] 12.8 实现手动健康检查、密钥重新生成

_验收标准: 实例CRUD功能完整，健康状态正确显示_ ✅

### Task 13: 订阅计划管理

- [x] 13.1 创建 SubscriptionListView (计划列表)
- [x] 13.2 实现计划卡片展示
- [x] 13.3 实现计划详情弹窗
- [x] 13.4 在租户详情页添加订阅变更功能

_验收标准: 订阅计划正确展示，变更功能可用_ ✅

### Task 14: 租户管理员管理

- [x] 14.1 在租户详情页添加管理员 Tab
- [x] 14.2 实现管理员列表
- [x] 14.3 创建 AdminForm 组件
- [x] 14.4 实现创建编辑管理员
- [x] 14.5 实现重置密码功能
- [x] 14.6 实现启用禁用删除功能

_验收标准: 管理员管理功能完整_ ✅

---

## Phase 4: 账单与交易数据

### Task 15: 账单管理

- [x] 15.1 创建 InvoiceListView (列表页)
- [x] 15.2 实现账单搜索和筛选 (租户、状态、日期)
- [x] 15.3 创建 InvoiceDetailView (详情页/弹窗)
- [x] 15.4 实现标记已付款功能
- [x] 15.5 实现取消账单功能
- [x] 15.6 实现账单统计面板

_验收标准: 账单管理功能完整，统计数据正确_ ✅

### Task 16: 交易数据概览

- [x] 16.1 创建 TradingOverviewView (交易数据页)
- [x] 16.2 实现全平台交易统计卡片
- [x] 16.3 实现租户交易排名列表
- [x] 16.4 实现交易品种分布图表 (NProgress条形图)
- [x] 16.5 实现租户交易详情查看
- [x] 16.6 实现时间范围筛选

_验收标准: 交易数据正确展示，筛选功能可用_ ✅

### Task 17: 图表组件完善

- [x] 17.1 创建 LineChart 组件 (折线图)
- [x] 17.2 创建 BarChart 组件 (柱状图)
- [x] 17.3 创建 PieChart 组件 (饼图)
- [x] 17.4 实现图表响应式和主题适配
- [x] 17.5 添加图表加载状态

_验收标准: 图表组件通用，支持深色模式_ ✅

### Task 18: invoices 和 trading store

- [x] 18.1 创建 invoices store
- [x] 18.2 创建 trading store
- [x] 18.3 实现数据缓存和刷新

_验收标准: Store 功能完整_ ✅

---

## Phase 5: 系统设置与优化

### Task 19: 系统设置页面

- [x] 19.1 创建 ProfileView (个人设置)
- [x] 19.2 实现修改密码功能
- [x] 19.3 实现修改个人信息功能
- [x] 19.4 创建 AdminsView (src/views/admins/index.vue)
- [x] 19.5 实现平台管理员CRUD (创建、编辑、删除、密码重置)

_验收标准: 设置功能完整，权限控制正确_ ✅

### Task 20: 主题与语言完善

- [x] 20.1 在 settings store 实现主题切换
- [x] 20.2 实现主题切换 (浅色/深色)
- [x] 20.3 App.vue 配置 Naive UI 主题覆盖
- [x] 20.4 完善主要页面的中英文翻译 (login, dashboard, mainLayout, admin)

_验收标准: 主题切换流畅，翻译完整_ ✅ (基础完成)

### Task 21: 构建与部署

- [x] 21.1 优化 Vite 构建配置 (已在Task 1完成)
- [x] 21.2 创建 Dockerfile
- [x] 21.3 创建 nginx.conf
- [x] 21.4 创建 docker-compose.yml
- [x] 21.5 编写部署文档

_验收标准: 可成功构建和部署_ ✅

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
              ┌─────────────────────────────────────┐
              ↓                   ↓                 ↓
         Task 11            Task 12            Task 13
         (租户)             (实例)             (订阅)
              ↓
         Task 14 (租户管理员)
              ↓
         Task 15 (账单) ───→ Task 16 (交易数据)
              ↓
         Task 17 (图表) ───→ Task 18 (Stores)
              ↓
         Task 19 (设置) ───→ Task 20 (主题/语言)
              ↓
         Task 21 (部署)
```
