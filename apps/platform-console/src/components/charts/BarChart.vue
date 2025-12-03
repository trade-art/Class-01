<template>
  <div ref="chartRef" :style="{ width: '100%', height: height }" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart as EBarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption, BarSeriesOption } from 'echarts'
import { useSettingsStore } from '@/stores/settings'

echarts.use([
  EBarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  CanvasRenderer,
])

interface Props {
  title?: string
  xData?: string[]
  series?: {
    name: string
    data: number[]
    color?: string
  }[]
  height?: string
  loading?: boolean
  horizontal?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  xData: () => [],
  series: () => [],
  height: '300px',
  loading: false,
  horizontal: false,
})

const chartRef = ref<HTMLDivElement>()
let chartInstance: echarts.ECharts | null = null
const settingsStore = useSettingsStore()

const isDark = computed(() => settingsStore.isDark)

function getOption(): EChartsOption {
  const textColor = isDark.value ? '#e5e7eb' : '#374151'
  const lineColor = isDark.value ? '#374151' : '#e5e7eb'

  const seriesData: BarSeriesOption[] = props.series.map((item) => ({
    name: item.name,
    type: 'bar',
    data: item.data,
    itemStyle: item.color ? { color: item.color } : undefined,
    barMaxWidth: 40,
  }))

  const categoryAxis = {
    type: 'category' as const,
    data: props.xData,
    axisLine: { lineStyle: { color: lineColor } },
    axisLabel: { color: textColor },
  }

  const valueAxis = {
    type: 'value' as const,
    axisLine: { lineStyle: { color: lineColor } },
    axisLabel: { color: textColor },
    splitLine: { lineStyle: { color: lineColor } },
  }

  return {
    title: props.title ? {
      text: props.title,
      left: 'center',
      textStyle: { color: textColor, fontSize: 14 },
    } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: isDark.value ? '#1f2937' : '#fff',
      borderColor: isDark.value ? '#374151' : '#e5e7eb',
      textStyle: { color: textColor },
    },
    legend: {
      bottom: 0,
      textStyle: { color: textColor },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: props.series.length > 1 ? '15%' : '10%',
      top: props.title ? '15%' : '10%',
      containLabel: true,
    },
    xAxis: props.horizontal ? valueAxis : categoryAxis,
    yAxis: props.horizontal ? categoryAxis : valueAxis,
    series: seriesData,
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

watch(() => [props.xData, props.series, props.loading], updateChart, { deep: true })
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
