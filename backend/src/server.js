// 王者万象棋数据站 - 真实业务后端主入口 (Backend Server Entry)
// 支持 npm start 直接启动，兼容标准 REST API 与 PostgreSQL 数据持久化

import { createApiServer, PORT, HOST } from '../../tools/emulator-watcher/index.mjs'
import { dbManager } from './db.js'

async function bootstrap() {
  console.log('========================================================')
  console.log('王者万象棋数据站 - 真实数据后端服务正在初始化...')
  
  // 1. 尝试初始化数据库与表结构
  const dbStatus = await dbManager.initialize()
  console.log(`- 数据库驱动模式: ${dbStatus.engine} (连接状态: ${dbStatus.isConnected ? '已连接' : '未连接/本地引擎'})`)

  // 2. 启动 HTTP 业务服务
  const server = createApiServer()
  server.listen(PORT, HOST, () => {
    console.log(`- 业务服务监听于: http://${HOST}:${PORT}`)
    console.log(`- 管理鉴权已生效: Authorization: Bearer <ADMIN_TOKEN>`)
    console.log(`- 冷启动状态: 严格零 mock 空事实库 (Zero-Mock Cold Start)`)
    console.log('========================================================')
  })

  // 优雅退出处理
  process.on('SIGINT', () => {
    console.log('\n[Backend Server] 正在关闭业务服务...')
    server.close(() => {
      console.log('[Backend Server] 服务已安全终止')
      process.exit(0)
    })
  })
}

bootstrap().catch(err => {
  console.error('[Backend Server] 启动失败:', err)
  process.exit(1)
})
