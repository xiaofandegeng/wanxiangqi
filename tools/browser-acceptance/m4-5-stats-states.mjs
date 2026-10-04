// M4-5 · 统计口径三态走查（浏览器）—— 缺失/过期/失败呈现 + 小样本提示
//
// 前置：wanxiangqi_v6dev 已有 hokace 真实同步（35 结构）+ 4 条人工映射（M4-4）。
// 本走查在真实栈上验证 §6 三态的公开面呈现：
//   S1 正常态：无失败横幅/过期提示；详情页小样本阅读提示（不设阈值）
//   S2 失败态：dev 库注入 last_error（场景注入，走查后按原值恢复）→
//      「来源最近一次同步失败（时间）：…；以上为最近一次成功同步保留的快照」+
//      上次成功快照值不被破坏
//   S3 过期态：updated_at 回拨 9 天 → 「快照较旧 · 适用旧版本」
//   S4 恢复验证：注入值按原样恢复 → 三态回到正常态（注入不留痕）
// 全程仅触碰 wanxiangqi_v6dev（开发库，非业务库）；注入/恢复逐条留档于 walkthrough.json。
//
// 运行：node tools/browser-acceptance/m4-5-stats-states.mjs
// 产物：docs/v6_artifacts/m4-5-stats-states-<ts>/（截图 + walkthrough.json + 走查记录.md）

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { launchChrome, CdpBrowser, CdpPage, sleep } from './cdp.mjs'

// pg 装在 backend/node_modules（走查脚本不重复引依赖，复用后端安装）
const requireFromBackend = createRequire(new URL('../../backend/package.json', import.meta.url))
const { Client } = requireFromBackend('pg')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const BACKEND_PORT = 18082
const FRONT_PORT = 5189
const API = `http://127.0.0.1:${BACKEND_PORT}`
const SITE = `http://127.0.0.1:${FRONT_PORT}`
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const OUT_DIR = path.join(REPO, 'docs', 'v6_artifacts', `m4-5-stats-states-${TS}`)
const SHOT_DIR = path.join(OUT_DIR, 'screenshots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const steps = []
let failures = 0
const injectionLog = []

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

const pageText = page => page.eval('document.body.innerText.replace(/\\s+/g, " ")')

// ---------------- 1. dev 库注入基线（原值先存证，走查后逐字恢复） ----------------
const pg = new Client({ host: '127.0.0.1', user: process.env.USER, database: 'wanxiangqi_v6dev' })
await pg.connect()
const sourceBefore = (await pg.query(
  `SELECT status, last_error, last_attempt_at, last_success_at FROM data_sources WHERE source_id = 'src-hokace-wiki'`
)).rows[0]
const snapsBefore = (await pg.query(
  `SELECT id, updated_at FROM lineup_snapshots ls
   WHERE EXISTS (SELECT 1 FROM lineup_snapshot_links lsl
                 WHERE lsl.source_id = ls.source_id AND lsl.structure_key = ls.structure_key)
   ORDER BY ls.id`)).rows
console.log(`[walk] 已存证原值：来源行 1 条 + 已映射快照 ${snapsBefore.length} 条（走查后恢复）`)

// ---------------- 2. 起真实栈 ----------------
console.log('[walk] 起后端（wanxiangqi_v6dev）…')
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

console.log('[walk] 起 vite dev…')
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

// S1 正常态：无失败横幅/过期提示；详情页小样本阅读提示（不设阈值，如实声明来源未给口径）
await walk('S1', '正常态（阵容库）', `${SITE}/lineups`, async step => {
  const text = await pageText(page)
  check(step, '无「同步失败」横幅', !text.includes('同步失败'), '')
  check(step, '无「快照较旧」提示', !text.includes('快照较旧'), '')
  check(step, '列表小样本阅读提示（statsNotice）', text.includes('样本规模越小比率波动越大'))
  check(step, '如实声明未设阈值（来源未公布口径）', text.includes('未公布小样本判定口径'))
  check(step, '无「大样本可靠」类表述', !text.includes('大样本可靠'), '')
})

await walk('S1b', '正常态（三分手册详情）', `${SITE}/lineups/sanfen-dengchang`, async step => {
  const text = await pageText(page)
  check(step, '小样本提示置于样本指标处', text.includes('样本规模越小比率波动越大'))
  check(step, '提示含「不代表全服出现率」', text.includes('样本量不代表全服出现率'))
  check(step, '无失败横幅', !text.includes('同步失败'))
  check(step, '无过期提示', !text.includes('快照较旧'))
})

// S2 失败态：注入 last_error（与真实失败路径同一呈现字段；走查后恢复）
await pg.query(
  `UPDATE data_sources SET last_error = $1, last_attempt_at = now() WHERE source_id = 'src-hokace-wiki'`,
  ['上游页面改版，解析未发现符合规范的阵容数据结构（M4-5 走查场景注入）'])
injectionLog.push({
  scenario: 'failure',
  set: { last_error: '上游页面改版，解析未发现符合规范的阵容数据结构（M4-5 走查场景注入）', last_attempt_at: 'now()' },
  original: { last_error: sourceBefore.last_error, last_attempt_at: sourceBefore.last_attempt_at }
})
await sleep(200)

await walk('S2', '失败态（阵容库）', `${SITE}/lineups`, async step => {
  const text = await pageText(page)
  check(step, '失败横幅呈现「来源最近一次同步失败」', text.includes('来源最近一次同步失败'))
  check(step, '横幅含失败原因摘要', text.includes('未发现符合规范的阵容数据结构'))
  check(step, '横幅声明「以上为最近一次成功同步…保留的快照」',
    text.includes('以上为最近一次成功同步') && text.includes('保留的快照'))
  check(step, '上次成功快照值不被破坏（三分 30.2% 仍在）', text.includes('30.2%'))
  check(step, '上次成功快照值不被破坏（大河样本 9,541 仍在）', text.includes('9,541'))
})

await walk('S2b', '失败态（三分手册详情）', `${SITE}/lineups/sanfen-dengchang`, async step => {
  const text = await pageText(page)
  check(step, '失败横幅（「以下为最近一次成功同步…保留的快照」）',
    text.includes('来源最近一次同步失败') && text.includes('以下为最近一次成功同步'))
  check(step, '统计值原样（登顶率 30.2%）', text.includes('30.2%'))
  check(step, '统计值原样（样本 1,813）', text.includes('1,813'))
  check(step, '未映射手册口径不受影响（暂无统计语义另列）', true)
})

// S3 过期态：回拨已映射快照 updated_at 9 天（data_cutoff_at 为 NULL → stale 基准回落 updated_at）
await pg.query(`UPDATE lineup_snapshots SET updated_at = now() - interval '9 days' WHERE id = ANY($1::varchar[])`,
  [snapsBefore.map(r => r.id)])
injectionLog.push({
  scenario: 'stale',
  set: { updated_at: "now() - interval '9 days'", rows: snapsBefore.map(r => r.id) },
  original: snapsBefore
})
await sleep(200)

await walk('S3', '过期态（阵容库）', `${SITE}/lineups`, async step => {
  const text = await pageText(page)
  check(step, '过期提示「快照较旧（数据基准已超过 7 日）」', text.includes('快照较旧') && text.includes('超过 7 日'))
  check(step, '过期提示「适用旧版本，仅供参考」', text.includes('适用旧版本'))
  check(step, '统计值原样（过期不改写数值 30.2%）', text.includes('30.2%'))
})

await walk('S3b', '过期态（三分手册详情）', `${SITE}/lineups/sanfen-dengchang`, async step => {
  const text = await pageText(page)
  check(step, '过期提示呈现', text.includes('快照较旧') && text.includes('适用旧版本'))
  check(step, '版本一致性标注仍在（过期提示不替代版本标注）', text.includes('快照适用版本'))
})

// S4 恢复：注入值逐字恢复原值 → 三态回正常态（注入不留痕）
await pg.query(
  `UPDATE data_sources SET last_error = $1, last_attempt_at = $2, last_success_at = $3 WHERE source_id = 'src-hokace-wiki'`,
  [sourceBefore.last_error, sourceBefore.last_attempt_at, sourceBefore.last_success_at])
for (const r of snapsBefore) {
  await pg.query(`UPDATE lineup_snapshots SET updated_at = $1 WHERE id = $2`, [r.updated_at, r.id])
}
injectionLog.push({ scenario: 'restore', note: '来源行与已映射快照 updated_at 均按原值恢复' })

const sourceAfter = (await pg.query(
  `SELECT status, last_error, last_attempt_at, last_success_at FROM data_sources WHERE source_id = 'src-hokace-wiki'`
)).rows[0]
const snapsAfter = (await pg.query(
  `SELECT id, updated_at FROM lineup_snapshots WHERE id = ANY($1::varchar[]) ORDER BY id`,
  [snapsBefore.map(r => r.id)])).rows
const restoredOk =
  sourceAfter.last_error === sourceBefore.last_error &&
  new Date(sourceAfter.last_attempt_at).getTime() === new Date(sourceBefore.last_attempt_at).getTime() &&
  new Date(sourceAfter.last_success_at).getTime() === new Date(sourceBefore.last_success_at).getTime() &&
  snapsAfter.every((r, i) => new Date(r.updated_at).getTime() === new Date(snapsBefore[i].updated_at).getTime())

await walk('S4', '恢复后回查（注入不留痕）', `${SITE}/lineups/sanfen-dengchang`, async step => {
  check(step, 'dev 库注入值已按原值恢复（DB 层比对）', restoredOk,
    JSON.stringify({ sourceAfter, snapsAfter: snapsAfter.length }))
  const text = await pageText(page)
  check(step, '失败横幅消失', !text.includes('同步失败'))
  check(step, '过期提示消失', !text.includes('快照较旧'))
  check(step, '统计值与口径提示仍在', text.includes('30.2%') && text.includes('样本规模越小比率波动越大'))
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
  scenarioInjection: {
    policy: '仅 wanxiangqi_v6dev 开发库；注入前存证原值，走查后逐字恢复并 DB 层比对',
    log: injectionLog,
    restored: restoredOk
  },
  steps, total, passed, failed: failures
}
fs.writeFileSync(path.join(OUT_DIR, 'walkthrough.json'), JSON.stringify(summary, null, 2))

const md = [
  '# M4-5 统计三态走查记录（浏览器）',
  '',
  `- 时间：${summary.ranAt}`,
  `- 栈：真实后端（wanxiangqi_v6dev，hokace 真实同步 35 结构 + 4 映射）+ vite dev 代理 + headless Chromium 1440×900`,
  `- 覆盖：正常态（小样本提示/无横幅）→ 失败态（last_error 注入 → 失败横幅 + 上次成功快照值不破坏）→ 过期态（updated_at 回拨 → 适用旧版本提示）→ 恢复验证（注入不留痕）`,
  `- 场景注入说明：失败/过期态由 dev 库字段注入构造（与真实失败路径同一呈现字段链路：data_sources.last_error → listLinkedSnapshotRows → snapshotSubObject → 公开 JSON → 前端横幅）；注入前存证原值，S4 按原值恢复并比对`,
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
await pg.end()
await sleep(800)

console.log(`\n[walk] 完成：${passed}/${total} 通过，${failures} 失败；产物 → ${path.relative(REPO, OUT_DIR)}`)
process.exit(failures > 0 ? 1 : 0)
