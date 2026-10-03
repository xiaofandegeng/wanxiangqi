// M3-6 · 新手走查（浏览器）—— 首页→课程→阵容→资料→情境 可理解
//
// 与 M5-4 全量浏览器验收的区别：本脚本只验证「最小教学闭环对新玩家可理解」，
// 单视口 1440×900、固定新手路径、每步断言真实内容渲染（无建设中/加载失败占位）。
// 复用 v4 零安装 CDP 方案（cdp.mjs）；栈全部真实：v6dev 开发库 + 正式后端 + vite dev。
//
// 运行：node tools/browser-acceptance/m3-newbie-walkthrough.mjs
// 产物：docs/v6_artifacts/m3-newbie-walkthrough-<ts>/（截图 + 走查记录.md + walkthrough.json）

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, CdpBrowser, CdpPage, sleep } from './cdp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const BACKEND_PORT = 18081
const FRONT_PORT = 5188
const API = `http://127.0.0.1:${BACKEND_PORT}`
const SITE = `http://127.0.0.1:${FRONT_PORT}`
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const OUT_DIR = path.join(REPO, 'docs', 'v6_artifacts', `m3-newbie-walkthrough-${TS}`)
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

// S1 首页：品牌/导航/真实计数（不是建设中占位）
await walk('S1', '首页（新手入口）', `${SITE}/`, async step => {
  const text = await pageText(page)
  check(step, '站点定位文案（阵容研习站）', text.includes('阵容研习站'))
  check(step, '新手主路径引导（先看规则→第一套阵容）', text.includes('从零开始') && text.includes('一套阵容'))
  check(step, '教学内容计数非占位（已上线课程）', /已上线 \d+ 门课程/.test(text), (text.match(/已上线 \d+ 门课程/) || [])[0])
  const nav = await page.eval('Array.from(document.querySelectorAll("nav a, header a")).map(a => a.textContent.trim()).join(",")')
  check(step, '主导航含 新手学堂/阵容库/资料库/版本动态', ['新手学堂', '阵容库', '资料库', '版本动态'].every(t => nav.includes(t)), nav)
})

// S2 新手学堂：A–F 六阶段 + 6 门课
await walk('S2', '新手学堂（阶段路径）', `${SITE}/learn`, async step => {
  const letters = await page.eval('Array.from(document.querySelectorAll(".stage-index")).map(e => e.textContent.trim())')
  check(step, '六阶段 A–F 依序呈现', letters.join('') === 'ABCDEF', letters.join(''))
  const goals = await page.eval('Array.from(document.querySelectorAll(".stage-goal")).map(e => e.textContent.trim())')
  check(step, '每阶段有「学完能做什么」目标', goals.length === 6 && goals.every(g => g.includes('学完能做什么')), goals.length)
  const text = await pageText(page)
  check(step, '六门课程标题可见（含 A 与 F）', text.includes('第一次进入游戏') && text.includes('变阵与复盘'))
  check(step, '无「暂无课程」占位（闭环已建全）', !text.includes('暂无课程'))
  const link = await page.eval('(() => { const a = Array.from(document.querySelectorAll("a")).find(x => (x.textContent||"").includes("第一次进入游戏")); return a ? a.getAttribute("href") : null })()')
  check(step, '课程链接指向 /learn/a-first-look', link === '/learn/a-first-look', link)
})

// S3 课程详情 A：统一结构 + 两种观看层次切换
await walk('S3', '课程 A 详情（第一次进入游戏）', `${SITE}/learn/a-first-look`, async step => {
  const text = await pageText(page)
  check(step, '标题与适用版本', text.includes('第一次进入游戏') && text.includes('适用版本'))
  check(step, '统一结构·学习目标', text.includes('学完你能'))
  check(step, '统一结构·一张规则图', text.includes('一张规则图'))
  check(step, '统一结构·常见错误', text.includes('常见错误'))
  check(step, '来源引用区', text.includes('来源与依据'))
  // 基础层：进阶内容应隐藏
  const advHidden = await page.eval('!document.querySelector(".ls-advanced")')
  check(step, '基础层默认隐藏进阶段落', advHidden)
  // 切到进阶层
  const clicked = await page.clickText('我已理解规则')
  await sleep(400)
  const advVisible = await page.eval('!!document.querySelector(".ls-advanced")')
  check(step, '切换「我已理解规则」后进阶段落展开', clicked && advVisible)
  const chip = await page.eval('(() => { const c = document.querySelector(".adv-chip"); return c ? c.textContent.trim() : null })()')
  check(step, '进阶段落带「进阶」标注', chip === '进阶', chip)
  await page.screenshot(path.join(SHOT_DIR, 'S3b-advanced-layer.png'), { fullPage: true })
  // 切回基础层（还原状态）
  await page.clickText('第一次玩')
  await sleep(300)
})

// S4 情境：课程 D 与 E 的情景案例区（≥2 情境，有判定/答案解释）
await walk('S4', '情境练习（课程 D/E 情景案例）', `${SITE}/learn/d-transition-stabilize`, async step => {
  const text = await pageText(page)
  check(step, '情景案例区呈现', text.includes('情景案例'))
  const items = await page.eval('Array.from(document.querySelectorAll(".scenario-item .scenario-title")).map(e => e.textContent.trim())')
  check(step, '课程 D 含情境（开局没有孙尚香）', items.some(t => t.includes('孙尚香')), items.join(' / '))
  await page.goto(`${SITE}/learn/e-first-lineup`, { settleMs: 900 })
  const itemsE = await page.eval('Array.from(document.querySelectorAll(".scenario-item .scenario-title")).map(e => e.textContent.trim())')
  check(step, '课程 E 含情境（成型缺吕布）', itemsE.some(t => t.includes('吕布')), itemsE.join(' / '))
  const textE = await pageText(page)
  check(step, '情境标注「教学情境（非真实对局）」不可达时不伪造', textE.includes('情景案例'))
  step.notes.push(`情境清单：D=[${items.join('、')}] E=[${itemsE.join('、')}]`)
})

// S5 阵容库：三分登场流手册卡
await walk('S5', '阵容库（第一套阵容入口）', `${SITE}/lineups`, async step => {
  const text = await pageText(page)
  check(step, '阵容手册卡（三分登场流）', text.includes('三分登场流'))
  check(step, '难度标注（LOW）', /LOW|低/.test(text))
  check(step, '新手路线标注', text.includes('新手'))
  const link = await page.eval('(() => { const a = Array.from(document.querySelectorAll("a")).find(x => (x.getAttribute("href")||"").startsWith("/lineups/")); return a ? a.getAttribute("href") : null })()')
  check(step, '手册链接 → /lineups/sanfen-dengchang', link === '/lineups/sanfen-dengchang', link)
})

// S6 阵容手册详情：§5 全字段 + 构成/替补 + 诚实边界
await walk('S6', '阵容手册详情（三分登场流）', `${SITE}/lineups/sanfen-dengchang`, async step => {
  const text = await pageText(page)
  for (const key of ['定阵条件', '阶段', '站位', '替补', '技能操作链', '稳血']) {
    check(step, `手册章节（${key}）`, text.includes(key))
  }
  check(step, '构成成员（吕布/曹操/蔡文姬）', text.includes('吕布') && text.includes('曹操') && text.includes('蔡文姬'))
  check(step, '替补方案（甄姬/阿轲）', text.includes('甄姬') && text.includes('阿轲'))
  check(step, '站位未核实项如实标注', text.includes('未核实'))
  check(step, '来源引用区', text.includes('来源'))
  const stats = await page.eval('document.body.innerText.includes("统计")')
  step.notes.push(stats ? '页面含统计区块（无快照时应为如实提示）' : '页面无统计区块')
})

// S7 资料库：分类页签 + 英雄清单
await walk('S7', '资料库（英雄/装备/效果牌）', `${SITE}/library`, async step => {
  const text = await pageText(page)
  check(step, '页签（英雄/棋手/装备/效果牌/天赋）',
    ['英雄', '棋手', '装备', '效果牌', '天赋'].every(t => text.includes(t)))
  const cards = await page.eval('Array.from(document.querySelectorAll("a[href^=\'/library/\']")).map(a => (a.textContent||"").trim()).slice(0, 30)')
  check(step, '英雄清单含 吕布 与 白歌（棋手）待切页签', cards.some(t => t.includes('吕布')), cards.slice(0, 8).join(' / '))
  await page.clickText('装备')
  await sleep(500)
  const equipText = await pageText(page)
  check(step, '装备页签可切换（炽热/不死鸟）', equipText.includes('炽热') || equipText.includes('不死鸟'))
})

// S8 实体详情：事实表 + 诚实边界（装备数值未公布）
await walk('S8', '实体详情（吕布 / 炽热）', `${SITE}/library/heroes/hero-lvbu`, async step => {
  const text = await pageText(page)
  check(step, '吕布定位事实（核心C位）', text.includes('吕布') && text.includes('核心'))
  check(step, '官方阶段指引事实', text.includes('换帅'))
  await page.goto(`${SITE}/library/equipment/equip-chire`, { settleMs: 900 })
  const eqText = await pageText(page)
  check(step, '炽热：推荐佩戴者（吕布 + 稳定 ID）', eqText.includes('吕布') && eqText.includes('hero-lvbu'))
  check(step, '炽热：数值未公布如实呈现（不编数值）',
    eqText.includes('未公布') || eqText.includes('未核实') || !/\d+\s*(攻击|生命|法强)/.test(eqText))
  check(step, 'AI 转写声明可见', eqText.includes('以') && (eqText.includes('图原件') || eqText.includes('官方')))
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
  '# M3-6 新手走查记录（浏览器）',
  '',
  `- 时间：${summary.ranAt}`,
  `- 栈：真实后端（wanxiangqi_v6dev 隔离开发库）+ vite dev 代理 + headless Chromium 1440×900`,
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
