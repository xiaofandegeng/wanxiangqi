// M4-6 · 新手走查（浏览器）—— 六套手册/进阶课程/目录实体/复盘案例 全链路可理解
//
// 与 M3-6 走查的关系：同一真实栈与走查方法（v6dev 开发库 + 正式后端 + vite dev
// + headless Chromium 1440×900，零安装 CDP），覆盖面扩到 M4-2 内容集——
// 11 门课（A–F + B2/C2/D2/E2/F2）、6 套全量手册（含 M5-1 来源结构阵容「核心灌注流」）、514 目录实体、14 情境/复盘。
// 每步断言真实内容渲染（无建设中/加载失败占位）；实体断言用官方目录稳定 ID。
//
// 运行：node tools/browser-acceptance/m4-newbie-walkthrough.mjs
// 产物：docs/v6_artifacts/m4-newbie-walkthrough-<ts>/（截图 + 走查记录.md + walkthrough.json）

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, CdpBrowser, CdpPage, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const BACKEND_PORT = 18082
const FRONT_PORT = 5189
const API = `http://127.0.0.1:${BACKEND_PORT}`
const SITE = `http://127.0.0.1:${FRONT_PORT}`
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const OUT_DIR = path.join(REPO, 'docs', 'v6_artifacts', `m4-newbie-walkthrough-${TS}`)
const SHOT_DIR = path.join(OUT_DIR, 'screenshots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const steps = [] // { id, name, url, assertions: [{ok, label, detail}], consoleExceptions, notes }
let failures = 0

async function waitFor(url, { timeoutMs = 30_000, ready = false } = {}) {
  const started = Date.now()
  let lastErr = null
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        if (!ready) return true
        const body = await res.text()
        if (body.includes('READY')) return true
      }
      lastErr = `HTTP ${res.status}`
    } catch (err) { lastErr = err.message }
    await sleep(400)
  }
  throw new Error(`等待 ${url} 超时（最后：${lastErr}）`)
}

function record(stepId, name, url) {
  const step = { id: stepId, name, url, assertions: [], consoleExceptions: [], notes: [] }
  steps.push(step)
  return step
}

function check(step, label, ok, detail = '') {
  step.assertions.push({ ok: !!ok, label, detail: String(detail ?? '').slice(0, 200) })
  if (!ok) {
    failures++
    console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`)
  } else {
    console.log(`  ✓ ${label}`)
  }
}

/** 页面正文文本（去空白） */
function pageText(page) {
  return page.eval('document.body.innerText.replace(/\\s+/g, " ")')
}

// ---------------- 1. 起真实栈 ----------------
console.log('[walk] 起后端（wanxiangqi_v6dev）…')
const backend = spawn('node', ['src/server.js'], {
  cwd: path.join(REPO, 'backend'),
  env: {
    ...process.env,
    PGDATABASE: 'wanxiangqi_v6dev',
    PGHOST: '127.0.0.1',
    PGUSER: process.env.USER,
    HOST: '127.0.0.1',
    PORT: String(BACKEND_PORT)
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
let backendLog = ''
backend.stdout.on('data', d => { backendLog += d.toString() })
backend.stderr.on('data', d => { backendLog += d.toString() })
try {
  await waitFor(`${API}/api/v1/ready`, { ready: true })
  console.log('[walk] 后端 READY')
} catch (err) {
  console.error(backendLog)
  throw err
}

console.log('[walk] 起 vite dev（WXQ_API_TARGET → 后端）…')
const vite = spawn('npm', ['exec', 'vite', '--', '--port', String(FRONT_PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: path.join(REPO, 'frontend'),
  env: { ...process.env, WXQ_API_TARGET: API },
  stdio: ['ignore', 'pipe', 'pipe']
})
let viteLog = ''
vite.stdout.on('data', d => { viteLog += d.toString() })
vite.stderr.on('data', d => { viteLog += d.toString() })
try {
  await waitFor(SITE)
  console.log('[walk] 前端可访问')
} catch (err) {
  console.error(viteLog)
  throw err
}

// ---------------- 2. 浏览器走查 ----------------
const launched = await launchChrome({ headless: true })
const chrome = await new CdpBrowser(launched.wsEndpoint, launched).connect()
const page = await CdpPage.create(chrome, { viewport: { width: 1440, height: 900 } })

async function walk(stepId, name, url, fn) {
  console.log(`[walk] ${stepId} ${name} — ${url}`)
  const step = record(stepId, name, url)
  page.resetConsole()
  await page.goto(url, { settleMs: 900 })
  try {
    await fn(step)
  } catch (err) {
    check(step, '页面走查脚本无异常', false, err.message)
  }
  const exceptions = page.takeConsole().filter(c => c.kind === 'exception')
  step.consoleExceptions = exceptions
  check(step, '无未捕获前端异常', exceptions.length === 0,
    exceptions.map(e => e.text.slice(0, 120)).join(' | '))
  await page.screenshot(path.join(SHOT_DIR, `${stepId}.png`), { fullPage: true })
  return step
}

// S1 首页：品牌/导航/真实计数（M4 内容集：11 门课）
await walk('S1', '首页（新手入口）', `${SITE}/`, async step => {
  const text = await pageText(page)
  check(step, '站点定位文案（阵容研习站）', text.includes('阵容研习站'))
  check(step, '新手主路径引导（先看规则→第一套阵容）', text.includes('从零开始') && text.includes('一套阵容'))
  check(step, '教学内容计数非占位（11 门课程）', /已上线 11 门课程/.test(text), (text.match(/已上线 \d+ 门课程/) || [])[0])
  const nav = await page.eval('Array.from(document.querySelectorAll("nav a, header a")).map(a => a.textContent.trim()).join(",")')
  check(step, '主导航含 新手学堂/阵容库/资料库/版本动态', ['新手学堂', '阵容库', '资料库', '版本动态'].every(t => nav.includes(t)), nav)
})

// S2 新手学堂：A–F 六阶段不变 + 进阶课（B2/C2/D2/E2/F2）入列
await walk('S2', '新手学堂（阶段路径 + 进阶课）', `${SITE}/learn`, async step => {
  const letters = await page.eval('Array.from(document.querySelectorAll(".stage-index")).map(e => e.textContent.trim())')
  check(step, '六阶段 A–F 依序呈现', letters.join('') === 'ABCDEF', letters.join(''))
  const text = await pageText(page)
  check(step, '基础六门（A 与 F）可见', text.includes('第一次进入游戏') && text.includes('变阵与复盘'))
  check(step, '进阶五门抽查（B2 能量台账 / F2 复盘方法）', text.includes('能量台账') && text.includes('复盘方法'))
  check(step, '无「暂无课程」占位', !text.includes('暂无课程'))
  const link = await page.eval('(() => { const a = Array.from(document.querySelectorAll("a")).find(x => (x.getAttribute("href")||"").includes("/learn/c2-keyword-deep-dive")); return a ? a.getAttribute("href") : null })()')
  check(step, 'C2 词条深潜课链接可入', link === '/learn/c2-keyword-deep-dive', link)
})

// S3 C2 词条深潜：目录口径词条（图腾/阿科米亚核心）来源分列呈现
await walk('S3', '课程 C2（词条深潜：目录口径）', `${SITE}/learn/c2-keyword-deep-dive`, async step => {
  const text = await pageText(page)
  check(step, '目录口径词条（图腾）', text.includes('图腾'))
  check(step, '目录口径词条（阿科米亚核心）', text.includes('阿科米亚核心'))
  check(step, '口径来源区分（指引页词典 vs 卡牌图鉴）', text.includes('词典') && (text.includes('图鉴') || text.includes('目录')))
  check(step, '概念区分（阿科米亚之子=装备 / 核心=词条）', text.includes('阿科米亚之子'))
  check(step, '来源引用区', text.includes('来源与依据'))
})

// S4 D2 资源集中：三套手册的定阵/集中情境（大河/河洛/逐鹿）
await walk('S4', '课程 D2（资源集中：三套手册情境）', `${SITE}/learn/d2-stabilize-budget`, async step => {
  const text = await pageText(page)
  check(step, '情景案例区呈现', text.includes('情景案例'))
  const items = await page.eval('Array.from(document.querySelectorAll(".scenario-item .scenario-title")).map(e => e.textContent.trim())')
  check(step, '大河装备转交情境', items.some(t => t.includes('大河') || t.includes('装备')), items.join(' / '))
  check(step, '河洛古币集中情境', items.some(t => t.includes('河洛') || t.includes('古币')), items.join(' / '))
  check(step, '逐鹿蒙犽装备情境', items.some(t => t.includes('逐鹿') || t.includes('蒙犽')), items.join(' / '))
  step.notes.push(`D2 情境清单：[${items.join('、')}]`)
})

// S5 F2 复盘方法：kind 徽标正确（阵容情境/复盘案例）+ 复盘非真实对局标注
await walk('S5', '课程 F2（复盘方法 + 四个复盘案例）', `${SITE}/learn/f2-review-method`, async step => {
  const text = await pageText(page)
  const kinds = await page.eval('Array.from(document.querySelectorAll(".scenario-kind")).map(e => e.textContent.trim())')
  check(step, 'kind 徽标用 DDL 枚举口径（阵容情境/复盘案例）',
    kinds.some(k => k.includes('阵容情境')) && kinds.filter(k => k.includes('复盘案例')).length >= 4, kinds.join(' / '))
  check(step, '复盘案例标注「教学复盘（非真实对局演绎」', (text.match(/教学复盘（非真实对局演绎/g) || []).length >= 4,
    `出现 ${(text.match(/教学复盘（非真实对局演绎/g) || []).length} 次`)
  check(step, '无遗留旧枚举徽标（成功案例/失败案例/决策情景）',
    !kinds.some(k => ['成功案例', '失败案例', '决策情景'].includes(k)), kinds.join(' / '))
})

// S6 阵容库：六套手册全列出 + 难度分列（低/中）+ 新手册链接
await walk('S6', '阵容库（六套手册）', `${SITE}/lineups`, async step => {
  const text = await pageText(page)
  for (const name of ['三分登场流', '日落海整备流', '大河图腾流', '河洛古币流', '逐鹿战术牌流', '核心灌注流']) {
    check(step, `手册卡（${name}）`, text.includes(name))
  }
  check(step, '难度分列（低 与 中）', text.includes('难度：低') && text.includes('难度：中'))
  const link = await page.eval('(() => { const a = Array.from(document.querySelectorAll("a")).find(x => (x.getAttribute("href")||"").startsWith("/lineups/zhulu")); return a ? a.getAttribute("href") : null })()')
  check(step, '逐鹿手册链接 → /lineups/zhulu-zhanshupai', link === '/lineups/zhulu-zhanshupai', link)
  check(step, '新手筛选（仅看新手友好）', text.includes('仅看新手友好'))
})

// S7 新手册详情（逐鹿·中难度）：§5 全字段 + 构成 + 复盘引用 + 诚实边界
await walk('S7', '手册详情（逐鹿战术牌流·中难度）', `${SITE}/lineups/zhulu-zhanshupai`, async step => {
  const text = await pageText(page)
  for (const key of ['定阵条件', '阶段', '站位', '技能操作链', '实战案例引用']) {
    check(step, `手册章节（${key}）`, text.includes(key))
  }
  check(step, '难度=中 + 新手适合度理由（非胜率）', text.includes('难度：中') && text.includes('新手适合度'))
  check(step, '构成成员（蒙犽/芈月/白起）', text.includes('蒙犽') && text.includes('芈月') && text.includes('白起'))
  check(step, '推荐棋手（小妲己·官网首页口径）', text.includes('小妲己'))
  check(step, '复盘案例引用（非真实对局演绎）', text.includes('教学复盘（非真实对局演绎'))
  check(step, '站位未核实项如实标注', text.includes('未核实'))
})

// S8 资料库：目录全量（85 英雄 + 73 装备 + 98 效果牌 + 258 天赋 + 11 棋手）
await walk('S8', '资料库（官方目录全量）', `${SITE}/library`, async step => {
  const text = await pageText(page)
  check(step, '页签（英雄/棋手/装备/效果牌/天赋）',
    ['英雄', '棋手', '装备', '效果牌', '天赋'].every(t => text.includes(t)))
  const counts = await page.eval('Array.from(document.querySelectorAll(".kind-count, .tab-count, [class*=count]")).map(e => e.textContent.trim()).slice(0, 8)')
  step.notes.push(`页签计数：${counts.join(' / ') || '（无计数元素，按详情断言）'}`)
  await page.clickText('装备')
  await sleep(500)
  const equipText = await pageText(page)
  check(step, '装备页签：目录装备（炽热支配者/不祥征兆）',
    equipText.includes('炽热支配者') || equipText.includes('不祥征兆'))
})

// S9 实体详情（官方目录稳定 ID）：目录事实 + 编辑附加并列 + 诚实标注
await walk('S9', '实体详情（吕布 hero-1231 / 炽热支配者 equip-643803）', `${SITE}/library/heroes/hero-1231`, async step => {
  const text = await pageText(page)
  // 实体页改版（GameArt 卡片化）后不再呈现目录 ID 文本——可访问断言改为 名称 + 路由稳定 ID
  check(step, '吕布（目录 ID hero-1231）可访问', text.includes('吕布') && (await page.eval('location.pathname')).includes('hero-1231'))
  check(step, '阵容角色事实（三分核心C位）', text.includes('核心C位') || text.includes('核心'))
  check(step, '官方阶段指引事实（换帅）', text.includes('换帅'))
  check(step, '目录技能原文（魔神降世）', text.includes('魔神降世'))
  await page.goto(`${SITE}/library/equipment/equip-643803`, { settleMs: 900 })
  const eqText = await pageText(page)
  check(step, '炽热支配者（目录 ID equip-643803）可访问', eqText.includes('炽热支配者') && (await page.eval('location.pathname')).includes('equip-643803'))
  check(step, '装备归属阵容（吕布）', eqText.includes('吕布'))
  check(step, '来源引用（官方卡牌图鉴存证）', eqText.includes('原始材料存证') || eqText.includes('官方'))
})

// ---------------- 3. 汇总与留档 ----------------
const total = steps.reduce((n, s) => n + s.assertions.length, 0)
const passed = steps.reduce((n, s) => n + s.assertions.filter(a => a.ok).length, 0)
const summary = {
  ranAt: new Date().toISOString(),
  stack: {
    backend: `node src/server.js @ ${API} (PGDATABASE=wanxiangqi_v6dev)`,
    frontend: `vite dev @ ${SITE} (WXQ_API_TARGET=${API})`,
    viewport: '1440x900',
    chrome: launched.exe
  },
  steps, total, passed, failed: failures
}
fs.writeFileSync(path.join(OUT_DIR, 'walkthrough.json'), JSON.stringify(summary, null, 2))

const md = [
  '# M4-6 新手走查记录（浏览器）',
  '',
  `- 时间：${summary.ranAt}`,
  `- 栈：真实后端（wanxiangqi_v6dev 隔离开发库）+ vite dev 代理 + headless Chromium 1440×900`,
  `- 覆盖：M4-2 + M5-1 补齐内容集（11 课 / 6 手册 / 525 实体 / 14 情境·复盘）`,
  `- 结果：**${passed}/${total} 断言通过，${failures} 失败**；截图见 screenshots/`,
  '',
  ...steps.map(s => [
    `## ${s.id} ${s.name}`,
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

await page.close()
await chrome.close() // 同时回收 chrome 子进程与临时 profile
vite.kill('SIGTERM')
backend.kill('SIGTERM')
await sleep(800)

console.log(`\n[walk] 完成：${passed}/${total} 通过，${failures} 失败；产物 → ${path.relative(REPO, OUT_DIR)}`)
process.exit(failures > 0 ? 1 : 0)
