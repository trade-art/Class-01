<template>
  <div ref="chartRef" class="chart"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useSettingsStore } from '@/stores/settings'

interface Props {
  data: Array<{ date: string; value: number }>
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  color: '#18a058',
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

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'axis',
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
      type: 'category',
      boundaryGap: false,
      data: props.data.map((item) => item.date),
      axisLine: {
        lineStyle: { color: borderColor },
      },
      axisLabel: {
        color: textColor,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false,
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        lineStyle: { color: borderColor },
      },
      axisLabel: {
        color: textColor,
      },
    },
    series: [
      {
        type: 'line',
        data: props.data.map((item) => item.value),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: props.color,
          width: 2,
        },
        itemStyle: {
          color: props.color,
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: props.color + '40' },
            { offset: 1, color: props.color + '05' },
          ]),
        },
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
