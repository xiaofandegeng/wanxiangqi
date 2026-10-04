// M5-4 · 浏览器验收（任务书 §10 A11）—— 360×800 与 1440×900 关键路由走查：
// 加载/空态/无统计/错误/历史版本可理解；阶段切换、搜索、筛选、收藏、练习、返回正常。
//
// 三套真实栈（零 mock）：
//   A 内容集栈（wanxiangqi_v6dev，M4-2 内容集）——加载/搜索/筛选/收藏/练习/返回/无统计
//   B 空库栈（wanxiangqi_m54_empty_test）——空态；随后种入 HISTORICAL 版本手册验证历史版本呈现
//   C 错误栈（wanxiangqi_m54_err_test，杀后端）——API 离线错误态 + 重新加载
//
// 运行：node tools/browser-acceptance/m5-4-browser-acceptance.mjs
// 产物：docs/v6_artifacts/m5-4-browser-acceptance-<ts>/（截图 + 走查记录.md + walkthrough.json）

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, CdpBrowser, CdpPage, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const BACKEND_HELPERS = path.resolve(REPO, 'backend/tests/acceptance/_helpers.mjs')
const BACKEND_PORT = 18084
const FRONT_PORT_A = 5193
const FRONT_PORT_B = 5194
const FRONT_PORT_C = 5195
const API_A = `http://127.0.0.1:${BACKEND_PORT}`
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 360, height: 800, mobile: true, touch: true }
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const OUT_DIR = path.join(REPO, 'docs', 'v6_artifacts', `m5-4-browser-acceptance-${TS}`)
const SHOT_DIR = path.join(OUT_DIR, 'screenshots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const { bootAcceptanceStack, pgAvailable } = await import(BACKEND_HELPERS)

const steps = [] // { id, stack, viewport, name, url, assertions, consoleExceptions, notes }
let failures = 0

function check(step, label, ok, detail = '') {
  step.assertions.push({ ok: !!ok, label, detail: String(detail ?? '').slice(0, 220) })
  if (!ok) { failures++; console.error(`    ✗ ${label}${detail ? ` —— ${detail}` : ''}`) }
  else console.log(`    ✓ ${label}`)
}

const pageText = (page) => page.eval('document.body.innerText.replace(/\\s+/g, " ")')

async function waitFor(url, { timeoutMs = 30_000, ready = false } = {}) {
  const started = Date.now()
  let lastErr = null
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        if (!ready) return true
        if ((await res.text()).includes('READY')) return true
      }
      lastErr = `HTTP ${res.status}`
    } catch (err) { lastErr = err.message }
    await sleep(400)
  }
  throw new Error(`等待 ${url} 超时（最后：${lastErr}）`)
}

async function startVite(port, apiTarget) {
  const child = spawn('npm', ['exec', 'vite', '--', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.join(REPO, 'frontend'),
    env: { ...process.env, WXQ_API_TARGET: apiTarget },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout.on('data', d => { log += d.toString() })
  child.stderr.on('data', d => { log += d.toString() })
  const base = `http://127.0.0.1:${port}`
  try { await waitFor(base) } catch (err) { child.kill('SIGKILL'); throw new Error(`${err.message}\n${log.slice(-800)}`) }
  return { child, base }
}

const stopVite = async (vite) => { if (vite) { vite.child.kill('SIGTERM'); await sleep(300); vite.child.kill('SIGKILL') } }

/** 走查一步：切视口 → 打开 URL → 断言 → 控制台异常检查 → 截图 */
async function walk(page, stepId, stackName, viewport, name, url, fn, { shot = true } = {}) {
  const vpName = `${viewport.width}x${viewport.height}`
  console.log(`[walk] ${stepId} ${name} — ${url} @${vpName}`)
  const step = { id: stepId, stack: stackName, viewport: vpName, name, url, assertions: [], consoleExceptions: [], notes: [] }
  steps.push(step)
  await page.setViewport(viewport)
  page.resetConsole()
  await page.goto(url, { settleMs: 1100 })
  try { await fn(step) } catch (err) {
    check(step, '走查脚本无异常', false, err.message)
  }
  const exceptions = page.takeConsole().filter(c => c.kind === 'exception')
  step.consoleExceptions = exceptions
  check(step, '无未捕获前端异常', exceptions.length === 0, exceptions.map(e => e.text.slice(0, 120)).join(' | '))
  if (shot) await page.screenshot(path.join(SHOT_DIR, `${stepId}__${vpName}.png`), { fullPage: true })
  return step
}

// ===========================================================================
// 栈 A · 内容集（wanxiangqi_v6dev）
// ===========================================================================
console.log('[m5-4] 栈 A：起后端（wanxiangqi_v6dev）…')
const backend = spawn('node', ['src/server.js'], {
  cwd: path.join(REPO, 'backend'),
  env: { ...process.env, PGDATABASE: 'wanxiangqi_v6dev', PGHOST: '127.0.0.1', PGUSER: process.env.USER, HOST: '127.0.0.1', PORT: String(BACKEND_PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
})
let backendLog = ''
backend.stdout.on('data', d => { backendLog += d.toString() })
backend.stderr.on('data', d => { backendLog += d.toString() })
let viteA = null, viteB = null, viteC = null
let stackB = null, stackC = null
const launched = await launchChrome({ headless: true })
const chrome = await new CdpBrowser(launched.wsEndpoint, launched).connect()
const page = await CdpPage.create(chrome, { viewport: DESKTOP })
let exitCode = 0

try {
  await waitFor(`${API_A}/api/v1/ready`, { ready: true })
  console.log('[m5-4] 栈 A 后端 READY；起 vite…')
  viteA = await startVite(FRONT_PORT_A, API_A)
  const SITE = viteA.base

  // ---- A1 加载 · 首页（桌面 1440×900）----
  await walk(page, 'A1', 'content', DESKTOP, '加载 · 首页', `${SITE}/`, async step => {
    const text = await pageText(page)
    check(step, '品牌（阵容研习站）与课程计数（11 门）', text.includes('阵容研习站') && /11 门课程/.test(text), (text.match(/\d+ 门课程/) || [])[0])
    const nav = await page.eval('Array.from(document.querySelectorAll("nav a, header a")).map(a => a.textContent.trim()).join(",")')
    check(step, '主导航四入口齐全', ['新手学堂', '阵容库', '资料库', '版本动态'].every(t => nav.includes(t)), nav)
    check(step, '全站搜索框在页头可用', await page.eval('!!document.querySelector(".gs-input")'))
  })

  // ---- A2 加载 · 首页（移动 360×800）+ 无横向滚动 ----
  await walk(page, 'A2', 'content', MOBILE, '加载 · 首页（移动）', `${SITE}/`, async step => {
    const overflow = await page.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check(step, '页面本体无横向滚动（360px）', overflow <= 1, `scrollWidth-clientWidth=${overflow}px`)
    const text = await pageText(page)
    check(step, '移动端内容完整（课程计数 + 搜索框）', /11 门课程/.test(text) && await page.eval('!!document.querySelector(".gs-input")'))
  })

  // ---- A3 全站搜索（桌面）：四类命中 + 键盘导航 + 点击入册 ----
  await walk(page, 'A3', 'content', DESKTOP, '搜索 · 全站搜索四类命中', `${SITE}/`, async step => {
    await page.typeIn('document.querySelector(".gs-input")', '图腾')
    await sleep(1400) // 防抖 250ms + 请求 + 渲染
    const groupTitles = await page.eval('Array.from(document.querySelectorAll(".gs-group-title")).map(e => e.textContent.trim())')
    check(step, '四类分组齐全（课程/阵容手册/资料实体/规则条目）',
      ['课程', '阵容手册', '资料实体', '规则条目'].every(t => groupTitles.some(g => g.includes(t))), groupTitles.join(' / '))
    const hitCount = await page.eval('document.querySelectorAll(".gs-hit").length')
    check(step, '各类均有结果（合计 >6 条）', hitCount > 6, `${hitCount} 条`)
    // 键盘：ArrowDown 两次 → Enter 导航到第三项（手册或资料）
    await page.eval(`(() => { const i = document.querySelector('.gs-input'); i.focus()
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })()`)
    await sleep(900)
    const after = await page.eval('location.pathname')
    check(step, '键盘 ArrowDown+Enter 可导航到结果', /^\/(learn|lineups|library)\//.test(after), after)
    // 无命中如实为空
    await page.goto(`${SITE}/`, { settleMs: 600 })
    await page.typeIn('document.querySelector(".gs-input")', '完全不存在的词xyz')
    await sleep(1400)
    const emptyText = await page.eval('(document.querySelector(".gs-empty") || {}).textContent || ""')
    check(step, '无命中如实提示（不造结果）', emptyText.includes('没有找到'), emptyText.trim().slice(0, 60))
  })

  // ---- A4 阵容库筛选（桌面）：仅看新手友好 + 关键词过滤 + 无匹配空态 ----
  await walk(page, 'A4', 'content', DESKTOP, '筛选 · 阵容库', `${SITE}/lineups`, async step => {
    const before = await page.eval('document.querySelectorAll(".manual-card").length')
    check(step, '五套手册全列出', before === 5, `${before} 张`)
    await page.clickText('仅看新手友好')
    await sleep(500)
    const lowOnly = await page.eval('document.querySelectorAll(".manual-card").length')
    check(step, '仅看新手友好（难度=低）收窄为 3', lowOnly === 3, `${lowOnly} 张`)
    const btnActive = await page.eval('document.querySelector(".sort-tab-btn.active")?.textContent.includes("新手友好")')
    check(step, '筛选按钮呈激活态（色彩非唯一信号）', btnActive === true)
    await page.typeIn('document.querySelector(".search-input")', '三分')
    await sleep(500)
    const one = await page.eval('document.querySelectorAll(".manual-card").length')
    check(step, '关键词「三分」在新手筛选内进一步收窄为 1', one === 1, `${one} 张`)
    await page.typeIn('document.querySelector(".search-input")', '不存在手册xyz')
    await sleep(500)
    let text = await pageText(page)
    check(step, '无匹配空态如实呈现', text.includes('没有匹配的阵容手册'))
    // 组合筛选语义抽查：取消新手筛选后，「逐鹿」（难度=中）应可见——收窄条件是叠加而非互斥
    await page.eval('document.querySelector(".search-input").value = ""; document.querySelector(".search-input").dispatchEvent(new Event("input", { bubbles: true }))')
    await page.clickText('仅看新手友好')
    await sleep(500)
    await page.typeIn('document.querySelector(".search-input")', '逐鹿')
    await sleep(500)
    const zhulu = await page.eval('document.querySelectorAll(".manual-card").length')
    check(step, '取消新手筛选后「逐鹿」（难度=中）可搜到', zhulu === 1, `${zhulu} 张`)
  })

  // ---- A5 无统计 · 逐鹿手册详情（未映射来源快照）----
  await walk(page, 'A5', 'content', DESKTOP, '无统计 · 手册详情（逐鹿）', `${SITE}/lineups/zhulu-zhanshupai`, async step => {
    const text = await pageText(page)
    check(step, '「暂无统计」如实呈现（不编造热度）', text.includes('暂无统计'))
    check(step, '栏目名「最新可用快照」（不冒称当前热门）', text.includes('最新可用快照'))
    check(step, '教学正文照常可用（阶段章节在）', text.includes('阶段'))
  })

  // ---- A6+A7 课程页：收藏/学完反馈 + 情境练习作答（键盘可操作）----
  await walk(page, 'A6', 'content', DESKTOP, '收藏与练习 · 课程页', `${SITE}/learn/a-first-look`, async step => {
    const text = await pageText(page)
    check(step, '教学情境徽标（非真实对局）', text.includes('教学情境（非真实对局）'))
    check(step, '情境练习题面与候选动作呈现', text.includes('情境练习') && (await page.eval('document.querySelectorAll(".practice-opt").length')) >= 3)

    // 练习：先选错误项 → 判定与代价解释 → 重答 → 选正确项
    await page.eval('document.querySelectorAll(".practice-item")[0].querySelectorAll(".practice-opt")[1].click()')
    await sleep(400)
    let verdict = await page.eval('(document.querySelector(".practice-verdict") || {}).textContent || ""')
    check(step, '错误选项判「✗ 再想想」并给出正确动作', verdict.includes('✗') && verdict.includes('再想想'), verdict.trim().slice(0, 50))
    const reasons = await page.eval('document.querySelectorAll(".practice-reasons li").length')
    check(step, '逐项代价解释（正确原因 + 其他动作代价）', reasons >= 3, `${reasons} 条`)
    await page.eval('document.querySelector(".practice-retry").click()')
    await sleep(300)
    await page.eval('document.querySelectorAll(".practice-item")[0].querySelectorAll(".practice-opt")[0].click()')
    await sleep(400)
    verdict = await page.eval('(document.querySelector(".practice-verdict") || {}).textContent || ""')
    check(step, '正确选项判「✓ 选择正确」', verdict.includes('✓ 选择正确'), verdict.trim().slice(0, 40))
    check(step, '答案解释与来源引用呈现', (await pageText(page)).includes('来源：'))

    // 键盘可操作：未作答题目的选项按钮可聚焦（Tab 序；已作答题目按设计禁用防误触）
    await page.eval('document.querySelectorAll(".practice-item")[1].querySelectorAll(".practice-opt")[0].focus()')
    const focused = await page.eval('document.activeElement.classList.contains("practice-opt")')
    check(step, '练习选项键盘可聚焦（Tab/Enter 可操作）', focused === true)

    // 收藏本课：按钮态切换 + 明确反馈
    await page.eval('Array.from(document.querySelectorAll(".pref-btn")).find(b => b.textContent.includes("收藏本课"))?.click()')
    await sleep(400)
    const favState = await page.eval('Array.from(document.querySelectorAll(".pref-btn")).map(b => b.textContent.trim()).join(" / ")')
    check(step, '收藏切换 ★ 已收藏', favState.includes('★ 已收藏'), favState)
    const fb = await pageText(page)
    check(step, '收藏反馈文案（本地保存告知）', fb.includes('已收藏（本地保存'))
    await page.eval('Array.from(document.querySelectorAll(".pref-btn")).find(b => b.textContent.includes("标记为已学完"))?.click()')
    await sleep(400)
    const doneState = await page.eval('Array.from(document.querySelectorAll(".pref-btn")).map(b => b.textContent.trim()).join(" / ")')
    check(step, '学完标记切换 ✓', doneState.includes('✓ 已标记学完'), doneState)
  })

  // ---- A8 收藏 · 手册详情 + 反馈 ----
  await walk(page, 'A8', 'content', DESKTOP, '收藏 · 手册详情（大河图腾流）', `${SITE}/lineups/dahe-tuteng`, async step => {
    await page.eval('document.querySelector(".fav-toggle-btn")?.click()')
    await sleep(400)
    const btn = await page.eval('document.querySelector(".fav-toggle-btn")?.textContent.trim() || ""')
    check(step, '手册收藏切换 ★ 已收藏', btn.includes('★ 已收藏'), btn)
    const fb = await page.eval('(document.querySelector(".fav-feedback") || {}).textContent || ""')
    check(step, '收藏反馈（指引到新手学堂查看）', fb.includes('已收藏') && fb.includes('我的收藏'), fb.trim().slice(0, 60))
  })

  // ---- A9 我的收藏 + 进度（刷新后仍在 = 本地持久）+ 名册星标联动 ----
  await walk(page, 'A9', 'content', DESKTOP, '收藏与进度 · 我的收藏（重载后持久）', `${SITE}/learn`, async step => {
    const text = await pageText(page)
    check(step, '我的收藏分组列出 2 条（课程 + 手册）', text.includes('我的收藏') && (await page.eval('document.querySelectorAll(".fav-list .fav-row").length')) >= 2)
    check(step, '收藏条目含课程与手册名', text.includes('第一次进入游戏') && text.includes('大河图腾流'))
    check(step, '学习进度呈现（已学 1/1 阶段 A）', /已学 1\/1/.test(text), (text.match(/已学 \d+\/\d+/g) || []).join(','))
    check(step, '课程行学完标记可见', (await page.eval('document.querySelectorAll(".done-chip").length')) >= 1)
    // 名册星标联动
    await page.goto(`${SITE}/lineups`, { settleMs: 900 })
    const badge = await page.eval('document.querySelectorAll(".fav-star-badge").length')
    check(step, '阵容库卡片已收藏星标联动', badge >= 1, `${badge} 个 ★`)
  })

  // ---- A10 返回 · 路由返回保留状态（SPA 历史）----
  await walk(page, 'A10', 'content', DESKTOP, '返回 · 历史返回与状态保留', `${SITE}/learn`, async step => {
    await page.eval('document.querySelector("a[href=\\"/learn/c2-keyword-deep-dive\\"]")?.click()')
    await sleep(900)
    check(step, '进入课程 C2', (await page.eval('location.pathname')) === '/learn/c2-keyword-deep-dive')
    await page.eval('history.back()')
    await sleep(900)
    const back = await page.eval('location.pathname')
    check(step, 'history.back() 返回学堂', back === '/learn', back)
    const text = await pageText(page)
    check(step, '返回后收藏与进度仍在（不因返回丢失）', text.includes('我的收藏') && text.includes('大河图腾流'))
    // 阶段切换：课程内观看层次
    await page.goto(`${SITE}/learn/a-first-look`, { settleMs: 900 })
    const layerBtns = await page.eval('Array.from(document.querySelectorAll("button")).filter(b => /我已理解规则|第一次玩/.test(b.textContent)).map(b => b.textContent.trim())')
    check(step, '两种观看层次切换入口在', layerBtns.length >= 1, layerBtns.join(' / '))
  })

  // ---- A11 移动端关键路由无横向滚动 ----
  for (const [id, path_, label] of [
    ['A11a', '/learn', '新手学堂'],
    ['A11b', '/lineups', '阵容库'],
    ['A11c', '/lineups/zhulu-zhanshupai', '手册详情（无统计）'],
    ['A11d', '/library', '资料库']
  ]) {
    await walk(page, id, 'content', MOBILE, `移动走查 · ${label}`, `${SITE}${path_}`, async step => {
      const overflow = await page.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      check(step, '无横向滚动（360px）', overflow <= 1, `${overflow}px`)
      const text = await pageText(page)
      check(step, '内容可读（关键区块渲染）', text.length > 200)
    })
  }

  // ===========================================================================
  // 栈 B · 空库（隔离 *_test）→ 空态；再种 HISTORICAL 版本手册 → 历史版本
  // ===========================================================================
  if (!pgAvailable) {
    steps.push({ id: 'B0', stack: 'empty', name: '空库栈', assertions: [{ ok: false, label: '本地 PG 可用', detail: '不可用：空态/历史版本走查受阻' }], consoleExceptions: [], notes: [] })
    failures++
  } else {
    stackB = await bootAcceptanceStack('wanxiangqi_m54_empty_test')
    viteB = await startVite(FRONT_PORT_B, stackB.baseUrl)
    const SITE_B = viteB.base

    // ---- B1 空态（桌面 + 移动抽查）----
    await walk(page, 'B1a', 'empty', DESKTOP, '空态 · 首页与学堂', `${SITE_B}/`, async step => {
      const text = await pageText(page)
      check(step, '首页空计数如实（暂无/建设中口径）', /暂无|建设中/.test(text))
    })
    await page.goto(`${SITE_B}/learn`, { settleMs: 900 })
    {
      const step = steps[steps.length - 1]; const text = await pageText(page)
      check(step, '学堂空态「暂无课程」', text.includes('暂无课程'))
    }
    await walk(page, 'B1b', 'empty', DESKTOP, '空态 · 阵容库/资料库/版本动态', `${SITE_B}/lineups`, async step => {
      const text = await pageText(page)
      check(step, '阵容库空态如实', text.includes('暂无已发布的阵容手册'))
    })
    await page.goto(`${SITE_B}/library`, { settleMs: 900 })
    {
      const step = steps[steps.length - 1]; const text = await pageText(page)
      check(step, '资料库空态如实', text.includes('暂无已发布的'))
    }
    await page.goto(`${SITE_B}/updates`, { settleMs: 900 })
    {
      const step = steps[steps.length - 1]; const text = await pageText(page)
      check(step, '版本动态空态如实（未核实不发布）', text.includes('暂无已发布的官方更新公告'))
    }
    await walk(page, 'B1c', 'empty', MOBILE, '空态 · 移动抽查（阵容库）', `${SITE_B}/lineups`, async step => {
      const text = await pageText(page)
      check(step, '移动端空态可理解', text.includes('暂无已发布的阵容手册'))
      const overflow = await page.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      check(step, '无横向滚动', overflow <= 1, `${overflow}px`)
    })
    await walk(page, 'B1d', 'empty', DESKTOP, '空态 · 不存在课程如实 404 文案', `${SITE_B}/learn/a-first-look`, async step => {
      const text = await pageText(page)
      check(step, '课程不存在/未发布如实呈现', text.includes('不存在或尚未发布'))
    })

    // ---- B2 历史版本：种入 HISTORICAL 版本手册 → 旧版本口径标注 ----
    await stackB.pool.query(
      `INSERT INTO game_versions (version_id, official_basis, effective_at, status)
       VALUES ('v1.1.13', 'M5-4 历史版本走查种子（旧版本）', '2026-09-10T00:00:00Z', 'HISTORICAL')`)
    await stackB.pool.query(
      `INSERT INTO lineups (id, slug, display_name, one_line_summary, status)
       VALUES ('lu-hist', 'hist-old-lineup', '旧版本口径手册（走查种子）', '适用版本已被取代的示例手册', 'PUBLISHED')`)
    await stackB.pool.query(
      `INSERT INTO lineup_revisions (lineup_id, revision, game_version_id, difficulty, review_status, published_at)
       VALUES ('lu-hist', 1, 'v1.1.13', 'LOW', 'PUBLISHED', now())`)

    await walk(page, 'B2a', 'empty+hist', DESKTOP, '历史版本 · 名册旧版本标注', `${SITE_B}/lineups`, async step => {
      const text = await pageText(page)
      check(step, '旧版本手册列出并标注（旧版本口径）', text.includes('旧版本口径') && text.includes('v1.1.13'))
    })
    await walk(page, 'B2b', 'empty+hist', DESKTOP, '历史版本 · 详情页可理解', `${SITE_B}/lineups/hist-old-lineup`, async step => {
      const text = await pageText(page)
      check(step, '详情标注旧版本口径（非当前版本）', text.includes('旧版本口径，非当前版本') && text.includes('v1.1.13'))
      check(step, '修订号呈现（手册修订 r1）', text.includes('r1'))
    })
    await stopVite(viteB); viteB = null
    await stackB.cleanup(); stackB = null
  }

  // ===========================================================================
  // 栈 C · 错误态（杀后端 → API 离线）
  // ===========================================================================
  if (!pgAvailable) {
    steps.push({ id: 'C0', stack: 'error', name: '错误栈', assertions: [{ ok: false, label: '本地 PG 可用', detail: '不可用：错误态走查受阻' }], consoleExceptions: [], notes: [] })
    failures++
  } else {
    stackC = await bootAcceptanceStack('wanxiangqi_m54_err_test')
    viteC = await startVite(FRONT_PORT_C, stackC.baseUrl)
    // 后端在 vite 就绪后杀掉：所有 /api 代理失败 → 界面错误态
    await new Promise(r => stackC.server.close(r))
    stackC.server = null
    const SITE_C = viteC.base

    for (const [id, path_, mustHave] of [
      ['C1', '/', '数据源状态加载失败'],
      ['C2', '/learn', '学习路径加载失败'],
      ['C3', '/lineups', '阵容手册库加载失败'],
      ['C4', '/library', '资料库加载失败'],
      ['C5', '/updates', '版本动态加载失败']
    ]) {
      await walk(page, id, 'error', DESKTOP, `错误态 · ${path_}（API 离线）`, `${SITE_C}${path_}`, async step => {
        const text = await pageText(page)
        check(step, `错误态文案（${mustHave}）`, text.includes(mustHave))
        const retry = await page.eval('Array.from(document.querySelectorAll("button")).some(b => b.textContent.includes("重新加载"))')
        check(step, '提供「重新加载」恢复入口', retry === true)
      }, { shot: id !== 'C2' })
    }
    // 错误态移动抽查
    await walk(page, 'C6', 'error', MOBILE, '错误态 · 移动抽查（学堂）', `${SITE_C}/learn`, async step => {
      const text = await pageText(page)
      check(step, '移动端错误态可理解', text.includes('学习路径加载失败'))
    })
    await stopVite(viteC); viteC = null
    await stackC.pool.end().catch(() => {}); stackC = null
  }
} catch (err) {
  console.error('[m5-4] 致命错误：', err)
  steps.push({ id: 'FATAL', stack: '-', name: '致命错误', assertions: [{ ok: false, label: '走查完成', detail: String(err.message || err) }], consoleExceptions: [], notes: [] })
  failures++
  exitCode = 1
} finally {
  // ---- 清理 ----
  try { await page.close() } catch { /* noop */ }
  try { await chrome.close() } catch { /* noop */ }
  await stopVite(viteA); await stopVite(viteB); await stopVite(viteC)
  backend.kill('SIGTERM')
  if (stackB) { if (stackB.server) await stackB.cleanup().catch(() => {}); else await stackB.pool.end().catch(() => {}) }
  if (stackC) { if (stackC.server) await stackC.cleanup().catch(() => {}); else await stackC.pool.end().catch(() => {}) }
  await sleep(600)
}

// ===========================================================================
// 汇总留档
// ===========================================================================
const total = steps.reduce((n, s) => n + s.assertions.length, 0)
const passed = steps.reduce((n, s) => n + s.assertions.filter(a => a.ok).length, 0)
const summary = {
  ranAt: new Date().toISOString(),
  taskBook: 'docs/王者万象棋项目转型任务书_v6_阵容分析与新手教学_2026-10-03.md §10 A11',
  viewports: ['1440x900', '360x800'],
  stacks: {
    content: `wanxiangqi_v6dev → backend :${BACKEND_PORT} + vite :${FRONT_PORT_A}`,
    empty: 'wanxiangqi_m54_empty_test（bootAcceptanceStack）+ vite :5194（B2 阶段种入 HISTORICAL 手册）',
    error: 'wanxiangqi_m54_err_test（bootAcceptanceStack，vite 就绪后杀后端）+ vite :5195'
  },
  steps, total, passed, failed: failures
}
fs.writeFileSync(path.join(OUT_DIR, 'walkthrough.json'), JSON.stringify(summary, null, 2))

const md = [
  '# M5-4 浏览器验收走查记录（A11 双视口）',
  '',
  `- 时间：${summary.ranAt}`,
  '- 视口：1440×900（桌面）与 360×800（移动）',
  '- 栈：A 内容集（wanxiangqi_v6dev，11 课/5 手册/525 实体）；B 空库（隔离 *_test，后种 HISTORICAL 版本手册验证历史版本）；C 错误（杀后端 API 离线）',
  `- 结果：**${passed}/${total} 断言通过，${failures} 失败**；截图见 screenshots/`,
  '',
  ...steps.map(s => [
    `## ${s.id} ${s.name}（${s.stack} @${s.viewport}）`,
    '',
    `- 路径：${s.url}`,
    `- 断言：${s.assertions.filter(a => a.ok).length}/${s.assertions.length}`,
    ...(s.assertions.filter(a => !a.ok).map(a => `- ✗ ${a.label}（${a.detail}）`)),
    ...(s.consoleExceptions.length ? `- 前端异常：${s.consoleExceptions.map(e => e.text).join(' | ')}` : '- 前端异常：无'),
    ...s.notes.map(n => `- ${n}`),
    ''
  ]).flat()
].join('\n')
fs.writeFileSync(path.join(OUT_DIR, '走查记录.md'), md)

console.log(`\n[m5-4] 完成：${passed}/${total} 通过，${failures} 失败；产物 → ${path.relative(REPO, OUT_DIR)}`)
process.exit((failures > 0 || exitCode !== 0) ? 1 : 0)
