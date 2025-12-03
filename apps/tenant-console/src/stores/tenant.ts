import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Tenant, TenantBranding } from '@/types'
import { settingsApi } from '@/api/settings'

export const useTenantStore = defineStore(
  'tenant',
  () => {
    // State
    const tenant = ref<Tenant | null>(null)
    const branding = ref<TenantBranding | null>(null)
    const loading = ref(false)

    // Getters
    const companyName = computed(() => branding.value?.companyName || tenant.value?.name || 'Tenant Console')
    const logoUrl = computed(() => branding.value?.logoUrl || null)
    const faviconUrl = computed(() => branding.value?.faviconUrl || null)
    const primaryColor = computed(() => branding.value?.primaryColor || '#18a058')

    // Actions
    const setTenant = (tenantData: Tenant) => {
      tenant.value = tenantData
      if (tenantData.branding) {
        branding.value = tenantData.branding
      }
    }

    const loadBranding = async () => {
      loading.value = true
      try {
        const data = await settingsApi.getBranding()
        branding.value = data
        return data
      } finally {
        loading.value = false
      }
    }

    const updateBranding = async (data: Partial<TenantBranding>) => {
      loading.value = true
      try {
        await settingsApi.updateBranding(data)
        branding.value = { ...branding.value, ...data }
      } finally {
        loading.value = false
      }
    }

    const uploadLogo = async (file: File) => {
      const formData = new FormData()
      formData.append('logo', file)
      const result = await settingsApi.uploadLogo(formData)
      if (branding.value) {
        branding.value.logoUrl = result.url
      } else {
        branding.value = { logoUrl: result.url }
      }
      return result.url
    }

    const uploadFavicon = async (file: File) => {
      const formData = new FormData()
      formData.append('favicon', file)
      const result = await settingsApi.uploadFavicon(formData)
      if (branding.value) {
        branding.value.faviconUrl = result.url
      } else {
        branding.value = { faviconUrl: result.url }
      }
      return result.url
    }

    const clear = () => {
      tenant.value = null
      branding.value = null
    }

    return {
      // State
      tenant,
      branding,
      loading,

      // Getters
      companyName,
      logoUrl,
      faviconUrl,
      primaryColor,

      // Actions
      setTenant,
      loadBranding,
      updateBranding,
      uploadLogo,
      uploadFavicon,
      clear,
    }
  },
  {
    persist: {
      key: 'tenant-info',
      paths: ['tenant', 'branding'],
    },
  }
)
