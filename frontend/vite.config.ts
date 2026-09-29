import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  },
  test: {
    // v3 P0-A 测试隔离（V01 雏形）：
    // 1. 业务 storage.json 哈希护栏 —— 整轮 vitest 前后哈希必须一致
    // 2. WXQ_DATA_DIR 指向临时目录 —— 任何残留的隐式业务存储访问都被重定向
    globalSetup: fileURLToPath(new URL('./tests/guards/business-assets-guard.setup.mts', import.meta.url))
  }
})
