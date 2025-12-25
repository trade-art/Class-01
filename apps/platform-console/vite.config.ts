import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'path'

export default defineConfig({
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
    port: 5180,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
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
    include: ['naive-ui', 'vue', 'vue-router', 'pinia', 'axios'],
  },
})
