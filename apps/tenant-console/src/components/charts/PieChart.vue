<template>
  <div ref="chartRef" class="chart"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useSettingsStore } from '@/stores/settings'

interface Props {
  data: Array<{ name: string; value: number }>
}

const props = defineProps<Props>()

const settingsStore = useSettingsStore()
const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const colors = [
  '#18a058',
  '#2080f0',
  '#f0a020',
  '#d03050',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#84cc16',
]

const initChart = () => {
  if (!chartRef.value) return

  chart = echarts.init(chartRef.value)
  updateChart()
}

const updateChart = () => {
  if (!chart) return

  const isDark = settingsStore.isDark
  const textColor = isDark ? 'rgba(255, 255, 255, 0.9)' : '#333'

  const option: echarts.EChartsOption = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: isDark ? '#18181c' : '#fff',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e0e0e6',
      textStyle: {
        color: textColor,
      },
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: {
        color: isDark ? 'rgba(255, 255, 255, 0.6)' : '#666',
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: isDark ? '#18181c' : '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            color: textColor,
          },
        },
        labelLine: {
          show: false,
        },
        data: props.data.map((item, index) => ({
          ...item,
          itemStyle: {
            color: colors[index % colors.length],
          },
        })),
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
