<template>
  <div class="data-table-wrapper">
    <n-data-table
      ref="tableRef"
      :columns="columns"
      :data="data"
      :loading="loading"
      :pagination="paginationConfig"
      :row-key="rowKey"
      :scroll-x="scrollX"
      :bordered="bordered"
      :single-line="singleLine"
      :striped="striped"
      :size="size"
      @update:page="handlePageChange"
      @update:page-size="handlePageSizeChange"
      @update:sorter="handleSorterChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NDataTable, type DataTableColumns, type PaginationProps } from 'naive-ui'

interface Props {
  columns: DataTableColumns<any>
  data: any[]
  loading?: boolean
  pagination?: PaginationProps | false
  rowKey?: (row: any) => string | number
  scrollX?: number | string
  bordered?: boolean
  singleLine?: boolean
  striped?: boolean
  size?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  bordered: false,
  singleLine: true,
  striped: false,
  size: 'medium',
})

const emit = defineEmits<{
  'update:page': [page: number]
  'update:page-size': [pageSize: number]
  'update:sorter': [sorter: any]
}>()

const tableRef = ref<InstanceType<typeof NDataTable> | null>(null)

const paginationConfig = computed(() => {
  if (props.pagination === false) return false
  return {
    page: 1,
    pageSize: 10,
    showSizePicker: true,
    pageSizes: [10, 20, 50, 100],
    showQuickJumper: true,
    ...props.pagination,
  }
})

const handlePageChange = (page: number) => {
  emit('update:page', page)
}

const handlePageSizeChange = (pageSize: number) => {
  emit('update:page-size', pageSize)
}

const handleSorterChange = (sorter: any) => {
  emit('update:sorter', sorter)
}

defineExpose({
  tableRef,
})
</script>

<style scoped>
.data-table-wrapper {
  width: 100%;
}
</style>
