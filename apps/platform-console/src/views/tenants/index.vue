<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">租户管理</h1>
      <n-button type="primary" @click="showCreateModal = true">
        <template #icon>
          <n-icon><i class="i-carbon-add" /></n-icon>
        </template>
        新建租户
      </n-button>
    </div>

    <!-- Search & Filter -->
    <n-card class="mb-4">
      <n-space>
        <n-input
          v-model:value="searchQuery"
          placeholder="搜索租户名称/代码/邮箱"
          style="width: 300px"
          clearable
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <n-icon><i class="i-carbon-search" /></n-icon>
          </template>
        </n-input>
        <n-select
          v-model:value="statusFilter"
          placeholder="状态筛选"
          style="width: 150px"
          clearable
          :options="statusOptions"
          @update:value="handleSearch"
        />
        <n-button @click="handleSearch">搜索</n-button>
      </n-space>
    </n-card>

    <!-- Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="tenants"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: Tenant) => row.id"
        @update:page="handlePageChange"
      />
    </n-card>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showCreateModal"
      preset="dialog"
      :title="editingTenant ? '编辑租户' : '新建租户'"
      :style="{ width: '600px' }"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
      >
        <n-grid :cols="2" :x-gap="16">
          <n-gi>
            <n-form-item path="name" label="租户名称">
              <n-input v-model:value="form.name" placeholder="请输入租户名称" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="code" label="租户代码">
              <n-input
                v-model:value="form.code"
                placeholder="小写字母数字"
                :disabled="!!editingTenant"
              />
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-grid :cols="2" :x-gap="16">
          <n-gi>
            <n-form-item path="email" label="邮箱">
              <n-input v-model:value="form.email" placeholder="请输入邮箱" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="phone" label="电话">
              <n-input v-model:value="form.phone" placeholder="请输入电话" />
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-form-item path="company" label="公司名称">
          <n-input v-model:value="form.company" placeholder="请输入公司名称" />
        </n-form-item>

        <n-grid :cols="3" :x-gap="16">
          <n-gi>
            <n-form-item path="plan" label="套餐">
              <n-select v-model:value="form.plan" :options="planOptions" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="maxInstances" label="最大实例数">
              <n-input-number v-model:value="form.maxInstances" :min="1" style="width: 100%" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="maxAdmins" label="最大管理员数">
              <n-input-number v-model:value="form.maxAdmins" :min="1" style="width: 100%" />
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-form-item path="notes" label="备注">
          <n-input
            v-model:value="form.notes"
            type="textarea"
            placeholder="请输入备注"
            :maxlength="500"
          />
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="resetForm">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ editingTenant ? '更新' : '创建' }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NIcon,
  NSpace,
  NInput,
  NSelect,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NGrid,
  NGi,
  NInputNumber,
  NTag,
  NDropdown,
  useMessage,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { api } from '@/api'
import dayjs from 'dayjs'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

interface Tenant {
  id: string
  name: string
  code: string
  email: string
  phone?: string
  company?: string
  status: string
  plan: string
  maxInstances: number
  maxAdmins: number
  notes?: string
  createdAt: string
}

const loading = ref(false)
const saving = ref(false)
const tenants = ref<Tenant[]>([])
const searchQuery = ref('')
const statusFilter = ref<string | null>(null)
const showCreateModal = ref(false)
const editingTenant = ref<Tenant | null>(null)
const formRef = ref<FormInst | null>(null)

const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
})

const form = reactive({
  name: '',
  code: '',
  email: '',
  phone: '',
  company: '',
  plan: 'BASIC',
  maxInstances: 1,
  maxAdmins: 3,
  notes: '',
})

const statusOptions = [
  { label: '活跃', value: 'ACTIVE' },
  { label: '待审核', value: 'PENDING' },
  { label: '已暂停', value: 'SUSPENDED' },
]

const planOptions = [
  { label: '试用', value: 'TRIAL' },
  { label: '基础', value: 'BASIC' },
  { label: '专业', value: 'PROFESSIONAL' },
  { label: '企业', value: 'ENTERPRISE' },
]

const rules: FormRules = {
  name: [{ required: true, message: '请输入租户名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入租户代码', trigger: 'blur' },
    { pattern: /^[a-z0-9_-]+$/, message: '只能包含小写字母、数字、下划线和连字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
}

const columns: DataTableColumns<Tenant> = [
  {
    title: '租户名称',
    key: 'name',
    render: (row) => h('a', {
      class: 'text-primary cursor-pointer',
      onClick: () => viewTenant(row.id),
    }, row.name),
  },
  { title: '代码', key: 'code' },
  { title: '邮箱', key: 'email' },
  {
    title: '套餐',
    key: 'plan',
    render: (row) => h(NTag, { type: getPlanType(row.plan), size: 'small' }, () => row.plan),
  },
  {
    title: '状态',
    key: 'status',
    render: (row) => h(NTag, { type: getStatusType(row.status), size: 'small' }, () => getStatusText(row.status)),
  },
  {
    title: '创建时间',
    key: 'createdAt',
    render: (row) => formatDate(row.createdAt),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render: (row) => h(NSpace, null, () => [
      h(NButton, { text: true, type: 'primary', size: 'small', onClick: () => viewTenant(row.id) }, () => '详情'),
      h(NDropdown, {
        options: getActionOptions(row),
        onSelect: (key: string) => handleAction(key, row),
      }, () => h(NButton, { text: true, size: 'small' }, () => '更多')),
    ]),
  },
]

function getPlanType(plan: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    TRIAL: 'default',
    BASIC: 'info',
    PROFESSIONAL: 'success',
    ENTERPRISE: 'warning',
  }
  return types[plan] || 'default'
}

function getStatusType(status: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    ACTIVE: 'success',
    PENDING: 'warning',
    SUSPENDED: 'error',
  }
  return types[status] || 'default'
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    ACTIVE: '活跃',
    PENDING: '待审核',
    SUSPENDED: '已暂停',
    EXPIRED: '已过期',
    CANCELLED: '已取消',
  }
  return texts[status] || status
}

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

function getActionOptions(row: Tenant) {
  const options = []
  if (row.status === 'PENDING') {
    options.push({ label: '激活', key: 'activate' })
  }
  if (row.status === 'ACTIVE') {
    options.push({ label: '暂停', key: 'suspend' })
  }
  if (row.status === 'SUSPENDED') {
    options.push({ label: '启用', key: 'reactivate' })
  }
  options.push({ label: '编辑', key: 'edit' })
  options.push({ label: '删除', key: 'delete', props: { style: { color: 'var(--error-color)' } } })
  return options
}

function handleAction(key: string, row: Tenant) {
  switch (key) {
    case 'activate':
      activateTenant(row)
      break
    case 'suspend':
      suspendTenant(row)
      break
    case 'reactivate':
      reactivateTenant(row)
      break
    case 'edit':
      editTenant(row)
      break
    case 'delete':
      deleteTenant(row)
      break
  }
}

async function loadTenants() {
  loading.value = true
  try {
    const result = await api.tenants.list({
      page: pagination.page,
      limit: pagination.pageSize,
      search: searchQuery.value || undefined,
      status: statusFilter.value || undefined,
    }) as any
    tenants.value = result.data
    pagination.itemCount = result.total
  } catch (error) {
    message.error('加载租户列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  loadTenants()
}

function handlePageChange(page: number) {
  pagination.page = page
  loadTenants()
}

function viewTenant(id: string) {
  router.push(`/tenants/${id}`)
}

function editTenant(tenant: Tenant) {
  editingTenant.value = tenant
  Object.assign(form, {
    name: tenant.name,
    code: tenant.code,
    email: tenant.email,
    phone: tenant.phone || '',
    company: tenant.company || '',
    plan: tenant.plan,
    maxInstances: tenant.maxInstances,
    maxAdmins: tenant.maxAdmins,
    notes: tenant.notes || '',
  })
  showCreateModal.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (editingTenant.value) {
      await api.tenants.update(editingTenant.value.id, form)
      message.success('更新成功')
    } else {
      await api.tenants.create(form)
      message.success('创建成功')
    }

    showCreateModal.value = false
    resetForm()
    loadTenants()
  } catch (error: any) {
    message.error(error.message || '操作失败')
  } finally {
    saving.value = false
  }
}

function resetForm() {
  showCreateModal.value = false
  editingTenant.value = null
  Object.assign(form, {
    name: '',
    code: '',
    email: '',
    phone: '',
    company: '',
    plan: 'BASIC',
    maxInstances: 1,
    maxAdmins: 3,
    notes: '',
  })
}

async function activateTenant(tenant: Tenant) {
  try {
    await api.tenants.activate(tenant.id)
    message.success('激活成功')
    loadTenants()
  } catch {
    message.error('激活失败')
  }
}

function suspendTenant(tenant: Tenant) {
  dialog.warning({
    title: '确认暂停',
    content: `确定要暂停租户 "${tenant.name}" 吗？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.tenants.suspend(tenant.id)
        message.success('已暂停')
        loadTenants()
      } catch {
        message.error('操作失败')
      }
    },
  })
}

function reactivateTenant(tenant: Tenant) {
  dialog.info({
    title: '确认启用',
    content: `确定要启用租户 "${tenant.name}" 吗？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.tenants.activate(tenant.id)
        message.success('已启用')
        loadTenants()
      } catch {
        message.error('操作失败')
      }
    },
  })
}

async function deleteTenant(tenant: Tenant) {
  // 先获取关联数据统计
  const loadingMsg = message.loading('正在获取关联数据...', { duration: 0 })
  let relatedCount = { instances: 0, admins: 0, mtServers: 0 }
  try {
    relatedCount = await api.tenants.getRelatedCount(tenant.id) as any
  } catch {
    // 获取失败时使用默认值
  }
  loadingMsg.destroy()

  // 构建删除确认信息
  const relatedInfo: string[] = []
  if (relatedCount.instances > 0) {
    relatedInfo.push(`${relatedCount.instances} 个实例`)
  }
  if (relatedCount.admins > 0) {
    relatedInfo.push(`${relatedCount.admins} 个管理员`)
  }
  if (relatedCount.mtServers > 0) {
    relatedInfo.push(`${relatedCount.mtServers} 个MT服务器`)
  }

  const contentText = relatedInfo.length > 0
    ? `确定要删除租户 "${tenant.name}" 吗？\n\n将同时删除以下关联数据：${relatedInfo.join('、')}\n\n此操作不可恢复！`
    : `确定要删除租户 "${tenant.name}" 吗？此操作不可恢复！`

  dialog.error({
    title: '确认删除',
    content: contentText,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.tenants.delete(tenant.id)
        message.success('删除成功')
        loadTenants()
      } catch {
        message.error('删除失败')
      }
    },
  })
}

onMounted(() => {
  loadTenants()
})
</script>
