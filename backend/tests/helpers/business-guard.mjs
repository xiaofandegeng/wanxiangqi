// v3 P0-A 测试隔离 · 业务资产护栏 (V01 雏形)
// 用法：测试套件 before() 调 captureBusinessBaseline()，after() 调 assertBusinessUntouched()
// 断言两件事在整轮测试前后完全不变：
//   1. 业务 storage.json 的 sha256（文件级：任何写入都会暴露）
//   2. 业务 PostgreSQL 七张业务表的行数（库级：绕过文件直写库也会暴露）
// 护栏自身只读不写；业务库不可达时记录跳过原因，文件哈希检查始终执行。

import fs from 'node:fs'
import crypto from 'node:crypto'

const ROOT_DIR = new URL('../../../', import.meta.url).pathname
export const BUSINESS_STORAGE_FILE = process.env.WXQ_BUSINESS_STORAGE_FILE ||
  `${ROOT_DIR}tools/emulator-watcher/data/storage.json`

export const BUSINESS_TABLES = [
  'players',
  'matches',
  'events',
  'event_participants',
  'lineup_snapshots',
  'evidences',
  'import_batches'
]

export function businessStorageSha256() {
  if (!fs.existsSync(BUSINESS_STORAGE_FILE)) return null
  return crypto.createHash('sha256').update(fs.readFileSync(BUSINESS_STORAGE_FILE)).digest('hex')
}

async function businessTableCounts() {
  let pg = null
  try {
    pg = await import('pg')
  } catch {
    return { ok: false, reason: 'pg 模块不可用，跳过业务库计数比对' }
  }
  const PoolClass = pg.Pool || pg.default?.Pool
  if (!PoolClass) return { ok: false, reason: 'pg.Pool 不可用，跳过业务库计数比对' }

  const pool = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'wanxiangqi',
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 2000
  })
  try {
    const counts = {}
    for (const table of BUSINESS_TABLES) {
      const res = await pool.query(`SELECT count(*)::int AS n FROM ${table}`)
      counts[table] = res.rows[0].n
    }
    return { ok: true, counts }
  } catch (err) {
    return { ok: false, reason: `业务库不可达 (${err.message})，跳过业务库计数比对` }
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function captureBusinessBaseline() {
  const pgState = await businessTableCounts()
  const baseline = {
    fileSha256: businessStorageSha256(),
    fileExists: fs.existsSync(BUSINESS_STORAGE_FILE),
    pg: pgState
  }
  if (!pgState.ok) console.warn(`[business-guard] ⚠️ ${pgState.reason}`)
  return baseline
}

export async function assertBusinessUntouched(baseline) {
  const afterFile = businessStorageSha256()
  if (baseline.fileExists || afterFile) {
    if (afterFile !== baseline.fileSha256) {
      throw new Error(
        `V01 违规：业务 storage.json 在测试期间被修改\n  before: ${baseline.fileSha256}\n  after:  ${afterFile}\n` +
        '测试必须注入临时数据目录 (backend/tests/helpers/tmp-store.mjs)，禁止触碰业务文件'
      )
    }
  }

  if (baseline.pg.ok) {
    const after = await businessTableCounts()
    if (after.ok) {
      const drift = BUSINESS_TABLES.filter(t => after.counts[t] !== baseline.pg.counts[t])
      if (drift.length > 0) {
        const detail = drift.map(t => `${t}: ${baseline.pg.counts[t]} -> ${after.counts[t]}`).join(', ')
        throw new Error(`V01 违规：业务库表计数在测试期间发生变化 (${detail})。测试库必须用 wanxiangqi_test`)
      }
    }
  }
}
