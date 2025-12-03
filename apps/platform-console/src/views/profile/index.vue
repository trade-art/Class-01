<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('menu.profile') }}</h1>
    </div>

    <n-grid :cols="2" :x-gap="16">
      <!-- Profile Info Card -->
      <n-gi>
        <n-card :title="t('profile.basicInfo')">
          <n-spin :show="loadingProfile">
            <n-form
              ref="profileFormRef"
              :model="profileForm"
              :rules="profileRules"
              label-placement="left"
              label-width="100"
            >
              <n-form-item :label="t('admin.name')" path="name">
                <n-input v-model:value="profileForm.name" :placeholder="t('admin.namePlaceholder')" />
              </n-form-item>
              <n-form-item :label="t('admin.email')" path="email">
                <n-input v-model:value="profileForm.email" :placeholder="t('admin.emailPlaceholder')" disabled />
              </n-form-item>
              <n-form-item :label="t('admin.role')">
                <n-tag :type="userStore.user?.role === 'super_admin' ? 'success' : 'info'">
                  {{ userStore.user?.role === 'super_admin' ? t('admin.roles.superAdmin') : t('admin.roles.admin') }}
                </n-tag>
              </n-form-item>
              <n-form-item :label="t('admin.lastLogin')">
                <span class="text-secondary">{{ formatDate(userStore.user?.lastLoginAt) }}</span>
              </n-form-item>
              <n-form-item>
                <n-button type="primary" @click="handleUpdateProfile" :loading="savingProfile">
                  {{ t('common.save') }}
                </n-button>
              </n-form-item>
            </n-form>
          </n-spin>
        </n-card>
      </n-gi>

      <!-- Change Password Card -->
      <n-gi>
        <n-card :title="t('admin.changePassword')">
          <n-form
            ref="passwordFormRef"
            :model="passwordForm"
            :rules="passwordRules"
            label-placement="left"
            label-width="100"
          >
            <n-form-item :label="t('profile.currentPassword')" path="currentPassword">
              <n-input
                v-model:value="passwordForm.currentPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('profile.currentPasswordPlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('admin.newPassword')" path="newPassword">
              <n-input
                v-model:value="passwordForm.newPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('admin.newPasswordPlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('admin.confirmPassword')" path="confirmPassword">
              <n-input
                v-model:value="passwordForm.confirmPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('admin.confirmPasswordPlaceholder')"
              />
            </n-form-item>
            <n-form-item>
              <n-button type="primary" @click="handleChangePassword" :loading="savingPassword">
                {{ t('admin.changePassword') }}
              </n-button>
            </n-form-item>
          </n-form>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Account Info -->
    <n-card :title="t('profile.accountInfo')" class="mt-4">
      <n-descriptions :columns="3" bordered>
        <n-descriptions-item :label="t('common.createdAt')">
          {{ formatDate(userStore.user?.createdAt) }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('common.updatedAt')">
          {{ formatDate(userStore.user?.updatedAt) }}
        </n-descriptions-item>
        <n-descriptions-item :label="t('common.status')">
          <n-tag :type="userStore.user?.isActive ? 'success' : 'error'">
            {{ userStore.user?.isActive ? t('common.active') : t('common.inactive') }}
          </n-tag>
        </n-descriptions-item>
      </n-descriptions>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NTag,
  NGrid,
  NGi,
  NSpin,
  NDescriptions,
  NDescriptionsItem,
  useMessage,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { useUserStore } from '@/stores/user'
import { api } from '@/api'
import dayjs from 'dayjs'

const { t } = useI18n()
const message = useMessage()
const userStore = useUserStore()

const profileFormRef = ref<FormInst | null>(null)
const passwordFormRef = ref<FormInst | null>(null)
const loadingProfile = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)

const profileForm = reactive({
  name: '',
  email: '',
})

const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const profileRules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('admin.nameRequired'), trigger: 'blur' },
  ],
}))

const passwordRules = computed<FormRules>(() => ({
  currentPassword: [
    { required: true, message: t('profile.currentPasswordRequired'), trigger: 'blur' },
  ],
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

function formatDate(date?: string) {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

async function loadProfile() {
  loadingProfile.value = true
  try {
    await userStore.fetchProfile()
    if (userStore.user) {
      profileForm.name = userStore.user.name || ''
      profileForm.email = userStore.user.email || ''
    }
  } catch {
    message.error(t('profile.loadFailed'))
  } finally {
    loadingProfile.value = false
  }
}

async function handleUpdateProfile() {
  try {
    await profileFormRef.value?.validate()
  } catch {
    return
  }

  savingProfile.value = true
  try {
    await api.platformAdmins.updateProfile({ name: profileForm.name })
    await userStore.fetchProfile()
    message.success(t('common.updateSuccess'))
  } catch {
    message.error(t('common.operationFailed'))
  } finally {
    savingProfile.value = false
  }
}

async function handleChangePassword() {
  try {
    await passwordFormRef.value?.validate()
  } catch {
    return
  }

  savingPassword.value = true
  try {
    await api.platformAdmins.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    message.success(t('admin.passwordChanged'))
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
  } catch {
    message.error(t('profile.passwordChangeFailed'))
  } finally {
    savingPassword.value = false
  }
}

onMounted(() => {
  loadProfile()
})
</script>
