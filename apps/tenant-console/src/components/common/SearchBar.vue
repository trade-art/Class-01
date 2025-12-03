<template>
  <div class="search-bar">
    <n-space :wrap="false">
      <n-input
        v-model:value="searchValue"
        :placeholder="placeholder"
        clearable
        :style="{ width: inputWidth }"
        @keyup.enter="handleSearch"
      >
        <template #prefix>
          <span class="i-carbon-search"></span>
        </template>
      </n-input>
      <slot name="filters"></slot>
      <n-button type="primary" @click="handleSearch">
        <template #icon>
          <span class="i-carbon-search"></span>
        </template>
        {{ t('common.search') }}
      </n-button>
      <n-button v-if="showReset" @click="handleReset">
        <template #icon>
          <span class="i-carbon-reset"></span>
        </template>
        {{ t('common.reset') }}
      </n-button>
      <slot name="actions"></slot>
    </n-space>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NInput, NButton, NSpace } from 'naive-ui'
import { useI18n } from 'vue-i18n'

interface Props {
  modelValue?: string
  placeholder?: string
  inputWidth?: string
  showReset?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  inputWidth: '240px',
  showReset: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [value: string]
  reset: []
}>()

const { t } = useI18n()

const searchValue = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  searchValue.value = val
})

watch(searchValue, (val) => {
  emit('update:modelValue', val)
})

const handleSearch = () => {
  emit('search', searchValue.value)
}

const handleReset = () => {
  searchValue.value = ''
  emit('reset')
}
</script>

<style scoped>
.search-bar {
  margin-bottom: 16px;
}
</style>
