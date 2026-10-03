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
        // 浏览器验收：harness 用 WXQ_API_TARGET 把代理指向临时验收后端；
        // 默认仍是本机 8080（不影响日常开发）。仅作用于 dev server，与 vitest 无关。
        target: process.env.WXQ_API_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  },
  test: {
    // v6：demo 文件引擎与业务 storage.json 已退役，前端测试隔离不再依赖
    // storage.json 哈希护栏（原 guards/business-assets-guard.setup.mts 随 v6 删除）。
    // 后端业务库隔离由 backend/tests/helpers/business-guard.mjs（PG 计数）承担；
    // 前端 vitest 全部走 mock fetch / mock api 层，不触达任何真实数据面。
  }
})
