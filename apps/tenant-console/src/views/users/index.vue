<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ t('users.title') }}</h1>
    </div>

    <!-- Search & Filters -->
    <n-card class="filter-card">
      <div class="filter-row">
        <n-space :wrap="true" :size="16" align="center">
          <!-- MT Manager Selector -->
          <n-select
            v-if="usersStore.mtManagers.length > 0"
            :value="usersStore.currentManagerId"
            :options="managerOptions"
            :placeholder="t('users.selectManager')"
            :loading="usersStore.managersLoading"
            style="width: 200px"
            @update:value="handleManagerChange"
          />
          <n-tag v-else-if="!usersStore.managersLoading" type="warning" size="small">
            {{ t('users.noManagerTitle') }}
          </n-tag>

          <n-divider vertical />

          <n-input
            v-model:value="filters.keyword"
            :placeholder="t('users.searchPlaceholder')"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <span class="i-carbon-search"></span>
            </template>
          </n-input>

          <n-select
            v-model:value="filters.status"
            :placeholder="t('users.status')"
            :options="statusOptions"
            clearable
            style="width: 120px"
          />

          <n-select
            v-model:value="filters.group"
            :placeholder="t('users.group')"
            :options="groupOptions"
            clearable
            style="width: 140px"
          />

          <n-button type="primary" @click="handleSearch">
            <template #icon>
              <span class="i-carbon-search"></span>
            </template>
            {{ t('common.search') }}
          </n-button>

          <n-button @click="handleReset">
            <template #icon>
              <span class="i-carbon-reset"></span>
            </template>
            {{ t('common.reset') }}
          </n-button>
        </n-space>

        <n-button type="primary" @click="handleCreate" :disabled="!usersStore.currentManagerId">
          <template #icon>
            <span class="i-carbon-add"></span>
          </template>
          {{ t('users.createUser') }}
        </n-button>
      </div>
    </n-card>

    <!-- Users Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="usersStore.users"
        :loading="usersStore.loading"
        :pagination="paginationConfig"
        :row-key="(row: TradingUser) => row.login"
        :scroll-x="1200"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </n-card>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showModal"
      :title="editingUser ? t('users.editUser') : t('users.createUser')"
      preset="dialog"
      style="width: 600px"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="left"
        label-width="100"
      >
        <n-form-item :label="t('users.login')" path="login">
          <n-input-number
            v-model:value="formData.login"
            :placeholder="editingUser ? '' : 'Next'"
            :disabled="!!editingUser"
            :show-button="false"
            style="width: 100%"
          />
        </n-form-item>

        <n-form-item :label="t('users.lastName')" path="lastName">
          <n-input v-model:value="formData.lastName" :placeholder="t('users.lastNamePlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('users.firstName')" path="firstName">
          <n-input v-model:value="formData.firstName" :placeholder="t('users.firstNamePlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('users.email')" path="email">
          <n-input v-model:value="formData.email" :placeholder="t('users.emailPlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('users.phone')" path="phone">
          <n-input v-model:value="formData.phone" :placeholder="t('users.phonePlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('users.group')" path="group">
          <n-select
            v-model:value="formData.group"
            :placeholder="t('users.groupPlaceholder')"
            :options="groupOptions"
          />
        </n-form-item>

        <n-form-item :label="t('users.leverage')" path="leverage">
          <n-select
            v-model:value="formData.leverage"
            :placeholder="t('users.leveragePlaceholder')"
            :options="leverageOptions"
          />
        </n-form-item>

        <n-form-item v-if="!editingUser" :label="t('users.password')" path="password">
          <n-input-group>
            <n-input
              v-model:value="formData.password"
              type="password"
              show-password-on="click"
              :placeholder="t('users.passwordPlaceholder')"
              style="flex: 1"
            />
            <n-button @click="formData.password = generatePassword()" :title="t('users.regeneratePassword')">
              <template #icon>
                <span class="i-carbon-renew"></span>
              </template>
            </n-button>
          </n-input-group>
        </n-form-item>
      </n-form>

      <template #action>
        <n-space justify="end">
          <n-button @click="showModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ t('common.confirm') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NInput,
  NInputNumber,
  NInputGroup,
  NSelect,
  NSpace,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NTag,
  NDropdown,
  NDivider,
  useMessage,
  useDialog,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { useUsersStore } from '@/stores/users'
import type { TradingUser } from '@/types'

const { t } = useI18n()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const usersStore = useUsersStore()

const formRef = ref<FormInst | null>(null)
const showModal = ref(false)
const editingUser = ref<TradingUser | null>(null)
const submitting = ref(false)

const filters = reactive({
  keyword: '',
  status: null as string | null,
  group: null as string | null,
})

const formData = reactive({
  login: null as number | null,
  lastName: '',
  firstName: '',
  email: '',
  phone: '',
  group: '',
  leverage: 100,
  password: '',
})

const statusOptions = computed(() => [
  { label: t('users.statusActive'), value: 'active' },
  { label: t('users.statusInactive'), value: 'inactive' },
])

// 从 store 获取组别选项（根据当前 MT 经理账户）
const groupOptions = computed(() =>
  usersStore.groups.map((group) => ({
    label: group,
    value: group,
  }))
)

// MT 经理账户选项
const managerOptions = computed(() =>
  usersStore.mtManagers.map((manager) => ({
    label: manager.displayName || `${t('users.managerAccount')} ${manager.managerLogin}`,
    value: manager.id,
    suffix: manager.isDefault ? ` (${t('users.defaultManager')})` : '',
  }))
)

const leverageOptions = [
  { label: '1:50', value: 50 },
  { label: '1:100', value: 100 },
  { label: '1:200', value: 200 },
  { label: '1:500', value: 500 },
]

// 生成随机密码（8位，包含大小写字母、数字和特殊符号）
const generatePassword = (): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const special = '!@#$%^&*'
  const all = uppercase + lowercase + numbers + special

  // 确保每种字符至少有一个
  let password = ''
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += special[Math.floor(Math.random() * special.length)]

  // 填充剩余4位
  for (let i = 0; i < 4; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  // 打乱顺序
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

const formRules: FormRules = {
  lastName: [{ required: true, message: () => t('users.lastNameRequired'), trigger: 'blur' }],
  firstName: [{ required: true, message: () => t('users.firstNameRequired'), trigger: 'blur' }],
  email: [{ type: 'email', message: () => t('users.invalidEmail'), trigger: 'blur' }],
  group: [{ required: true, message: () => t('users.groupRequired'), trigger: 'blur' }],
  password: [
    { required: true, message: () => t('users.passwordRequired'), trigger: 'blur' },
    { min: 6, message: () => t('users.passwordMinLength'), trigger: 'blur' },
  ],
}

const paginationConfig = computed(() => ({
  page: usersStore.pagination.page,
  pageSize: usersStore.pagination.pageSize,
  pageCount: usersStore.pagination.pageCount,
  itemCount: usersStore.pagination.total,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  showQuickJumper: true,
}))

const columns: DataTableColumns<TradingUser> = [
  {
    title: t('users.login'),
    key: 'login',
    width: 100,
    sorter: true,
  },
  {
    title: t('users.name'),
    key: 'name',
    width: 150,
    ellipsis: { tooltip: true },
  },
  {
    title: t('users.email'),
    key: 'email',
    width: 180,
    ellipsis: { tooltip: true },
  },
  {
    title: t('users.group'),
    key: 'group',
    width: 100,
    render: (row) => h(NTag, { size: 'small', type: 'info' }, () => row.group),
  },
  {
    title: t('users.leverage'),
    key: 'leverage',
    width: 80,
    render: (row) => `1:${row.leverage}`,
  },
  {
    title: t('users.balance'),
    key: 'balance',
    width: 120,
    render: (row) => {
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(row.balance)
      return formatted
    },
  },
  {
    title: t('users.equity'),
    key: 'equity',
    width: 120,
    render: (row) => {
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(row.equity)
      return formatted
    },
  },
  {
    title: t('users.status'),
    key: 'status',
    width: 100,
    render: (row) => {
      const statusMap: Record<string, { type: 'success' | 'error' | 'warning' | 'default'; label: string }> = {
        active: { type: 'success', label: t('users.statusActive') },
        inactive: { type: 'default', label: t('users.statusInactive') },
      }
      const config = statusMap[row.status] || { type: 'default', label: row.status }
      return h(NTag, { size: 'small', type: config.type }, () => config.label)
    },
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 120,
    fixed: 'right',
    render: (row) => {
      const options = [
        { label: t('common.view'), key: 'view' },
        { label: t('common.edit'), key: 'edit' },
        { label: t('users.resetPassword'), key: 'resetPassword' },
        { type: 'divider', key: 'd1' },
        { label: row.status === 'inactive' ? t('users.activate') : t('users.deactivate'), key: 'toggleStatus' },
      ]

      return h(
        NDropdown,
        {
          trigger: 'click',
          options,
          onSelect: (key: string) => handleAction(key, row),
        },
        {
          default: () =>
            h(
              NButton,
              { size: 'small', quaternary: true },
              {
                icon: () => h('span', { class: 'i-carbon-overflow-menu-vertical' }),
              }
            ),
        }
      )
    },
  },
]

const handleSearch = () => {
  usersStore.fetchUsers({
    keyword: filters.keyword,
    status: filters.status || undefined,
    group: filters.group || undefined,
    page: 1,
    pageSize: usersStore.pagination.pageSize,
  })
}

const handleReset = () => {
  filters.keyword = ''
  filters.status = null
  filters.group = null
  handleSearch()
}

const handlePageChange = (page: number) => {
  usersStore.fetchUsers({
    ...filters,
    page,
    pageSize: usersStore.pagination.pageSize,
  })
}

const handlePageSizeChange = (pageSize: number) => {
  usersStore.fetchUsers({
    ...filters,
    page: 1,
    pageSize,
  })
}

const handleCreate = () => {
  editingUser.value = null
  Object.assign(formData, {
    login: null,
    lastName: '',
    firstName: '',
    email: '',
    phone: '',
    group: '',
    leverage: 100,
    password: generatePassword(),
  })
  showModal.value = true
}

const handleEdit = (user: TradingUser) => {
  editingUser.value = user
  Object.assign(formData, {
    login: user.login,
    name: user.name || '',
    email: user.email,
    phone: user.phone || '',
    group: user.group,
    leverage: user.leverage,
    password: '',
  })
  showModal.value = true
}

const handleSubmit = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    if (editingUser.value) {
      await usersStore.updateUser(editingUser.value.id, formData)
      message.success(t('users.updateSuccess'))
    } else {
      await usersStore.createUser(formData)
      message.success(t('users.createSuccess'))
    }
    showModal.value = false
    handleSearch()
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  } finally {
    submitting.value = false
  }
}

const handleAction = (key: string, user: TradingUser) => {
  switch (key) {
    case 'view':
      router.push(`/users/${user.id}`)
      break
    case 'edit':
      handleEdit(user)
      break
    case 'resetPassword':
      handleResetPassword(user)
      break
    case 'toggleStatus':
      handleToggleStatus(user)
      break
  }
}

const handleResetPassword = (user: TradingUser) => {
  dialog.warning({
    title: t('users.resetPassword'),
    content: t('users.resetPasswordConfirm', { login: user.login }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await usersStore.resetPassword(user.id)
        message.success(t('users.resetPasswordSuccess'))
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

const handleToggleStatus = (user: TradingUser) => {
  const action = user.status === 'disabled' ? 'activate' : 'deactivate'
  const actionText = user.status === 'disabled' ? t('users.activate') : t('users.deactivate')

  dialog.warning({
    title: actionText,
    content: t('users.toggleStatusConfirm', { login: user.login, action: actionText }),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        if (action === 'deactivate') {
          await usersStore.deactivateUser(user.id)
        } else {
          await usersStore.activateUser(user.id)
        }
        message.success(t('users.toggleStatusSuccess'))
        handleSearch()
      } catch (error: any) {
        message.error(error.message || t('common.error'))
      }
    },
  })
}

// 处理经理账户切换
const handleManagerChange = async (managerId: string) => {
  usersStore.setCurrentManager(managerId)
  // 重新加载该经理账户下的组别列表
  await usersStore.loadGroups(managerId)
  handleSearch()
}

onMounted(async () => {
  // 先加载经理账户列表
  await usersStore.loadManagers()
  // 然后加载组别列表和用户列表
  if (usersStore.currentManagerId) {
    await usersStore.loadGroups()
    handleSearch()
  }
})
</script>

<style scoped>
.filter-card {
  margin-bottom: 16px;
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
</style>
