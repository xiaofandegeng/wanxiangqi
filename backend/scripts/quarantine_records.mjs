// v3 P0-B · 合成/测试记录可回滚隔离工具
// 任务书依据：docs/真实数据与统计链路整改任务书_v3_2026-09-29.md §P0-B / §6-2
//
// 用法：
//   node scripts/quarantine_records.mjs --dry-run [--db wanxiangqi_test]
//   node scripts/quarantine_records.mjs --execute --db wanxiangqi --yes     # 业务库执行（已获用户授权）
//   node scripts/rollback_quarantine.mjs --db <db> --backup-table <t> --yes # 回滚
//
// 铁律：
//   1. 默认 dry-run，只读不写；--execute 必须同时携带 --db 与 --yes
//   2. 执行 = 单事务：先建 quarantine_backup_<ts> 全行备份(含行级 sha256)再打标，全成或全败
//   3. 不物理删除任何行（QUARANTINED 打标隔离；events/evidences 用状态列隔离）
//   4. 无证据记录只转 PENDING 待核验，不认定为虚假（任务书 P0-B）
//   5. 前置依赖：目标库已应用 0002_v3 迁移（matches.record_status/synthetic 列）

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '../..')
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'docs', 'v3_artifacts')

const BUSINESS_TABLES = ['players', 'matches', 'events', 'event_participants', 'lineup_snapshots', 'evidences', 'import_batches']

// ---- 隔离/修正类别（唯一事实源，dry-run 与 execute 共用）----
const CRITERIA = {
  quarantineSeed: {
    table: 'matches',
    where: `batch_id = 'batch-datatft-s1-seed'`,
    action: 'record_status=QUARANTINED, synthetic=TRUE',
    reason: 'F01/F02: generate_real_dataset.mjs 按赛事排名剧本生成的合成战绩，无真实材料支撑'
  },
  quarantineCamp: {
    table: 'matches',
    where: `batch_id = 'batch-camp-official-full'`,
    action: 'record_status=QUARANTINED, synthetic=TRUE',
    reason: 'F03: sync_camp_official_matches.mjs 零网络请求生成却声称官方同步的伪官方战绩'
  },
  quarantineTestAudits: {
    table: 'matches',
    where: `batch_id LIKE 'audit-evt-%'`,
    action: 'record_status=QUARANTINED, synthetic=TRUE',
    reason: 'P0-B: 演示/测试存证经人工核验台写入的测试审核记录，非真实核验材料'
  },
  quarantineTestEvents: {
    table: 'events',
    where: `EXISTS (SELECT 1 FROM matches m WHERE m.batch_id = 'audit-' || events.id)`,
    action: 'status=QUARANTINED',
    reason: 'P0-B: 测试审核记录关联的对决场次（连带隔离，随 matches 一并可回滚）'
  },
  quarantineTestEvidences: {
    table: 'evidences',
    where: `id IN (SELECT evidence_id FROM matches WHERE batch_id LIKE 'audit-evt-%' AND evidence_id IS NOT NULL)
            OR id IN (SELECT e.evidence_id FROM events e
                      WHERE e.evidence_id IS NOT NULL
                        AND EXISTS (SELECT 1 FROM matches m WHERE m.batch_id = 'audit-' || e.id))`,
    action: 'status=QUARANTINED',
    reason: 'P0-B: 测试审核存证材料（连带隔离，含被隔离对决场次自身的证据）'
  },
  pendingNoEvidence: {
    table: 'matches',
    where: `verified = TRUE AND evidence_id IS NULL AND record_status = 'ACTIVE' AND synthetic = FALSE
            AND batch_id IS DISTINCT FROM 'batch-datatft-s1-seed'
            AND batch_id IS DISTINCT FROM 'batch-camp-official-full'
            AND (batch_id IS NULL OR batch_id NOT LIKE 'audit-evt-%')`,
    action: 'verified=FALSE, record_status=PENDING',
    reason: 'P0-B: 无证据核验记录转待核验（不认定为虚假，待补证据链后由核验动作放行）'
  },
  nullFabricatedPlayerRank: {
    table: 'players',
    where: `rank_score IS NOT NULL OR rank_text IS NOT NULL`,
    action: 'rank_score=NULL, rank_text=NULL',
    reason: 'F06: 现存天梯分/段位全部来自 datatft 赛事积分推导或默认值填充（10000/最强王者），非真实天梯数据'
  },
  nullFabricatedLineupMeta: {
    table: 'lineup_snapshots',
    where: `source_id = 'src-datatft-platform' AND (tier IS NOT NULL OR window_text IS NOT NULL OR scope IS NOT NULL OR snapshot_version IS NOT NULL)`,
    action: 'tier=NULL, window_text=NULL, scope=NULL, snapshot_version=NULL',
    reason: 'F09/P2-B: 现存 datatft 快照的 tier(按列表序号赋 T0/T1/T2)与“全服近 7 日实战大数据”等窗口文案为适配器编造，来源未公布 → 清 NULL（winRate/sampleCount 等真实公布字段保留）'
  },
  nullLineupAvgRankFallback: {
    table: 'lineup_snapshots',
    where: `avg_rank = 3.5`,
    action: 'avg_rank=NULL',
    reason: 'F09: 适配器 avgRank 缺失时 3.5 兜底填充值（无法区分真实 3.5，按兜底值处理）'
  }
}

const QUARANTINE_MATCH_CATEGORIES = ['quarantineSeed', 'quarantineCamp', 'quarantineTestAudits']

function parseArgs(argv) {
  const args = { mode: 'dry-run', db: null, yes: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.mode = 'dry-run'
    else if (argv[i] === '--execute') args.mode = 'execute'
    else if (argv[i] === '--db') args.db = argv[++i]
    else if (argv[i] === '--yes') args.yes = true
    else throw new Error(`未知参数: ${argv[i]}`)
  }
  if (!args.db) throw new Error('必须指定 --db <库名>（业务库 wanxiangqi / 测试库 wanxiangqi_test）')
  if (args.mode === 'execute' && !args.yes) throw new Error('--execute 必须伴随 --yes（防误操作；请先审阅 dry-run 清单）')
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

async function assertMigrated(client) {
  const res = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name IN ('record_status', 'synthetic', 'quarantine_reason')
  `)
  if (res.rows.length < 3) {
    throw new Error('目标库缺少 0002_v3 迁移列 (matches.record_status/synthetic)。请先运行: npm run migrate -- --db <库名>')
  }
}

async function tableCounts(client) {
  const counts = {}
  for (const t of BUSINESS_TABLES) {
    counts[t] = (await client.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n
  }
  return counts
}

/** 有效统计（正式口径：verified ∧ ACTIVE ∧ 非 synthetic）*/
async function effectiveStats(client, extraExclusions = null) {
  const excl = extraExclusions
    ? ` AND NOT (${extraExclusions})`
    : ''
  const res = await client.query(`
    SELECT m.player_id,
           count(*)::int AS n,
           sum(CASE WHEN m.final_rank = 1 THEN 1 ELSE 0 END)::int AS first_places,
           sum(CASE WHEN m.final_rank <= 3 THEN 1 ELSE 0 END)::int AS top3_places,
           round(avg(m.final_rank)::numeric, 2) AS avg_rank
    FROM matches m
    WHERE m.verified = TRUE AND m.record_status = 'ACTIVE' AND m.synthetic = FALSE${excl}
    GROUP BY m.player_id
    ORDER BY n DESC, m.player_id
  `)
  return res.rows
}

async function categoryRows(client, category) {
  const c = CRITERIA[category]
  const res = await client.query(`SELECT * FROM ${c.table} WHERE ${c.where} ORDER BY 1`)
  return res.rows
}

function statsMap(rows) {
  const map = {}
  for (const r of rows) {
    map[r.player_id] = {
      n: r.n,
      firstPlaces: r.first_places,
      top3Places: r.top3_places,
      avgRank: r.avg_rank !== null ? Number(r.avg_rank) : null,
      winRate: r.n > 0 ? Number((r.first_places / r.n).toFixed(4)) : null,
      top3Rate: r.n > 0 ? Number((r.top3_places / r.n).toFixed(4)) : null
    }
  }
  return map
}

async function buildManifest(client, dbName) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    database: dbName,
    tool: 'backend/scripts/quarantine_records.mjs',
    taskBookRef: 'docs/真实数据与统计链路整改任务书_v3_2026-09-29.md §P0-B',
    baselineTableCounts: await tableCounts(client),
    categories: {},
    playerStatsBefore: null,
    playerStatsAfterSimulated: null,
    expectedEffectiveMatchesAfter: 0
  }

  for (const [key, c] of Object.entries(CRITERIA)) {
    const rows = await categoryRows(client, key)
    manifest.categories[key] = {
      table: c.table,
      criterion: c.where,
      action: c.action,
      reason: c.reason,
      rowCount: rows.length,
      primaryKeys: rows.map(r => r.id)
    }
  }

  const before = await effectiveStats(client)
  manifest.playerStatsBefore = statsMap(before)

  // 模拟执行后：排除将被隔离/转待核验的记录
  // COALESCE(..., FALSE)：三值逻辑防护 —— batch_id 为 NULL 的行上等值/IN 谓词求值为 NULL，
  // 直接 NOT(NULL OR ...) 会把无关行一并吞掉（真实事故：预测有效对局 0 ≠ 实际）
  const exclusions = [
    ...QUARANTINE_MATCH_CATEGORIES.map(k => CRITERIA[k].where),
    CRITERIA.pendingNoEvidence.where
  ].map(w => `COALESCE((${w}), FALSE)`).join(' OR ')
  const after = await effectiveStats(client, exclusions)
  manifest.playerStatsAfterSimulated = statsMap(after)
  manifest.expectedEffectiveMatchesAfter = after.reduce((acc, r) => acc + r.n, 0)
  manifest.expectedEffectiveMatchesBefore = before.reduce((acc, r) => acc + r.n, 0)

  return manifest
}

function writeArtifact(filename, data) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const file = path.join(ARTIFACTS_DIR, filename)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  return file
}

async function backupCategory(client, backupTable, category, rows) {
  const c = CRITERIA[category]
  for (const row of rows) {
    // row_pk 存文本；WHERE 用独立参数避免 $n 同时推导 varchar 与各表 id 类型冲突
    await client.query(
      `INSERT INTO ${backupTable} (table_name, row_pk, row_json, row_sha256, category, reason)
       SELECT $1, $2::text, row_to_json(t.*)::jsonb,
              encode(sha256(convert_to(row_to_json(t.*)::text, 'utf8')), 'hex'),
              $3, $4
       FROM ${c.table} t WHERE t.id = $5`,
      [c.table, String(row.id), category, c.reason, row.id]
    )
  }
}

async function execute(args) {
  const pool = await connect(args.db)
  const client = await pool.connect()
  const ts = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14) // YYYYMMDDHHMMSS
  const backupTable = `quarantine_backup_${ts}`

  try {
    await assertMigrated(client)
    const manifest = await buildManifest(client, args.db)

    console.log('===== 隔离执行（单事务）=====')
    console.log(`目标库: ${args.db}  备份表: ${backupTable}`)
    for (const [k, v] of Object.entries(manifest.categories)) {
      console.log(`  ${k}: ${v.rowCount} 行  → ${v.action}`)
    }

    await client.query('BEGIN')
    try {
      await client.query(`
        CREATE TABLE ${backupTable} (
          id BIGSERIAL PRIMARY KEY,
          table_name VARCHAR(64) NOT NULL,
          row_pk VARCHAR(128) NOT NULL,
          row_json JSONB NOT NULL,
          row_sha256 VARCHAR(64) NOT NULL,
          category VARCHAR(64) NOT NULL,
          reason TEXT NOT NULL,
          backed_up_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // 0. 事务内统一快照各类别受影响行（备份与断言共用同一集合，保证备份覆盖 = 修改覆盖）
      const snapshots = {}
      for (const key of Object.keys(CRITERIA)) {
        snapshots[key] = await categoryRows(client, key)
      }

      // 1. 全行备份（按快照）
      for (const key of Object.keys(CRITERIA)) {
        if (snapshots[key].length > 0) await backupCategory(client, backupTable, key, snapshots[key])
      }
      const backupCount = (await client.query(`SELECT count(*)::int AS n FROM ${backupTable}`)).rows[0].n

      // 各类别 UPDATE 影响行数必须与快照一致，任何漂移即回滚（防止类别间状态联动扩面）
      const assertCount = (key, rowCount) => {
        if (rowCount !== snapshots[key].length) {
          throw new Error(`类别 ${key} 实际影响 ${rowCount} 行 ≠ 快照 ${snapshots[key].length} 行（类别间状态联动扩面），已回滚`)
        }
      }

      // 2. matches 隔离打标（合成/测试）
      for (const key of QUARANTINE_MATCH_CATEGORIES) {
        const c = CRITERIA[key]
        const res = await client.query(
          `UPDATE matches SET record_status = 'QUARANTINED', synthetic = TRUE,
                  quarantine_reason = $1, operator = 'v3-quarantine', updated_at = CURRENT_TIMESTAMP
           WHERE ${c.where}`,
          [c.reason]
        )
        assertCount(key, res.rowCount)
        console.log(`  [QUARANTINED] ${key}: ${res.rowCount} 行`)
      }

      // 3. 无证据记录转待核验
      {
        const c = CRITERIA.pendingNoEvidence
        const res = await client.query(
          `UPDATE matches SET verified = FALSE, record_status = 'PENDING',
                  quarantine_reason = $1, operator = 'v3-quarantine', updated_at = CURRENT_TIMESTAMP
           WHERE ${c.where}`,
          [c.reason]
        )
        assertCount('pendingNoEvidence', res.rowCount)
        console.log(`  [→PENDING]   pendingNoEvidence: ${res.rowCount} 行`)
      }

      // 4. 测试对决场次与存证连带隔离
      {
        const res = await client.query(
          `UPDATE events SET status = 'QUARANTINED' WHERE ${CRITERIA.quarantineTestEvents.where}`
        )
        assertCount('quarantineTestEvents', res.rowCount)
        console.log(`  [QUARANTINED] quarantineTestEvents: ${res.rowCount} 行`)
      }
      {
        const res = await client.query(
          `UPDATE evidences SET status = 'QUARANTINED' WHERE ${CRITERIA.quarantineTestEvidences.where}`
        )
        assertCount('quarantineTestEvidences', res.rowCount)
        console.log(`  [QUARANTINED] quarantineTestEvidences: ${res.rowCount} 行`)
      }

      // 5. F06/F09 造默认值清 NULL
      {
        const res = await client.query(
          `UPDATE players SET rank_score = NULL, rank_text = NULL WHERE ${CRITERIA.nullFabricatedPlayerRank.where}`
        )
        assertCount('nullFabricatedPlayerRank', res.rowCount)
        console.log(`  [→NULL]      nullFabricatedPlayerRank: ${res.rowCount} 行`)
      }
      {
        const res = await client.query(
          `UPDATE lineup_snapshots SET avg_rank = NULL WHERE ${CRITERIA.nullLineupAvgRankFallback.where}`
        )
        assertCount('nullLineupAvgRankFallback', res.rowCount)
        console.log(`  [→NULL]      nullLineupAvgRankFallback: ${res.rowCount} 行`)
      }
      {
        const res = await client.query(
          `UPDATE lineup_snapshots SET tier = NULL, window_text = NULL, scope = NULL, snapshot_version = NULL
           WHERE ${CRITERIA.nullFabricatedLineupMeta.where}`
        )
        assertCount('nullFabricatedLineupMeta', res.rowCount)
        console.log(`  [→NULL]      nullFabricatedLineupMeta: ${res.rowCount} 行`)
      }

      // 6. 事务内复核：有效统计必须与 dry-run 模拟一致
      const after = await effectiveStats(client)
      const afterTotal = after.reduce((acc, r) => acc + r.n, 0)
      if (afterTotal !== manifest.expectedEffectiveMatchesAfter) {
        throw new Error(`事务内复核失败: 有效对局 ${afterTotal} ≠ dry-run 预期 ${manifest.expectedEffectiveMatchesAfter}，已回滚`)
      }

      await client.query('COMMIT')
      console.log(`✔ 事务提交完成。备份 ${backupCount} 行 → ${backupTable}`)

      // 7. 提交后复核报告
      const report = {
        executedAt: new Date().toISOString(),
        database: args.db,
        backupTable,
        backupRowCount: backupCount,
        tableCountsAfter: await tableCounts(client),
        effectiveStatsAfter: statsMap(after),
        effectiveMatchesAfter: afterTotal
      }
      const file = writeArtifact(`quarantine-execute-${args.db}-${ts}.json`, report)
      console.log(`执行报告: ${file}`)
      console.log(`有效对局(verified∧ACTIVE∧非synthetic): ${manifest.expectedEffectiveMatchesBefore} → ${afterTotal}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  } finally {
    client.release()
    await pool.end()
  }
}

async function dryRun(args) {
  const pool = await connect(args.db)
  const client = await pool.connect()
  try {
    await assertMigrated(client)
    const manifest = await buildManifest(client, args.db)
    const ts = manifest.generatedAt.replace(/[^\d]/g, '').slice(0, 14)
    const file = writeArtifact(`quarantine-dryrun-${args.db}-${ts}.json`, manifest)

    console.log('===== 隔离 DRY-RUN 清单（只读，未做任何修改）=====')
    console.log(`目标库: ${args.db}`)
    console.log(`基线七表计数: ${JSON.stringify(manifest.baselineTableCounts)}`)
    for (const [k, v] of Object.entries(manifest.categories)) {
      console.log(`  ${k}: ${v.rowCount} 行 (${v.table})  原因: ${v.reason}`)
    }
    console.log(`有效对局(verified∧ACTIVE∧非synthetic): ${manifest.expectedEffectiveMatchesBefore} → ${manifest.expectedEffectiveMatchesAfter} (模拟)`)
    console.log(`清单已写入: ${file}`)
  } finally {
    client.release()
    await pool.end()
  }
}

const args = parseArgs(process.argv.slice(2))
;(args.mode === 'execute' ? execute(args) : dryRun(args)).catch(err => {
  console.error(`\n✖ ${err.message}`)
  process.exit(1)
})
