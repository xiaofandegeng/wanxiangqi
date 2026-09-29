// v3 迁移执行器 (任务书 P1-A：迁移有版本记录、与启动逻辑分离)
// 用法：
//   node src/migrate.mjs [--db <库名>] [--list]
//   npm run migrate [-- --db wanxiangqi_test]
// 规则：
//   - 按 filename 顺序应用 backend/src/migrations/*.sql，每个迁移独立事务
//   - schema_migrations 记录 filename + sha256 + applied_at
//   - 已应用的迁移跳过；已应用但磁盘 sha256 变化 → 拒绝执行（防篡改）
//   - 幂等：重复运行无副作用

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

function parseArgs(argv) {
  const args = { db: process.env.PGDATABASE || 'wanxiangqi', list: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--db') args.db = argv[++i]
    else if (argv[i] === '--list') args.list = true
    else throw new Error(`未知参数: ${argv[i]}`)
  }
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

async function listMigrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = await listMigrationFiles()
  if (files.length === 0) {
    console.error(`[migrate] ${MIGRATIONS_DIR} 中没有迁移文件`)
    process.exit(1)
  }

  const pool = await connect(args.db)
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(256) PRIMARY KEY,
        sha256 VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const applied = new Map(
      (await client.query('SELECT filename, sha256 FROM schema_migrations ORDER BY filename')).rows
        .map(r => [r.filename, r.sha256])
    )

    if (args.list) {
      console.log(`已应用 ${applied.size} 个迁移 (库: ${args.db}):`)
      for (const [f, sha] of applied) console.log(`  ✔ ${f}  (${sha.slice(0, 12)}…)`)
      console.log('磁盘迁移文件:', files.join(', '))
      return
    }

    let pending = 0
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
      const sha = crypto.createHash('sha256').update(sql).digest('hex')

      if (applied.has(file)) {
        if (applied.get(file) !== sha) {
          throw new Error(`迁移 ${file} 已应用但内容发生变更（记录 ${applied.get(file)} vs 磁盘 ${sha}）；已应用迁移不可修改，请新增编号迁移`)
        }
        console.log(`[migrate] = ${file} (已应用，跳过)`)
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)', [file, sha])
        await client.query('COMMIT')
        console.log(`[migrate] + ${file} 已应用 (${sha.slice(0, 12)}…)`)
        pending++
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`迁移 ${file} 失败(已回滚): ${err.message}`)
      }
    }
    console.log(`[migrate] 完成: 新应用 ${pending} 个, 共 ${files.length} 个迁移 (库: ${args.db})`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error(`[migrate] ✖ ${err.message}`)
  process.exit(1)
})
