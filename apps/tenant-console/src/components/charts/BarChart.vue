<template>
  <div ref="chartRef" class="chart"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useSettingsStore } from '@/stores/settings'

interface Props {
  data: Array<{ name: string; value: number }>
  color?: string
  horizontal?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  color: '#18a058',
  horizontal: false,
})

const settingsStore = useSettingsStore()
const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const initChart = () => {
  if (!chartRef.value) return

  chart = echarts.init(chartRef.value)
  updateChart()
}

const updateChart = () => {
  if (!chart) return

  const isDark = settingsStore.isDark
  const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#666'
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#e0e0e6'

  const categories = props.data.map((item) => item.name)
  const values = props.data.map((item) => item.value)

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
      backgroundColor: isDark ? '#18181c' : '#fff',
      borderColor: borderColor,
      textStyle: {
        color: isDark ? 'rgba(255, 255, 255, 0.9)' : '#333',
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: props.horizontal ? 'value' : 'category',
      data: props.horizontal ? undefined : categories,
      axisLine: {
        lineStyle: { color: borderColor },
      },
      axisLabel: {
        color: textColor,
        rotate: props.horizontal ? 0 : 30,
      },
      splitLine: props.horizontal
        ? {
            lineStyle: { color: borderColor },
          }
        : undefined,
    },
    yAxis: {
      type: props.horizontal ? 'category' : 'value',
      data: props.horizontal ? categories : undefined,
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: props.horizontal
        ? undefined
        : {
            lineStyle: { color: borderColor },
          },
      axisLabel: {
        color: textColor,
      },
    },
    series: [
      {
        type: 'bar',
        data: values,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(
            props.horizontal ? 0 : 0,
            props.horizontal ? 0 : 1,
            props.horizontal ? 1 : 0,
            props.horizontal ? 0 : 0,
            [
              { offset: 0, color: props.color },
              { offset: 1, color: props.color + '80' },
            ]
          ),
          borderRadius: props.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
        barWidth: '60%',
      },
    ],
  }

  chart.setOption(option)
}

const handleResize = () => {
  chart?.resize()
}

watch(() => props.data, updateChart, { deep: true })
watch(() => settingsStore.isDark, updateChart)

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
}
</style>
