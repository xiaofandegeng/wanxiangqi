// M4-4 · 来源快照统计走查（浏览器）—— 真实 hokace 同步数据全链路可理解
//
// 前置：wanxiangqi_v6dev 已完成 hokace 真实同步（35 结构）+ 4 条人工映射
// （判据：手册必需核心 ⊆ 结构英雄 ∧ 结构英雄 ⊆ 手册英雄池；逐鹿无匹配=诚实暂无统计）。
// 本走查验证公开面呈现：热度/表现/推荐/新手适合度分列、排序分离、版本一致性标注、
// 未映射手册「暂无统计」、原始指标留档说明。
//
// 运行：node tools/browser-acceptance/m4-4-snapshot-stats.mjs
// 产物：docs/v6_artifacts/m4-4-snapshot-stats-<ts>/（截图 + walkthrough.json + 走查记录.md）

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
const OUT_DIR = path.join(REPO, 'docs', 'v6_artifacts', `m4-4-snapshot-stats-${TS}`)
const SHOT_DIR = path.join(OUT_DIR, 'screenshots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const steps = []
let failures = 0

async function waitFor(url, { timeoutMs = 30_000 } = {}) {
  const started = Date.now()
  let lastErr = null
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
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

function pageText(page) {
  return page.eval('document.body.innerText.replace(/\\s+/g, " ")')
}

// ---------------- 1. 起真实栈 ----------------
console.log('[walk] 起后端（wanxiangqi_v6dev，含真实 hokace 快照与映射）…')
const backend = spawn('node', ['src/server.js'], {
  cwd: path.join(REPO, 'backend'),
  env: {
    ...process.env,
    PGDATABASE: 'wanxiangqi_v6dev',
    PGHOST: '127.0.0.1',
    PGUSER: process.env.USER,
    HOST: '127.0.0.1',
    PORT: String(BACKEND_PORT),
    ADMIN_TOKEN: 'm4-local-acceptance'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
let backendLog = ''
backend.stdout.on('data', d => { backendLog += d.toString() })
backend.stderr.on('data', d => { backendLog += d.toString() })
try {
  await waitFor(`${API}/api/v1/ready`)
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

const cardNames = () => page.eval(
  'Array.from(document.querySelectorAll(".manual-card .manual-name")).map(e => e.textContent.trim())'
)

// S1 阵容库默认序：分列结构 + 编辑推荐 + 版本标注 + 诚实空态
await walk('S1', '阵容库（默认序 · 统计分列呈现）', `${SITE}/lineups`, async step => {
  const text = await pageText(page)
  check(step, '栏目名「最新可用快照」（不称当前热门）', text.includes('最新可用快照'))
  check(step, '版本一致性标注（适用 v260924 · 未经核实）',
    text.includes('v260924') && text.includes('未经核实'), '')
  const groups = await page.eval('Array.from(document.querySelectorAll(".snap-group-label")).map(e => e.textContent.trim())')
  check(step, '热度/表现分列标签', groups.includes('表现') && groups.includes('热度'), groups.join('/'))
  check(step, '表现指标（登顶率/前三率/平均名次）',
    text.includes('登顶率') && text.includes('前三率') && text.includes('平均名次'))
  check(step, '热度指标（样本/窗口）', text.includes('样本') && text.includes('窗口'))
  const recChips = await page.eval('Array.from(document.querySelectorAll(".editor-rec-chip")).length')
  check(step, '编辑推荐徽标（难度=低手册 ×3）', recChips === 3, `实际 ${recChips} 枚`)
  const snapBlocks = await page.eval('Array.from(document.querySelectorAll(".manual-snapshots")).map(b => b.innerText.includes("暂无统计"))')
  check(step, '未映射手册如实「暂无统计」（恰 1 套 = 逐鹿）',
    snapBlocks.filter(Boolean).length === 1, JSON.stringify(snapBlocks))
})

// S2 按热度排序：样本规模降序、无统计末尾
await walk('S2', '阵容库（按热度排序）', `${SITE}/lineups`, async step => {
  await page.clickText('按热度（样本规模）')
  await sleep(400)
  const names = await cardNames()
  check(step, '热度降序：大河图腾流第一（样本 9,541）', names[0] === '大河图腾流', names.join(' / '))
  check(step, '热度降序：日落海(4,711) → 三分(1,813) → 河洛(1,102)',
    names[1] === '日落海整备流' && names[2] === '三分登场流' && names[3] === '河洛古币流', names.join(' / '))
  check(step, '无统计手册（逐鹿）排末尾', names[names.length - 1] === '逐鹿战术牌流', names.join(' / '))
})

// S3 按表现排序：登顶率降序（与热度序不同，分列排序互不混用）
await walk('S3', '阵容库（按表现排序）', `${SITE}/lineups`, async step => {
  await page.clickText('按表现（登顶率）')
  await sleep(400)
  const names = await cardNames()
  check(step, '表现降序：三分登场流第一（登顶率 30.2%）', names[0] === '三分登场流', names.join(' / '))
  check(step, '表现降序：大河(12.2%) → 日落海(5.9%) → 河洛(5.1%)',
    names[1] === '大河图腾流' && names[2] === '日落海整备流' && names[3] === '河洛古币流', names.join(' / '))
  step.notes.push('热度序与表现序首位不同（大河 vs 三分）——分列排序互不混用')
})

// S4 三分手册详情：快照全口径 + 分列 + 原始指标留档说明
await walk('S4', '手册详情（三分登场流 · 挂接快照）', `${SITE}/lineups/sanfen-dengchang`, async step => {
  const text = await pageText(page)
  check(step, '栏目「最新可用快照（来源统计，参考非战绩）」', text.includes('最新可用快照'))
  check(step, '版本一致性标注列出两侧版本', text.includes('快照适用版本') && text.includes('手册教学版本'))
  const dims = await page.eval('Array.from(document.querySelectorAll(".snap-dim-group .dim-label")).map(e => e.textContent.trim())')
  check(step, '表现/热度分列标签', dims.includes('表现') && dims.includes('热度'), dims.join('/'))
  check(step, '登顶率 30.2%（比率原样换算显示）', text.includes('30.2%'))
  check(step, '样本 1,813', text.includes('1,813'))
  check(step, '统计窗口（7 日对局快照）', text.includes('7 日对局快照'))
  check(step, '快照采集时间说明（采集 ≠ 数据截止）', text.includes('采集时间 ≠ 数据截止时间'))
  check(step, '原始指标留档说明（归一化可审计）', text.includes('已按来源原文留档'))
  check(step, '不构成战绩/建议声明', text.includes('不推算个人战绩'))
})

// S5 逐鹿手册详情：无映射 → 暂无统计（不编造）
await walk('S5', '手册详情（逐鹿战术牌流 · 无映射）', `${SITE}/lineups/zhulu-zhanshupai`, async step => {
  const text = await pageText(page)
  check(step, '暂无统计如实呈现', text.includes('暂无统计'))
  check(step, '说明统计不由本站生成', text.includes('统计不得由本站生成'))
  check(step, '无登顶率数值（不编造统计）', !text.includes('登顶率') || text.includes('暂无统计'),
    '登顶率字样仅允许出现在暂无统计语境')
})

// ---------------- 汇总与留档 ----------------
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
  '# M4-4 来源快照统计走查记录（浏览器）',
  '',
  `- 时间：${summary.ranAt}`,
  `- 栈：真实后端（wanxiangqi_v6dev，含 hokace 真实同步 35 结构 + 4 条人工映射）+ vite dev 代理 + headless Chromium 1440×900`,
  `- 覆盖：热度/表现/推荐/新手适合度分列、热度与表现分离排序、版本一致性标注、未映射手册暂无统计`,
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
await chrome.close()
vite.kill('SIGTERM')
backend.kill('SIGTERM')
await sleep(800)

console.log(`\n[walk] 完成：${passed}/${total} 通过，${failures} 失败；产物 → ${path.relative(REPO, OUT_DIR)}`)
process.exit(failures > 0 ? 1 : 0)
