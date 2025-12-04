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

    // Getters - 支持白标字段和传统 branding 字段
    const companyName = computed(() =>
      tenant.value?.displayName || branding.value?.companyName || tenant.value?.name || 'Tenant Console'
    )
    const logoUrl = computed(() =>
      tenant.value?.logo || branding.value?.logoUrl || tenant.value?.logoUrl || null
    )
    const faviconUrl = computed(() =>
      tenant.value?.favicon || branding.value?.faviconUrl || tenant.value?.faviconUrl || null
    )
    const primaryColor = computed(() =>
      tenant.value?.primaryColor || branding.value?.primaryColor || '#18a058'
    )
    const customDomain = computed(() => tenant.value?.customDomain || null)

    // Actions
    const setTenant = (tenantData: Tenant) => {
      tenant.value = tenantData
      // 如果有白标字段，同步到 branding
      if (tenantData.logo || tenantData.displayName || tenantData.primaryColor) {
        branding.value = {
          ...branding.value,
          logoUrl: tenantData.logo || branding.value?.logoUrl,
          companyName: tenantData.displayName || branding.value?.companyName,
          primaryColor: tenantData.primaryColor || branding.value?.primaryColor,
          faviconUrl: tenantData.favicon || branding.value?.faviconUrl,
        }
      } else if (tenantData.branding) {
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
      customDomain,

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
