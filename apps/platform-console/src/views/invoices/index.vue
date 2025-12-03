<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('menu.invoices') }}</h1>
    </div>

    <!-- Stats Cards -->
    <n-grid :cols="4" :x-gap="16" class="mb-6">
      <n-gi>
        <n-card>
          <n-statistic :label="t('invoice.stats.total')" :value="stats.total" />
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic :label="t('invoice.stats.pending')" :value="stats.pending">
            <template #prefix>
              <n-icon class="text-warning"><i class="i-carbon-time" /></n-icon>
            </template>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic :label="t('invoice.stats.paid')" :value="stats.paid">
            <template #prefix>
              <n-icon class="text-success"><i class="i-carbon-checkmark" /></n-icon>
            </template>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic :label="t('invoice.stats.totalAmount')" :value="stats.totalAmount">
            <template #prefix>¥</template>
          </n-statistic>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Filters -->
    <n-card class="mb-4">
      <n-space>
        <n-input
          v-model:value="filters.search"
          :placeholder="t('invoice.searchPlaceholder')"
          clearable
          style="width: 250px"
          @update:value="handleSearch"
        >
          <template #prefix>
            <n-icon><i class="i-carbon-search" /></n-icon>
          </template>
        </n-input>
        <n-select
          v-model:value="filters.status"
          :options="statusOptions"
          :placeholder="t('invoice.statusFilter')"
          clearable
          style="width: 150px"
          @update:value="loadInvoices"
        />
        <n-date-picker
          v-model:value="filters.dateRange"
          type="daterange"
          clearable
          :start-placeholder="t('invoice.startDate')"
          :end-placeholder="t('invoice.endDate')"
          @update:value="loadInvoices"
        />
      </n-space>
    </n-card>

    <!-- Invoice Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="invoices"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: Invoice) => row.id"
        @update:page="handlePageChange"
      />
    </n-card>

    <!-- Invoice Detail Modal -->
    <n-modal
      v-model:show="showDetailModal"
      preset="dialog"
      :title="t('invoice.detail')"
      :style="{ width: '600px' }"
    >
      <template v-if="selectedInvoice">
        <n-descriptions :columns="2" bordered>
          <n-descriptions-item :label="t('invoice.invoiceNo')">
            {{ selectedInvoice.invoiceNo }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('common.status')">
            <n-tag :type="getStatusType(selectedInvoice.status)" size="small">
              {{ t(`invoice.status.${selectedInvoice.status.toLowerCase()}`) }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item :label="t('invoice.tenant')">
            {{ selectedInvoice.tenant?.name }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('invoice.amount')">
            <span class="text-lg font-semibold">¥{{ selectedInvoice.amount }}</span>
          </n-descriptions-item>
          <n-descriptions-item :label="t('invoice.period')">
            {{ formatDate(selectedInvoice.periodStart) }} - {{ formatDate(selectedInvoice.periodEnd) }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('invoice.dueDate')">
            {{ formatDate(selectedInvoice.dueDate) }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('common.createdAt')">
            {{ formatDateTime(selectedInvoice.createdAt) }}
          </n-descriptions-item>
          <n-descriptions-item :label="t('invoice.paidAt')" v-if="selectedInvoice.paidAt">
            {{ formatDateTime(selectedInvoice.paidAt) }}
          </n-descriptions-item>
        </n-descriptions>

        <div v-if="selectedInvoice.description" class="mt-4">
          <h4 class="mb-2 font-medium">{{ t('common.description') }}</h4>
          <p class="text-secondary">{{ selectedInvoice.description }}</p>
        </div>
      </template>

      <template #action>
        <n-button @click="showDetailModal = false">{{ t('common.cancel') }}</n-button>
        <n-button
          v-if="selectedInvoice?.status === 'PENDING'"
          type="primary"
          @click="handleMarkPaid(selectedInvoice!)"
        >
          {{ t('invoice.markPaid') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NIcon,
  NTag,
  NSpace,
  NInput,
  NSelect,
  NDatePicker,
  NDataTable,
  NStatistic,
  NGrid,
  NGi,
  NModal,
  NDescriptions,
  NDescriptionsItem,
  NDropdown,
  useMessage,
  useDialog,
  type DataTableColumns,
} from 'naive-ui'
import { api } from '@/api'
import dayjs from 'dayjs'

interface Invoice {
  id: string
  invoiceNo: string
  tenantId: string
  tenant?: { name: string; code: string }
  amount: number
  status: string
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt?: string
  description?: string
  createdAt: string
}

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const invoices = ref<Invoice[]>([])
const showDetailModal = ref(false)
const selectedInvoice = ref<Invoice | null>(null)

const stats = reactive({
  total: 0,
  pending: 0,
  paid: 0,
  totalAmount: 0,
})

const filters = reactive({
  search: '',
  status: null as string | null,
  dateRange: null as [number, number] | null,
})

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
})

const statusOptions = computed(() => [
  { label: t('invoice.status.pending'), value: 'PENDING' },
  { label: t('invoice.status.paid'), value: 'PAID' },
  { label: t('invoice.status.overdue'), value: 'OVERDUE' },
  { label: t('invoice.status.cancelled'), value: 'CANCELLED' },
])

const columns = computed<DataTableColumns<Invoice>>(() => [
  { title: t('invoice.invoiceNo'), key: 'invoiceNo', width: 150 },
  {
    title: t('invoice.tenant'),
    key: 'tenant',
    render: (row) => row.tenant?.name || '-',
  },
  {
    title: t('invoice.amount'),
    key: 'amount',
    width: 120,
    render: (row) => `¥${row.amount.toFixed(2)}`,
  },
  {
    title: t('common.status'),
    key: 'status',
    width: 100,
    render: (row) => h(NTag, {
      type: getStatusType(row.status),
      size: 'small',
    }, () => t(`invoice.status.${row.status.toLowerCase()}`)),
  },
  {
    title: t('invoice.period'),
    key: 'period',
    render: (row) => `${formatDate(row.periodStart)} - ${formatDate(row.periodEnd)}`,
  },
  {
    title: t('invoice.dueDate'),
    key: 'dueDate',
    width: 120,
    render: (row) => formatDate(row.dueDate),
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 100,
    render: (row) => h(NDropdown, {
      trigger: 'click',
      options: getActionOptions(row),
      onSelect: (key: string) => handleAction(key, row),
    }, () => h(NButton, { text: true, type: 'primary' }, () => t('common.actions'))),
  },
])

function getStatusType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    PENDING: 'warning',
    PAID: 'success',
    OVERDUE: 'error',
    CANCELLED: 'default',
  }
  return types[status] || 'default'
}

function getActionOptions(row: Invoice) {
  const options: any[] = [
    { label: t('invoice.viewDetail'), key: 'view' },
  ]
  if (row.status === 'PENDING') {
    options.push({ label: t('invoice.markPaid'), key: 'markPaid' })
    options.push({ type: 'divider', key: 'd1' })
    options.push({ label: t('invoice.cancel'), key: 'cancel' })
  }
  return options
}

function formatDate(date: string | undefined) {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

function formatDateTime(date: string | undefined) {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

let searchTimer: number | null = null
function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    loadInvoices()
  }, 300)
}

function handlePageChange(page: number) {
  pagination.page = page
  loadInvoices()
}

async function loadInvoices() {
  loading.value = true
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    }
    if (filters.search) params.search = filters.search
    if (filters.status) params.status = filters.status
    if (filters.dateRange) {
      params.startDate = dayjs(filters.dateRange[0]).format('YYYY-MM-DD')
      params.endDate = dayjs(filters.dateRange[1]).format('YYYY-MM-DD')
    }

    const result = await api.invoices.list(params) as any
    invoices.value = Array.isArray(result) ? result : (result.data || [])
    pagination.itemCount = result.total || invoices.value.length
  } catch {
    message.error(t('invoice.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    const result = await api.invoices.getStats() as any
    stats.total = result.total || 0
    stats.pending = result.pending || 0
    stats.paid = result.paid || 0
    stats.totalAmount = result.totalAmount || 0
  } catch {
    // ignore stats error
  }
}

function handleAction(key: string, invoice: Invoice) {
  if (key === 'view') {
    selectedInvoice.value = invoice
    showDetailModal.value = true
  } else if (key === 'markPaid') {
    handleMarkPaid(invoice)
  } else if (key === 'cancel') {
    handleCancel(invoice)
  }
}

function handleMarkPaid(invoice: Invoice) {
  dialog.success({
    title: t('invoice.confirmMarkPaid'),
    content: t('invoice.confirmMarkPaidContent', { invoiceNo: invoice.invoiceNo }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await api.invoices.markPaid(invoice.id)
        message.success(t('invoice.markPaidSuccess'))
        showDetailModal.value = false
        loadInvoices()
        loadStats()
      } catch {
        message.error(t('common.operationFailed'))
      }
    },
  })
}

function handleCancel(invoice: Invoice) {
  dialog.error({
    title: t('invoice.confirmCancel'),
    content: t('invoice.confirmCancelContent', { invoiceNo: invoice.invoiceNo }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await api.invoices.cancel(invoice.id)
        message.success(t('invoice.cancelSuccess'))
        loadInvoices()
        loadStats()
      } catch {
        message.error(t('common.operationFailed'))
      }
    },
  })
}

onMounted(() => {
  loadInvoices()
  loadStats()
})
</script>
