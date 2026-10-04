// M1-8 · 0006..0009 迁移隔离库三条路径演练（任务书红线：生产库不得用于测试）
//   路径 A 空库安装：全新 *_test 库 → 全部 9 个迁移 → 内容表就位、旧表空壳入归档 schema
//   路径 B 旧库升级：仅应用 0001–0005 并种入旧业务数据 → runMigrations 增量应用 0006–0009
//          → 旧表整表归档、evidences 按行拆分、来源标退役、数据零丢失
//   路径 C 回滚：执行 migrations-rollback/0007 回滚脚本 → 恢复 0006 之前状态且数据完整
//          → runMigrations 可重新前进（回滚不破坏可重放性）。
//          注：0009（avg_rank 精度放宽）不随回滚撤销——列类型放宽向后兼容，
//          回退 NUMERIC(4,2) 反而会把已存 4 位小数舍入（有损），故台账保留 0009。
// 全程仅触碰 *_test 库（pg-test.mjs 强制后缀校验）。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { runMigrations, listMigrationFiles } from '../../src/migrate.mjs'
import { isLocalPgAvailable, recreateNamedTestDb, connectNamedTestDb } from '../helpers/pg-test.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, '../../src/migrations')
const ROLLBACK_0007 = path.join(__dirname, '../../src/migrations-rollback/0007_rollback_v6_archive_legacy.sql')

const pgAvailable = await isLocalPgAvailable().catch(() => false)

const CONTENT_TABLES = [
  'game_versions', 'catalog_entities', 'catalog_entity_revisions',
  'mechanics', 'mechanic_revisions',
  'lineups', 'lineup_revisions', 'lineup_components', 'lineup_snapshot_links',
  'lessons', 'lesson_revisions', 'lesson_dependencies',
  'scenarios', 'content_references', 'content_review_log',
  'patch_notes', 'content_impacts'
]
const LEGACY_TABLES = [
  'players', 'player_identities', 'player_nicknames',
  'events', 'event_participants', 'matches', 'import_batches'
]

async function tablesIn(pool, schema) {
  const res = await pool.query(
    'SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [schema])
  return res.rows.map(r => r.tablename)
}

async function countRows(pool, schema, table, where = '', params = []) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${schema}.${table} ${where}`, params)
  return res.rows[0].n
}

/** 复刻 migrate.mjs 执行器，但只应用到指定编号为止（构造 0005 旧库状态） */
async function applyMigrationsUpTo(client, lastNumber) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(256) PRIMARY KEY,
      sha256 VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  const applied = new Set(
    (await client.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename))
  for (const file of listMigrationFiles()) {
    if (file.split('_')[0] > lastNumber) break
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    const sha = crypto.createHash('sha256').update(sql).digest('hex')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)', [file, sha])
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  }
}

/** 在 0005 状态的旧库中种入代表性旧业务数据（含新旧两种证据行） */
async function seedLegacyBusinessData(pool) {
  const now = '2026-10-01T12:00:00Z'
  const blob = (text) => {
    const content = Buffer.from(text, 'utf-8')
    return { sha: crypto.createHash('sha256').update(content).digest('hex'), content }
  }
  const b1 = blob('legacy personal screenshot bytes')
  const b2 = blob('legacy six-seat sheet bytes')
  const b3 = blob('legacy hashless material bytes')
  const b4 = blob('new content asset bytes')

  for (const [b, mime] of [[b1, 'image/png'], [b2, 'image/png'], [b3, 'image/png'], [b4, 'image/png']]) {
    await pool.query(
      `INSERT INTO evidence_blobs (sha256, content, mime_type, size_bytes, storage_uri)
       VALUES ($1, $2, $3, $4, $5)`,
      [b.sha, b.content, mime, b.content.length, `pg:evidence_blobs:sha-${b.sha.slice(0, 16)}`])
  }

  // 3 条旧个人/赛事材料证据（kind 为空 / PERSONAL_SCREENSHOT / SIX_SEAT_SHEET）+ 1 条新内容素材
  await pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status, note, kind)
     VALUES
       ('ev-old-1', $1, 'src-manual-review', $5, 'VERIFIED', '旧个人截图', 'PERSONAL_SCREENSHOT'),
       ('ev-old-2', $2, 'src-manual-review', $5, 'PENDING',  '旧六席校对表', 'SIX_SEAT_SHEET'),
       ('ev-old-3', $3, 'src-manual-review', $5, 'VERIFIED', '旧无类型材料（历史行为空）', NULL),
       ('ev-new-1', $4, 'src-manual-review', $5, 'VERIFIED', 'v6 内容素材（保留）', 'CONTENT_ASSET')`,
    [b1.sha, b2.sha, b3.sha, b4.sha, now])

  await pool.query(
    `INSERT INTO players (id, nickname) VALUES ('p-1', '旧选手甲'), ('p-2', '旧选手乙')`)
  await pool.query(
    `INSERT INTO player_identities (player_id, source_id, external_player_id, verified_at)
     VALUES ('p-1', 'src-manual-review', 'ext-p-1', $1)`, [now])
  await pool.query(
    `INSERT INTO player_nicknames (player_id, nickname, source_id, observed_at)
     VALUES ('p-1', '旧选手甲曾用名', 'src-manual-review', $1)`, [now])
  await pool.query(
    `INSERT INTO events (id, scheduled_at, title, evidence_id) VALUES ('evt-1', $1, '旧赛事场次', 'ev-old-3')`, [now])
  await pool.query(
    `INSERT INTO event_participants (event_id, slot, player_id, nickname, final_rank)
     VALUES ('evt-1', 1, 'p-1', '旧选手甲', 1), ('evt-1', 2, 'p-2', '旧选手乙', 2)`)
  await pool.query(
    `INSERT INTO matches (id, player_id, match_time, available_at, final_rank, evidence_id, record_key, record_status)
     VALUES
       ('m-1', 'p-1', $1, $1, 1, 'ev-old-1', 'ev:ev-old-1:1', 'ACTIVE'),
       ('m-2', 'p-2', $1, $1, 2, NULL,        'ev:ev-old-1:2', 'ACTIVE')`, [now])
  await pool.query(
    `INSERT INTO import_batches (batch_id, total_records, inserted) VALUES ('ib-1', 2, 2)`)
  // 一条真实来源快照（迁移前后都应在 public.lineup_snapshots 存活）
  await pool.query(
    `INSERT INTO lineup_snapshots (id, source_id, lineup_name, sample_count, win_rate, top3_rate, avg_rank)
     VALUES ('ls-1', 'src-hokace-wiki', '演练阵容快照', 100, 0.5, 0.7, 3.1)`)
}

// ------------------------------------------------------------
// 路径 A · 空库安装
// ------------------------------------------------------------
test('M1-8 路径A: 空库全量安装 9 个迁移，内容表入 public、旧表空壳入 archive_legacy', { skip: !pgAvailable }, async () => {
  await recreateNamedTestDb('wanxiangqi_m1miga_test')
  const pool = await connectNamedTestDb('wanxiangqi_m1miga_test')
  try {
    const client = await pool.connect()
    let applied
    try {
      applied = await runMigrations(client, { logger: { log() {} } })
    } finally {
      client.release()
    }
    assert.equal(applied.applied.length, 9, '全新空库应依次应用 0001..0009')
    assert.deepEqual(applied.applied.slice(-4),
      ['0006_v6_content_models.sql', '0007_v6_archive_legacy.sql', '0008_v6_official_content_source.sql', '0009_v6_snapshot_avg_rank_precision.sql'])

    const publicTables = await tablesIn(pool, 'public')
    for (const t of CONTENT_TABLES) {
      assert.ok(publicTables.includes(t), `public 应包含内容表 ${t}`)
    }
    for (const t of LEGACY_TABLES) {
      assert.ok(!publicTables.includes(t), `public 不应再有旧业务表 ${t}`)
    }

    const archived = await tablesIn(pool, 'archive_legacy')
    for (const t of [...LEGACY_TABLES, 'evidences']) {
      assert.ok(archived.includes(t), `archive_legacy 应包含 ${t}（空库为空壳）`)
    }
    assert.equal(await countRows(pool, 'archive_legacy', 'evidences'), 0, '空库无旧证据行')

    // data_sources 种子保留 + 旧官方个人来源已标退役 + 0008 官网内容来源登记
    const src = await pool.query(
      `SELECT source_id, status FROM data_sources ORDER BY source_id`)
    assert.equal(src.rows.length, 6)
    const byId = Object.fromEntries(src.rows.map(r => [r.source_id, r.status]))
    assert.equal(byId['src-kohcamp-official'], 'RETIRED')
    assert.equal(byId['src-official-helper'], 'RETIRED')
    assert.equal(byId['src-datatft-platform'], 'UNCONFIGURED', 'datatft 保持隔离不退役')
    assert.equal(byId['src-hokace-wiki'], 'READY', 'hokace 阵容统计来源不变')
    assert.equal(byId['src-manual-review'], 'ACTIVE', '内容素材人工通道不变')
    assert.equal(byId['src-wxq-official'], 'UNCONFIGURED', '官网内容来源登记但未采集（M3-1）')

    // lineup_snapshots 补字段就位
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='lineup_snapshots'
         AND column_name IN ('mode','raw_metrics')`)
    assert.deepEqual(cols.rows.map(r => r.column_name).sort(), ['mode', 'raw_metrics'])

    // 幂等：重跑无新应用
    const client2 = await pool.connect()
    try {
      const rerun = await runMigrations(client2, { logger: { log() {} } })
      assert.deepEqual(rerun.applied, [])
    } finally {
      client2.release()
    }
  } finally {
    await pool.end()
  }
})

// ------------------------------------------------------------
// 路径 B · 旧库升级（0001–0005 + 旧业务数据 → 0006/0007）
// ------------------------------------------------------------
test('M1-8 路径B: 旧库升级——旧表整表归档、evidences 按行拆分、数据零丢失', { skip: !pgAvailable }, async () => {
  await recreateNamedTestDb('wanxiangqi_m1migb_test')
  const pool = await connectNamedTestDb('wanxiangqi_m1migb_test')
  try {
    const client = await pool.connect()
    try {
      await applyMigrationsUpTo(client, '0005')
      const before = (await client.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows
      assert.equal(before.length, 5, '预置旧库仅 0001..0005')
    } finally {
      client.release()
    }
    await seedLegacyBusinessData(pool)

    const client2 = await pool.connect()
    let applied
    try {
      applied = await runMigrations(client2, { logger: { log() {} } })
    } finally {
      client2.release()
    }
    assert.deepEqual(applied.applied,
      ['0006_v6_content_models.sql', '0007_v6_archive_legacy.sql', '0008_v6_official_content_source.sql', '0009_v6_snapshot_avg_rank_precision.sql'],
      '增量只应用 0006/0007/0008/0009')

    // 旧业务表整表移入归档 schema，行数保持
    assert.equal(await countRows(pool, 'archive_legacy', 'players'), 2)
    assert.equal(await countRows(pool, 'archive_legacy', 'player_identities'), 1)
    assert.equal(await countRows(pool, 'archive_legacy', 'player_nicknames'), 1)
    assert.equal(await countRows(pool, 'archive_legacy', 'events'), 1)
    assert.equal(await countRows(pool, 'archive_legacy', 'event_participants'), 2)
    assert.equal(await countRows(pool, 'archive_legacy', 'matches'), 2)
    assert.equal(await countRows(pool, 'archive_legacy', 'import_batches'), 1)

    // 关键：活动表删行不得抹掉归档对局/赛事的证据引用（FK 先摘除）
    const m1 = await pool.query(`SELECT evidence_id FROM archive_legacy.matches WHERE id='m-1'`)
    assert.equal(m1.rows[0].evidence_id, 'ev-old-1', '归档对局证据引用保持')
    const evt = await pool.query(`SELECT evidence_id FROM archive_legacy.events WHERE id='evt-1'`)
    assert.equal(evt.rows[0].evidence_id, 'ev-old-3', '归档赛事证据引用保持')

    // evidences 拆分：3 条旧材料行入归档，public 仅剩内容素材
    assert.equal(await countRows(pool, 'archive_legacy', 'evidences'), 3)
    assert.equal(await countRows(pool, 'public', 'evidences'), 1)
    const keep = await pool.query(`SELECT id, kind FROM public.evidences`)
    assert.deepEqual(keep.rows, [{ id: 'ev-new-1', kind: 'CONTENT_ASSET' }])

    // evidence_blobs 原件库整体保留（含归档行对应的孤儿 blob，供审计）
    assert.equal(await countRows(pool, 'public', 'evidence_blobs'), 4)

    // 真实快照存活且补字段可空
    const ls = await pool.query(
      `SELECT id, mode, raw_metrics FROM public.lineup_snapshots WHERE id='ls-1'`)
    assert.equal(ls.rows.length, 1)
    assert.equal(ls.rows[0].mode, null)
    assert.equal(ls.rows[0].raw_metrics, null)

    // 内容表空置待 M2（不因迁移伪造内容）
    assert.equal(await countRows(pool, 'public', 'game_versions'), 0)
    assert.equal(await countRows(pool, 'public', 'lineups'), 0)

    // 保留能力面不受影响：raw_materials / sync_jobs 结构仍在 public
    const publicTables = await tablesIn(pool, 'public')
    for (const t of ['data_sources', 'raw_materials', 'sync_jobs', 'evidences', 'evidence_blobs', 'lineup_snapshots', 'schema_migrations']) {
      assert.ok(publicTables.includes(t), `public 应保留 ${t}`)
    }
  } finally {
    await pool.end()
  }
})

// ------------------------------------------------------------
// 路径 C · 回滚（升级库执行回滚脚本 → 恢复 0005 状态 → 可重新前进）
// ------------------------------------------------------------
test('M1-8 路径C: 回滚脚本恢复 0005 状态且数据完整，迁移可重新前进', { skip: !pgAvailable }, async () => {
  await recreateNamedTestDb('wanxiangqi_m1migc_test')
  const pool = await connectNamedTestDb('wanxiangqi_m1migc_test')
  try {
    const client = await pool.connect()
    try {
      await applyMigrationsUpTo(client, '0005')
    } finally {
      client.release()
    }
    await seedLegacyBusinessData(pool)
    const client2 = await pool.connect()
    try {
      await runMigrations(client2, { logger: { log() {} } })
    } finally {
      client2.release()
    }

    // 执行回滚（整文件单事务）
    const rollbackSql = fs.readFileSync(ROLLBACK_0007, 'utf-8')
    const client3 = await pool.connect()
    try {
      await client3.query(rollbackSql)
    } finally {
      client3.release()
    }

    // 旧业务表回到 public 且数据完整
    const publicTables = await tablesIn(pool, 'public')
    for (const t of LEGACY_TABLES) {
      assert.ok(publicTables.includes(t), `回滚后 ${t} 应回到 public`)
    }
    for (const t of CONTENT_TABLES) {
      assert.ok(!publicTables.includes(t), `回滚后内容表 ${t} 应删除`)
    }
    const schemas = (await pool.query(
      `SELECT nspname FROM pg_namespace WHERE nspname='archive_legacy'`)).rows
    assert.equal(schemas.length, 0, '归档 schema 应移除')

    assert.equal(await countRows(pool, 'public', 'players'), 2)
    assert.equal(await countRows(pool, 'public', 'matches'), 2)
    assert.equal(await countRows(pool, 'public', 'evidences'), 4, '旧证据行应还原')

    const m1 = await pool.query(`SELECT evidence_id FROM public.matches WHERE id='m-1'`)
    assert.equal(m1.rows[0].evidence_id, 'ev-old-1', '回滚后证据引用仍在')
    const fk = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname='matches_evidence_id_fkey' AND conrelid='public.matches'::regclass`)
    assert.equal(fk.rows.length, 1, '外键应重建')

    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='lineup_snapshots' AND column_name IN ('mode','raw_metrics')`)
    assert.equal(cols.rows.length, 0, '补字段应移除')

    // data_sources 状态与说明还原
    const src = await pool.query(
      `SELECT source_id, status, note FROM data_sources WHERE source_id IN
        ('src-kohcamp-official','src-official-helper','src-datatft-platform','src-wxq-official') ORDER BY source_id`)
    const byId = Object.fromEntries(src.rows.map(r => [r.source_id, r]))
    assert.equal(byId['src-kohcamp-official'].status, 'UNCONFIGURED')
    assert.equal(byId['src-official-helper'].status, 'UNAVAILABLE')
    assert.equal(byId['src-datatft-platform'].status, 'UNCONFIGURED')
    assert.equal(src.rows.length, 3, '回滚后 src-wxq-official 登记行应随 0008 撤销移除')
    assert.equal(byId['src-wxq-official'], undefined)
    for (const r of src.rows) {
      assert.ok(!r.note.includes('[v6 2026-10-03]'), 'v6 标记说明应移除')
    }

    // 迁移台账回到 0005 + 0009（精度放宽不回滚，理由见文件头注），且可无冲突重新前进
    let client4 = await pool.connect()
    try {
      const rows = (await client4.query('SELECT filename FROM schema_migrations ORDER BY filename')).rows
      assert.equal(rows.length, 6, '0001..0005 + 0009（0009 列类型放宽向后兼容，不随 0007 回滚撤销）')
      const rerun = await runMigrations(client4, { logger: { log() {} } })
      assert.deepEqual(rerun.applied,
        ['0006_v6_content_models.sql', '0007_v6_archive_legacy.sql', '0008_v6_official_content_source.sql'],
        '回滚后可重新应用（0009 已在台账，跳过）')
    } finally {
      client4.release()
    }

    // 重新前进后归档语义再次成立（含证据引用保护）
    const m1b = await pool.query(`SELECT evidence_id FROM archive_legacy.matches WHERE id='m-1'`)
    assert.equal(m1b.rows[0].evidence_id, 'ev-old-1')
    assert.equal(await countRows(pool, 'public', 'evidences'), 1)
    assert.equal(await countRows(pool, 'archive_legacy', 'evidences'), 3)
  } finally {
    await pool.end()
  }
})
