<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <div class="flex items-center gap-4">
        <n-button quaternary circle @click="router.back()">
          <template #icon>
            <span class="i-carbon-arrow-left"></span>
          </template>
        </n-button>
        <h1 class="page-title">{{ t('users.userDetail') }}</h1>
      </div>
      <n-space>
        <n-button @click="handleEdit">
          <template #icon>
            <span class="i-carbon-edit"></span>
          </template>
          {{ t('common.edit') }}
        </n-button>
        <n-dropdown trigger="click" :options="actionOptions" @select="handleAction">
          <n-button>
            <template #icon>
              <span class="i-carbon-overflow-menu-vertical"></span>
            </template>
            {{ t('common.actions') }}
          </n-button>
        </n-dropdown>
      </n-space>
    </div>

    <n-spin :show="loading">
      <div class="detail-grid">
        <!-- User Info Card -->
        <n-card :title="t('users.basicInfo')" class="info-card">
          <n-descriptions :column="2" label-placement="left">
            <n-descriptions-item :label="t('users.login')">
              {{ user?.login }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('users.name')">
              {{ user?.name }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('users.email')">
              {{ user?.email || '-' }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('users.phone')">
              {{ user?.phone || '-' }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('users.group')">
              <n-tag size="small" type="info">{{ user?.group }}</n-tag>
            </n-descriptions-item>
            <n-descriptions-item :label="t('users.leverage')">
              1:{{ user?.leverage }}
            </n-descriptions-item>
            <n-descriptions-item :label="t('users.status')">
              <n-tag
                size="small"
                :type="user?.status === 'active' ? 'success' : user?.status === 'suspended' ? 'error' : 'default'"
              >
                {{ statusText }}
              </n-tag>
            </n-descriptions-item>
            <n-descriptions-item :label="t('users.createdAt')">
              {{ formatDate(user?.createdAt) }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- Account Stats Card -->
        <n-card :title="t('users.accountStats')" class="stats-card">
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-label">{{ t('users.balance') }}</div>
              <div class="stat-value">{{ formatCurrency(user?.balance || 0) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">{{ t('users.equity') }}</div>
              <div class="stat-value">{{ formatCurrency(user?.equity || 0) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">{{ t('users.margin') }}</div>
              <div class="stat-value">{{ formatCurrency(user?.margin || 0) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">{{ t('users.freeMargin') }}</div>
              <div class="stat-value">{{ formatCurrency(user?.freeMargin || 0) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">{{ t('users.marginLevel') }}</div>
              <div class="stat-value">{{ user?.marginLevel?.toFixed(2) || '0.00' }}%</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">{{ t('users.profit') }}</div>
              <div class="stat-value" :class="(user?.profit || 0) >= 0 ? 'profit' : 'loss'">
                {{ formatCurrency(user?.profit || 0, true) }}
              </div>
            </div>
          </div>
        </n-card>
      </div>

      <!-- Tabs for Positions and History -->
      <n-card class="tabs-card">
        <n-tabs v-model:value="activeTab" type="line">
          <n-tab-pane name="positions" :tab="t('positions.title')">
            <n-data-table
              :columns="positionColumns"
              :data="positions"
              :loading="positionsLoading"
              :pagination="false"
              size="small"
            />
          </n-tab-pane>

          <n-tab-pane name="history" :tab="t('history.title')">
            <n-data-table
              :columns="historyColumns"
              :data="history"
              :loading="historyLoading"
              :pagination="historyPagination"
              size="small"
              @update:page="handleHistoryPageChange"
            />
          </n-tab-pane>

          <n-tab-pane name="deposits" :tab="t('users.deposits')">
            <n-data-table
              :columns="depositColumns"
              :data="deposits"
              :loading="depositsLoading"
              :pagination="false"
              size="small"
            />
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NSpace,
  NDropdown,
  NSpin,
  NDescriptions,
  NDescriptionsItem,
  NTag,
  NTabs,
  NTabPane,
  NDataTable,
  useMessage,
  useDialog,
  type DataTableColumns,
} from 'naive-ui'
import { usersApi } from '@/api/users'
import { tradingApi } from '@/api/trading'
import type { TradingUser, Position, TradeHistory } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const userId = computed(() => route.params.id as string)

const loading = ref(false)
const user = ref<TradingUser | null>(null)
const activeTab = ref('positions')

// Positions
const positions = ref<Position[]>([])
const positionsLoading = ref(false)

// History
const history = ref<TradeHistory[]>([])
const historyLoading = ref(false)
const historyPagination = ref({
  page: 1,
  pageSize: 10,
  pageCount: 1,
  itemCount: 0,
})

// Deposits
const deposits = ref<any[]>([])
const depositsLoading = ref(false)

const statusText = computed(() => {
  if (!user.value) return ''
  const statusMap: Record<string, string> = {
    active: t('users.statusActive'),
    inactive: t('users.statusInactive'),
    suspended: t('users.statusSuspended'),
  }
  return statusMap[user.value.status] || user.value.status
})

const actionOptions = computed(() => [
  { label: t('users.resetPassword'), key: 'resetPassword' },
  { label: t('users.deposit'), key: 'deposit' },
  { label: t('users.withdraw'), key: 'withdraw' },
  { type: 'divider', key: 'd1' },
  {
    label: user.value?.status === 'suspended' ? t('users.activate') : t('users.suspend'),
    key: 'toggleStatus',
  },
])

const positionColumns: DataTableColumns<Position> = [
  { title: t('positions.ticket'), key: 'ticket', width: 100 },
  { title: t('positions.symbol'), key: 'symbol', width: 100 },
  {
    title: t('positions.type'),
    key: 'type',
    width: 80,
    render: (row) =>
      h(NTag, { size: 'small', type: row.type === 'buy' ? 'info' : 'error' }, () =>
        row.type === 'buy' ? t('history.buy') : t('history.sell')
      ),
  },
  { title: t('positions.volume'), key: 'volume', width: 80, render: (row) => row.volume.toFixed(2) },
  { title: t('positions.openPrice'), key: 'openPrice', width: 100, render: (row) => row.openPrice.toFixed(5) },
  { title: t('positions.currentPrice'), key: 'currentPrice', width: 100, render: (row) => row.currentPrice.toFixed(5) },
  { title: t('positions.sl'), key: 'sl', width: 80, render: (row) => row.sl?.toFixed(5) || '-' },
  { title: t('positions.tp'), key: 'tp', width: 80, render: (row) => row.tp?.toFixed(5) || '-' },
  {
    title: t('positions.profit'),
    key: 'profit',
    width: 100,
    render: (row) =>
      h('span', { style: { color: row.profit >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' } }, formatCurrency(row.profit, true)),
  },
]

const historyColumns: DataTableColumns<TradeHistory> = [
  { title: t('history.ticket'), key: 'ticket', width: 100 },
  { title: t('history.symbol'), key: 'symbol', width: 100 },
  {
    title: t('history.type'),
    key: 'type',
    width: 80,
    render: (row) =>
      h(NTag, { size: 'small', type: row.type === 'buy' ? 'info' : 'error' }, () =>
        row.type === 'buy' ? t('history.buy') : t('history.sell')
      ),
  },
  { title: t('history.volume'), key: 'volume', width: 80, render: (row) => row.volume.toFixed(2) },
  { title: t('history.openPrice'), key: 'openPrice', width: 100, render: (row) => row.openPrice.toFixed(5) },
  { title: t('history.closePrice'), key: 'closePrice', width: 100, render: (row) => row.closePrice.toFixed(5) },
  {
    title: t('history.profit'),
    key: 'profit',
    width: 100,
    render: (row) =>
      h('span', { style: { color: row.profit >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' } }, formatCurrency(row.profit, true)),
  },
  { title: t('history.closeTime'), key: 'closeTime', width: 160, render: (row) => formatDate(row.closeTime) },
]

const depositColumns: DataTableColumns<any> = [
  { title: t('users.depositTime'), key: 'time', width: 160, render: (row) => formatDate(row.time) },
  { title: t('users.depositType'), key: 'type', width: 100 },
  {
    title: t('users.depositAmount'),
    key: 'amount',
    width: 120,
    render: (row) =>
      h('span', { style: { color: row.amount >= 0 ? 'var(--profit-color)' : 'var(--loss-color)' } }, formatCurrency(row.amount, true)),
  },
  { title: t('users.depositComment'), key: 'comment', ellipsis: { tooltip: true } },
]

const formatCurrency = (value: number, showSign = false) => {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(value))
  if (showSign) {
    return (value >= 0 ? '+' : '-') + formatted
  }
  return value >= 0 ? formatted : '-' + formatted
}

const formatDate = (date: string | undefined) => {
  if (!date) return '-'
  return new Date(date).toLocaleString()
}

const loadUser = async () => {
  loading.value = true
  try {
    user.value = await usersApi.getUser(userId.value)
  } catch (error: any) {
    message.error(error.message || t('common.error'))
    router.back()
  } finally {
    loading.value = false
  }
}

const loadPositions = async () => {
  if (!user.value) return
  positionsLoading.value = true
  try {
    const posResult = await tradingApi.getUserPositions(user.value.login)
    positions.value = (posResult as any).items || posResult as any
  } catch (error: any) {
    console.error('Failed to load positions:', error)
  } finally {
    positionsLoading.value = false
  }
}

const loadHistory = async (page = 1) => {
  if (!user.value) return
  historyLoading.value = true
  try {
    const result = await tradingApi.getUserHistory(user.value.login, { page, pageSize: 10 })
    history.value = result.items
    historyPagination.value = {
      page: result.page,
      pageSize: result.pageSize,
      pageCount: Math.ceil(result.total / result.pageSize),
      itemCount: result.total,
    }
  } catch (error: any) {
    console.error('Failed to load history:', error)
  } finally {
    historyLoading.value = false
  }
}

const loadDeposits = async () => {
  if (!user.value) return
  depositsLoading.value = true
  try {
    const depResult = await usersApi.getUserDeposits(userId.value)
    deposits.value = (depResult as any).items || depResult as any
  } catch (error: any) {
    console.error('Failed to load deposits:', error)
  } finally {
    depositsLoading.value = false
  }
}

const handleHistoryPageChange = (page: number) => {
  loadHistory(page)
}

const handleEdit = () => {
  // Navigate to edit page or open modal
  message.info(t('common.comingSoon'))
}

const handleAction = (key: string) => {
  switch (key) {
    case 'resetPassword':
      handleResetPassword()
      break
    case 'deposit':
      handleDeposit()
      break
    case 'withdraw':
      handleWithdraw()
      break
    case 'toggleStatus':
      handleToggleStatus()
      break
  }
}

const handleResetPassword = () => {
  if (!user.value) return
  dialog.warning({
    title: t('users.resetPassword'),
    content: t('users.resetPasswordConfirm', { login: user.value.login }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await usersApi.resetPassword(userId.value)
        message.success(t('users.resetPasswordSuccess'))
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

const handleDeposit = () => {
  message.info(t('common.comingSoon'))
}

const handleWithdraw = () => {
  message.info(t('common.comingSoon'))
}

const handleToggleStatus = () => {
  if (!user.value) return
  const action = user.value.status === 'suspended' ? 'activate' : 'suspend'
  const actionText = user.value.status === 'suspended' ? t('users.activate') : t('users.suspend')

  dialog.warning({
    title: actionText,
    content: t('users.toggleStatusConfirm', { login: user.value.login, action: actionText }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        if (action === 'suspend') {
          await usersApi.suspendUser(userId.value)
        } else {
          await usersApi.activateUser(userId.value)
        }
        message.success(t('users.toggleStatusSuccess'))
        loadUser()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

onMounted(async () => {
  await loadUser()
  loadPositions()
  loadHistory()
  loadDeposits()
})
</script>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background-color: var(--body-color);
  border-radius: var(--border-radius-base);
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color-base);
}

.stat-value.profit {
  color: var(--profit-color);
}

.stat-value.loss {
  color: var(--loss-color);
}

.tabs-card {
  margin-top: 16px;
}

@media (max-width: 768px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
