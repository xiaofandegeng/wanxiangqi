// M5-3 · 删除审计（A01）—— 运行代码/路由/HTTP/环境变量/包脚本/文档/活动表 全覆盖
//
// 依据：任务书 §10 A01「对照旧页面/接口清单访问、检查构建引用与启动依赖」+ §10 尾注
//「删除审计必须覆盖…；历史迁移/受控审计档案可命中旧术语，但需明确列入例外。
//  不能全局grep无命中作为唯一删除证据」。
// 因此每维证据 = 静态断言/文件系统 + **独立于 grep 的第二证据**：
//   D1 运行代码：fs 不存在断言 + 活动代码标识扫描（迁移/档案/退役断言测试列为显式例外）
//   D2 路由：router 静态枚举集合断言 + **浏览器实访旧页面**（应渲染「功能已退役」）
//   D3 HTTP：**隔离栈实访旧接口**（410 API_RETIRED / 管理面 401→410）+ 保留面 200
//   D4 env：.env.example 键集合 + 活动代码 process.env 实际使用面并集核对
//   D5 包脚本：两份 package.json scripts/deps 断言（无 tesseract/演示引擎依赖）
//   D6 文档：docs 根/受影响目录的现行集合断言 + git 索引（tracked）核对
//   D7 活动表：开发库 information_schema 实查（public 无旧业务表；archive_legacy 承接）
//   D8 构建与启动依赖：vue-tsc+vite build + 验收栈导入真实 http-server/services 启动
//
// 运行：node tools/browser-acceptance/m5-3-deletion-audit.mjs
// 产物：docs/v6_artifacts/m5-3-deletion-audit-<ts>/（audit.json + 审计记录.md + 截图）
// 业务库 wanxiangqi 零接触（D3 用 *_test 隔离库，D7 对 wanxiangqi_v6dev 只读 information_schema）。

import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { launchChrome, CdpBrowser, CdpPage, sleep } from './cdp.mjs'

const requireFromBackend = createRequire(new URL('../../backend/package.json', import.meta.url))
const { Client } = requireFromBackend('pg')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const FRONT_PORT = 5191
const SITE = `http://127.0.0.1:${FRONT_PORT}`
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const OUT_DIR = path.join(REPO, 'docs', 'v6_artifacts', `m5-3-deletion-audit-${TS}`)
const SHOT_DIR = path.join(OUT_DIR, 'screenshots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const dimensions = []
let failures = 0

function dim(id, title) {
  const d = { id, title, checks: [], notes: [] }
  dimensions.push(d)
  return d
}
function check(d, label, ok, detail = '') {
  d.checks.push({ ok: !!ok, label, detail: String(detail ?? '').slice(0, 300) })
  if (!ok) { failures++; console.error(`  ✗ [${d.id}] ${label}${detail ? ` —— ${detail}` : ''}`) }
  else console.log(`  ✓ [${d.id}] ${label}`)
}
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8')
const exists = p => fs.existsSync(path.join(REPO, p))

async function waitFor(url, { timeoutMs = 30_000 } = {}) {
  const started = Date.now()
  let lastErr = null
  while (Date.now() - started < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return true; lastErr = `HTTP ${r.status}` }
    catch (err) { lastErr = err.message }
    await sleep(400)
  }
  throw new Error(`等待 ${url} 超时（最后：${lastErr}）`)
}

// ---------------------------------------------------------------------------
// 显式例外（任务书 §10：历史迁移/受控档案可命中旧术语，需明确列入例外）
// ---------------------------------------------------------------------------
const EXCEPTIONS = [
  { scope: 'backend/src/migrations/0001–0005', reason: '历史迁移，sha256 防篡改不可改（迁移历史本身记录旧模型 DDL）' },
  { scope: 'backend/src/migrations/0007 + migrations-rollback/', reason: '归档/回滚迁移必须引用旧表名才能整表迁入 archive_legacy / 复原' },
  { scope: 'docs/archive/legacy-v2-v5/**', reason: '受控历史档案（M5-2 归档，INDEX.md 声明退役）' },
  { scope: 'backend/tests/acceptance/m1-retired-api.test.mjs', reason: '退役语义断言（旧端点名是断言对象本身）' },
  { scope: 'tools/browser-acceptance/m5-3-deletion-audit.mjs 自身', reason: '审计脚本：17 个旧标识与 8 条旧路径是其扫描词表/断言对象（受控审计档案；入库后 git ls-files 会列出本文件，需自排除以防自指误报）' },
  { scope: 'frontend/src/views/not-found.vue RETIRED_PREFIXES', reason: '旧链接误入时的退役引导文案（不注册路由、不提供功能）' },
  { scope: 'docs/v6旧功能删除与数据归档对照表.md', reason: 'M5-3 审计基线文档（枚举旧对象名是职责本身）' },
  { scope: 'untracked: research/ 2 个文件、docs/v3_artifacts/ 58 个、docs/v4_artifacts/ 1 个', reason: '从未入库的用户本地文件（保留用户改动，未提交、不参与构建/打包）' },
]

// ===========================================================================
// D1 · 运行代码：旧文件/目录不存在 + 活动代码标识扫描
// ===========================================================================
{
  const d = dim('D1', '运行代码')
  const gone = [
    'frontend/src/views/event-today.vue', 'frontend/src/views/event-detail.vue',
    'frontend/src/views/player-profile.vue', 'frontend/src/views/player-roster.vue',
    'frontend/src/views/match-archive.vue', 'frontend/src/views/personal-evidence-import.vue',
    'frontend/src/views/evidence-verify.vue', 'frontend/src/views/model-backtest.vue',
    'frontend/src/components/LiveRadarModal.vue', 'frontend/src/components/SupportBar.vue',
    'frontend/src/components/PlayerHistoryModal.vue', 'frontend/src/components/PlayerSlot.vue',
    'frontend/src/components/RankBadge.vue', 'frontend/src/components/StatusTag.vue',
    'frontend/src/utils', 'frontend/src/types',
    'backend/src/services/stats.mjs', 'backend/src/services/imports.mjs',
    'backend/src/repositories/file-repository.mjs',
    'backend/src/adapters/camp-adapter.mjs', 'backend/src/adapters/datatft.mjs',
    'tools/emulator-watcher',
    'database/schema.sql', 'database/enums.sql', 'database/seed.sql', 'database/views.sql',
  ]
  const leftover = gone.filter(exists)
  check(d, `对照表 D 项 ${gone.length} 个文件/目录全部不存在`, leftover.length === 0, leftover.join(', '))

  // 活动代码扫描（第二证据面：即便文件删净，也不得有残留引用/字符串复活旧功能）
  const scanRoots = ['backend/src', 'backend/tests', 'frontend/src', 'frontend/tests', 'tools/browser-acceptance']
  const ignore = p => p.includes('/migrations/') || p.includes('/migrations-rollback/')
    || p.endsWith('m1-retired-api.test.mjs')
    || p.endsWith('m5-3-deletion-audit.mjs') // 审计脚本自身：扫描词表含旧标识（见 EXCEPTIONS）
  const files = []
  for (const root of scanRoots) {
    const abs = path.join(REPO, root)
    if (!exists(root)) continue
    for (const name of execSync(`git ls-files "${root}"`, { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
      if (!/\.(mjs|ts|vue|json)$/.test(name) || ignore(name)) continue
      files.push(name)
    }
  }
  const idents = ['LiveRadarModal', 'SupportBar', 'PlayerHistoryModal', 'RankBadge', 'StatusTag',
    'event-today', 'match-archive', 'personal-evidence-import', 'model-backtest', 'camp-adapter',
    'emulator-watcher', 'stats-core', 'tesseract', 'WXQ_APP_MODE', 'WXQ_DATA_DIR',
    'WXQ_ENABLE_DATATFT', 'WXQ_DATATFT_SIGN_SECRET']
  const hits = []
  for (const f of files) {
    const text = read(f)
    for (const ident of idents) if (text.includes(ident)) hits.push(`${f}: ${ident}`)
  }
  check(d, `活动代码（${files.length} 文件，迁移/退役断言测试除外）无 ${idents.length} 个旧标识残留`, hits.length === 0, hits.join('; '))

  // 旧业务表 SQL 访问（活动仓储/服务不得读写旧表；0007 归档语义由迁移承载）
  const sqlHits = []
  const sqlRe = /\b(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?(players|player_identities|player_nicknames|events|event_participants|matches|import_batches)\b/i
  for (const f of files.filter(x => x.startsWith('backend/src'))) {
    if (sqlRe.test(read(f))) sqlHits.push(f)
  }
  check(d, 'backend/src（迁移除外）无旧业务表 SQL 读写', sqlHits.length === 0, sqlHits.join('; '))
}

// ===========================================================================
// D2 · 路由：静态枚举 + 浏览器实访旧页面
// ===========================================================================
{
  const d = dim('D2', '路由')
  const router = read('frontend/src/router/index.ts')
  const paths = [...router.matchAll(/path:\s*'([^']+)'/g)].map(m => m[1])
  const expect = ['/', '/learn', '/learn/:slug', '/lineups', '/lineups/:id', '/library',
    '/library/mechanics/:slug', '/library/:kind/:slug', '/updates', '/updates/:slug',
    '/admin/content', '/admin/sources', '/:pathMatch(.*)*'].sort()
  const actual = [...paths].sort()
  check(d, `路由表恰为新面 ${expect.length} 条（无旧路由注册）`,
    JSON.stringify(actual) === JSON.stringify(expect), `实际: ${actual.join(' ')}`)

  // 浏览器实访（A01「对照旧页面清单访问」）在 D3 栈起来后统一执行（见 D2b）
}

// ===========================================================================
// D3 · HTTP：隔离栈实访旧接口 + 保留面（同时构成「启动依赖」证据：真实 server 代码被导入并监听）
// ===========================================================================
const { bootAcceptanceStack, pgAvailable } = await import(
  new URL('../../backend/tests/acceptance/_helpers.mjs', import.meta.url)
)
if (!pgAvailable) throw new Error('本地 PG 不可用——删除审计的 HTTP/活动表两维无法执行，中止（如实失败，不跳过）')
const stack = await bootAcceptanceStack('wanxiangqi_m53_test')
try {
  {
    const d = dim('D3', 'HTTP 接口（隔离栈实访）')
    const retiredPublic = ['/api/v1/players', '/api/v1/players/p-x/stats', '/api/v1/players/p-x/matches',
      '/api/v1/matches', '/api/v1/events', '/api/v1/events/ev-x', '/api/live/stream', '/api/live/analyze']
    for (const p of retiredPublic) {
      const r = await stack.api(p)
      check(d, `GET ${p} → 410 API_RETIRED（匿名即达）`,
        r.status === 410 && r.json?.code_name === 'API_RETIRED' && r.json?.data === undefined,
        `实际 ${r.status} ${r.json?.code_name}`)
    }
    const post = await stack.api('/api/live/analyze', { method: 'POST', body: {} })
    check(d, 'POST /api/live/analyze 同样 410（不因方法复活）', post.status === 410, `实际 ${post.status}`)
    const retiredAdmin = ['/api/v1/admin/events', '/api/v1/admin/matches', '/api/v1/admin/imports',
      '/api/v1/admin/matches/m-x/verify', '/api/v1/admin/slots/confirm']
    for (const p of retiredAdmin) {
      const anon = await stack.api(p)
      const authed = await stack.api(p, { token: stack.adminToken })
      check(d, `${p} 匿名 401 → 授权 410（鉴权先于退役）`,
        anon.status === 401 && authed.status === 410 && authed.json?.code_name === 'API_RETIRED',
        `匿名 ${anon.status} / 授权 ${authed.status} ${authed.json?.code_name}`)
    }
    const ready = await stack.api('/api/v1/ready')
    const health = await stack.api('/api/v1/health')
    const lineups = await stack.api('/api/v1/lineups')
    const status = await stack.api('/api/v1/data-status')
    check(d, '保留面 /ready /health /lineups /data-status 全部 200（新形态）',
      ready.status === 200 && health.status === 200 && lineups.status === 200 && status.status === 200)
    check(d, 'health 不再报告旧业务计数（players/matches/events 键不存在）',
      health.json?.counts?.players === undefined && health.json?.counts?.matches === undefined
      && health.json?.counts?.events === undefined, JSON.stringify(health.json?.counts))
    const nf = await stack.api('/api/v1/definitely-not-a-route')
    check(d, '未注册路径 404（410/404 职责分离）', nf.status === 404, `实际 ${nf.status}`)
  }

  // ===========================================================================
  // D2b · 浏览器实访旧页面（vite dev + CDP；SPA 客户端路由需真实渲染验证）
  // ===========================================================================
  {
    const d = dim('D2b', '旧页面浏览器实访（对照 not-found 退役引导）')
    console.log('[audit] 起 vite dev…')
    const vite = spawn('npm', ['exec', 'vite', '--', '--port', String(FRONT_PORT), '--strictPort', '--host', '127.0.0.1'], {
      cwd: path.join(REPO, 'frontend'),
      env: { ...process.env, WXQ_API_TARGET: stack.baseUrl },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let viteLog = ''
    vite.stdout.on('data', x => { viteLog += x })
    vite.stderr.on('data', x => { viteLog += x })
    const launched = await launchChrome({ headless: true })
    const browser = await new CdpBrowser(launched.wsEndpoint, launched).connect()
    let page = null
    try {
      await waitFor(SITE)
      page = await CdpPage.create(browser, { viewport: { width: 1440, height: 900 } })
      const retiredPaths = ['/roster', '/archive', '/matches', '/players/p-1', '/events/ev-1',
        '/admin/verify', '/admin/personal-import', '/models/backtest']
      for (const p of retiredPaths) {
        await page.goto(`${SITE}${p}`)
        const text = await page.eval('document.body.innerText.replace(/\\s+/g, " ")')
        const ok = text.includes('功能已退役') && text.includes('该页面已随项目转型下线')
        check(d, `旧页面 ${p} → 退役引导（功能已退役 + 转型说明）`, ok, text.slice(0, 80))
      }
      await page.setViewport({ width: 360, height: 800 })
      await page.goto(`${SITE}/archive`)
      const mText = await page.eval('document.body.innerText.replace(/\\s+/g, " ")')
      check(d, '旧页面 360×800 移动视口同样呈现退役引导', mText.includes('功能已退役'))
      await page.setViewport({ width: 1440, height: 900 })
      await page.goto(`${SITE}/archive`)
      await page.screenshot(path.join(SHOT_DIR, 'retired-archive-desktop.png'))
      // 对照：现行页面正常加载（非退役态）
      await page.goto(`${SITE}/lineups`)
      const curText = await page.eval('document.body.innerText.replace(/\\s+/g, " ")')
      check(d, '对照现行 /lineups 正常渲染（非退役态）', !curText.includes('功能已退役'), curText.slice(0, 80))
      await page.screenshot(path.join(SHOT_DIR, 'current-lineups-desktop.png'))
    } finally {
      if (page) await page.close().catch(() => {})
      await browser.close().catch(() => {})
      launched.child.kill('SIGTERM')
      vite.kill('SIGTERM')
    }
  }
} finally {
  await stack.cleanup().catch(() => {})
}

// ===========================================================================
// D4 · 环境变量：.env.example 键集合 + 活动代码实际使用面
// ===========================================================================
{
  const d = dim('D4', '环境变量')
  const rawLines = read('backend/.env.example').split('\n').map(l => l.trim())
  const activeKeys = rawLines.filter(l => l && !l.startsWith('#')).map(l => l.split('=')[0])
  const commentedKeys = rawLines
    .filter(l => /^#\s*[A-Z_][A-Z0-9_]*=/.test(l))
    .map(l => l.replace(/^#\s*/, '').split('=')[0])
  const docKeys = [...new Set([...activeKeys, ...commentedKeys])]
  const expectActive = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'ADMIN_TOKEN']
  const expectDoc = [...expectActive, 'PGPASSWORD', 'HOST', 'PORT', 'WXQ_MAX_UPLOAD_BYTES']
  check(d, `.env.example 激活键恰为 5 项必填（${expectActive.join('/')}），注释可选项恰为 PGPASSWORD/HOST/PORT/WXQ_MAX_UPLOAD_BYTES`,
    JSON.stringify([...activeKeys].sort()) === JSON.stringify([...expectActive].sort())
    && JSON.stringify([...docKeys].sort()) === JSON.stringify([...expectDoc].sort()),
    `激活: ${activeKeys.join('/')} / 注释: ${commentedKeys.join('/')}`)
  check(d, '已删配置键（WXQ_APP_MODE/WXQ_DATA_DIR/WXQ_ENABLE_DATATFT/WXQ_DATATFT_SIGN_SECRET）不在文档面',
    !docKeys.some(k => ['WXQ_APP_MODE', 'WXQ_DATA_DIR', 'WXQ_ENABLE_DATATFT', 'WXQ_DATATFT_SIGN_SECRET'].includes(k)))

  const used = new Set()
  for (const root of ['backend/src', 'backend/tests', 'tools/browser-acceptance']) {
    for (const name of execSync(`git ls-files "${root}"`, { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
      if (!/\.(mjs|ts|vue)$/.test(name)) continue
      for (const m of read(name).matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) used.add(m[1])
    }
  }
  const allowedNotes = {
    NODE_ENV: 'Node 运行时惯例（库内部行为，非业务配置）',
    HOST: '.env.example 注释可选项（HTTP 监听地址）',
    PORT: '.env.example 注释可选项（HTTP 监听端口）',
    WXQ_MAX_UPLOAD_BYTES: '.env.example 注释可选项（上传限额）',
    WXQ_NETWORK_TESTS: '测试联网门控（tests/network 套件）',
    WXQ_TEST_DB: '测试库覆盖（tests/helpers/pg-test.mjs，测试设施）',
    WXQ_CHROME_BIN: '走查工具 Chromium 路径覆盖（tools/browser-acceptance/cdp.mjs）',
    USER: '走查脚本本机 PG 连接（OS 注入，非业务配置）',
    CI: 'Node 生态惯例',
  }
  const envFiles = new Set([...docKeys, ...Object.keys(allowedNotes),
    'PGPASSWORD', 'WXQ_API_TARGET']) // PGPASSWORD 见 .env.example 注释行；WXQ_API_TARGET 前端代理目标（frontend 文档记载）
  const undocumented = [...used].filter(k => !envFiles.has(k))
  check(d, `活动代码 process.env 使用 ${used.size} 个键全部有出处（.env.example/注释/测试门控/OS）`,
    undocumented.length === 0, `未记录: ${undocumented.join(', ')}`)
}

// ===========================================================================
// D5 · 包脚本
// ===========================================================================
{
  const d = dim('D5', '包脚本与依赖')
  const be = JSON.parse(read('backend/package.json'))
  const fe = JSON.parse(read('frontend/package.json'))
  check(d, 'backend deps 恰为 { pg }（无 tesseract/演示引擎依赖）',
    JSON.stringify(Object.keys(be.dependencies ?? {}).sort()) === JSON.stringify(['pg']), JSON.stringify(be.dependencies))
  check(d, 'backend scripts 恰为 dev/start/migrate/test（无旧 watcher/solver 入口）',
    JSON.stringify(Object.keys(be.scripts).sort()) === JSON.stringify(['dev', 'migrate', 'start', 'test']), JSON.stringify(be.scripts))
  check(d, 'frontend devDeps/Deps 无 tesseract、无演示引擎痕迹',
    !JSON.stringify(fe).includes('tesseract') && !JSON.stringify(fe).includes('emulator'), '—')
  check(d, '仓库根无 package.json（旧演示引擎入口已随 emulator-watcher 删除）', !exists('package.json'))
  check(d, 'tools/ 恰为 browser-acceptance（emulator-watcher 目录已删）',
    JSON.stringify(fs.readdirSync(path.join(REPO, 'tools')).sort()) === JSON.stringify(['browser-acceptance']))
}

// ===========================================================================
// D6 · 文档：现行集合 + git 索引核对
// ===========================================================================
{
  const d = dim('D6', '文档与归档')
  const docsRoot = fs.readdirSync(path.join(REPO, 'docs')).filter(x => x.endsWith('.md')).sort()
  const expectDocs = ['v6业务库归档迁移方案_M5-1.md', 'v6执行清单.md', 'v6实施报告.md',
    'v6旧功能删除与数据归档对照表.md',
    '王者万象棋项目转型任务书_v6_阵容分析与新手教学_2026-10-03.md'].sort()
  check(d, `docs 根恰为 5 份现行文档（含 v6实施报告.md）`,
    JSON.stringify(docsRoot) === JSON.stringify(expectDocs), `实际: ${docsRoot.join(', ')}`)
  check(d, 'database/ 恰为 README.md（v1 静态 DDL 已归档）',
    JSON.stringify(fs.readdirSync(path.join(REPO, 'database')).sort()) === JSON.stringify(['README.md']))
  check(d, 'docs/archive/legacy-v2-v5/INDEX.md 存在（退役声明索引）',
    exists('docs/archive/legacy-v2-v5/INDEX.md'))
  const git = scope => execSync(`git ls-files "${scope}"`, { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  const researchTracked = git('research/')
  check(d, 'research/ 无 tracked 文件（3 个旧调研文件已归档；未入库用户文件原位保留）',
    researchTracked.length === 0, researchTracked.join(', '))
  const v3Tracked = git('docs/v3_artifacts/')
  const v4Tracked = git('docs/v4_artifacts/')
  check(d, 'docs/v3_artifacts、docs/v4_artifacts 无 tracked 文件（tracked 产物已迁 archive）',
    v3Tracked.length === 0 && v4Tracked.length === 0, [...v3Tracked, ...v4Tracked].join(', '))
  const archived = git('docs/archive/legacy-v2-v5/')
  d.notes.push(`archive tracked 文件数：${archived.length}（12 v1–v5 文档 + v3/v4 artifacts + research + database DDL + emulator-watcher-data）`)
}

// ===========================================================================
// D7 · 活动表：开发库 information_schema 实查（只读）
// ===========================================================================
{
  const d = dim('D7', '活动数据表')
  const pg = new Client({ host: '127.0.0.1', user: process.env.USER, database: 'wanxiangqi_v6dev' })
  await pg.connect()
  try {
    const pub = (await pg.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(r => r.tablename)
    const legacy = (await pg.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='archive_legacy' ORDER BY tablename`)).rows.map(r => r.tablename)
    const oldTables = ['players', 'player_identities', 'player_nicknames', 'events', 'event_participants',
      'matches', 'import_batches']
    const inPublic = oldTables.filter(t => pub.includes(t))
    check(d, `public schema ${pub.length} 张表中无旧业务模型（${oldTables.join('/')}）`,
      inPublic.length === 0, `误在 public: ${inPublic.join(', ')}`)
    const missingInLegacy = oldTables.filter(t => !legacy.includes(t))
    check(d, `archive_legacy schema 承接旧表（缺: ${missingInLegacy.join(',') || '无'}）`,
      missingInLegacy.length === 0, `archive_legacy 实际: ${legacy.join(', ')}`)
    const mig = (await pg.query(
      `SELECT filename FROM schema_migrations ORDER BY filename`)).rows.map(r => r.filename)
    check(d, '迁移台账 0001..0009 全应用（0007 归档生效）', mig.length === 9 && mig[0].startsWith('0001') && mig[8].startsWith('0009'), mig.join(','))
    d.notes.push(`public 表全集：${pub.join(', ')}`)
  } finally {
    await pg.end()
  }
}

// ===========================================================================
// D8 · 构建引用与启动依赖
// ===========================================================================
{
  const d = dim('D8', '构建与启动依赖')
  console.log('[audit] vue-tsc + vite build…')
  const t0 = Date.now()
  try {
    execSync('npm run build', { cwd: path.join(REPO, 'frontend'), stdio: 'pipe' })
    check(d, `frontend vue-tsc -b && vite build 绿（${((Date.now() - t0) / 1000).toFixed(1)}s，无旧模块引用）`, true)
  } catch (err) {
    check(d, 'frontend vue-tsc -b && vite build 绿', false, String(err.stderr || err.message).slice(0, 200))
  }
  d.notes.push('启动依赖：D3 隔离栈经 _helpers.bootAcceptanceStack 导入真实 src/http-server/services/PgRepository 并监听（server 启动链完整）；构建产物含全部且仅新面视图')
}

// ===========================================================================
// 产物落盘
// ===========================================================================
const totalChecks = dimensions.reduce((n, x) => n + x.checks.length, 0)
const audit = {
  milestone: 'M5-3', title: '删除审计（A01）：旧功能清理全覆盖',
  ranAt: new Date().toISOString(),
  taskBasis: 'docs/王者万象棋项目转型任务书_v6_阵容分析与新手教学_2026-10-03.md §10 A01 + 尾注',
  baseline: 'docs/v6旧功能删除与数据归档对照表.md',
  result: failures === 0 ? 'PASS' : 'FAIL',
  checks: { total: totalChecks, failed: failures },
  dimensions,
  exceptions: EXCEPTIONS,
  stack: {
    http: 'bootAcceptanceStack(wanxiangqi_m53_test)（隔离 *_test 库，业务库零接触）',
    pages: `vite dev @ :${FRONT_PORT} + headless Chromium（1440×900 / 360×800）`,
    tables: 'wanxiangqi_v6dev information_schema 只读',
  },
}
fs.writeFileSync(path.join(OUT_DIR, 'audit.json'), JSON.stringify(audit, null, 2))
const md = [
  '# M5-3 删除审计记录（A01）', '',
  `- 时间：${audit.ranAt}　结果：**${audit.result}**（${totalChecks} 项断言，${failures} 失败）`,
  '- 基线：docs/v6旧功能删除与数据归档对照表.md；依据：任务书 §10 A01 + 尾注（不能以全局 grep 无命中作为唯一删除证据）', '',
  ...dimensions.map(x => [
    `## ${x.id} · ${x.title}`, '',
    ...x.checks.map(c => `- ${c.ok ? '✓' : '✗'} ${c.label}${c.detail && !c.ok ? `（${c.detail}）` : ''}`),
    ...x.notes.map(n => `- 附注：${n}`), ''
  ]).flat(),
  '## 显式例外（可合法命中旧术语的范围）', '',
  ...EXCEPTIONS.map(e => `- ${e.scope} —— ${e.reason}`), '',
  '产物：audit.json + screenshots/（retired-archive-desktop.png 退役引导 / current-lineups-desktop.png 现行对照）',
].join('\n')
fs.writeFileSync(path.join(OUT_DIR, '审计记录.md'), md)
console.log(`\n[audit] ${audit.result} —— ${totalChecks} 断言 / ${failures} 失败`)
console.log(`[audit] 产物 → ${path.relative(REPO, OUT_DIR)}`)
process.exit(failures === 0 ? 0 : 1)
