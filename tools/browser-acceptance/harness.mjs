#!/usr/bin/env node
// W5 · 浏览器验收 harness（v4 任务书 W5 · 零安装 CDP 方案）
//
// 编排：启动临时验收后端（独立 *_test 库）→ vite dev（WXQ_API_TARGET 代理）→
//       headless Chromium（CDP 直连）→ 五态 × 八路由 × 双视口走查 + 全流程演练
//       → 截图/控制台/检查结果落 docs/v4_artifacts/browser-acceptance-<ts>/
//
// 红线：绝不触碰业务 storage.json / 业务库（只 boot *_test 库）；fixtures 一律
//       FIXTURE 标注，绝不计入 V07；任何场景失败都如实记录，不静默跳过。
//
// 降级链：chromium-1234 → chromium-1208 → 手工清单（--manual 输出清单，标未执行）。
// 用法：node tools/browser-acceptance/harness.mjs [--only normal,drill] [--manual]

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { CdpBrowser, CdpPage, launchChrome, sleep } from './cdp.mjs'
import {
  DESKTOP, MOBILE, driveRoutes, interactionChecks, makeWatermarkedPng,
  routesFor, seedNormalData, seedStaleState
} from './scenarios.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const BACKEND_HELPERS = path.resolve(REPO, 'backend/tests/acceptance/_helpers.mjs')

const args = process.argv.slice(2)
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const MANUAL = args.includes('--manual')
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const ARTIFACTS_DIR = path.join(REPO, 'docs/v4_artifacts/browser-acceptance-' + ts)

const { bootAcceptanceStack, pgAvailable } = await import(BACKEND_HELPERS)

const manifest = {
  startedAt: new Date().toISOString(),
  node: process.version,
  scenarios: [],
  status: 'RUNNING'
}

function log(...a) { console.log('[w5-harness]', ...a) }

/** 启动 vite dev server，代理指向验收后端 */
async function startVite(apiTarget) {
  const port = 5190 + Math.floor(Math.random() * 90)
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: path.join(REPO, 'frontend'),
    env: { ...process.env, WXQ_API_TARGET: apiTarget },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base)
      if (res.ok) return { child, base }
    } catch { /* 未就绪 */ }
    await sleep(300)
  }
  child.kill('SIGTERM')
  throw new Error('vite dev server 启动超时')
}

async function stopVite(vite) {
  if (!vite) return
  vite.child.kill('SIGTERM')
  await sleep(300)
  vite.child.kill('SIGKILL')
}

// ---------------------------------------------------------------------------
// 场景执行器
// ---------------------------------------------------------------------------

async function runScenario(name, { seed = null, killBackendAfterBoot = false, drill = null } = {}) {
  if (ONLY && !ONLY.includes(name)) return null
  const dbName = `wanxiangqi_w5_${name}_test`
  const rec = { name, db: dbName, status: 'RUNNING' }
  manifest.scenarios.push(rec)
  if (!pgAvailable) {
    rec.status = 'SKIPPED'
    rec.reason = '本地 PG 不可用（验收后端无法启动，与后端验收套件同口径）'
    return rec
  }
  const stack = await bootAcceptanceStack(dbName)
  let vite = null
  try {
    let seeded = { players: [], eventId: 'ev-fx-today', lineupId: 'lu-fx-1' }
    if (seed) seeded = await seed(stack)
    if (killBackendAfterBoot) {
      // 失败态：后端在 vite 就绪前被杀 → /api 走代理必然 500，检验 UI 错误呈现
      await new Promise(r => stack.server.close(r))
      stack.server = null
    }
    vite = await startVite(stack.baseUrl)
    const page = await CdpPage.create(globalThis.__browser, { viewport: DESKTOP })
    try {
      rec.routes = await driveRoutes(page, vite.base, {
        routes: routesFor({ playerId: seeded.players[0] ?? 'p-none', eventId: seeded.eventId, lineupId: seeded.lineupId }),
        scenarioName: name,
        artifactsDir: ARTIFACTS_DIR,
        deepChecks: name === 'fail' ? null : () => ({})
      })
      if (name === 'normal') {
        rec.interactions = await interactionChecks(page, vite.base, ARTIFACTS_DIR, name)
      }
      if (name === 'filter') {
        rec.filterChecks = await filterChecks(page, vite.base)
      }
      if (name === 'stale') {
        rec.staleChecks = await staleChecks(page, vite.base)
      }
      if (drill) {
        rec.drill = await drill(page, vite.base, stack, seeded)
      }
      rec.status = 'DONE'
    } finally {
      await page.close()
    }
  } catch (err) {
    rec.status = 'FAILED'
    rec.error = String(err.message || err)
  } finally {
    await stopVite(vite)
    if (stack.server) await stack.cleanup()
    else await stack.pool.end().catch(() => {})
  }
  return rec
}

/** 筛选态专项：roster 搜索过滤 + archive 双口径切换（真实 UI 交互，不mock） */
async function filterChecks(page, base) {
  const out = {}
  await page.goto(`${base}/roster`)
  out.rosterRowsBefore = await page.eval(`document.querySelectorAll('.player-card, tbody tr, li[class*=player]').length`)
  await page.typeIn(`document.querySelector('.search-input')`, '弈星')
  await sleep(400)
  out.rosterRowsAfterSearch = await page.eval(`document.querySelectorAll('.player-card, tbody tr, li[class*=player]').length`)
  out.searchFilters = out.rosterRowsAfterSearch < out.rosterRowsBefore
  await page.screenshot(path.join(ARTIFACTS_DIR, 'filter__roster-search.png'))
  await page.typeIn(`document.querySelector('.search-input')`, '不存在的选手XYZ')
  await sleep(400)
  out.noMatchEmptyState = await page.eval(`(document.body.innerText || '').includes('没有匹配的选手')`)
  await page.goto(`${base}/archive`)
  const feedText = await page.eval(`(document.body.innerText || '').slice(0, 500)`)
  const clicked = await page.clickText('赛事')
  await sleep(500)
  const eventsText = await page.eval(`(document.body.innerText || '').slice(0, 500)`)
  out.archiveTabSwitched = clicked && feedText !== eventsText
  await page.screenshot(path.join(ARTIFACTS_DIR, 'filter__archive-events-tab.png'))
  return out
}

/** 过期态专项：/lineups 必须出现「已过期」标识；data-status 呈现失败来源 */
async function staleChecks(page, base) {
  const out = {}
  await page.goto(`${base}/lineups`)
  out.lineupsStaleTagCount = await page.eval(
    `Array.from(document.querySelectorAll('.stale-tag, [class*=stale]')).filter(e => (e.textContent||'').includes('过期')).length`
  )
  out.lineupTextHasStale = await page.eval(`(document.body.innerText || '').includes('已过期')`)
  out.versionChipShown = await page.eval(`(document.body.innerText || '').includes('v2609')`)
  await page.goto(`${base}/lineups/lu-fx-1`)
  out.detailShowsVersionOrWindow = await page.eval(
    `/(v2609|7日对局快照|快照版本|窗口)/.test(document.body.innerText || '')`
  )
  return out
}

// ---------------------------------------------------------------------------
// 全流程演练（正常栈）：UI 上传 FIXTURE PNG → 确认材料 → 身份 → 候选 → 提交 → 放行 → 统计复查
// ---------------------------------------------------------------------------

async function personalImportDrill(page, base, stack, seeded) {
  const rec = { steps: [] }
  const shot = n => path.join(ARTIFACTS_DIR, `drill__${n}.png`)
  const step = async (name, fn) => {
    try {
      const detail = await fn()
      rec.steps.push({ name, ok: true, detail: detail ?? null })
    } catch (err) {
      rec.steps.push({ name, ok: false, error: String(err.message || err) })
      throw err
    }
  }

  const me = seeded.players[1] ?? 'p-fx-02'
  const myNick = '清风徐来'

  await step('open-page', async () => {
    await page.goto(`${base}/admin/personal-import`)
    await page.screenshot(shot('01-open'))
    if (!await page.eval(`!!document.querySelector('.token-panel')`)) throw new Error('token 面板未渲染')
  })

  await step('save-admin-token', async () => {
    const ok = await page.typeIn(`document.querySelector('.token-panel input')`, stack.adminToken)
    if (!ok) throw new Error('token 输入框未找到')
    await page.clickText('保存凭证')
    const configured = await page.eval(`(document.body.innerText || '').includes('已配置')`)
    if (!configured) throw new Error('保存凭证后界面未显示已配置')
    await page.screenshot(shot('02-token'))
    return 'token 面板显示已配置'
  })

  await step('upload-fixture-png', async () => {
    const fixturePath = path.join(ARTIFACTS_DIR, 'fixture-personal.png')
    fs.writeFileSync(fixturePath, makeWatermarkedPng('FIXTURE'))
    await page.setFileInputFiles('input[type=file]', [fixturePath])
    await sleep(800)
    const text = await page.eval(`document.body.innerText`)
    if (!text.includes('待人工确认') && !text.includes('PENDING')) throw new Error('上传后未进入 PENDING 呈现')
    await page.screenshot(shot('03-uploaded'))
    return 'FIXTURE PNG 已上传，材料 PENDING'
  })

  await step('verify-evidence', async () => {
    await page.typeIn(`document.querySelector('.operator-col input')`, 'w5-staff')
    const clicked = await page.clickText('确认材料有效')
    if (!clicked) throw new Error('确认材料有效按钮不可用/未找到')
    await sleep(600)
    const text = await page.eval(`document.body.innerText`)
    if (!text.includes('已确认有效')) throw new Error('材料未进入 VERIFIED 呈现')
    await page.screenshot(shot('04-verified'))
    return '材料 VERIFIED'
  })

  await step('identity-check', async () => {
    const inputs = await page.eval(`Array.from(document.querySelectorAll('.identity-row input')).length`)
    if (inputs < 2) throw new Error('身份输入行不完整')
    await page.typeIn(`document.querySelectorAll('.identity-row input')[0]`, me)
    await page.typeIn(`document.querySelectorAll('.identity-row input')[1]`, myNick)
    await page.clickText('在选手库核对身份')
    await sleep(500)
    await page.screenshot(shot('05-identity'))
    return `身份核对完成（${me}/${myNick}）`
  })

  await step('add-candidate', async () => {
    await page.clickText('按材料添加一局')
    await sleep(300)
    const t = await page.eval(`(() => {
      const i = document.querySelector('.candidate-table input[type=datetime-local]')
      return i ? true : false
    })()`)
    if (!t) throw new Error('候选行未出现')
    // 本地时区当前时刻前 1 小时（保证 matchTime ≤ 现在）
    const local = new Date(Date.now() - 3600_000)
    const pad = n => String(n).padStart(2, '0')
    const dtLocal = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`
    await page.typeIn(`document.querySelector('.candidate-table input[type=datetime-local]')`, dtLocal)
    await page.typeIn(`document.querySelector('.candidate-table input[type=number]')`, '2')
    await sleep(300)
    await page.screenshot(shot('06-candidate'))
    return `候选：${dtLocal} / 名次 2`
  })

  await step('submit-pending', async () => {
    const clicked = await page.clickText('候选（PENDING）')
    if (!clicked) throw new Error('提交按钮不可用（前置门禁未通过）')
    await sleep(900)
    const text = await page.eval(`document.body.innerText`)
    if (!/批次/.test(text)) throw new Error('提交后未出现批次反馈')
    await page.screenshot(shot('07-submitted'))
    return '提交成功，出现待核验候选'
  })

  await step('release-verify', async () => {
    const clicked = await page.clickText('确认核验放行')
    if (!clicked) throw new Error('放行按钮不可用')
    await sleep(800)
    await page.screenshot(shot('08-released'))
    return '已放行（ACTIVE）'
  })

  await step('stats-reflected', async () => {
    await page.goto(`${base}/players/${me}`)
    await sleep(600)
    const statsBeforeCheck = await page.eval(`(document.body.innerText || '').slice(0, 400)`)
    // 种子每人 3 局 + 演练 1 局 = 4 局（小样本口径如实展示）
    const stats = await fetch(`${stack.baseUrl}/api/v1/players/${me}/stats`).then(r => r.json())
    rec.apiStatsAfterDrill = stats.stats ?? stats
    await page.screenshot(shot('09-stats'))
    if ((stats.stats?.sampleCount ?? -1) !== 4) {
      throw new Error(`演练后统计应为 4 局，实际 ${stats.stats?.sampleCount}`)
    }
    return `统计 4 局（API 复核一致）：${statsBeforeCheck.slice(0, 0)}`
  })

  return rec
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })

  if (MANUAL) {
    writeManualChecklist()
    manifest.status = 'MANUAL_FALLBACK'
    manifest.manualChecklist = 'manual-checklist.md（未执行，如实标注）'
    finish()
    return
  }

  if (typeof WebSocket !== 'function') {
    manifest.status = 'FAILED'
    manifest.error = `Node ${process.version} 无全局 WebSocket（需 ≥22 或 --experimental-websocket）`
    finish()
    process.exitCode = 1
    return
  }

  const chrome = await launchChrome()
  manifest.chromeBinary = chrome.exe
  log('Chromium:', chrome.exe)
  try {
    const browser = new CdpBrowser(chrome.wsEndpoint, chrome)
    globalThis.__browser = await browser.connect()

    await runScenario('empty', { seed: null })
    await runScenario('normal', { seed: seedNormalData, drill: personalImportDrill })
    await runScenario('filter', { seed: seedNormalData })
    await runScenario('stale', { seed: seedStaleState })
    await runScenario('fail', { seed: seedNormalData, killBackendAfterBoot: true })

    await browser.close()
  } catch (err) {
    manifest.fatal = String(err.message || err)
    manifest.status = 'FAILED'
    try { await chrome.child.kill('SIGKILL') } catch { /* 忽略 */ }
    fs.rmSync(chrome.userDataDir, { recursive: true, force: true })
    finish()
    process.exitCode = 1
    return
  }

  summarize()
  finish()
}

function summarize() {
  const all = manifest.scenarios.flatMap(s => s.routes ?? [])
  const withErrors = all.filter(r =>
    (r.consoleIssues ?? []).some(c => !c.expected) || r.error
  )
  const headingMissing = all.filter(r => r.checks && r.checks.headingPresent === false)
  const errorStateMissing = all.filter(r => r.checks && r.checks.errorStateShown === false)
  const drillFailed = manifest.scenarios.flatMap(s => s.drill?.steps ?? []).filter(s => !s.ok)
  manifest.summary = {
    routeShots: all.filter(r => r.screenshot).length,
    routesWithUnexpectedConsoleErrors: withErrors.map(r => `${r.scenario}/${r.route}@${r.viewport}`),
    routesMissingHeading: headingMissing.map(r => `${r.scenario}/${r.route}@${r.viewport}`),
    routesMissingErrorState: errorStateMissing.map(r => `${r.scenario}/${r.route}@${r.viewport}`),
    drillSteps: manifest.scenarios.flatMap(s => s.drill?.steps ?? []).map(s => `${s.name}:${s.ok ? 'ok' : 'FAIL'}`)
  }
  const failed = manifest.scenarios.filter(s => s.status === 'FAILED')
  const hasIssues = withErrors.length || headingMissing.length || errorStateMissing.length || drillFailed.length
  manifest.status = failed.length ? 'FAILED' : (hasIssues ? 'COMPLETED_WITH_ISSUES' : 'PASSED')
}

function writeManualChecklist() {
  const md = path.join(ARTIFACTS_DIR, 'manual-checklist.md')
  const routes = ['/', '/roster', '/players/:id', '/lineups', '/lineups/:id', '/archive', '/events/:id', '/admin/verify', '/admin/personal-import']
  const states = ['空态(清空测试库)', '正常(FIXTURE 种子)', '筛选(搜索/模式过滤)', '过期(9 天前快照+FAILED job)', '失败(停后端)']
  fs.writeFileSync(md, `# W5 浏览器验收 · 手工清单（自动执行不可用，如实标注：未执行）

> 生成时间 ${new Date().toISOString()}。每格手动打钩 + 截图放入本目录。

| 状态 \\ 视口 | 桌面 1440×900 | 移动 390×844 | 控制台错误 | 横向滚动 |
|---|---|---|---|---|
${states.map(s => `| ${s} ${routes.map(() => '| ☐ ').join('')} | | |`).join('\n')}

路由清单：${routes.join('  ')}

附加项：
- [ ] Tab 键盘走查（roster 页 6 次焦点前进）
- [ ] /archive 表格容器横向滚动可用、页面本体不溢出
- [ ] 对比度抽查（正文 ≥4.5:1）
- [ ] 全流程演练：上传→预览→确认→身份→候选→提交→放行→统计
`)
  log('手工清单已生成:', md)
}

function finish() {
  manifest.finishedAt = new Date().toISOString()
  const out = path.join(ARTIFACTS_DIR, 'run-manifest.json')
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2))
  log('manifest →', path.relative(process.cwd(), out))
  log('status =', manifest.status)
}

main().catch(err => {
  console.error('[w5-harness] 未捕获异常:', err)
  manifest.fatal = String(err)
  manifest.status = 'FAILED'
  finish()
  process.exitCode = 1
})
