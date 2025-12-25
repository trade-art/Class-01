import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'

export default defineConfig({
  // Base public path - for nginx deployment use /tenant/, for local dev use /
  base: process.env.VITE_BASE || '/',
  plugins: [
    vue(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5181,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:3200',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/v1/, ''),
      },
      '/ws': {
        target: 'ws://localhost:3200',
        ws: true,
      },
    },
    // 支持 SPA history 模式，刷新页面时返回 index.html
    historyApiFallback: true,
  },
  // SPA 路由支持（Vite 4+ 使用 appType）
  appType: 'spa',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'naive-ui': ['naive-ui'],
          'echarts': ['echarts'],
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['naive-ui', 'vue', 'vue-router', 'pinia', 'axios', 'echarts'],
  },
})
