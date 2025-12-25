import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '控制台' },
      },
      {
        path: 'tenants',
        name: 'Tenants',
        component: () => import('@/views/tenants/index.vue'),
        meta: { title: '租户管理' },
      },
      {
        path: 'tenants/:id',
        name: 'TenantDetail',
        component: () => import('@/views/tenants/detail.vue'),
        meta: { title: '租户详情' },
      },
      {
        path: 'instances',
        name: 'Instances',
        component: () => import('@/views/instances/index.vue'),
        meta: { title: '实例管理' },
      },
      {
        path: 'instances/:id',
        name: 'InstanceDetail',
        component: () => import('@/views/instances/detail.vue'),
        meta: { title: '实例详情' },
      },
      {
        path: 'admins',
        name: 'Admins',
        component: () => import('@/views/admins/index.vue'),
        meta: { title: '管理员管理' },
      },
      {
        path: 'subscriptions',
        name: 'Subscriptions',
        component: () => import('@/views/subscriptions/index.vue'),
        meta: { title: '订阅计划' },
      },
      {
        path: 'invoices',
        name: 'Invoices',
        component: () => import('@/views/invoices/index.vue'),
        meta: { title: '账单管理' },
      },
      {
        path: 'trading',
        name: 'Trading',
        component: () => import('@/views/trading/index.vue'),
        meta: { title: '交易数据' },
      },
      {
        path: 'middleware',
        name: 'Middleware',
        component: () => import('@/views/middleware/index.vue'),
        meta: { title: '中间件管理' },
      },
      {
        path: 'middleware/:id',
        name: 'MiddlewareDetail',
        component: () => import('@/views/middleware/detail.vue'),
        meta: { title: '中间件详情' },
      },
      {
        path: 'middleware/:id/config',
        name: 'MiddlewareConfig',
        component: () => import('@/views/middleware/config.vue'),
        meta: { title: '中间件配置' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: { title: '个人设置' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard - 动态导入 store 确保 pinia 已初始化
router.beforeEach(async (to, _from, next) => {
  // 动态导入确保 pinia 已注册
  const { useUserStore } = await import('@/stores/user')
  const userStore = useUserStore()

  // 公开页面直接放行
  if (to.meta.public) {
    next()
    return
  }

  // 检查 token 是否存在
  const token = localStorage.getItem('token')
  if (!token) {
    next('/login')
    return
  }

  // 如果有 token 但没有用户信息，尝试获取用户资料
  if (!userStore.user) {
    try {
      await userStore.fetchProfile()
    } catch {
      // token 无效，清除并跳转登录
      userStore.logout()
      next('/login')
      return
    }
  }

  next()
})

export default router
