<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <h1 class="page-title">{{ t('menu.subscriptions') }}</h1>
      <n-button type="primary" @click="showCreateModal = true">
        <template #icon>
          <n-icon><i class="i-carbon-add" /></n-icon>
        </template>
        {{ t('subscription.create') }}
      </n-button>
    </div>

    <!-- Plans Grid -->
    <n-spin :show="loading">
      <div class="grid grid-cols-3 gap-6">
        <n-card
          v-for="plan in plans"
          :key="plan.id"
          :class="['plan-card', { 'plan-featured': plan.code === 'PROFESSIONAL' }]"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <span class="text-lg font-semibold">{{ plan.name }}</span>
              <n-tag :type="getPlanTagType(plan.code)" size="small">
                {{ plan.code }}
              </n-tag>
            </div>
          </template>

          <div class="plan-price mb-4">
            <span class="text-3xl font-bold text-primary">¥{{ plan.price }}</span>
            <span class="text-secondary">/{{ t('subscription.month') }}</span>
          </div>

          <n-divider />

          <div class="plan-features space-y-3">
            <div class="flex items-center gap-2">
              <n-icon class="text-success"><i class="i-carbon-checkmark" /></n-icon>
              <span>{{ t('subscription.maxInstances') }}: {{ plan.maxInstances }}</span>
            </div>
            <div class="flex items-center gap-2">
              <n-icon class="text-success"><i class="i-carbon-checkmark" /></n-icon>
              <span>{{ t('subscription.maxAdmins') }}: {{ plan.maxAdmins }}</span>
            </div>
            <div class="flex items-center gap-2">
              <n-icon class="text-success"><i class="i-carbon-checkmark" /></n-icon>
              <span>{{ t('subscription.maxSessions') }}: {{ plan.maxSessions || t('common.unlimited') }}</span>
            </div>
            <div v-if="plan.features" class="mt-4">
              <div v-for="(feature, idx) in parseFeatures(plan.features)" :key="idx" class="flex items-center gap-2">
                <n-icon class="text-success"><i class="i-carbon-checkmark" /></n-icon>
                <span>{{ feature }}</span>
              </div>
            </div>
          </div>

          <template #action>
            <n-space justify="end">
              <n-button text type="primary" @click="editPlan(plan)">
                {{ t('common.edit') }}
              </n-button>
              <n-button text type="error" @click="deletePlan(plan)">
                {{ t('common.delete') }}
              </n-button>
            </n-space>
          </template>
        </n-card>
      </div>

      <n-empty v-if="!loading && plans.length === 0" :description="t('common.noData')" />
    </n-spin>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showCreateModal"
      preset="dialog"
      :title="editingPlan ? t('subscription.edit') : t('subscription.create')"
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
            <n-form-item path="name" :label="t('subscription.name')">
              <n-input v-model:value="form.name" :placeholder="t('subscription.namePlaceholder')" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="code" :label="t('subscription.code')">
              <n-input
                v-model:value="form.code"
                :placeholder="t('subscription.codePlaceholder')"
                :disabled="!!editingPlan"
              />
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-grid :cols="2" :x-gap="16">
          <n-gi>
            <n-form-item path="price" :label="t('subscription.price')">
              <n-input-number
                v-model:value="form.price"
                :min="0"
                :precision="2"
                style="width: 100%"
              >
                <template #prefix>¥</template>
              </n-input-number>
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="billingCycle" :label="t('subscription.billingCycle')">
              <n-select v-model:value="form.billingCycle" :options="billingCycleOptions" />
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-grid :cols="3" :x-gap="16">
          <n-gi>
            <n-form-item path="maxInstances" :label="t('subscription.maxInstances')">
              <n-input-number v-model:value="form.maxInstances" :min="1" style="width: 100%" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="maxAdmins" :label="t('subscription.maxAdmins')">
              <n-input-number v-model:value="form.maxAdmins" :min="1" style="width: 100%" />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="maxSessions" :label="t('subscription.maxSessions')">
              <n-input-number v-model:value="form.maxSessions" :min="0" style="width: 100%" />
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-form-item path="description" :label="t('subscription.description')">
          <n-input
            v-model:value="form.description"
            type="textarea"
            :placeholder="t('subscription.descriptionPlaceholder')"
            :rows="2"
          />
        </n-form-item>

        <n-form-item path="features" :label="t('subscription.features')">
          <n-dynamic-input
            v-model:value="form.featureList"
            :placeholder="t('subscription.featurePlaceholder')"
          />
        </n-form-item>

        <n-form-item path="isActive" :label="t('subscription.status')">
          <n-switch v-model:value="form.isActive">
            <template #checked>{{ t('common.active') }}</template>
            <template #unchecked>{{ t('common.inactive') }}</template>
          </n-switch>
        </n-form-item>
      </n-form>

      <template #action>
        <n-button @click="resetForm">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ editingPlan ? t('common.update') : t('common.create') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NButton,
  NIcon,
  NTag,
  NSpin,
  NSpace,
  NDivider,
  NEmpty,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NGrid,
  NGi,
  NDynamicInput,
  useMessage,
  useDialog,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { api } from '@/api'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()

interface SubscriptionPlan {
  id: string
  name: string
  code: string
  price: number
  billingCycle: string
  maxInstances: number
  maxAdmins: number
  maxSessions: number | null
  description?: string
  features?: string
  isActive: boolean
}

const loading = ref(false)
const saving = ref(false)
const plans = ref<SubscriptionPlan[]>([])
const showCreateModal = ref(false)
const editingPlan = ref<SubscriptionPlan | null>(null)
const formRef = ref<FormInst | null>(null)

const form = reactive({
  name: '',
  code: '',
  price: 0,
  billingCycle: 'MONTHLY',
  maxInstances: 1,
  maxAdmins: 3,
  maxSessions: 100,
  description: '',
  featureList: [] as string[],
  isActive: true,
})

const billingCycleOptions = computed(() => [
  { label: t('subscription.monthly'), value: 'MONTHLY' },
  { label: t('subscription.quarterly'), value: 'QUARTERLY' },
  { label: t('subscription.yearly'), value: 'YEARLY' },
])

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('subscription.nameRequired'), trigger: 'blur' }],
  code: [
    { required: true, message: t('subscription.codeRequired'), trigger: 'blur' },
    { pattern: /^[A-Z_]+$/, message: t('subscription.codeFormat'), trigger: 'blur' },
  ],
  price: [{ required: true, type: 'number', message: t('subscription.priceRequired'), trigger: 'blur' }],
}))

function getPlanTagType(code: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  const types: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    TRIAL: 'default',
    BASIC: 'info',
    PROFESSIONAL: 'success',
    ENTERPRISE: 'warning',
  }
  return types[code] || 'default'
}

function parseFeatures(features: string | undefined): string[] {
  if (!features) return []
  try {
    const parsed = JSON.parse(features)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return features.split(',').map(f => f.trim()).filter(Boolean)
  }
}

async function loadPlans() {
  loading.value = true
  try {
    const result = await api.subscriptions.list() as any
    plans.value = Array.isArray(result) ? result : (result.data || [])
  } catch (error) {
    message.error(t('subscription.loadFailed'))
  } finally {
    loading.value = false
  }
}

function editPlan(plan: SubscriptionPlan) {
  editingPlan.value = plan
  Object.assign(form, {
    name: plan.name,
    code: plan.code,
    price: plan.price,
    billingCycle: plan.billingCycle,
    maxInstances: plan.maxInstances,
    maxAdmins: plan.maxAdmins,
    maxSessions: plan.maxSessions || 0,
    description: plan.description || '',
    featureList: parseFeatures(plan.features),
    isActive: plan.isActive,
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
    const data = {
      ...form,
      features: JSON.stringify(form.featureList.filter(Boolean)),
    }
    delete (data as any).featureList

    if (editingPlan.value) {
      await api.subscriptions.update(editingPlan.value.id, data)
      message.success(t('common.updateSuccess'))
    } else {
      await api.subscriptions.create(data)
      message.success(t('common.createSuccess'))
    }

    showCreateModal.value = false
    resetForm()
    loadPlans()
  } catch (error: any) {
    message.error(error.message || t('common.operationFailed'))
  } finally {
    saving.value = false
  }
}

function resetForm() {
  showCreateModal.value = false
  editingPlan.value = null
  Object.assign(form, {
    name: '',
    code: '',
    price: 0,
    billingCycle: 'MONTHLY',
    maxInstances: 1,
    maxAdmins: 3,
    maxSessions: 100,
    description: '',
    featureList: [],
    isActive: true,
  })
}

function deletePlan(plan: SubscriptionPlan) {
  dialog.error({
    title: t('common.confirmDelete'),
    content: t('subscription.deleteConfirm', { name: plan.name }),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await api.subscriptions.delete(plan.id)
        message.success(t('common.deleteSuccess'))
        loadPlans()
      } catch {
        message.error(t('common.deleteFailed'))
      }
    },
  })
}

onMounted(() => {
  loadPlans()
})
</script>

<style scoped>
.plan-card {
  transition: all 0.3s ease;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.plan-featured {
  border: 2px solid var(--primary-color);
}

.plan-price {
  text-align: center;
}
</style>
