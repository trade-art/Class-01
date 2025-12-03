/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_APP_VERSION: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_ENABLE_MOCK: string
  readonly VITE_ENABLE_DEVTOOLS: string
  readonly VITE_TENANT_CODE?: string
  readonly VITE_TENANT_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
