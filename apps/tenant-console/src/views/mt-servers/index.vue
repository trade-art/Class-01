<template>
  <div class="page-container">
    <div class="page-header flex-between">
      <div>
        <h1 class="page-title">MT 服务器配置</h1>
        <n-text v-if="quota" depth="3" style="margin-top: 4px;">
          服务器数量: {{ quota.currentServers }} / {{ quota.maxServers }}
          | 支持平台: {{ quota.supportedPlatforms.join(', ') }}
        </n-text>
      </div>
      <n-button
        type="primary"
        :disabled="!quota?.canAddServer"
        @click="openCreateModal"
      >
        <template #icon>
          <n-icon><span class="i-carbon-add" /></n-icon>
        </template>
        新建服务器
      </n-button>
    </div>

    <!-- Quota Warning -->
    <n-alert
      v-if="quota && !quota.canAddServer"
      type="warning"
      class="mb-4"
      closable
    >
      已达到最大服务器数量限制 ({{ quota.maxServers }})，如需添加更多服务器请联系管理员升级套餐。
    </n-alert>

    <!-- Empty State -->
    <n-card v-if="!loading && servers.length === 0" class="empty-state-card">
      <div class="empty-state-content">
        <div class="empty-icon">
          <span class="i-carbon-server-dns"></span>
        </div>
        <div class="empty-text">暂无 MT 服务器配置</div>
        <div class="empty-action">
          <n-button
            v-if="quota?.canAddServer"
            type="primary"
            @click="openCreateModal"
          >
            添加第一个服务器
          </n-button>
          <n-text v-else depth="3">
            请联系管理员配置订阅套餐
          </n-text>
        </div>
      </div>
    </n-card>

    <!-- Servers Table -->
    <n-card v-else>
      <n-data-table
        :columns="columns"
        :data="servers"
        :loading="loading"
        :row-key="(row: MtServer) => row.id"
        :scroll-x="1100"
      />
    </n-card>

    <!-- Create/Edit Modal -->
    <n-modal
      v-model:show="showFormModal"
      :title="editingServer ? '编辑服务器' : '新建服务器'"
      preset="dialog"
      style="width: 600px"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="top"
      >
        <n-grid :cols="2" :x-gap="16">
          <n-gi>
            <n-form-item path="serverId" label="服务器ID">
              <n-input
                v-model:value="formData.serverId"
                placeholder="如: demo-mt5"
                :disabled="!!editingServer"
              />
            </n-form-item>
          </n-gi>
          <n-gi>
            <n-form-item path="displayName" label="显示名称">
              <n-input
                v-model:value="formData.displayName"
                placeholder="如: Demo MT5 Server"
              />
            </n-form-item>
          </n-gi>
        </n-grid>

        <n-form-item path="platformType" label="平台类型">
          <n-select
            v-model:value="formData.platformType"
            :options="platformOptions"
            :disabled="!!editingServer"
          />
        </n-form-item>

        <n-form-item path="middlewareId" label="中间件实例">
          <div style="width: 100%;">
            <n-select
              v-model:value="formData.middlewareId"
              :options="middlewareOptions"
              placeholder="请选择中间件实例"
              style="width: 280px;"
            />
            <div v-if="middlewareOptions.length === 0" style="margin-top: 6px;">
              <n-text depth="3" style="font-size: 12px;">
                暂无可用的中间件实例，请联系管理员分配
              </n-text>
            </div>
          </div>
        </n-form-item>

        <n-form-item path="serverAddress" label="MT服务器地址">
          <n-input
            v-model:value="formData.serverAddress"
            placeholder="192.168.1.100:443"
          />
        </n-form-item>

      </n-form>

      <template #action>
        <n-button @click="closeFormModal">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">
          {{ editingServer ? '保存' : '创建' }}
        </n-button>
      </template>
    </n-modal>

  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted, computed } from 'vue'
import {
  NCard,
  NButton,
  NIcon,
  NDataTable,
  NModal,
  NTag,
  NText,
  NEmpty,
  NAlert,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NGrid,
  NGi,
  NSpace,
  NPopconfirm,
  useMessage,
  type DataTableColumns,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { mtServersApi } from '@/api/mt-servers'
import { middlewareInstancesApi, type MiddlewareInstance } from '@/api/middleware-instances'
import type { MtServer, MtServerQuota, PlatformType } from '@/types'

const message = useMessage()
const authStore = useAuthStore()

// State
const loading = ref(false)
const saving = ref(false)
const servers = ref<MtServer[]>([])
const quota = ref<MtServerQuota | null>(null)
const middlewareInstances = ref<MiddlewareInstance[]>([])
const showFormModal = ref(false)
const editingServer = ref<MtServer | null>(null)
const formRef = ref<FormInst | null>(null)

// Check if user has write permission (owner or admin)
const canEdit = computed(() => {
  const role = authStore.admin?.role
  return role === 'owner' || role === 'admin'
})

// Form data
const formData = ref({
  serverId: '',
  displayName: '',
  platformType: 'MT5' as PlatformType,
  middlewareId: '',
  serverAddress: '',
  isDefault: false,
})

// Platform options based on quota
const platformOptions = computed(() => {
  const platforms = quota.value?.supportedPlatforms || ['MT5']
  return platforms.map(p => ({ label: p, value: p }))
})

// Middleware options based on assigned instances and selected platform
// 显示所有分配给租户的中间件，标注状态
const middlewareOptions = computed(() => {
  const selectedPlatform = formData.value.platformType

  return middlewareInstances.value
    .filter(m => m.platformType === selectedPlatform)
    .map(m => ({
      label: m.status === 'ONLINE'
        ? `${m.name} (${m.url})`
        : `${m.name} (${m.url}) - ${m.status === 'OFFLINE' ? '离线' : m.status}`,
      value: m.id,
    }))
})

// Form validation rules
const formRules: FormRules = {
  serverId: [
    { required: true, message: '请输入服务器ID', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_-]+$/, message: '只能包含字母、数字、下划线和连字符', trigger: 'blur' },
  ],
  displayName: [
    { required: true, message: '请输入显示名称', trigger: 'blur' },
  ],
  platformType: [
    { required: true, message: '请选择平台类型', trigger: 'change' },
  ],
  middlewareId: [
    { required: true, message: '请选择中间件实例', trigger: 'change' },
  ],
  serverAddress: [
    { required: true, message: '请输入MT服务器地址', trigger: 'blur' },
  ],
}

// Table columns
const columns = computed<DataTableColumns<MtServer>>(() => [
  {
    title: '服务器ID',
    key: 'serverId',
    width: 120,
  },
  {
    title: '显示名称',
    key: 'displayName',
    width: 150,
    ellipsis: { tooltip: true },
  },
  {
    title: '平台',
    key: 'platformType',
    width: 80,
    render: (row) => h(NTag, { size: 'small', type: 'info' }, () => row.platformType),
  },
  {
    title: '中间件',
    key: 'middlewareName',
    width: 180,
    ellipsis: { tooltip: true },
    render: (row) => {
      if (!row.middlewareId) {
        return h(NText, { depth: 3 }, () => '未配置')
      }
      const middleware = middlewareInstances.value.find(m => m.id === row.middlewareId)
      return middleware ? middleware.name : h(NText, { depth: 3 }, () => '未配置')
    },
  },
  {
    title: 'MT服务器',
    key: 'serverAddress',
    width: 150,
    ellipsis: { tooltip: true },
  },
  {
    title: '经理账号',
    key: 'defaultManagerLogin',
    width: 120,
    render: (row) => {
      if (row.defaultManagerLogin) {
        return h(NTag, { size: 'small', type: 'success' }, () => row.defaultManagerLogin)
      }
      return h(NText, { depth: 3 }, () => '未绑定')
    },
  },
  {
    title: '状态',
    key: 'isActive',
    width: 80,
    render: (row) =>
      h(
        NTag,
        { size: 'small', type: row.isActive ? 'success' : 'default' },
        () => (row.isActive ? '启用' : '禁用')
      ),
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    fixed: 'right',
    render: (row) => {
      const buttons: ReturnType<typeof h>[] = []

      if (canEdit.value) {
        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              onClick: () => openEditModal(row),
            },
            () => '编辑'
          )
        )

        buttons.push(
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              type: row.isActive ? 'warning' : 'success',
              onClick: () => handleToggleStatus(row),
            },
            () => (row.isActive ? '禁用' : '启用')
          )
        )

        buttons.push(
          h(
            NPopconfirm,
            {
              onPositiveClick: () => handleDelete(row),
            },
            {
              trigger: () =>
                h(
                  NButton,
                  {
                    size: 'small',
                    quaternary: true,
                    type: 'error',
                  },
                  () => '删除'
                ),
              default: () => `确定要删除服务器 "${row.displayName || row.serverId}" 吗？`,
            }
          )
        )
      }

      return h(NSpace, { size: 'small' }, () => buttons)
    },
  },
])

// Methods
const fetchServers = async () => {
  loading.value = true
  try {
    const [serversResponse, quotaResponse, middlewareResponse] = await Promise.all([
      mtServersApi.getServers(),
      mtServersApi.getQuota(),
      middlewareInstancesApi.getInstances(),
    ])
    servers.value = serversResponse.servers
    quota.value = quotaResponse
    middlewareInstances.value = middlewareResponse.middlewares
  } catch (error: any) {
    message.error(error.message || '获取服务器列表失败')
  } finally {
    loading.value = false
  }
}

const openCreateModal = () => {
  editingServer.value = null
  formData.value = {
    serverId: '',
    displayName: '',
    platformType: (quota.value?.supportedPlatforms[0] || 'MT5') as PlatformType,
    middlewareId: '',
    serverAddress: '',
    isDefault: false,
  }
  showFormModal.value = true
}

const openEditModal = (server: MtServer) => {
  editingServer.value = server
  formData.value = {
    serverId: server.serverId,
    displayName: server.displayName || '',
    platformType: server.platformType,
    middlewareId: server.middlewareId || '',
    serverAddress: server.serverAddress,
    isDefault: server.isDefault,
  }
  showFormModal.value = true
}

const closeFormModal = () => {
  showFormModal.value = false
  editingServer.value = null
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  // Get middleware URL from selected middleware instance
  const selectedMiddleware = middlewareInstances.value.find(m => m.id === formData.value.middlewareId)
  if (!selectedMiddleware) {
    message.error('请选择有效的中间件实例')
    return
  }

  saving.value = true
  try {
    if (editingServer.value) {
      // Update existing server
      const updateData: any = {
        displayName: formData.value.displayName,
        middlewareId: formData.value.middlewareId,
        middlewareUrl: selectedMiddleware.url,
        serverAddress: formData.value.serverAddress,
      }
      await mtServersApi.updateServer(editingServer.value.serverId, updateData)
      message.success('更新成功')
    } else {
      // Create new server
      await mtServersApi.createServer({
        serverId: formData.value.serverId,
        displayName: formData.value.displayName,
        platformType: formData.value.platformType,
        middlewareId: formData.value.middlewareId,
        middlewareUrl: selectedMiddleware.url,
        serverAddress: formData.value.serverAddress,
        isDefault: formData.value.isDefault,
      })
      message.success('创建成功')
    }
    closeFormModal()
    fetchServers()
  } catch (error: any) {
    message.error(error.message || '操作失败')
  } finally {
    saving.value = false
  }
}

const handleToggleStatus = async (server: MtServer) => {
  const newStatus = !server.isActive
  const action = newStatus ? '启用' : '禁用'

  try {
    await mtServersApi.toggleStatus(server.serverId, newStatus)
    message.success(`${action}成功`)
    fetchServers()
  } catch (error: any) {
    message.error(error.message || `${action}失败`)
  }
}

const handleDelete = async (server: MtServer) => {
  try {
    await mtServersApi.deleteServer(server.serverId)
    message.success('删除成功')
    fetchServers()
  } catch (error: any) {
    message.error(error.message || '删除失败')
  }
}

onMounted(() => {
  fetchServers()
})
</script>

<style scoped>
.page-container {
  padding: 0;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.mb-4 {
  margin-bottom: 16px;
}

.empty-state-card {
  min-height: 300px;
}

.empty-state-card :deep(.n-card__content) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 260px;
}

.empty-state-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  color: var(--n-text-color-disabled);
  line-height: 1;
}

.empty-text {
  font-size: 14px;
  color: var(--n-text-color-3);
}

.empty-action {
  margin-top: 8px;
}
</style>
