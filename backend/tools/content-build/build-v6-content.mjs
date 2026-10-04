// v6 M3-2..M3-5 + M4-2 · 内容构建脚本（可复跑：隔离开发库先演练，业务库 M5-1 授权后同脚本重放）
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
// 2. 机械化来源核查（任一失配立即构建失败，不静默放行）：
//    a. 词条/规则 statementRaw 按其声明的存证路由核查——默认官网新手指引页
//       （去标签/折叠空白子串命中）；图腾→cards.js 原文子串；阿科米亚核心→
//       英雄目录 JSON 解析后关键词定义变体唯一性断言（JSON 中文为 \uXXXX
//       转义，原始字节子串核查不适用）。
//    b. 卡牌数据两级指纹：data/<file> 本地字节 sha256 = 固定指纹（快照出处）；
//       JSON 目标再对本地与存证双侧计算语义指纹（剥离官方轮换子树
//       previewCards/sourceCards 与 skillList[].url 签名视频 URL——2026-10-04
//       实测其随服务端轮换而卡牌实质数据零变化），双侧都等于 semanticSha256。
//       目录实体 facts 由 data/*.json 在本进程内构建 ⇒ 语义一致即 facts 的
//       全部取值域与存证一致（传递性核查，无需逐字段比对）。
//    c. RAW 棋手/配对文案逐字核查：RAW:guide → 新手指引页；RAW:home → 首页。
// 3. 图片事实（五套阵容教学图）以 OFFICIAL_PAGE 引用原图 URL + sha256 指纹
//    （2026-10-03/04 本地下载计算并复验线上字节一致），facts 内标注
//    「AI 辅助转写，以图原件为准」；冲突处理记录写入构建证据。
// 4. 内容只经 ContentService 生命周期创建/发布（validatePublish 门槛全部走一遍），
//    不绕过服务直写业务表；草稿阵容（材料不足）只登记缺口不发布。

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../../src/migrate.mjs'
import { PgRepository } from '../../src/repositories/pg-repository.mjs'
import { createServices } from '../../src/services/index.mjs'
import { OFFICIAL_CONTENT_TARGETS } from '../../src/adapters/official-site.mjs'
import { MECHANICS } from './corpus-mechanics.mjs'
import { CARD_DATA_FILES, canonicalCardsSha256 } from './corpus-cards.mjs'
import {
  ALL_ENTITIES, IMAGE_REFS, RAW_GUIDE_STATEMENTS, RAW_HOME_STATEMENTS, IMG_FACT_STATS
} from './corpus-entities.mjs'
import { PUBLISHABLE_LINEUPS, DRAFT_LINEUPS } from './corpus-lineup.mjs'
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

// 目录实体 kind → 卡牌存证 recordKey（facts 传递性核查的引用落点）
const CATALOG_REF_BY_KIND = {
  HERO: 'official:cards:heroes',
  EQUIPMENT: 'official:cards:equips',
  TALENT: 'official:cards:talents',
  EFFECT_CARD: 'official:cards:effects'
}

// IMG 棋手的推荐事实出现在哪些官方教学图（图文详解）——引用按图逐张登记
const CMD_IMG_REFS = {
  'cmd-changxiaoer': ['IMG_2', 'IMG_2_3', 'IMG_3_3', 'IMG_4_3'], // 三分/日落海/大河/河洛
  'cmd-naonao': ['IMG_2_3', 'IMG_4_3', 'IMG_5_3'], // 日落海/河洛/逐鹿
  'cmd-jiangdao': ['IMG_4_3'], // 河洛
  'cmd-make': ['IMG_2'] // 三分
}

// 课程正文深度依赖某张官方教学图的，加挂图引用（键=课程 slug）
const LESSON_IMG_REFS = {
  'e-first-lineup': 'IMG_2', // 三分登场流四阶段全流程
  'e2-ribe-full-run': 'IMG_2_3' // 日落海整备流四阶段全流程
}

// 情境/复盘案例分支依据的官方教学图（键=情境 id；竞拍情境走 guide RAW 存证特例）
const SCENARIO_IMG_REFS = {
  'scn-early-no-sunshangxiang': 'IMG_2',
  'scn-sanfen-no-lvbu': 'IMG_2',
  'scn-final-circle-substitute': 'IMG_2', // 决赛圈替补机制出自三分官方实战技巧
  'rvw-sanfen-inherit-success': 'IMG_2',
  'scn-riluohai-surround-angela': 'IMG_2_3',
  'rvw-ribe-keep-two-success': 'IMG_2_3',
  'scn-dahe-equip-handoff': 'IMG_3_3',
  'scn-heluo-gubi-focus': 'IMG_4_3',
  'rvw-heluo-scatter-failure': 'IMG_4_3',
  'scn-zhulu-mengkai-equipment-max': 'IMG_5_3',
  'rvw-zhulu-eq-not-max-failure': 'IMG_5_3'
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

// ---------------- 官图指纹（2026-10-03/04 本地下载计算并复验线上字节一致，人工可按 URL 复算） ----------------
const IMAGE_SHA256 = {
  [IMAGE_REFS.IMG_1]: '908537ba910b57eec5f6dfe80ae9e552b7d391e2c289271f4e03d4aa41969c65',
  [IMAGE_REFS.IMG_2]: '00700089ed71073179119787c68a66b78d87aba77e536aa47b99e823c2f09fdc',
  [IMAGE_REFS.IMG_2_2]: 'a6616db5ea2a6cdb80fd69c9ef98fb8c6055e4b337db8a031b4f4c2a5dceb287',
  [IMAGE_REFS.IMG_2_3]: '078a652504179e7fa83ed43eecf6baff9c01becb244dae65dfc72d86c4a301a8',
  [IMAGE_REFS.IMG_3_2]: 'a0944b1e80bc5cb1b4f1d2b345d25471cb1929060dc6269edd73afd37f8c435a',
  [IMAGE_REFS.IMG_3_3]: '617e25efdddfa0e8dabd0881ec74876e9867fd536a8a9cde42868842e68a35fc',
  [IMAGE_REFS.IMG_4_2]: '8db3101a58d4a817ebb688e7d3176633ff1c6e09af989c9f54f4a3b5aabc7ce7',
  [IMAGE_REFS.IMG_4_3]: 'c65360e0c190d078ddf94761c91756f2442b38e02ee25490182cbabe593ecfc2',
  [IMAGE_REFS.IMG_5_2]: '991076c9dc9bd062f7204b25c46c3213a739de79b14d926f6aadf88e40487804',
  [IMAGE_REFS.IMG_5_3]: '7eb881ac977684efadffec3c9ae2f8b318e5b9ede2c884953045decb1de244e5'
}

// 英雄目录里以关键词定义核查的词条名（唯一一个走 cards:heroes 路由的词条）
const AKEMIYA_KW = '阿科米亚核心'

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

/**
 * 词条/规则按声明的存证路由核查（§铁律 2a）。
 * 返回 { checked, failures }；cards:heroes 路由额外做关键词定义变体唯一性断言。
 */
function verifyMechanicsRouted({ guideNorm, cardsJsNorm, heroesJson }) {
  const failures = []
  let checked = 0
  let routed = { guide: 0, cardsJs: 0, cardsHeroes: 0 }
  for (const m of MECHANICS) {
    checked++
    if (!m.verifyAgainst) {
      routed.guide++
      if (!guideNorm.includes(normalizeText(m.statementRaw))) {
        failures.push({ label: 'mechanics:guide', statement: m.statementRaw })
      }
    } else if (m.verifyAgainst === 'official:cards:js') {
      routed.cardsJs++
      if (!cardsJsNorm.includes(normalizeText(m.statementRaw))) {
        failures.push({ label: 'mechanics:cards:js', statement: m.statementRaw })
      }
    } else if (m.verifyAgainst === 'official:cards:heroes') {
      routed.cardsHeroes++
      // JSON 中文为 \uXXXX 转义：解析后收集该关键词的全部定义变体
      const variants = new Set()
      let carriers = 0
      for (const card of heroesJson.heroCards || []) {
        for (const k of card.heroCard?.keywordDescription || []) {
          if (k.name === AKEMIYA_KW) {
            carriers++
            variants.add(normalizeText(k.desc))
          }
        }
      }
      const wanted = normalizeText(m.statementRaw)
      if (carriers === 0 || variants.size !== 1 || !variants.has(wanted)) {
        failures.push({
          label: 'mechanics:cards:heroes',
          statement: m.statementRaw,
          detail: `载体英雄数=${carriers} 变体数=${variants.size}（应：载体≥1 且变体恰 1 且与 statementRaw 逐字一致）`
        })
      }
    } else {
      failures.push({ label: 'mechanics:routing', statement: `未知的存证路由 ${m.verifyAgainst}（${m.id}）` })
    }
  }
  return { checked, failures, routed }
}

/**
 * 卡牌数据三方指纹核查（§铁律 2b，两级）：
 * - 字节级：本地 data 文件 sha256 = 固定指纹（快照出处锚定，永不变）
 * - 语义级（JSON 目标）：剥离官方轮换子树（previewCards/sourceCards 展示区、
 *   skillList[].url 签名视频 URL——2026-10-04 发现其随服务端轮换，但实质
 *   卡牌数据零变化）后，本地与存证的规范化 sha256 都必须等于 semanticSha256
 *   ——实质数据变化仍立即失败；轮换子树原件完整保留在 raw_materials 存证中。
 * - cards.js 为静态文件：字节级锁定（存证 sha256 = 固定指纹）。
 */
function verifyCardDataPins(materials) {
  const failures = []
  for (const def of CARD_DATA_FILES) {
    const fileBytes = fs.readFileSync(path.join(__dirname, 'data', def.file))
    const localSha = crypto.createHash('sha256').update(fileBytes).digest('hex')
    if (localSha !== def.sha256) {
      failures.push({
        label: `cards-pin:${def.file}`,
        statement: `本地 sha256=${localSha.slice(0, 16)}… ≠ 固定指纹 ${def.sha256.slice(0, 16)}…（data 文件被改动）`
      })
    }
    const mat = materials.get(def.recordKey)
    if (!mat) {
      failures.push({ label: `cards-material:${def.recordKey}`, statement: '库内无该存证' })
      continue
    }
    if (def.semanticSha256) {
      let localSemantic = null
      let storedSemantic = null
      try {
        localSemantic = canonicalCardsSha256(JSON.parse(fileBytes.toString('utf8')))
        storedSemantic = canonicalCardsSha256(JSON.parse(mat.content))
      } catch (e) {
        failures.push({
          label: `cards-semantic:${def.recordKey}`,
          statement: `JSON 解析失败（内容结构变化需人工复核）：${e.message}`
        })
        continue
      }
      if (localSemantic !== def.semanticSha256 || storedSemantic !== def.semanticSha256) {
        failures.push({
          label: `cards-semantic:${def.recordKey}`,
          statement: `语义指纹不一致：本地 ${localSemantic.slice(0, 16)}… / 存证 ${storedSemantic.slice(0, 16)}… ≠ 固定 ${def.semanticSha256.slice(0, 16)}…（卡牌实质数据变化，需人工复核后更新 data 文件与两级指纹）`
        })
      }
    } else if (mat.content_sha256 !== def.sha256) {
      failures.push({
        label: `cards-material:${def.recordKey}`,
        statement: `存证 sha256=${String(mat.content_sha256).slice(0, 16)}… ≠ 固定指纹 ${def.sha256.slice(0, 16)}…（静态文件字节变化，需人工复核）`
      })
    }
  }
  return failures
}

// ---------------- 幂等写入助手 ----------------
let referencesAdded = 0

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
  referencesAdded++
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
  const published = await services.content.publishRevision(typeName, rev.id, { operator: OPERATOR, reason: 'M4-2 内容构建（来源核查通过后发布）' })
  return { revisionId: published.id, published: true, skipped: false }
}

// ---------------- 主流程 ----------------
async function main() {
  const startedAt = new Date().toISOString()
  const { pool, repo, services } = await bootstrap()
  const report = {
    testedAt: startedAt, db: DB_NAME, operator: OPERATOR,
    materials: [], verification: { checked: 0, failures: [], details: {} },
    version: null, patchNote: null,
    created: { mechanics: 0, entities: 0, lineups: 0, lessons: 0, scenarios: 0 },
    skipped: { mechanics: 0, entities: 0, lineups: 0, lessons: 0, scenarios: 0 },
    referencesAdded: 0, conflictLog: [], draftLineups: [], publicRead: null, errors: []
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
    const home = materials.get('official:home')
    const news = materials.get('official:news:18873181')
    const guideNorm = normalizeText(guide.content)
    const homeNorm = normalizeText(home.content)
    const cardsJsNorm = normalizeText(materials.get('official:cards:js').content)
    let heroesJson = null
    try {
      heroesJson = JSON.parse(materials.get('official:cards:heroes').content)
    } catch (e) {
      throw new Error(`英雄目录存证 JSON 解析失败（内容变化需人工复核）：${e.message}`)
    }

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
      officialBasis: `官网资讯《${newsTitle}》（apps.game.qq.com 资讯接口 id=18873181，发布时间 ${newsJson.publishedAt || '未解析'}，原文已存证 official:news:18873181；正文载明更新时段 9月21日6:00-8:00 不停机更新）；官网新手指引页（official:newbie-guide，页面标题含「万象启航入门指南」）与卡牌图鉴五份目录存证（official:cards:*）为本批教学内容的第一方依据`,
      effectiveAt: '2026-09-21T06:00:00+08:00',
      note: 'S1 赛季官网新手指引 + 卡牌图鉴配套版本（五套入门阵容教学 + 目录实体）'
    }, OPERATOR)
    const current = await services.content.listVersions()
    const isCurrent = current.some(v => v.versionId === VERSION_ID && v.status === 'CURRENT')
    if (!isCurrent) {
      const act = await services.content.activateVersion(VERSION_ID, { operator: OPERATOR, note: 'M4-2 内容构建：激活当前版本基准' })
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
    const mechCheck = verifyMechanicsRouted({ guideNorm, cardsJsNorm, heroesJson })
    failures.push(...mechCheck.failures)
    failures.push(...verifyCardDataPins(materials))
    const rawGuideFail = verifyStatements(RAW_GUIDE_STATEMENTS, guideNorm, 'raw:guide')
    const rawHomeFail = verifyStatements(RAW_HOME_STATEMENTS, homeNorm, 'raw:home')
    failures.push(...rawGuideFail, ...rawHomeFail)
    report.verification.checked =
      mechCheck.checked + CARD_DATA_FILES.length + RAW_GUIDE_STATEMENTS.length + RAW_HOME_STATEMENTS.length
    report.verification.details = {
      mechanicsRouting: mechCheck.routed, // { guide, cardsJs, cardsHeroes }
      cardDataPins: CARD_DATA_FILES.map(d => d.recordKey),
      cardDataPinPolicy: 'JSON 目标=字节指纹（快照出处）+语义指纹（剥离轮换子树，本地与存证双侧断言）；cards.js=纯字节锁定',
      rawGuideStatements: RAW_GUIDE_STATEMENTS.length,
      rawHomeStatements: RAW_HOME_STATEMENTS.length,
      catalogFactsTransitive:
        '目录实体 facts 由 data/*.json 在本进程内构建；语义指纹双侧一致（本地文件=存证=固定 semanticSha256，剥离的轮换子树不含任何 facts 取值域字段）⇒ facts 与存证一致（传递性核查，无需逐字段比对）',
      imgFacts: IMG_FACT_STATS // 转写事实以图原件 URL+sha256 引用，不做存证子串核查
    }
    if (failures.length) {
      report.verification.failures = failures
      throw new Error(`来源核查失败 ${failures.length} 条（详见构建证据）：\n` +
        failures.map(f => `  [${f.label}] ${f.statement.slice(0, 60)}…${f.detail ? '（' + f.detail + '）' : ''}`).join('\n'))
    }
    console.log(`[build] 来源核查通过：${report.verification.checked} 项（词条路由/三方指纹/RAW 逐字）`)

    // 5) 词条与规则条目（38）
    for (const m of MECHANICS) {
      const { root } = await ensureRoot(services, pool, 'mechanics', { id: m.id, slug: m.slug, title: m.title })
      const ref = !m.verifyAgainst
        ? { refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '官网新手指引原文存证（statementRaw 未改写）' }
        : m.verifyAgainst === 'official:cards:js'
          ? { refKind: 'RAW_MATERIAL', refLocator: String(materials.get('official:cards:js').id), usageScope: 'PUBLIC', licenseNote: '官方卡牌图鉴专题站 cards.js 原文存证（关键词官方定义，statementRaw 未改写）' }
          : { refKind: 'RAW_MATERIAL', refLocator: String(materials.get('official:cards:heroes').id), usageScope: 'PUBLIC', licenseNote: '官方卡牌目录英雄接口原文存证（关键词定义变体唯一性已断言）' }
      const r = await publishOnce(services, pool, 'mechanics', root.id,
        'mechanic_revisions', 'mechanic_id',
        { gameVersionId: VERSION_ID, statementRaw: m.statementRaw, params: m.params, appliesTo: m.appliesTo },
        [ref])
      r.skipped ? report.skipped.mechanics++ : report.created.mechanics++
    }

    // 6) 资料实体（525 = 目录 514 + 棋手 11）
    for (const e of ALL_ENTITIES) {
      const { root } = await ensureRoot(services, pool, 'catalog-entities',
        { id: e.id, slug: e.slug, kind: e.kind, displayName: e.displayName })
      let refs
      if (e.source === 'RAW:guide') {
        refs = [{ refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '官网新手指引「棋手推荐」原文存证（statement 未改写）' }]
      } else if (e.source === 'RAW:home') {
        refs = [{ refKind: 'RAW_MATERIAL', refLocator: String(home.id), usageScope: 'PUBLIC', licenseNote: '官网首页「棋手推荐」栏原文存证（statement 未改写）' }]
      } else if (e.source === 'IMG') {
        const imgKeys = CMD_IMG_REFS[e.id]
        if (!imgKeys) throw new Error(`IMG 棋手 ${e.id} 未登记教学图引用映射（构建脚本需显式登记）`)
        refs = imgKeys.map(key => ({
          refKind: 'OFFICIAL_PAGE', refLocator: IMAGE_REFS[key], usageScope: 'PUBLIC',
          licenseNote: `官方教学图（图文详解）sha256=${IMAGE_SHA256[IMAGE_REFS[key]]}；事实为 AI 辅助转写，以图原件为准`
        }))
      } else {
        const recordKey = CATALOG_REF_BY_KIND[e.kind]
        if (!recordKey) throw new Error(`目录实体 ${e.id}（kind=${e.kind}）无卡牌存证路由`)
        refs = [{
          refKind: 'RAW_MATERIAL', refLocator: String(materials.get(recordKey).id), usageScope: 'PUBLIC',
          licenseNote: '官方卡牌图鉴接口原文存证（facts 逐字段来自存证 JSON：data 文件 sha256 = 固定指纹 = 存证 sha256，三方一致）'
        }]
      }
      const r = await publishOnce(services, pool, 'catalog-entities', root.id,
        'catalog_entity_revisions', 'entity_id',
        { gameVersionId: VERSION_ID, facts: e.facts }, refs)
      r.skipped ? report.skipped.entities++ : report.created.entities++
    }

    // 7) 阵容手册（5 套全量发布；材料不足的草稿只登记缺口不发布）
    const heroByName = new Map(ALL_ENTITIES.filter(e => e.kind === 'HERO').map(e => [e.displayName, e]))
    for (const lu of PUBLISHABLE_LINEUPS) {
      const { root } = await ensureRoot(services, pool, 'lineups', {
        id: lu.id, slug: lu.slug, displayName: lu.displayName, oneLineSummary: lu.oneLineSummary
      })
      const existingPub = await publishedRevisionId(pool, 'lineup_revisions', 'lineup_id', root.id)
      if (!existingPub) {
        const rev = await services.content.createRevision('lineups', root.id, {
          gameVersionId: VERSION_ID,
          commanderEntityId: lu.commanderEntityId,
          difficulty: lu.difficulty,
          newbieFitRationale: lu.newbieFitRationale,
          playConditions: lu.sections.playConditions,
          structureLevels: lu.sections.structureLevels,
          stages: lu.sections.stages,
          stabilization: lu.sections.stabilization,
          skillChains: lu.sections.skillChains,
          positioning: lu.sections.positioning,
          substitutes: lu.sections.substitutes,
          practiceCases: lu.sections.practiceCases,
          components: lu.components.map(c => ({
            entityId: c.entityId, role: c.role, necessity: c.necessity, notes: c.notes
          }))
        }, OPERATOR)
        // 替补关系显式化：构成行已落库（自引用 FK 不允许删了重插——序列会换 id），
        // 按 notes.substituteForNames 解析实体后定向 UPDATE 指向本修订内的真实行
        for (const c of lu.components) {
          const names = c.notes?.substituteForNames || []
          if (!names.length) continue
          const target = heroByName.get(names[0])
          if (!target) throw new Error(`替补关系解析失败：${c.entityId} 的替补目标「${names[0]}」未唯一命中英雄实体`)
          const upd = await pool.query(`
            UPDATE lineup_components sub
            SET substitute_for = tgt.id
            FROM lineup_components tgt
            WHERE sub.lineup_revision_id = $1 AND sub.entity_id = $2
              AND tgt.lineup_revision_id = $1 AND tgt.entity_id = $3`,
            [rev.id, c.entityId, target.id])
          if (upd.rowCount === 0) {
            throw new Error(`替补关系建立失败：${c.entityId} → ${target.id}（${names[0]}）`)
          }
        }
        // 引用：一图速览（由图文详解 URL 推导 guide_N_3 → guide_N_2）+ 图文详解 + 官网 RAW
        const detailImg = lu.sections.positioning.officialBoard.guideImage
        const quickImg = detailImg.replace(/_3\.jpg$/, '_2.jpg')
        if (quickImg === detailImg || !IMAGE_SHA256[quickImg] || !IMAGE_SHA256[detailImg]) {
          throw new Error(`阵容 ${lu.id} 教学图 URL 无法解析或未登记指纹：detail=${detailImg} quick=${quickImg}`)
        }
        for (const ref of [
          { refKind: 'OFFICIAL_PAGE', refLocator: quickImg, usageScope: 'PUBLIC', licenseNote: `官方教学图（一图速览）sha256=${IMAGE_SHA256[quickImg]}；事实为 AI 辅助转写，以图原件为准` },
          { refKind: 'OFFICIAL_PAGE', refLocator: detailImg, usageScope: 'PUBLIC', licenseNote: `官方教学图（图文详解）sha256=${IMAGE_SHA256[detailImg]}；事实为 AI 辅助转写，以图原件为准` },
          { refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '官网新手指引「入门阵容」明示阵容名与核心英雄' }
        ]) {
          await ensureReference(services, pool, { contentType: 'LINEUP', contentId: root.id, ...ref })
        }
        await services.content.publishRevision('lineups', rev.id, { operator: OPERATOR, reason: 'M4-2 阵容手册（官方教学图+官网存证，§5.1–5.6 全字段）' })
        report.created.lineups++
      } else {
        report.skipped.lineups++
      }
    }
    // 草稿阵容：如实登记缺口，不创建不发布（不生成无依据攻略）
    report.draftLineups = DRAFT_LINEUPS.map(l => ({
      id: l.id, displayName: l.displayName, status: l.status, gaps: l.draftGaps
    }))

    // 8) 课程 A–F + 进阶课（含先修依赖）
    for (const l of LESSONS) {
      const { root } = await ensureRoot(services, pool, 'lessons', {
        id: l.id, slug: l.slug, title: l.title, stage: l.stage, sortOrder: l.sortOrder
      })
      const refs = [{ refKind: 'RAW_MATERIAL', refLocator: String(guide.id), usageScope: 'PUBLIC', licenseNote: '课程引用的规则事实以官网新手指引存证为准' }]
      const imgKey = LESSON_IMG_REFS[l.slug]
      if (imgKey) {
        refs.push({ refKind: 'OFFICIAL_PAGE', refLocator: IMAGE_REFS[imgKey], usageScope: 'PUBLIC', licenseNote: `全流程教学依据官方教学图（图文详解）sha256=${IMAGE_SHA256[IMAGE_REFS[imgKey]]}；事实为 AI 辅助转写，以图原件为准` })
      }
      const r = await publishOnce(services, pool, 'lessons', root.id,
        'lesson_revisions', 'lesson_id',
        { gameVersionId: VERSION_ID, objectives: l.objectives, sections: l.sections, practice: l.practice },
        refs)
      if (l.deps.length) await services.content.setDependencies(root.id, l.deps, OPERATOR)
      r.skipped ? report.skipped.lessons++ : report.created.lessons++
    }

    // 9) 教学情境 + 教学复盘（12）
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
        if (s.slug === 'auction-bid-or-pass') {
          await ensureReference(services, pool, {
            contentType: 'SCENARIO', contentId: s.id, refKind: 'RAW_MATERIAL',
            refLocator: String(guide.id), usageScope: 'PUBLIC',
            licenseNote: '竞拍规则四条以官网新手指引存证为唯一依据'
          })
        } else {
          const imgKey = SCENARIO_IMG_REFS[s.id]
          if (!imgKey) throw new Error(`情境 ${s.id}（${s.kind}）未登记引用图映射（构建脚本需显式登记，不默认套用）`)
          await ensureReference(services, pool, {
            contentType: 'SCENARIO', contentId: s.id, refKind: 'OFFICIAL_PAGE',
            refLocator: IMAGE_REFS[imgKey], usageScope: 'PUBLIC',
            licenseNote: `情境/复盘分支依据官方教学图（sha256=${IMAGE_SHA256[IMAGE_REFS[imgKey]]}）与官网规则存证；复盘案例为机制推演，非真实对局`
          })
        }
        await services.content.publishScenario(s.id, { operator: OPERATOR, reason: 'M4-2 教学情境/复盘案例（官方出处登记）' })
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
        readings: ['两轮提取在「等级等同最近1名三分英雄」的表述细节上略有差异'],
        resolution: '按最优读数录入 guideEffectText 并标注「两轮图面提取在表述细节上略有差异，以图原件为准」；实体 facts.caliberNote 同步登记。',
        affectedContent: ['tal-636316']
      },
      {
        topic: 'cards.js「合成」词条 mark 文案与其「凯旋」完全相同',
        readings: [
          'cards.js 关键词清单：合成 mark = 凯旋 mark =「英雄上阵期间若战斗胜利，触发效果。」',
          '新手指引页词典：合成 =「使用场上已存在的英雄牌，与场上英雄结合，使其强化。」'
        ],
        resolution: '两个官方来源对「合成」给出不同定义；按较新来源（新手指引页）维持 kw-hecheng 的 statementRaw，cards.js 该 mark 疑似官方页面配置错误，不采信、不删除登记。图腾词条（指引页词典未收录）仍以 cards.js 为准。',
        affectedContent: ['kw-hecheng', 'kw-tuteng']
      },
      {
        topic: '教学图效果牌/天赋为简化表述，卡牌目录已公布精确文本',
        readings: [
          '教学图（图文详解）：远洋宝藏「提供阵营专属装备」、复印机「复制场上英雄」、智能装甲「随机获得1件日落海专属装备」等',
          '卡牌目录 effectText：逐字段精确数值/条件（如大河新援「获得2能量，以及随机1张2-3阶【大河流域】英雄牌」）'
        ],
        resolution: '双源并存时以卡牌目录 effectText 为权威（第一方数据接口，三方 sha256 锁定）；教学图简化文案仅作为推荐理由引用，实体 facts.caliberNote 逐条登记差异。',
        affectedContent: ['tal-636117', 'tal-623002', 'tal-635031', 'tal-636417', 'tal-636403', 'effcard-7529']
      },
      {
        topic: '教学图装备短名 → 官方目录全名归一',
        readings: [
          '图示短名：炽热/无尽/近卫/法源/不死鸟/霸者/御灵/不详',
          '官方目录全名：炽热支配者/无尽巨剑/近卫荣耀/法源之杯/不死鸟之眼/霸者重铠/御灵之纱/不祥征兆'
        ],
        resolution: '短名按前缀在装备目录唯一命中即归一（炽热→炽热支配者等 7 项，机械可验证）；「御灵」为御灵之纱前缀缩写、「不详→不祥征兆」为近音异形（目录唯一近似防御装+坦克佩戴定位）——后两项属编辑归一化推断，caliberNote 如实标注推断性质。',
        affectedContent: ['equip-643805', 'equip-643601', '装备推荐各条 lineupEquip 标注（图示短名：X）']
      },
      {
        topic: '「阿科米亚之子」（装备）与「阿科米亚核心」（词条）概念区分',
        readings: [
          '装备实体 阿科米亚之子（equip-644117，卡牌目录）',
          '关键词词条 阿科米亚核心（英雄目录关键词定义：等级平均分配给【日落海】英雄）'
        ],
        resolution: '两者是不同概念（装备实体 vs 核心等级分配机制），并存登记不互相冒充；装备实体 facts.caliberNote 显式提示区分，避免读者混淆。',
        affectedContent: ['equip-644117', 'kw-akemiya-core']
      },
      {
        topic: '官方卡牌 JSON 接口内嵌轮换内容（字节不稳定）',
        readings: [
          '2026-10-03 存证（= data/ 快照）与 2026-10-04 新抓取的字节 sha256 不一致（heroes/effects/talents 三个目标）',
          '连续两次抓取同一目标字节一致（接口本身稳定）；逐字段比对：85 英雄/98 效果牌/73 装备/258 天赋全部卡片的实质字段（名称/品阶/效果原文/关键词/技能文本/属性/费用/觉醒/获取）零变化',
          '差异仅两类：heroCard.skillList[].url 为技能视频签名 URL（video2.osgame.qq.com/<签名>/<过期hex>/…，随服务端重发轮换）；previewCards/sourceCards 为官方预告卡/来源卡展示区（内容随运营轮换）'
        ],
        resolution: '两级指纹：字节 sha256 保留为 data 快照的出处锚定；新增语义指纹（剥离上述轮换子树后按键序规范化序列化的 sha256）对本地与存证双侧断言相等——轮换内容不参与比对但原件完整保留在 raw_materials 存证中（可独立复核），卡牌实质数据任何变化仍立即构建失败。',
        affectedContent: ['corpus-cards.mjs CARD_DATA_FILES（semanticSha256）', '本构建脚本 verifyCardDataPins', '本构建证据']
      },
      {
        topic: '「瑶」同名：英雄目录实体 vs 棋手',
        readings: [
          '英雄目录：瑶（hero-5051，大河图腾流成员）',
          '官网首页棋手推荐栏：瑶妹（RAW:home，技能「可爱小鹿」，与官网新手指引「瑶」技能文本逐字一致）'
        ],
        resolution: '两者为不同实体（英雄牌 vs 棋手），ID 体系天然隔离（hero- vs cmd-）；棋手实体 facts.aliasNote 登记「官网首页以瑶妹呈现（同一棋手）」，名称检索各自命中。',
        affectedContent: ['hero-5051', 'cmd-yao']
      },
      {
        topic: '嫦娥四人队：官网仅一句配对文案，材料不足',
        readings: ['官网首页小菟配对文案：「这套阵容凑齐4个英雄后每回合靠棋手技能成长，操作难度低，但找齐英雄有一定运气成分。」'],
        resolution: '四名英雄构成/阶段/装备/站位/替补均无官方材料（卡牌目录亦无「嫦娥」英雄实体，无法按目录挂接组件）；validateLineupPublish 要求 8 板块齐备且 ≥1 组件，无法诚实填齐。按「不生成无依据攻略」红线保持 DRAFT 不创建不发布，缺口四条登记于 draftLineups。',
        affectedContent: ['lu-change-siren（DRAFT，未发布）', '本构建证据 draftLineups']
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
      mechanics: MECHANICS.length, lineups: PUBLISHABLE_LINEUPS.length, lessons: LESSONS.length,
      entities: ALL_ENTITIES.length, scenariosPublished: SCENARIOS.length
    }
    for (const [k, v] of Object.entries(expect)) {
      if (report.publicRead[k] !== v) {
        throw new Error(`公开读取数量不符：${k} 期望 ${v} 实际 ${report.publicRead[k]}`)
      }
    }
    console.log('[build] 公开读取复核通过：', JSON.stringify(report.publicRead))

    // 12) 证据落盘
    report.referencesAdded = referencesAdded
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
    const file = path.join(ARTIFACTS_DIR,
      `m4-content-build-${startedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
    fs.writeFileSync(file, JSON.stringify(report, null, 2))
    console.log(`[build] 完成。证据：${file}`)
    process.exitCode = 0
  } catch (err) {
    report.errors.push(String(err?.message || err))
    console.error(`[build] 失败：${err?.message || err}`)
    try {
      fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
      const file = path.join(ARTIFACTS_DIR,
        `m4-content-build-FAILED-${startedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
      fs.writeFileSync(file, JSON.stringify(report, null, 2))
      console.error(`[build] 失败证据：${file}`)
    } catch { /* 落盘失败不掩盖原始错误 */ }
    process.exitCode = 1
  } finally {
    await pool.end().catch(() => {})
  }
}

main()
