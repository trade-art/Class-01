<template>
  <div class="page-container">
    <div class="page-header">
      <h1 class="page-title">{{ t('settings.subscription') }}</h1>
      <p class="page-subtitle">{{ t('subscription.pageDesc') }}</p>
    </div>

    <n-spin :show="loading">
      <div v-if="subscriptionData" class="subscription-content">
        <!-- Plan Card -->
        <n-card class="plan-card">
          <div class="plan-header">
            <div class="plan-info">
              <n-tag :type="planTagType" size="large">{{ planLabel }}</n-tag>
              <n-tag v-if="subscriptionData.isExpiringSoon" type="warning" size="small" class="ml-2">
                {{ t('subscription.expiringSoon') }}
              </n-tag>
            </div>
            <div class="plan-status">
              <span class="status-label">{{ t('subscription.status') }}:</span>
              <n-tag :type="statusTagType" size="small">{{ statusLabel }}</n-tag>
            </div>
          </div>

          <n-descriptions :column="2" label-placement="left" class="plan-details">
            <n-descriptions-item :label="t('subscription.expiresAt')">
              <span v-if="subscriptionData.daysRemaining === -1">{{ t('subscription.neverExpires') }}</span>
              <span v-else>
                {{ subscriptionData.expiresAt ? formatDate(subscriptionData.expiresAt) : '-' }}
                <n-tag v-if="subscriptionData.daysRemaining >= 0" :type="daysRemainingType" size="small" class="ml-2">
                  {{ t('subscription.daysRemaining', { days: subscriptionData.daysRemaining }) }}
                </n-tag>
              </span>
            </n-descriptions-item>
            <n-descriptions-item :label="t('subscription.supportedPlatforms')">
              <n-space>
                <n-tag v-for="platform in subscriptionData.supportedPlatforms" :key="platform" size="small">
                  {{ platform }}
                </n-tag>
              </n-space>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- Quota Cards -->
        <div class="quota-grid">
          <!-- Admins Quota -->
          <n-card :title="t('subscription.adminsQuota')" size="small">
            <template #header-extra>
              <span class="i-carbon-user-admin text-lg" style="color: var(--warning-color);"></span>
            </template>
            <quota-progress
              :used="subscriptionData.admins.used"
              :max="subscriptionData.admins.max"
              :percentage="subscriptionData.admins.percentage"
              color="#f0a020"
            />
          </n-card>

          <!-- MT Servers Quota -->
          <n-card :title="t('subscription.mtServersQuota')" size="small">
            <template #header-extra>
              <span class="i-carbon-server text-lg" style="color: var(--primary-color);"></span>
            </template>
            <quota-progress
              :used="subscriptionData.mtServers.used"
              :max="subscriptionData.mtServers.max"
              :percentage="subscriptionData.mtServers.percentage"
              color="#18a058"
            />
          </n-card>

          <!-- Manager Accounts Quota -->
          <n-card :title="t('subscription.managerAccountsQuota')" size="small">
            <template #header-extra>
              <span class="i-carbon-user-multiple text-lg" style="color: var(--info-color);"></span>
            </template>
            <quota-progress
              :used="subscriptionData.managerAccounts.used"
              :max="subscriptionData.managerAccounts.max"
              :percentage="subscriptionData.managerAccounts.percentage"
              color="#2080f0"
            />
          </n-card>

          <!-- Instances Quota -->
          <n-card :title="t('subscription.instancesQuota')" size="small">
            <template #header-extra>
              <span class="i-carbon-cube text-lg" style="color: #722ed1;"></span>
            </template>
            <quota-progress
              :used="subscriptionData.instances.used"
              :max="subscriptionData.instances.max"
              :percentage="subscriptionData.instances.percentage"
              color="#722ed1"
            />
          </n-card>
        </div>

        <!-- Plan Comparison -->
        <n-card :title="t('subscription.planComparison')" class="plan-comparison-card">
          <n-table :bordered="false" :single-line="false">
            <thead>
              <tr>
                <th>{{ t('subscription.feature') }}</th>
                <th>{{ t('subscription.planTrial') }}</th>
                <th>{{ t('subscription.planBasic') }}</th>
                <th>{{ t('subscription.planProfessional') }}</th>
                <th>{{ t('subscription.planEnterprise') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ t('subscription.maxAdmins') }}</td>
                <td>2</td>
                <td>5</td>
                <td>20</td>
                <td>{{ t('subscription.unlimited') }}</td>
              </tr>
              <tr>
                <td>{{ t('subscription.maxMtServers') }}</td>
                <td>1</td>
                <td>3</td>
                <td>10</td>
                <td>{{ t('subscription.unlimited') }}</td>
              </tr>
              <tr>
                <td>{{ t('subscription.maxManagerAccounts') }}</td>
                <td>5</td>
                <td>20</td>
                <td>100</td>
                <td>{{ t('subscription.unlimited') }}</td>
              </tr>
              <tr>
                <td>{{ t('subscription.maxInstances') }}</td>
                <td>1</td>
                <td>2</td>
                <td>5</td>
                <td>{{ t('subscription.unlimited') }}</td>
              </tr>
              <tr>
                <td>{{ t('subscription.platforms') }}</td>
                <td>MT5</td>
                <td>MT5</td>
                <td>MT4, MT5</td>
                <td>MT4, MT5</td>
              </tr>
            </tbody>
          </n-table>
        </n-card>

        <!-- Upgrade CTA -->
        <n-card v-if="canUpgrade" class="upgrade-card">
          <n-result status="info" :title="t('subscription.upgradeTitle')" :description="t('subscription.upgradeDesc')">
            <template #footer>
              <n-button type="primary" @click="handleContactUs">
                {{ t('subscription.contactUs') }}
              </n-button>
            </template>
          </n-result>
        </n-card>
      </div>

      <!-- Empty State -->
      <n-empty v-else-if="!loading" :description="t('subscription.loadError')">
        <template #extra>
          <n-button @click="loadSubscription">{{ t('common.retry') }}</n-button>
        </template>
      </n-empty>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NCard,
  NTag,
  NDescriptions,
  NDescriptionsItem,
  NSpace,
  NTable,
  NButton,
  NResult,
  NSpin,
  NEmpty,
  NProgress,
  useMessage,
} from 'naive-ui'
import { settingsApi, type SubscriptionStatus } from '@/api/settings'

const { t } = useI18n()
const message = useMessage()

const loading = ref(false)
const subscriptionData = ref<SubscriptionStatus | null>(null)

// Quota Progress Component
const QuotaProgress = defineComponent({
  name: 'QuotaProgress',
  props: {
    used: { type: Number, required: true },
    max: { type: Number, required: true },
    percentage: { type: Number, required: true },
    color: { type: String, default: '#18a058' },
  },
  setup(props) {
    const { t } = useI18n()
    const progressStatus = computed(() => {
      if (props.percentage >= 90) return 'error'
      if (props.percentage >= 70) return 'warning'
      return 'success'
    })

    return () =>
      h('div', { class: 'quota-progress' }, [
        h('div', { class: 'quota-numbers' }, [
          h('span', { class: 'quota-used' }, props.used.toString()),
          h('span', { class: 'quota-separator' }, ' / '),
          h('span', { class: 'quota-max' }, props.max === -1 ? t('subscription.unlimited') : props.max.toString()),
        ]),
        h(NProgress, {
          type: 'line',
          percentage: props.max === -1 ? 0 : props.percentage,
          status: progressStatus.value,
          indicatorPlacement: 'inside',
          color: props.color,
          height: 20,
        }),
        h('p', { class: 'quota-hint' },
          props.percentage >= 90
            ? t('subscription.quotaWarning')
            : props.percentage >= 70
              ? t('subscription.quotaNotice')
              : ''
        ),
      ])
  },
})

const planTagType = computed(() => {
  const typeMap: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
    TRIAL: 'default',
    BASIC: 'info',
    PROFESSIONAL: 'success',
    ENTERPRISE: 'warning',
  }
  return typeMap[subscriptionData.value?.plan || 'TRIAL'] || 'default'
})

const planLabel = computed(() => {
  const plan = subscriptionData.value?.plan || 'TRIAL'
  const labelMap: Record<string, string> = {
    TRIAL: t('subscription.planTrial'),
    BASIC: t('subscription.planBasic'),
    PROFESSIONAL: t('subscription.planProfessional'),
    ENTERPRISE: t('subscription.planEnterprise'),
  }
  return labelMap[plan] || plan
})

const statusTagType = computed(() => {
  const status = subscriptionData.value?.status || ''
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'error'
  return 'warning'
})

const statusLabel = computed(() => {
  const status = subscriptionData.value?.status || ''
  const labelMap: Record<string, string> = {
    ACTIVE: t('subscription.statusActive'),
    SUSPENDED: t('subscription.statusSuspended'),
    PENDING: t('subscription.statusPending'),
  }
  return labelMap[status] || status
})

const daysRemainingType = computed(() => {
  const days = subscriptionData.value?.daysRemaining || 0
  if (days <= 7) return 'error'
  if (days <= 30) return 'warning'
  return 'info'
})

const canUpgrade = computed(() => {
  const plan = subscriptionData.value?.plan
  return plan && plan !== 'ENTERPRISE'
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString()
}

const loadSubscription = async () => {
  loading.value = true
  try {
    subscriptionData.value = await settingsApi.getSubscriptionStatus()
  } catch (error: any) {
    message.error(error.message || t('common.error'))
  } finally {
    loading.value = false
  }
}

const handleContactUs = () => {
  message.info(t('subscription.contactInfo'))
}

onMounted(() => {
  loadSubscription()
})
</script>

<style scoped>
.page-subtitle {
  color: var(--text-color-secondary);
  margin-top: 8px;
  font-size: 14px;
}

.subscription-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plan-card {
  background: linear-gradient(135deg, var(--card-color) 0%, var(--body-color) 100%);
}

.plan-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.plan-info {
  display: flex;
  align-items: center;
}

.plan-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  color: var(--text-color-secondary);
  font-size: 14px;
}

.plan-details {
  margin-top: 16px;
}

.quota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.quota-progress {
  padding: 8px 0;
}

.quota-numbers {
  display: flex;
  align-items: baseline;
  margin-bottom: 8px;
}

.quota-used {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color-base);
}

.quota-separator {
  margin: 0 4px;
  color: var(--text-color-secondary);
}

.quota-max {
  font-size: 16px;
  color: var(--text-color-secondary);
}

.quota-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--warning-color);
  min-height: 18px;
}

.plan-comparison-card {
  margin-top: 8px;
}

.plan-comparison-card th,
.plan-comparison-card td {
  text-align: center;
}

.plan-comparison-card th:first-child,
.plan-comparison-card td:first-child {
  text-align: left;
}

.upgrade-card {
  margin-top: 8px;
}

.ml-2 {
  margin-left: 8px;
}
</style>
