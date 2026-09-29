// v3 P0-B · 隔离回滚工具
// 从 quarantine_backup_<ts> 表整行还原被隔离/修正的数据。
// 用法：
//   node scripts/rollback_quarantine.mjs --db wanxiangqi_test --yes                 # 回滚最新备份表
//   node scripts/rollback_quarantine.mjs --db wanxiangqi --backup-table quarantine_backup_20260929T1015 --yes
//
// 还原方式：备份保存的是修改前整行 JSON；按主键 UPDATE 全部非 PK 列，
// 还原后逐行校验 row_to_json 哈希与备份一致，任何不一致即失败回滚。

import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const args = { db: null, backupTable: null, yes: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') args.db = argv[++i]
    else if (argv[i] === '--backup-table') args.backupTable = argv[++i]
    else if (argv[i] === '--yes') args.yes = true
    else throw new Error(`未知参数: ${argv[i]}`)
  }
  if (!args.db) throw new Error('必须指定 --db <库名>')
  if (!args.yes) throw new Error('回滚必须携带 --yes（将按备份整行覆盖当前数据）')
  return args
}

async function connect(dbName) {
  const pg = await import('pg')
  const PoolClass = pg.Pool || pg.default?.Pool
  const pool = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: dbName,
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 3000
  })
  return pool
}

async function tableColumns(client, table) {
  const res = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table])
  return res.rows.map(r => r.column_name)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pool = await connect(args.db)
  const client = await pool.connect()

  try {
    // 定位备份表
    let backupTable = args.backupTable
    if (!backupTable) {
      const res = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'quarantine_backup_%'
        ORDER BY table_name DESC LIMIT 1
      `)
      if (res.rows.length === 0) throw new Error('未找到任何 quarantine_backup_* 备份表')
      backupTable = res.rows[0].table_name
    } else {
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1
      `, [backupTable])
      if (exists.rows.length === 0) throw new Error(`备份表 ${backupTable} 不存在`)
    }

    const backupRows = (await client.query(
      `SELECT table_name, row_pk, row_json, row_sha256, category FROM ${backupTable} ORDER BY id`
    )).rows
    console.log(`===== 回滚（单事务）=====`)
    console.log(`目标库: ${args.db}  备份表: ${backupTable}  待还原: ${backupRows.length} 行`)

    await client.query('BEGIN')
    try {
      const byTable = new Map()
      for (const row of backupRows) {
        if (!byTable.has(row.table_name)) byTable.set(row.table_name, [])
        byTable.get(row.table_name).push(row)
      }

      let restored = 0
      const restoredCounts = {}
      for (const [table, rows] of byTable) {
        const cols = await tableColumns(client, table)
        const setClause = cols.filter(c => c !== 'id').map(c => `${c} = r.${c}`).join(', ')

        for (const row of rows) {
          const res = await client.query(
            `UPDATE ${table} t SET ${setClause}
             FROM jsonb_populate_record(null::${table}, $1::jsonb) r
             WHERE t.id = r.id
             RETURNING encode(sha256(convert_to(row_to_json(t.*)::text, 'utf8')), 'hex') AS sha`,
            [JSON.stringify(row.row_json)]
          )
          if (res.rows.length === 0) {
            throw new Error(`${table} 主键 ${row.row_pk}（备份类别 ${row.category}）在库中不存在，无法还原——中止回滚`)
          }
          if (res.rows[0].sha !== row.row_sha256) {
            throw new Error(`${table}#${row.row_pk} 还原后哈希与备份不一致（${res.rows[0].sha} ≠ ${row.row_sha256}）——中止回滚`)
          }
          restored++
        }
        restoredCounts[table] = rows.length
      }

      await client.query('COMMIT')
      console.log(`✔ 回滚完成: ${restored} 行整行还原并逐行哈希校验通过`)
      console.log(`  按表: ${JSON.stringify(restoredCounts)}`)
      console.log(`  备份表 ${backupTable} 保留（如需再次回滚可重复使用；确认无误后可手动 DROP）`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error(`\n✖ ${err.message}`)
  process.exit(1)
})
