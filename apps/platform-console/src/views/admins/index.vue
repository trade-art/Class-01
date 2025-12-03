<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('menu.admins') }}</h1>
      <n-button type="primary" @click="showCreateModal = true">
        <template #icon>
          <n-icon><i class="i-carbon-add" /></n-icon>
        </template>
        {{ t('admin.create') }}
      </n-button>
    </div>

    <!-- Table -->
    <n-card>
      <n-data-table
        :columns="columns"
        :data="admins"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row: Admin) => row.id"
        @update:page="handlePageChange"
      />
    </n-card>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showCreateModal"
      preset="dialog"
      :title="editingAdmin ? t('admin.edit') : t('admin.create')"
      :style="{ width: '500px' }"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-placement="top"
      >
        <n-form-item path="name" :label="t('admin.name')">
          <n-input v-model:value="form.name" :placeholder="t('admin.namePlaceholder')" />
        </n-form-item>

        <n-form-item path="email" :label="t('admin.email')">
          <n-input
            v-model:value="form.email"
            :placeholder="t('admin.emailPlaceholder')"
            :disabled="!!editingAdmin"
          />
        </n-form-item>

        <n-form-item v-if="!editingAdmin" path="password" :label="t('admin.password')">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="t('admin.passwordPlaceholder')"
          />
        </n-form-item>

        <n-form-item path="role" :label="t('admin.role')">
          <n-select v-model:value="form.role" :options="roleOptions" />
        </n-form-item>

        <n-form-item path="isActive" :label="t('admin.status')">
          <n-switch v-model:value="form.isActive">
            <template #checked>{{ t('common.active') }}</template>
            <template #unchecked>{{ t('common.inactive') }}</template>
          </n-switch>
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="resetForm">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ editingAdmin ? t('common.update') : t('common.create') }}
        </n-button>
      </template>
    </n-modal>

    <!-- Change Password Modal -->
    <n-modal
      v-model:show="showPasswordModal"
      preset="dialog"
      :title="t('admin.changePassword')"
      :style="{ width: '400px' }"
      :mask-closable="false"
    >
      <n-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-placement="top"
      >
        <n-form-item path="newPassword" :label="t('admin.newPassword')">
          <n-input
            v-model:value="passwordForm.newPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('admin.newPasswordPlaceholder')"
          />
        </n-form-item>

        <n-form-item path="confirmPassword" :label="t('admin.confirmPassword')">
          <n-input
            v-model:value="passwordForm.confirmPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('admin.confirmPasswordPlaceholder')"
          />
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="showPasswordModal = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleChangePassword">
          {{ t('common.confirm') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, h, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NIcon,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSwitch,
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

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()

interface Admin {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  lastLoginAt?: string
}

const loading = ref(false)
const saving = ref(false)
const admins = ref<Admin[]>([])
const showCreateModal = ref(false)
const showPasswordModal = ref(false)
const editingAdmin = ref<Admin | null>(null)
const passwordTargetAdmin = ref<Admin | null>(null)
const formRef = ref<FormInst | null>(null)
const passwordFormRef = ref<FormInst | null>(null)

const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
})

const form = reactive({
  name: '',
  email: '',
  password: '',
  role: 'ADMIN',
  isActive: true,
})

const passwordForm = reactive({
  newPassword: '',
  confirmPassword: '',
})

const roleOptions = computed(() => [
  { label: t('admin.roles.superAdmin'), value: 'SUPER_ADMIN' },
  { label: t('admin.roles.admin'), value: 'ADMIN' },
])

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('admin.nameRequired'), trigger: 'blur' }],
  email: [
    { required: true, message: t('admin.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('admin.emailInvalid'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: t('admin.passwordRequired'), trigger: 'blur' },
    { min: 8, message: t('admin.passwordMinLength'), trigger: 'blur' },
  ],
}))

const passwordRules = computed<FormRules>(() => ({
  newPassword: [
    { required: true, message: t('admin.passwordRequired'), trigger: 'blur' },
    { min: 8, message: t('admin.passwordMinLength'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: t('admin.confirmPasswordRequired'), trigger: 'blur' },
    {
      validator: (_rule: any, value: string) => {
        if (value !== passwordForm.newPassword) {
          return new Error(t('admin.passwordMismatch'))
        }
        return true
      },
      trigger: 'blur',
    },
  ],
}))

const columns = computed<DataTableColumns<Admin>>(() => [
  {
    title: t('admin.name'),
    key: 'name',
  },
  {
    title: t('admin.email'),
    key: 'email',
  },
  {
    title: t('admin.role'),
    key: 'role',
    render: (row) => h(NTag, {
      type: row.role === 'SUPER_ADMIN' ? 'warning' : 'info',
      size: 'small',
    }, () => row.role === 'SUPER_ADMIN' ? t('admin.roles.superAdmin') : t('admin.roles.admin')),
  },
  {
    title: t('admin.status'),
    key: 'isActive',
    render: (row) => h(NTag, {
      type: row.isActive ? 'success' : 'default',
      size: 'small',
    }, () => row.isActive ? t('common.active') : t('common.inactive')),
  },
  {
    title: t('admin.lastLogin'),
    key: 'lastLoginAt',
    render: (row) => row.lastLoginAt ? formatDate(row.lastLoginAt) : '-',
  },
  {
    title: t('common.createdAt'),
    key: 'createdAt',
    render: (row) => formatDate(row.createdAt),
  },
  {
    title: t('common.actions'),
    key: 'actions',
    width: 120,
    render: (row) => h(NDropdown, {
      options: getActionOptions(),
      onSelect: (key: string) => handleAction(key, row),
    }, () => h(NButton, { text: true, size: 'small' }, () => t('common.actions'))),
  },
])

function getActionOptions() {
  return [
    { label: t('common.edit'), key: 'edit' },
    { label: t('admin.changePassword'), key: 'password' },
    { label: t('common.delete'), key: 'delete', props: { style: { color: 'var(--error-color)' } } },
  ]
}

function handleAction(key: string, row: Admin) {
  switch (key) {
    case 'edit':
      editAdmin(row)
      break
    case 'password':
      openPasswordModal(row)
      break
    case 'delete':
      deleteAdmin(row)
      break
  }
}

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadAdmins() {
  loading.value = true
  try {
    const result = await api.platformAdmins.list() as any
    admins.value = Array.isArray(result) ? result : (result.data || [])
    pagination.itemCount = admins.value.length
  } catch (error) {
    message.error(t('admin.loadFailed'))
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number) {
  pagination.page = page
}

function editAdmin(admin: Admin) {
  editingAdmin.value = admin
  Object.assign(form, {
    name: admin.name,
    email: admin.email,
    password: '',
    role: admin.role,
    isActive: admin.isActive,
  })
  showCreateModal.value = true
}

function openPasswordModal(admin: Admin) {
  passwordTargetAdmin.value = admin
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  showPasswordModal.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (editingAdmin.value) {
      const { password, ...updateData } = form
      await api.platformAdmins.update(editingAdmin.value.id, updateData)
      message.success(t('common.updateSuccess'))
    } else {
      await api.platformAdmins.create(form)
      message.success(t('common.createSuccess'))
    }

    showCreateModal.value = false
    resetForm()
    loadAdmins()
  } catch (error: any) {
    message.error(error.message || t('common.operationFailed'))
  } finally {
    saving.value = false
  }
}

async function handleChangePassword() {
  try {
    await passwordFormRef.value?.validate()
  } catch {
    return
  }

  if (!passwordTargetAdmin.value) return

  saving.value = true
  try {
    await api.platformAdmins.resetPassword(passwordTargetAdmin.value.id, {
      newPassword: passwordForm.newPassword,
    })
    message.success(t('admin.passwordChanged'))
    showPasswordModal.value = false
  } catch (error: any) {
    message.error(error.message || t('common.operationFailed'))
  } finally {
    saving.value = false
  }
}

function resetForm() {
  showCreateModal.value = false
  editingAdmin.value = null
  Object.assign(form, {
    name: '',
    email: '',
    password: '',
    role: 'ADMIN',
    isActive: true,
  })
}

function deleteAdmin(admin: Admin) {
  dialog.error({
    title: t('common.confirmDelete'),
    content: t('admin.deleteConfirm', { name: admin.name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await api.platformAdmins.delete(admin.id)
        message.success(t('common.deleteSuccess'))
        loadAdmins()
      } catch {
        message.error(t('common.deleteFailed'))
      }
    },
  })
}

onMounted(() => {
  loadAdmins()
})
</script>
