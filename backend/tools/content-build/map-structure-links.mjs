// v6 M5-1 · 阵容手册 ↔ 来源快照结构映射工具（判据机械化重放）
//
// 用法：node tools/content-build/map-structure-links.mjs [--db wanxiangqi_v6dev]
//          [--business-db-authorized]（指向业务库另需 env WXQ_AUTHORIZE_BUSINESS_DB=1；
//          --recreate 对业务库永远拒绝——本工具不提供 --recreate）
// 前置：目标库已完成迁移且 build-v6-content.mjs 已发布手册（手册行存在）；
//       hokace 同步已落 ACTIVE 快照（无快照则如实失败，不猜）。
//
// 判据（与 M4-4 人工映射同一条，本工具机械化执行）：
//   手册 REQUIRED 组件英雄名 ⊆ 结构 core_heroes
//   ∧ 结构 core_heroes ⊆ 手册全部组件英雄池
//   ∧ 该判据在该来源全部 ACTIVE 快照中唯一命中
//   → 唯一命中才建立映射；零命中/多命中/与语料声明不一致均失败退出（不猜）。
// 语料声明：corpus-lineup.mjs 每套手册的 snapshotLink { sourceId, structureKey }
//   为期望映射；本工具验证判据命中恰为该结构后才落链。
// 幂等：已存在相同 (lineup_id, source_id, structure_key) 的链接跳过，不重复建链。
// 铁律：全部经 services.content.linkSnapshot（服务内含审查日志落账），不直写业务表。
// 产物：docs/v6_artifacts/m5-1-snapshot-links-<ts>.json（含每套手册的判据明细，
//       未声明映射的手册如实列为「语料未声明映射」——不自动为其找结构）。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../../src/migrate.mjs'
import { PgRepository } from '../../src/repositories/pg-repository.mjs'
import { createServices } from '../../src/services/index.mjs'
import { PUBLISHABLE_LINEUPS } from './corpus-lineup.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_DIR = path.resolve(__dirname, '../../../docs/v6_artifacts')
const OPERATOR = 'map-structure-links/v6-m5-1'
const BUSINESS_DB = 'wanxiangqi'

// ---------------- CLI ----------------
const argv = process.argv.slice(2)
const arg = name => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : null
}
const hasFlag = name => argv.includes(`--${name}`)

const DB_NAME = arg('db') || 'wanxiangqi_v6dev'
const BUSINESS_AUTHORIZED =
  hasFlag('business-db-authorized') && process.env.WXQ_AUTHORIZE_BUSINESS_DB === '1'

if (DB_NAME === BUSINESS_DB && !BUSINESS_AUTHORIZED) {
  console.error(
    `[map] 拒绝指向业务库 ${BUSINESS_DB}：M5-1 要求显式授权。\n` +
    '如已获授权，请同时提供 --business-db-authorized 与环境变量 WXQ_AUTHORIZE_BUSINESS_DB=1。'
  )
  process.exit(2)
}

async function main() {
  const startedAt = new Date().toISOString()
  const pg = await import('pg')
  const PoolClass = pg.Pool || pg.default?.Pool
  const pool = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: DB_NAME,
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 5000
  })
  const client = await pool.connect()
  try {
    const { applied } = await runMigrations(client, { logger: { log() {} } })
    if (applied.length) console.log(`[map] 已应用迁移 ${applied.length} 个（幂等重放）`)
  } finally {
    client.release()
  }
  const repo = new PgRepository(pool)
  const services = createServices(repo, { appMode: 'formal' })

  const report = {
    testedAt: startedAt, db: DB_NAME, operator: OPERATOR,
    criterion: '手册 REQUIRED 组件英雄名 ⊆ 结构 core_heroes ∧ 结构 core_heroes ⊆ 手册全部组件英雄池，且在来源全部 ACTIVE 快照中唯一命中（与 M4-4 人工映射同一条判据，机械化重放）',
    results: [], notDeclared: [], errors: []
  }

  try {
    // 来源快照一次取全：source_id → [{ structure_key, lineup_name, core_heroes[] }]
    const snaps = (await pool.query(`
      SELECT source_id, structure_key, lineup_name,
             ARRAY(SELECT jsonb_array_elements_text(core_heroes)) AS hero_names
      FROM lineup_snapshots
      WHERE record_status = 'ACTIVE' AND core_heroes IS NOT NULL
      ORDER BY structure_key`)).rows
    const snapsBySource = new Map()
    for (const s of snaps) {
      if (!snapsBySource.has(s.source_id)) snapsBySource.set(s.source_id, [])
      snapsBySource.get(s.source_id).push(s)
    }

    for (const lu of PUBLISHABLE_LINEUPS) {
      if (!lu.snapshotLink) {
        report.notDeclared.push({
          lineupId: lu.id, displayName: lu.displayName,
          note: '语料未声明映射（M4-4 判据零命中：来源无唯一匹配结构）——如实不挂统计，页面呈现「暂无统计」'
        })
        continue
      }
      const { sourceId, structureKey } = lu.snapshotLink

      // 1) 手册行存在且已发布
      const root = await services.content.getContent('lineups', lu.id)
      if (!root) throw new Error(`阵容 ${lu.id} 不存在（先运行 build-v6-content.mjs）`)
      if (root.status !== 'PUBLISHED') throw new Error(`阵容 ${lu.id} 未发布（status=${root.status}）`)

      // 2) 已发布修订的组件 → 英雄名集合（REQUIRED 与全量池）
      const comps = (await pool.query(`
        SELECT e.display_name, c.necessity
        FROM lineup_components c
        JOIN lineup_revisions r ON r.id = c.lineup_revision_id
        JOIN catalog_entities e ON e.id = c.entity_id
        WHERE r.lineup_id = $1 AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
        ORDER BY c.id`, [lu.id])).rows
      if (!comps.length) throw new Error(`阵容 ${lu.id} 已发布修订无组件（数据异常）`)
      const poolNames = comps.map(c => c.display_name)
      const requiredNames = comps.filter(c => c.necessity === 'REQUIRED').map(c => c.display_name)

      // 3) 判据机械化执行：零命中/多命中都拒绝
      const sourceSnaps = snapsBySource.get(sourceId) || []
      if (!sourceSnaps.length) {
        throw new Error(`来源 ${sourceId} 无 ACTIVE 快照（先执行同步——M5-1 上线流程「同步及映射」阶段）`)
      }
      const hits = sourceSnaps.filter(s =>
        requiredNames.every(n => s.hero_names.includes(n)) &&
        s.hero_names.every(n => poolNames.includes(n)))
      if (hits.length !== 1) {
        throw new Error(
          `阵容 ${lu.id} 判据命中 ${hits.length} 个结构（应恰 1）——拒绝映射，不猜：` +
          hits.map(h => `${h.structure_key}(${h.lineup_name})`).join('、') || '零命中')
      }
      if (hits[0].structure_key !== structureKey) {
        throw new Error(
          `阵容 ${lu.id} 判据唯一命中 ${hits[0].structure_key}（${hits[0].lineup_name}）` +
          `≠ 语料声明 ${structureKey}——声明与判据不一致，需人工修订语料后重放`)
      }

      // 4) 幂等落链（经服务，含审查日志）
      const existing = (await pool.query(`
        SELECT id FROM lineup_snapshot_links
        WHERE lineup_id = $1 AND source_id = $2 AND structure_key = $3`,
        [lu.id, sourceId, structureKey])).rows
      const note =
        `机械化映射（M5-1 工具重放，判据与 M4-4 人工映射一致）：` +
        `手册必需核心(${requiredNames.length}名)⊆结构英雄 ∧ 结构英雄(${hits[0].hero_names.length}名)⊆手册英雄池(${poolNames.length}名)，` +
        `在来源 ${sourceSnaps.length} 个 ACTIVE 快照中唯一命中；结构 ${hits[0].lineup_name}`
      let linkId = existing[0]?.id || null
      let action = 'skipped-exists'
      if (!existing.length) {
        const linked = await services.content.linkSnapshot(
          { lineupId: lu.id, sourceId, structureKey, note }, OPERATOR)
        linkId = linked.id
        action = 'linked'
      }
      report.results.push({
        lineupId: lu.id, displayName: lu.displayName, action, linkId,
        sourceId, structureKey, structureName: hits[0].lineup_name,
        requiredNames, poolNames, structureHeroes: hits[0].hero_names,
        activeSnapshotsChecked: sourceSnaps.length, uniqueHit: true
      })
      console.log(`[map] ${lu.displayName} → ${structureKey}（${hits[0].lineup_name}）：${action}；判据唯一命中（${sourceSnaps.length} 快照内）`)
    }

    // 5) 终态核对：链接总数 = 语料声明数；无孤儿链接（库里有、语料没声明的）
    const declared = PUBLISHABLE_LINEUPS.filter(l => l.snapshotLink)
    const dbLinks = (await pool.query(`
      SELECT lineup_id, source_id, structure_key FROM lineup_snapshot_links`)).rows
    const declaredKeys = new Set(declared.map(l => `${l.id}|${l.snapshotLink.sourceId}|${l.snapshotLink.structureKey}`))
    const orphans = dbLinks.filter(l => !declaredKeys.has(`${l.lineup_id}|${l.source_id}|${l.structure_key}`))
    if (dbLinks.length !== declared.length) {
      throw new Error(`库内链接 ${dbLinks.length} 条 ≠ 语料声明 ${declared.length} 条（含未声明链接 ${orphans.length}）——需人工核对`)
    }
    report.finalState = { declared: declared.length, dbLinks: dbLinks.length, orphans: [] }

    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
    const file = path.join(ARTIFACTS_DIR,
      `m5-1-snapshot-links-${startedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
    fs.writeFileSync(file, JSON.stringify(report, null, 2))
    console.log(`[map] 完成：${report.results.length} 条映射（含跳过 ${report.results.filter(r => r.action === 'skipped-exists').length}）、未声明 ${report.notDeclared.length} 套。证据：${file}`)
    process.exitCode = 0
  } catch (err) {
    report.errors.push(String(err?.message || err))
    console.error(`[map] 失败：${err?.message || err}`)
    try {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
      const file = path.join(ARTIFACTS_DIR,
        `m5-1-snapshot-links-FAILED-${startedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
      fs.writeFileSync(file, JSON.stringify(report, null, 2))
    } catch { /* 落盘失败不掩盖原始错误 */ }
    process.exitCode = 1
  } finally {
    await pool.end().catch(() => {})
  }
}

main()
