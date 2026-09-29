// 王者万象棋数据站 - 正式模式主入口 (Formal Server Entry, v3)
// compose 顺序：env 校验 → PG 连接（失败=退出）→ 迁移 → PgRepository → services → listen
//
// 任务书 P1-A：
// - PostgreSQL 为唯一权威存储；WXQ_APP_MODE=formal 下关键环境变量必须显式（无默认值）
// - 启动时 pool 连接失败 → 打印原因并退出（禁止静默降级到文件引擎，F04 根因之一）
// - 运行中 PG 失联 → /api/v1/ready = 503、写路径报错；liveness(/health) 正常返回
// - db.js/schema.sql 已退役：DDL 全部走版本化迁移 (migrations/)

import { loadEnvFile, getEnv, assertFormalEnv } from './env.mjs'
import { runMigrations } from './migrate.mjs'
import { PgRepository } from './repositories/pg-repository.mjs'
import { createServices } from './services/index.mjs'
import { createApiServer } from '../../tools/emulator-watcher/index.mjs'

async function bootstrap() {
  loadEnvFile()
  const env = getEnv()
  assertFormalEnv(env)

  console.log('========================================================')
  console.log('王者万象棋数据站 - 正式模式后端服务 (PostgreSQL 唯一权威)')
  console.log(`- 数据库: ${env.pg.host}:${env.pg.port}/${env.pg.database} (user: ${env.pg.user})`)

  // 1. 连接权威库（formal 下失败即退出，不降级）
  const pg = await import('pg')
  const PoolClass = pg.Pool || pg.default?.Pool
  const pool = new PoolClass({
    host: env.pg.host,
    port: env.pg.port,
    database: env.pg.database,
    user: env.pg.user,
    password: env.pg.password,
    connectionTimeoutMillis: 5000,
    max: 10
  })

  const client = await pool.connect().catch(err => {
    console.error(`[Server] ✖ PostgreSQL 连接失败（正式模式拒绝降级启动）: ${err.message}`)
    console.error('[Server]    请检查 PGHOST/PGPORT/PGDATABASE/PGUSER 与数据库可达性')
    process.exit(1)
  })

  // 2. 版本化迁移（幂等；篡改即拒绝）
  try {
    const { applied } = await runMigrations(client)
    console.log(`- 迁移: ${applied.length > 0 ? `新应用 ${applied.length} 个 (${applied.join(', ')})` : '全部已是最新'}`)
  } catch (err) {
    console.error(`[Server] ✖ 迁移失败，拒绝启动: ${err.message}`)
    process.exit(1)
  } finally {
    client.release()
  }

  // 3. 仓储与服务层
  const repo = new PgRepository(pool)
  const services = createServices(repo, env)

  // 4. HTTP（注入 services 与显式 adminToken）
  const server = createApiServer({ services, adminToken: env.adminToken })
  server.listen(env.port, env.host, () => {
    console.log(`- 业务服务监听于: http://${env.host}:${env.port}`)
    console.log('- 管理鉴权已生效: Authorization: Bearer <ADMIN_TOKEN>（显式注入，无默认值）')
    console.log(`- 小样本阈值: N < ${env.smallSampleThreshold} 标记 isSmallSample`)
    console.log('- 就绪探测: GET /api/v1/ready（PG 失联时 503）')
    console.log('========================================================')
  })

  const shutdown = (signal) => {
    console.log(`\n[Server] 收到 ${signal}，正在关闭...`)
    server.close(async () => {
      await pool.end().catch(() => {})
      console.log('[Server] 服务已安全终止')
      process.exit(0)
    })
    // 兜底：close 钩子卡住（长连接 SSE）时强制退出
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

bootstrap().catch(err => {
  console.error('[Server] 启动失败:', err.message)
  process.exit(1)
})
