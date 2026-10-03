// v6 · 测试隔离 · 业务库护栏
// 用法：测试套件 before() 调 captureBusinessBaseline()，after() 调 assertBusinessUntouched()
// 断言业务 PostgreSQL 各表行数在整轮测试前后完全不变（绕过服务层直写库也会暴露）。
// 护栏自身只读不写；业务库不可达时记录跳过原因。
// （v6：demo 文件引擎与业务 storage.json 已退役，文件哈希护栏随之移除；PG 为唯一权威。）

export const BUSINESS_TABLES = [
  'players',
  'matches',
  'events',
  'event_participants',
  'import_batches',
  'lineup_snapshots',
  'evidences',
  'evidence_blobs',
  'data_sources',
  'raw_materials',
  'sync_jobs'
]

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
    return { ok: false, reason: `业务库不可达或表缺失 (${err.message})，跳过业务库计数比对` }
  } finally {
    await pool.end().catch(() => {})
  }
}

export async function captureBusinessBaseline() {
  const pgState = await businessTableCounts()
  if (!pgState.ok) console.warn(`[business-guard] ⚠️ ${pgState.reason}`)
  return { pg: pgState }
}

export async function assertBusinessUntouched(baseline) {
  if (baseline.pg.ok) {
    const after = await businessTableCounts()
    if (after.ok) {
      const drift = BUSINESS_TABLES.filter(t => after.counts[t] !== baseline.pg.counts[t])
      if (drift.length > 0) {
        const detail = drift.map(t => `${t}: ${baseline.pg.counts[t]} -> ${after.counts[t]}`).join(', ')
        throw new Error(`V01 违规：业务库表计数在测试期间发生变化 (${detail})。测试库必须用 *_test 命名库`)
      }
    }
  }
}
