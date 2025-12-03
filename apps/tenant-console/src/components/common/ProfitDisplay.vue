<template>
  <span :class="['profit-display', profitClass]" :style="style">
    {{ formattedValue }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  value: number
  showSign?: boolean
  showCurrency?: boolean
  currency?: string
  decimals?: number
  size?: 'small' | 'medium' | 'large'
  bold?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSign: true,
  showCurrency: true,
  currency: 'USD',
  decimals: 2,
  size: 'medium',
  bold: false,
})

const profitClass = computed(() => {
  if (props.value > 0) return 'profit'
  if (props.value < 0) return 'loss'
  return 'neutral'
})

const formattedValue = computed(() => {
  const absValue = Math.abs(props.value)
  let formatted = absValue.toFixed(props.decimals)

  if (props.showCurrency) {
    formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: props.currency,
      minimumFractionDigits: props.decimals,
      maximumFractionDigits: props.decimals,
    }).format(absValue)
  } else {
    formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: props.decimals,
      maximumFractionDigits: props.decimals,
    }).format(absValue)
  }

  if (props.showSign && props.value !== 0) {
    const sign = props.value > 0 ? '+' : '-'
    // Remove any existing currency symbol for repositioning
    if (props.showCurrency) {
      formatted = sign + formatted
    } else {
      formatted = sign + formatted
    }
  } else if (props.value < 0) {
    formatted = '-' + formatted
  }

  return formatted
})

const style = computed(() => ({
  fontSize: props.size === 'small' ? '12px' : props.size === 'large' ? '18px' : '14px',
  fontWeight: props.bold ? '600' : '400',
}))
</script>

<style scoped>
.profit-display {
  font-variant-numeric: tabular-nums;
}

.profit {
  color: var(--profit-color);
}

.loss {
  color: var(--loss-color);
}

.neutral {
  color: var(--text-color-secondary);
}
</style>
