<template>
  <n-tag :type="tagType" :size="size" :round="round" :bordered="bordered">
    <template v-if="showIcon" #icon>
      <span :class="iconClass"></span>
    </template>
    {{ displayText }}
  </n-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'

type StatusType = 'active' | 'inactive' | 'pending' | 'suspended' | 'success' | 'error' | 'warning' | 'info' | 'buy' | 'sell' | 'profit' | 'loss'

interface Props {
  status: StatusType | string
  text?: string
  size?: 'small' | 'medium' | 'large'
  round?: boolean
  bordered?: boolean
  showIcon?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small',
  round: false,
  bordered: true,
  showIcon: false,
})

const { t } = useI18n()

const statusConfig: Record<string, { type: 'success' | 'error' | 'warning' | 'info' | 'default'; icon: string; textKey?: string }> = {
  active: { type: 'success', icon: 'i-carbon-checkmark-filled', textKey: 'common.active' },
  inactive: { type: 'default', icon: 'i-carbon-close-filled', textKey: 'common.inactive' },
  pending: { type: 'warning', icon: 'i-carbon-time', textKey: 'common.pending' },
  suspended: { type: 'error', icon: 'i-carbon-warning-alt-filled', textKey: 'common.suspended' },
  success: { type: 'success', icon: 'i-carbon-checkmark-filled' },
  error: { type: 'error', icon: 'i-carbon-close-filled' },
  warning: { type: 'warning', icon: 'i-carbon-warning-alt-filled' },
  info: { type: 'info', icon: 'i-carbon-information-filled' },
  buy: { type: 'info', icon: 'i-carbon-arrow-up', textKey: 'history.buy' },
  sell: { type: 'error', icon: 'i-carbon-arrow-down', textKey: 'history.sell' },
  profit: { type: 'success', icon: 'i-carbon-trending-up' },
  loss: { type: 'error', icon: 'i-carbon-trending-down' },
}

const config = computed(() => statusConfig[props.status] || { type: 'default' as const, icon: '' })

const tagType = computed(() => config.value.type)

const iconClass = computed(() => config.value.icon)

const displayText = computed(() => {
  if (props.text) return props.text
  if (config.value.textKey) return t(config.value.textKey)
  return props.status
})
</script>
