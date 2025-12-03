<template>
  <div ref="chartRef" :style="{ width: '100%', height: height }" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart as EPieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption, PieSeriesOption } from 'echarts'
import { useSettingsStore } from '@/stores/settings'

echarts.use([
  EPieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])

interface Props {
  title?: string
  data?: {
    name: string
    value: number
    color?: string
  }[]
  height?: string
  loading?: boolean
  donut?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  data: () => [],
  height: '300px',
  loading: false,
  donut: false,
})

const chartRef = ref<HTMLDivElement>()
let chartInstance: echarts.ECharts | null = null
const settingsStore = useSettingsStore()

const isDark = computed(() => settingsStore.isDark)

function getOption(): EChartsOption {
  const textColor = isDark.value ? '#e5e7eb' : '#374151'

  const seriesData: PieSeriesOption = {
    type: 'pie',
    radius: props.donut ? ['40%', '70%'] : '70%',
    center: ['50%', '55%'],
    data: props.data.map((item) => ({
      name: item.name,
      value: item.value,
      itemStyle: item.color ? { color: item.color } : undefined,
    })),
    label: {
      color: textColor,
      formatter: '{b}: {d}%',
    },
    labelLine: {
      lineStyle: { color: textColor },
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
      },
    },
  }

  return {
    title: props.title ? {
      text: props.title,
      left: 'center',
      textStyle: { color: textColor, fontSize: 14 },
    } : undefined,
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: isDark.value ? '#1f2937' : '#fff',
      borderColor: isDark.value ? '#374151' : '#e5e7eb',
      textStyle: { color: textColor },
    },
    legend: {
      bottom: 0,
      textStyle: { color: textColor },
    },
    series: [seriesData],
  }
}

function initChart() {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value, isDark.value ? 'dark' : undefined)
  chartInstance.setOption(getOption())

  if (props.loading) {
    chartInstance.showLoading({
      text: '',
      color: '#18a058',
      maskColor: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.8)',
    })
  }
}

function updateChart() {
  if (!chartInstance) return

  if (props.loading) {
    chartInstance.showLoading({
      text: '',
      color: '#18a058',
      maskColor: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.8)',
    })
  } else {
    chartInstance.hideLoading()
    chartInstance.setOption(getOption())
  }
}

function handleResize() {
  chartInstance?.resize()
}

watch(() => [props.data, props.loading], updateChart, { deep: true })
watch(isDark, () => {
  chartInstance?.dispose()
  initChart()
})

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>
