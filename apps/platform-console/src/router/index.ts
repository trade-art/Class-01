import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

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

// Navigation guard
router.beforeEach((to, _from, next) => {
  const userStore = useUserStore()

  if (to.meta.public) {
    next()
    return
  }

  if (!userStore.isLoggedIn) {
    next('/login')
    return
  }

  next()
})

export default router
