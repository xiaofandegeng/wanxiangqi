// v3 P0-A 测试隔离 · 测试专用 PostgreSQL 工具
// 铁律：测试只允许连接 *_test 库。库名不匹配 /_test$/ 时拒绝连接，
// 防止任何测试代码意外指向业务库 wanxiangqi。

export const TEST_DB_NAME = process.env.WXQ_TEST_DB || 'wanxiangqi_test'

if (!/_test$/.test(TEST_DB_NAME)) {
  throw new Error(
    `[pg-test] 拒绝连接：测试库名 "${TEST_DB_NAME}" 必须以 _test 结尾。` +
    '业务库 (wanxiangqi) 禁止用于测试 —— v3 任务书 P0-A。'
  )
}

async function loadPg() {
  const pg = await import('pg')
  const PoolClass = pg.Pool || pg.default?.Pool
  if (!PoolClass) throw new Error('[pg-test] pg 模块不可用（请先 cd backend && npm install pg）')
  return PoolClass
}

/**
 * 连接测试库（已强制 _test 后缀校验）
 */
export async function connectTestDb() {
  const PoolClass = await loadPg()
  const pool = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: TEST_DB_NAME,
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 2000
  })
  return pool
}

/**
 * 探测本地 PostgreSQL 是否可用（不可用则测试应 skip 而非 fail）
 */
export async function isLocalPgAvailable() {
  const PoolClass = await loadPg()
  const pool = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: 'postgres',
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 1500
  })
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await pool.end().catch(() => {})
  }
}

/**
 * 重建测试库（drop + create），仅在本地 PG 可用时使用
 */
export async function recreateTestDb() {
  const PoolClass = await loadPg()
  const admin = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: 'postgres',
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 2000
  })
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`)
  } finally {
    await admin.end().catch(() => {})
  }
}
