// v6 M3-2..M3-5 · 内容构建脚本（可复跑：隔离开发库先演练，业务库 M5-1 授权后同脚本重放）
//
// 用法：
//   node tools/content-build/build-v6-content.mjs [--db wanxiangqi_v6dev] [--recreate] [--skip-sync]
//   --recreate             删除并重建目标库（业务库 wanxiangqi 永远拒绝）
//   --skip-sync            不触发官网抓取（库内无存证则构建失败，如实报错）
//   --business-db-authorized + env WXQ_AUTHORIZE_BUSINESS_DB=1
//                          仅这两个条件同时满足才允许指向业务库 wanxiangqi（M5-1 授权用）
//
// 铁律：
// 1. 幂等：已发布的根/修订跳过，不重复创建；引用按存在性去重。
// 2. 机械化来源核查：全部 statementRaw（及官网棋手/装备等 RAW 事实）在去标签、
//    折叠空白后必须能在 raw_materials 存证原文中命中子串——任一失配立即构建失败，
//    不静默放行。
// 3. 图片事实（三分登场流教学图）以 OFFICIAL_PAGE 引用原图 URL + sha256 指纹，
//    facts 内标注「AI 辅助转写，以图原件为准」；冲突处理记录写入构建证据。
// 4. 内容只经 ContentService 生命周期创建/发布（validatePublish 门槛全部走一遍），
//    不绕过服务直写业务表。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../../src/migrate.mjs'
import { PgRepository } from '../../src/repositories/pg-repository.mjs'
import { createServices } from '../../src/services/index.mjs'
import { OFFICIAL_CONTENT_TARGETS } from '../../src/adapters/official-site.mjs'
import { MECHANICS } from './corpus-mechanics.mjs'
import { ALL_ENTITIES, IMAGE_REFS } from './corpus-entities.mjs'
import { LINEUP } from './corpus-lineup.mjs'
import { LESSONS, SCENARIOS } from './corpus-lessons.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS_DIR = path.resolve(__dirname, '../../../docs/v6_artifacts')
const OPERATOR = 'content-build/v6'

const BUSINESS_DB = 'wanxiangqi'

// 引用登记用的类型标签（与 ContentRepository.CONTENT_TYPES 的 label 一致）
const CONTENT_TYPE_LABELS = {
  'catalog-entities': 'CATALOG_ENTITY',
  mechanics: 'MECHANIC',
  lineups: 'LINEUP',
  lessons: 'LESSON',
  scenarios: 'SCENARIO'
}

// ---------------- CLI ----------------
const argv = process.argv.slice(2)
const arg = name => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : null
}
const hasFlag = name => argv.includes(`--${name}`)

const DB_NAME = arg('db') || 'wanxiangqi_v6dev'
const RECREATE = hasFlag('recreate')
const SKIP_SYNC = hasFlag('skip-sync')
const BUSINESS_AUTHORIZED =
  hasFlag('business-db-authorized') && process.env.WXQ_AUTHORIZE_BUSINESS_DB === '1'

if (DB_NAME === BUSINESS_DB) {
  if (!BUSINESS_AUTHORIZED) {
    console.error(
      `[build] 拒绝指向业务库 ${BUSINESS_DB}：M5-1 要求显式授权。\n` +
      '如已获授权，请同时提供 --business-db-authorized 与环境变量 WXQ_AUTHORIZE_BUSINESS_DB=1，\n' +
      '并确认已按任务书完成备份与回滚方案审查。'
    )
    process.exit(2)
  }
  if (RECREATE) {
    console.error('[build] 业务库禁止 --recreate（生产数据库不得用于测试或重建）')
    process.exit(2)
  }
}

// ---------------- 官图指纹（2026-10-03 本地下载计算，人工可按 URL 复算） ----------------
const IMAGE_SHA256 = {
  [IMAGE_REFS.IMG_1]: '908537ba910b57eec5f6dfe80ae9e552b7d391e2c289271f4e03d4aa41969c65',
  [IMAGE_REFS.IMG_2]: '00700089ed71073179119787c68a66b78d87aba77e536aa47b99e823c2f09fdc'
}

// ---------------- 引导：建库 + 迁移 + 服务 ----------------
async function loadPoolClass() {
  const pg = await import('pg')
  return pg.Pool || pg.default?.Pool
}

async function bootstrap() {
  const PoolClass = await loadPoolClass()
  const basePool = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: 'postgres',
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 5000
  })
  try {
    const exists = (await basePool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME])).rows.length > 0
    if (RECREATE && exists) {
      if (DB_NAME === BUSINESS_DB) throw new Error('unreachable') // 前面已拦截
      await basePool.query(`DROP DATABASE ${JSON.stringify(DB_NAME)}`)
      console.log(`[build] 已删除旧库 ${DB_NAME}（--recreate）`)
    }
    if (!exists || RECREATE) {
      await basePool.query(`CREATE DATABASE ${JSON.stringify(DB_NAME)}`)
      console.log(`[build] 已创建库 ${DB_NAME}`)
    }
  } finally {
    await basePool.end().catch(() => {})
  }

  const pool = new PoolClass({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT) || 5432,
    database: DB_NAME,
    user: process.env.PGUSER || process.env.USER || 'lhw',
    connectionTimeoutMillis: 5000
  })
  const client = await pool.connect()
  try {
    const { applied, skipped } = await runMigrations(client, { logger: { log() {} } })
    if (applied.length) console.log(`[build] 已应用迁移 ${applied.length} 个（跳过 ${skipped}）`)
  } finally {
    client.release()
  }
  const repo = new PgRepository(pool)
  return { pool, repo, services: createServices(repo, { appMode: 'formal' }) }
}

// ---------------- 存证解析与核查 ----------------

/** 每个目标取最新一条存证（append-only 证据日志，构建时解析最新快照） */
async function resolveMaterials(pool) {
  const res = await pool.query(`
    SELECT DISTINCT ON (record_key) id, record_key, content, content_sha256, fetched_at
    FROM raw_materials WHERE source_id = 'src-wxq-official'
    ORDER BY record_key, fetched_at DESC, id DESC`)
  return new Map(res.rows.map(r => [r.record_key, r]))
}

function normalizeText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, '')
}

/** 官网资讯 JSONP（var searchObj={...}）→ { title, publishedAt, bodyText } */
function parseNewsJsonp(content) {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(content.slice(start, end + 1))
    const msg = obj?.msg || {}
    const publishedAt = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(msg.sCreated || ''))
      ? msg.sCreated.replace(' ', 'T') + '+08:00'
      : null
    const bodyText = normalizeText(msg.sContent || '') // 去标签/折叠空白，正文逐字
    return { title: msg.sTitle || null, publishedAt, bodyText }
  } catch {
    return null
  }
}

/** 机械化来源核查：statement 必须能在存证原文（去标签/折叠空白）中命中 */
function verifyStatements(corpus, normalizedSource, label) {
  const failures = []
  for (const stmt of corpus) {
    if (!normalizedSource.includes(normalizeText(stmt))) {
      failures.push({ label, statement: stmt })
    }
  }
  return failures
}

// ---------------- 幂等写入助手 ----------------
async function publishedRevisionId(pool, revTable, revFk, rootId) {
  const res = await pool.query(
    `SELECT id FROM ${revTable} WHERE ${revFk} = $1 AND review_status = 'PUBLISHED' AND superseded_at IS NULL LIMIT 1`,
    [rootId])
  return res.rows[0]?.id ?? null
}

async function ensureRoot(services, pool, typeName, payload) {
  const existing = await services.content.getContent(typeName, payload.id)
  if (existing) return { root: existing, created: false }
  const root = await services.content.createContent(typeName, payload, OPERATOR)
  return { root, created: true }
}

async function ensureReference(services, pool, { contentType, contentId, refKind, refLocator, usageScope = 'INTERNAL_ONLY', licenseNote = null }) {
  const res = await pool.query(
    `SELECT 1 FROM content_references
     WHERE content_type = $1 AND content_id = $2 AND revision_id IS NULL
       AND ref_kind = $3 AND ref_locator = $4 LIMIT 1`,
    [contentType, contentId, refKind, refLocator])
  if (res.rows.length) return { added: false }
  await services.content.addReference(
    { contentType, contentId, revisionId: null, refKind, refLocator, usageScope, licenseNote }, OPERATOR)
  return { added: true }
}

/** 建修订 → 登引用 → 走发布门槛；已有当前发布修订则跳过（幂等） */
async function publishOnce(services, pool, typeName, rootId, revTable, revFk, payload, references) {
  const existing = await publishedRevisionId(pool, revTable, revFk, rootId)
  if (existing) return { revisionId: existing, published: false, skipped: true }
  const rev = await services.content.createRevision(typeName, rootId, payload, OPERATOR)
  const typeLabel = CONTENT_TYPE_LABELS[typeName]
  for (const ref of references) {
    await ensureReference(services, pool, { contentType: typeLabel, contentId: rootId, ...ref })
  }
  const published = await services.content.publishRevision(typeName, rev.id, { operator: OPERATOR, reason: 'M3 内容构建（来源核查通过后发布）' })
  return { revisionId: published.id, published: true, skipped: false }
}

// ---------------- 主流程 ----------------
async function main() {
  const startedAt = new Date().toISOString()
  const { pool, repo, services } = await bootstrap()
  const report = {
    testedAt: startedAt, db: DB_NAME, operator: OPERATOR,
    materials: [], verification: { checked: 0, failures: [] },
    version: null, patchNote: null,
    created: { mechanics: 0, entities: 0, lineups: 0, lessons: 0, scenarios: 0 },
    skipped: { mechanics: 0, entities: 0, lineups: 0, lessons: 0, scenarios: 0 },
    referencesAdded: 0, conflictLog: [], publicRead: null, errors: []
  }

  try {
    // 1) 存证就位（缺则真实抓取；--skip-sync 时如实失败）
    let materials = await resolveMaterials(pool)
    const missing = OFFICIAL_CONTENT_TARGETS.filter(t => !materials.has(t.recordKey))
    if (missing.length && SKIP_SYNC) {
      throw new Error(`库内缺少官网存证 [${missing.map(t => t.recordKey).join(', ')}] 且指定 --skip-sync`)
    }
    if (missing.length) {
      console.log(`[build] 库内缺 ${missing.length} 个目标存证，触发官网真实抓取…`)
      const syncRes = await services.sync.syncSource('src-wxq-official')
      if (!syncRes.ok) throw new Error(`官网抓取失败：${syncRes.message}`)
      materials = await resolveMaterials(pool)
    }
    const allPresent = OFFICIAL_CONTENT_TARGETS.every(t => materials.has(t.recordKey))
    if (!allPresent) throw new Error('官网存证仍不完整，构建终止')
    for (const t of OFFICIAL_CONTENT_TARGETS) {
      const m = materials.get(t.recordKey)
      report.materials.push({ recordKey: t.recordKey, rawMaterialId: String(m.id), sha256: m.content_sha256, fetchedAt: m.fetched_at })
    }
    const guide = materials.get('official:newbie-guide')
    const news = materials.get('official:news:18873181')
    const guideNorm = normalizeText(guide.content)

    // 2) 版本登记与激活（v1.1.14：官网资讯标题明示）
    const newsJson = parseNewsJsonp(news.content)
    const newsTitle = newsJson?.title || null
    if (!newsTitle || !newsTitle.includes('v1.1.14')) {
      throw new Error(`官网资讯标题未确认 v1.1.14（解析到：${JSON.stringify(newsTitle)}）`)
    }
    // 公告正文核对：更新时段以正文为准（正文 6:00-8:00；接口 sDesc 预览与之不一致，弃用预览）
    if (!newsJson.bodyText || !newsJson.bodyText.includes('9月21日6:00-8:00')) {
      throw new Error('官网资讯正文未确认「9月21日6:00-8:00」更新时段（正文结构变化，人工复核）')
    }
    const VERSION_ID = 'v1.1.14'
    await services.content.createVersion({
      versionId: VERSION_ID,
      officialBasis: `官网资讯《${newsTitle}》（apps.game.qq.com 资讯接口 id=18873181，发布时间 ${newsJson.publishedAt || '未解析'}，原文已存证 official:news:18873181；正文载明更新时段 9月21日6:00-8:00 不停机更新）；官网新手指引页（official:newbie-guide，页面标题含「万象启航入门指南」）为本批教学内容的第一方依据`,
      effectiveAt: '2026-09-21T06:00:00+08:00',
      note: 'S1 赛季官网新手指引配套版本（官网页「入门阵容教学」）'
    }, OPERATOR)
    const current = await services.content.listVersions()
    const isCurrent = current.some(v => v.versionId === VERSION_ID && v.status === 'CURRENT')
    if (!isCurrent) {
      const act = await services.content.activateVersion(VERSION_ID, { operator: OPERATOR, note: 'M3 内容构建：激活当前版本基准' })
      report.version = { versionId: VERSION_ID, previousVersionId: act.previousVersionId, markedCount: act.markedCount }
    } else {
      report.version = { versionId: VERSION_ID, alreadyCurrent: true }
    }

    // 3) 版本动态（公告）
    const pnId = 'pn-20260921-v1114'
    const pnExists = (await pool.query(`SELECT 1 FROM patch_notes WHERE id = $1`, [pnId])).rows.length > 0
    if (!pnExists) {
      const newsUrl = OFFICIAL_CONTENT_TARGETS.find(t => t.recordKey === 'official:news:18873181').url
      await services.content.createPatchNote({
        id: pnId, versionId: VERSION_ID, slug: 'v1-1-4-20260921',
        title: newsTitle, officialUrl: newsUrl,
        officialPublishedAt: newsJson.publishedAt,
        fetchedAt: news.fetched_at,
        summary: `官方公告正文（节选，逐字）：${newsJson.bodyText.slice(0, 200)}…… 全文以存证为准（raw_materials：official:news:18873181，sha256 可独立复算）。要点：9月21日6:00-8:00 全服不停机更新至 v1.1.14；王牌对决下调冠军钻石分红比例（1%→0.3%），并筹备第2、3名参与分红。`
      }, OPERATOR)
      await services.content.publishPatchNote(pnId, OPERATOR)
      report.patchNote = { id: pnId, created: true }
    } else {
      report.patchNote = { id: pnId, created: false }
    }
    await ensureReference(services, pool, {
      contentType: 'PATCH_NOTE', contentId: pnId, refKind: 'RAW_MATERIAL',
      refLocator: String(news.id), usageScope: 'PUBLIC',
      licenseNote: '官网资讯接口原文存证（JSONP 整包）'
    })

    // 4) 机械化来源核查（构建失败式：任何失配都不进入写入）
    const failures = []
    failures.push(...verifyStatements(MECHANICS.map(m => m.statementRaw), guideNorm, 'mechanics'))
    const rawEntityFacts = []
    for (const e of ALL_ENTITIES.filter(e => e.source === 'RAW')) {
      if (e.facts.tagline) rawEntityFacts.push(e.facts.tagline)
      if (e.facts.skill?.text) rawEntityFacts.push(e.facts.skill.text)
      for (const s of e.facts.secretProgression || []) rawEntityFacts.push(s.text)
    }
    failures.push(...verifyStatements(rawEntityFacts, guideNorm, 'entities(RAW)'))
    failures.push(...verifyStatements(['三分登场流', '吕布', '安琪拉', '敖隐', '百里玄策', '蒙犽'], guideNorm, 'lineup-announcement'))
    report.verification.checked = MECHANICS.length + rawEntityFacts.length + 6
    if (failures.length) {
      report.verification.failures = failures
      throw new Error(`来源核查失败 ${failures.length} 条（详见构建证据）：\n` +
        failures.map(f => `  [${f.label}] ${f.statement.slice(0, 60)}…`).join('\n'))
    }
    console.log(`[build] 来源核查通过：${report.verification.checked} 条陈述全部命中存证原文`)

    // 5) 规则条目（36）
    for (const m of MECHANICS) {
      const { root } = await ensureRoot(services, pool, 'mechanics', { id: m.id, slug: m.slug, title: m.title })
      const r = await publishOnce(services, pool, 'mechanics', root.id,
        'mechanic_revisions', 'mechanic_id',
        { gameVersionId: VERSION_ID, statementRaw: m.statementRaw, params: m.params, appliesTo: m.appliesTo },
        [{ refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '官网新手指引原文存证（statementRaw 未改写）' }])
      r.skipped ? report.skipped.mechanics++ : report.created.mechanics++
    }

    // 6) 资料实体（26）
    for (const e of ALL_ENTITIES) {
      const { root } = await ensureRoot(services, pool, 'catalog-entities',
        { id: e.id, slug: e.slug, kind: e.kind, displayName: e.displayName })
      const refs = e.source === 'RAW'
        ? [{ refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '官网新手指引「棋手推荐/入门阵容」原文存证' }]
        : [{ refKind: 'OFFICIAL_PAGE', refLocator: IMAGE_REFS.IMG_2, usageScope: 'PUBLIC', licenseNote: `官方教学图（图文详解）sha256=${IMAGE_SHA256[IMAGE_REFS.IMG_2]}；事实为 AI 辅助转写，以图原件为准` }]
      const r = await publishOnce(services, pool, 'catalog-entities', root.id,
        'catalog_entity_revisions', 'entity_id',
        { gameVersionId: VERSION_ID, facts: e.facts }, refs)
      r.skipped ? report.skipped.entities++ : report.created.entities++
    }

    // 7) 阵容手册（三分登场流，§5.1–5.6 全字段）
    {
      const { root } = await ensureRoot(services, pool, 'lineups', {
        id: LINEUP.id, slug: LINEUP.slug, displayName: LINEUP.displayName, oneLineSummary: LINEUP.oneLineSummary
      })
      const existingPub = await publishedRevisionId(pool, 'lineup_revisions', 'lineup_id', root.id)
      if (!existingPub) {
        const rev = await services.content.createRevision('lineups', root.id, {
          gameVersionId: VERSION_ID,
          commanderEntityId: LINEUP.commanderEntityId,
          difficulty: LINEUP.difficulty,
          newbieFitRationale: LINEUP.newbieFitRationale,
          playConditions: LINEUP.sections.playConditions,
          structureLevels: LINEUP.sections.structureLevels,
          stages: LINEUP.sections.stages,
          stabilization: LINEUP.sections.stabilization,
          skillChains: LINEUP.sections.skillChains,
          positioning: LINEUP.sections.positioning,
          substitutes: LINEUP.sections.substitutes,
          practiceCases: LINEUP.sections.practiceCases,
          components: LINEUP.components.map(c => ({
            entityId: c.entityId, role: c.role, necessity: c.necessity, notes: c.notes
          }))
        }, OPERATOR)
        // 替补关系显式化：构成行已落库（自引用 FK 不允许删了重插——序列会换 id），
        // 按实体定向 UPDATE 把 substitute_for 指向本修订内的真实行
        for (const c of LINEUP.components) {
          const targets = c.notes?.substituteFor || []
          if (!targets.length) continue
          const upd = await pool.query(`
            UPDATE lineup_components sub
            SET substitute_for = tgt.id
            FROM lineup_components tgt
            WHERE sub.lineup_revision_id = $1 AND sub.entity_id = $2
              AND tgt.lineup_revision_id = $1 AND tgt.entity_id = $3`,
            [rev.id, c.entityId, targets[0]])
          if (upd.rowCount === 0) {
            throw new Error(`替补关系建立失败：${c.entityId} → ${targets[0]}`)
          }
        }
        for (const ref of [
          { refKind: 'OFFICIAL_PAGE', refLocator: IMAGE_REFS.IMG_1, usageScope: 'PUBLIC', licenseNote: `官方教学图（一图速览）sha256=${IMAGE_SHA256[IMAGE_REFS.IMG_1]}；事实为 AI 辅助转写，以图原件为准` },
          { refKind: 'OFFICIAL_PAGE', refLocator: IMAGE_REFS.IMG_2, usageScope: 'PUBLIC', licenseNote: `官方教学图（图文详解）sha256=${IMAGE_SHA256[IMAGE_REFS.IMG_2]}；事实为 AI 辅助转写，以图原件为准` },
          { refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '官网新手指引「入门阵容」明示阵容名与核心英雄' }
        ]) {
          const r = await ensureReference(services, pool, { contentType: 'LINEUP', contentId: root.id, ...ref })
          if (r.added) report.referencesAdded++
        }
        await services.content.publishRevision('lineups', rev.id, { operator: OPERATOR, reason: 'M3-3 第一套阵容手册（官方教学图+官网存证）' })
        report.created.lineups++
      } else {
        report.skipped.lineups++
      }
    }

    // 8) 课程 A–F（含先修依赖）
    for (const l of LESSONS) {
      const { root } = await ensureRoot(services, pool, 'lessons', {
        id: l.id, slug: l.slug, title: l.title, stage: l.stage, sortOrder: l.sortOrder
      })
      const refs = [{ refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '课程引用的规则事实以官网新手指引存证为准' }]
      if (l.slug === 'e-first-lineup') {
        refs.push({ refKind: 'OFFICIAL_PAGE', refLocator: IMAGE_REFS.IMG_2, usageScope: 'PUBLIC', licenseNote: `三分登场流阶段教学（官方图文详解）sha256=${IMAGE_SHA256[IMAGE_REFS.IMG_2]}` })
      }
      const r = await publishOnce(services, pool, 'lessons', root.id,
        'lesson_revisions', 'lesson_id',
        { gameVersionId: VERSION_ID, objectives: l.objectives, sections: l.sections, practice: l.practice },
        refs)
      if (l.deps.length) await services.content.setDependencies(root.id, l.deps, OPERATOR)
      r.skipped ? report.skipped.lessons++ : report.created.lessons++
    }

    // 9) 教学情境（3）
    for (const s of SCENARIOS) {
      const existing = await services.content.getContent('scenarios', s.id)
      if (!existing) {
        await services.content.createContent('scenarios', {
          id: s.id, slug: s.slug, title: s.title, kind: s.kind,
          initialState: s.initialState, branches: s.branches, feedback: s.feedback,
          sourceNote: s.sourceNote, lineupId: s.lineupId, lessonId: s.lessonId
        }, OPERATOR)
      }
      const root = await services.content.getContent('scenarios', s.id)
      if (root.status !== 'PUBLISHED') {
        const isAuction = s.slug === 'auction-bid-or-pass'
        await ensureReference(services, pool, isAuction
          ? {
              contentType: 'SCENARIO', contentId: s.id, refKind: 'RAW_MATERIAL',
              refLocator: String(guide.id), usageScope: 'PUBLIC',
              licenseNote: '竞拍规则四条以官网新手指引存证为唯一依据'
            }
          : {
              contentType: 'SCENARIO', contentId: s.id, refKind: 'OFFICIAL_PAGE',
              refLocator: IMAGE_REFS.IMG_2, usageScope: 'PUBLIC',
              licenseNote: `情境分支依据官方教学图（sha256=${IMAGE_SHA256[IMAGE_REFS.IMG_2]}）与官网规则存证`
            })
        await services.content.publishScenario(s.id, { operator: OPERATOR, reason: 'M3-4 教学情境（官方出处登记）' })
        report.created.scenarios++
      } else {
        report.skipped.scenarios++
      }
    }

    // 10) 冲突处理记录（任务书：冲突处理记录）
    report.conflictLog = [
      {
        topic: '三分登场流 站位（图内无文字标注）',
        readings: [
          '第一轮独立提取（guide_1_2.jpg）：曾读出「第二排 赵云/貂蝉/周瑜…」等行列归属',
          '第一轮独立提取（guide_1_3.jpg）：曾读出「前排 周瑜/吕布/曹操…」的相反归属'
        ],
        resolution: '定向复核确认：两图站位均以棋盘头像呈现、无任何文字行列标注；先前两种读数均为对头像位置的推断而非图内原文。处理：站位事实收敛为「官方图示布局（3后排/3中排/1前排）+ 文字角色标注（吕布核心C位/曹操核心坦克/蔡文姬核心功能）」；逐格到人的坐标登记为未核实，以官方图原件为准。',
        affectedContent: ['lu-sanfen-dengchang 定位章节 positioning.unverified', '本构建证据']
      },
      {
        topic: '天赋「挂帅上阵」效果转写',
        readings: [
          '两轮提取在「等级等同最近1名三分英雄」的表述细节上略有差异'
        ],
        resolution: '按最优读数录入并标注「两轮提取略有差异，以官方图原件为准」；实体 facts.verificationNote 同步登记。',
        affectedContent: ['tal-guashuishangzhen']
      }
    ]

    // 11) 公开读取复核（发布后真实可读，不以写入成功宣称可见）
    const mechanicsPub = await services.content.getMechanics()
    const lineupsPub = await services.content.getLineupsList()
    const learnPub = await services.content.getLearnPath()
    const catalogPub = await services.content.getCatalog({})
    const scenarioCount = (await pool.query(
      `SELECT count(*)::int AS n FROM scenarios WHERE status = 'PUBLISHED'`)).rows[0].n
    report.publicRead = {
      mechanics: mechanicsPub.length,
      lineups: lineupsPub.length,
      lessons: learnPub.total,
      entities: catalogPub.length,
      scenariosPublished: scenarioCount,
      entitiesByKind: catalogPub.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc }, {})
    }
    const expect = {
      mechanics: MECHANICS.length, lineups: 1, lessons: LESSONS.length,
      entities: ALL_ENTITIES.length, scenariosPublished: SCENARIOS.length
    }
    for (const [k, v] of Object.entries(expect)) {
      if (report.publicRead[k] !== v) {
        throw new Error(`公开读取数量不符：${k} 期望 ${v} 实际 ${report.publicRead[k]}`)
      }
    }
    console.log('[build] 公开读取复核通过：', JSON.stringify(report.publicRead))

    // 12) 证据落盘
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
    const file = path.join(ARTIFACTS_DIR,
      `m3-content-build-${startedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
    fs.writeFileSync(file, JSON.stringify(report, null, 2))
    console.log(`[build] 完成。证据：${file}`)
    process.exitCode = 0
  } catch (err) {
    report.errors.push(String(err?.message || err))
    console.error(`[build] 失败：${err?.message || err}`)
    try {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
      const file = path.join(ARTIFACTS_DIR,
        `m3-content-build-FAILED-${startedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
      fs.writeFileSync(file, JSON.stringify(report, null, 2))
      console.error(`[build] 失败证据：${file}`)
    } catch { /* 落盘失败不掩盖原始错误 */ }
    process.exitCode = 1
  } finally {
    await pool.end().catch(() => {})
  }
}

main()
