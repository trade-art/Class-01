import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: {
      title: 'auth.login',
      requiresAuth: false,
    },
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: 'menu.dashboard' },
      },
      // User Management
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/users/index.vue'),
        meta: { title: 'menu.users' },
      },
      // Trading
      {
        path: 'positions',
        name: 'positions',
        component: () => import('@/views/positions/index.vue'),
        meta: { title: 'menu.positions' },
      },
      {
        path: 'quotes',
        name: 'quotes',
        component: () => import('@/views/quotes/index.vue'),
        meta: { title: 'menu.quotes' },
      },
      {
        path: 'history',
        name: 'history',
        component: () => import('@/views/history/index.vue'),
        meta: { title: 'menu.history' },
      },
      {
        path: 'risk',
        name: 'risk',
        component: () => import('@/views/risk/index.vue'),
        meta: { title: 'menu.riskMonitor' },
      },
      // Reports
      {
        path: 'reports',
        name: 'reports',
        component: () => import('@/views/reports/index.vue'),
        meta: { title: 'menu.reports' },
      },
      {
        path: 'reports/trading',
        name: 'trading-report',
        component: () => import('@/views/reports/trading.vue'),
        meta: { title: 'menu.tradingReport' },
      },
      {
        path: 'reports/users',
        name: 'user-report',
        component: () => import('@/views/reports/users.vue'),
        meta: { title: 'menu.userReport' },
      },
      {
        path: 'reports/finance',
        name: 'finance-report',
        component: () => import('@/views/reports/finance.vue'),
        meta: { title: 'menu.financeReport' },
      },
      // Settings
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: 'menu.settings' },
      },
      {
        path: 'settings/branding',
        name: 'branding',
        component: () => import('@/views/settings/branding.vue'),
        meta: { title: 'menu.branding', requiredRole: 'owner' },
      },
      {
        path: 'settings/admins',
        name: 'admins',
        component: () => import('@/views/settings/admins.vue'),
        meta: { title: 'menu.admins', requiredRole: 'owner' },
      },
      {
        path: 'settings/api-keys',
        name: 'api-keys',
        component: () => import('@/views/settings/api-keys.vue'),
        meta: { title: 'menu.apiKeys', requiredRole: 'admin' },
      },
      {
        path: 'settings/profile',
        name: 'profile',
        component: () => import('@/views/settings/profile.vue'),
        meta: { title: 'menu.profile' },
      },
      {
        path: 'settings/subscription',
        name: 'subscription',
        component: () => import('@/views/settings/subscription.vue'),
        meta: { title: 'menu.subscription' },
      },
      {
        path: 'settings/notifications',
        name: 'notifications',
        component: () => import('@/views/settings/notifications.vue'),
        meta: { title: 'menu.notifications' },
      },
      {
        path: 'settings/middleware-instances',
        name: 'middleware-instances',
        component: () => import('@/views/settings/middleware-instances.vue'),
        meta: { title: 'menu.middlewareInstances', requiredRole: 'admin' },
      },
      // MT Server Management
      {
        path: 'mt-servers',
        name: 'mt-servers',
        component: () => import('@/views/mt-servers/index.vue'),
        meta: { title: 'menu.mtServers', requiredRole: 'admin' },
      },
      // MT Manager Management
      {
        path: 'mt-managers',
        name: 'mt-managers',
        component: () => import('@/views/mt-managers/index.vue'),
        meta: { title: 'menu.mtManagers', requiredRole: 'admin' },
      },
      {
        path: 'users/:id',
        name: 'user-detail',
        component: () => import('@/views/users/detail.vue'),
        meta: { title: 'users.userDetail' },
      },
    ],
  },
  // Catch all - redirect to dashboard
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

// Router base path - for nginx deployment use /tenant/, for local dev use /
const routerBase = import.meta.env.VITE_ROUTER_BASE || '/'

const router = createRouter({
  history: createWebHistory(routerBase),
  routes,
})

// Navigation guard
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  // Check authentication
  if (to.meta.requiresAuth !== false && !authStore.isLoggedIn) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // Already logged in, trying to access login page
  if (to.name === 'login' && authStore.isLoggedIn) {
    return next({ name: 'dashboard' })
  }

  // Check role-based access
  const requiredRole = to.meta.requiredRole as string | undefined
  if (requiredRole && !authStore.hasPermission(requiredRole as any)) {
    // Redirect to dashboard if no permission
    return next({ name: 'dashboard' })
  }

  next()
})

// Update page title
router.afterEach((to) => {
  const baseTitle = 'Tenant Console'
  const pageTitle = to.meta.title as string | undefined

  if (pageTitle) {
    // Title will be translated in the component
    document.title = `${baseTitle}`
  } else {
    document.title = baseTitle
  }
})

export default router
