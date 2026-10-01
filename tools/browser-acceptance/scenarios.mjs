// W5 · 浏览器验收场景定义：五态构造 + 八路由走查 + 全流程演练
//
// 状态构造原则（任务书 W5，全部用真实后端，不造假响应）：
// - 空态   ：全新临时测试库，零种子
// - 正常态 ：FIXTURE 种子（players/matches/events/lineups），明确标注绝不计入 V07
// - 筛选态 ：复用正常栈，走 UI 筛选交互（roster 搜索 / archive 模式过滤）
// - 过期态 ：独立栈 + 旧 updated_at 阵容快照 + FAILED sync_job + 来源 last_error（真实 stale 链路）
// - 失败态 ：正常栈启动后杀掉后端 → vite 代理 500 → UI 错误态呈现
// 所有数据只写 *_test 库；业务 storage.json / 业务库零接触（V01 红线）。

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { sleep } from './cdp.mjs'

// ---------------------------------------------------------------------------
// FIXTURE 材料生成：带 FIXTURE 字样水印的最小合法 PNG（魔数有效，服务端可入库）
// ---------------------------------------------------------------------------

const GLYPHS = {
  // 5x7 点阵（大写字母子集，仅供水印可读）
  F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111']
}

/** 生成水印 PNG（白底黑字 + 边框）。返回 Buffer —— 明确 FIXTURE 材料，绝不计入 V07。 */
export function makeWatermarkedPng(label = 'FIXTURE') {
  const scale = 3
  const text = label.toUpperCase().slice(0, 10)
  const textW = text.length * 6 * scale - scale
  const W = Math.max(textW + 24, 160)
  const H = 64
  // 画布：0=白 1=黑
  const px = Array.from({ length: H }, () => new Array(W).fill(0))
  const drawPx = (x, y) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y][x] = 1 }
  // 边框
  for (let x = 0; x < W; x++) { drawPx(x, 0); drawPx(x, H - 1) }
  for (let y = 0; y < H; y++) { drawPx(0, y); drawPx(W - 1, y) }
  // 文字
  const ox = Math.floor((W - textW) / 2)
  const oy = Math.floor((H - 7 * scale) / 2)
  for (let i = 0; i < text.length; i++) {
    const g = GLYPHS[text[i]] ?? GLYPHS['-']
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '1') continue
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) drawPx(ox + (i * 6 + c) * scale + dx, oy + r * scale + dy)
        }
      }
    }
  }
  return encodePng(W, H, px)
}

// ---- 最小 PNG 编码（colortype 2 = RGB，8bit）----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(W, H, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  const raw = Buffer.alloc(H * (1 + W * 3))
  let o = 0
  for (let y = 0; y < H; y++) {
    raw[o++] = 0 // filter: None
    for (let x = 0; x < W; x++) {
      const v = px[y][x] ? 0x10 : 0xf0
      raw[o++] = v; raw[o++] = px[y][x] ? 0x10 : 0xf0; raw[o++] = v === 0x10 ? 0x10 : 0xf0
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------------------------------------------------------------------------
// 种子数据（只写 *_test 库）
// ---------------------------------------------------------------------------

const NICKNAMES = ['弈星北辰', '清风徐来', '白鹤亮翅', '夜雨声烦', '碎星拾光', '长安某']

export async function seedNormalData(stack) {
  const { pool } = stack
  const now = Date.now()
  const iso = (t) => new Date(t).toISOString()
  const players = []
  for (let i = 0; i < 6; i++) {
    const id = `p-fx-0${i + 1}`
    players.push(id)
    await pool.query(
      `INSERT INTO players (id, nickname, rank_score, rank_text) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING`,
      [id, NICKNAMES[i], 9500 + i * 220, i < 3 ? '最强王者' : '至尊星耀']
    )
    // 每人 3 局已核验对局（FIXTURE；availableAt 早于 matchTime 之后即可见）
    for (let g = 0; g < 3; g++) {
      const mt = now - (g * 36 + i) * 3600_000
      await pool.query(
        `INSERT INTO matches (id, player_id, match_time, available_at, final_rank, mode,
                              verified, record_status, synthetic, record_key, revision, source_id)
         VALUES ($1,$2,$3,$4,$5,'RANKED_DIAMOND',TRUE,'ACTIVE',FALSE,$6,1,'src-manual-review')`,
        [`m-fx-${i}-${g}`, id, iso(mt), iso(mt + 60_000), (i + g) % 6 + 1, `w5fx:${id}:${g}`]
      )
    }
  }
  // 今日赛事（/ 首页口径）+ 六席
  await pool.query(
    `INSERT INTO events (id, mode, scheduled_at, title, status, verified_at, verified_by)
     VALUES ('ev-fx-today','TOURNAMENT',$1,'FIXTURE 演练赛·巅峰对决场','AUDITED',$2,'w5-fixture')
     ON CONFLICT (id) DO NOTHING`,
    [iso(now - 3600_000), iso(now - 3500_000)]
  )
  for (let s = 0; s < 6; s++) {
    await pool.query(
      `INSERT INTO event_participants (event_id, slot, player_id, nickname, final_rank)
       VALUES ('ev-fx-today',$1,$2,$3,$4)`,
      [s + 1, players[s], NICKNAMES[s], s + 1]
    )
  }
  // 阵容快照（新鲜：updated_at = 现在 → stale=false；带版本/窗口文本供 W4 分列核对）
  await pool.query(
    `INSERT INTO lineup_snapshots
       (id, source_id, lineup_name, tier, commander, core_heroes, sample_count,
        win_rate, top3_rate, avg_rank, snapshot_version, window_text, scope, updated_at)
     VALUES
       ('lu-fx-1','src-hokace-wiki','长安守卫体系','T1','弈星','["弈星","长安","苏烈"]'::jsonb,412,0.2240,0.5310,3.85,'v2609','7日对局快照','全服王者段位',NOW()),
       ('lu-fx-2','src-hokace-wiki','三远消耗流','T2','后羿','["后羿","蒙犽","鲁班大师"]'::jsonb,287,0.1910,0.4770,4.12,'v2609','7日对局快照','全服王者段位',NOW())
     ON CONFLICT (id) DO NOTHING`
  )
  return { players, eventId: 'ev-fx-today', lineupId: 'lu-fx-1' }
}

/** 过期态：9 天前的快照（超过 7 日阈值）+ FAILED sync_job + 来源 last_error（真实 stale 标识链路） */
export async function seedStaleState(stack) {
  const { pool } = stack
  const seeded = await seedNormalData(stack)
  await pool.query(`UPDATE lineup_snapshots SET updated_at = NOW() - INTERVAL '9 days' WHERE id LIKE 'lu-fx-%'`)
  await pool.query(
    `INSERT INTO sync_jobs (source_id, job_type, scope, started_at, finished_at, status, error_summary)
     VALUES ('src-hokace-wiki','full_page_scrape','zh/lineups', NOW() - INTERVAL '9 days',
             NOW() - INTERVAL '9 days' + INTERVAL '3 seconds', 'FAILED',
             $1)`,
    ['W5-FIXTURE: 模拟抓取失败（connect ETIMEDOUT）——验收过期态用，非真实故障']
  )
  await pool.query(
    `UPDATE data_sources SET last_attempt_at = NOW() - INTERVAL '9 days',
       last_error = 'W5-FIXTURE simulated fetch failure', updated_at = NOW()
     WHERE source_id = 'src-hokace-wiki'`
  )
  return seeded
}

// ---------------------------------------------------------------------------
// 路由走查
// ---------------------------------------------------------------------------

export const DESKTOP = { name: 'desktop', width: 1440, height: 900, mobile: false, touch: false }
export const MOBILE = { name: 'mobile', width: 390, height: 844, mobile: true, touch: true }

export function routesFor({ playerId = 'p-fx-01', eventId = 'ev-fx-today', lineupId = 'lu-fx-1' } = {}) {
  return [
    { name: 'home', path: '/' },
    { name: 'roster', path: '/roster' },
    { name: 'player-profile', path: `/players/${playerId}` },
    { name: 'lineups', path: '/lineups' },
    { name: 'lineup-detail', path: `/lineups/${lineupId}` },
    { name: 'archive', path: '/archive' },
    { name: 'event-detail', path: `/events/${eventId}` },
    { name: 'admin-verify', path: '/admin/verify' },
    { name: 'personal-import', path: '/admin/personal-import' }
  ]
}

/** 单路由检查：渲染健康度 + 内容断言（结果如实进 manifest，不掩盖失败） */
async function checkRoute(page, route, scenarioName) {
  const checks = {}
  const info = await page.eval(`(() => {
    const h = document.querySelector('h1, h2, .view-header h1, .view-header h2')
    const text = document.body.innerText || ''
    return {
      title: document.title,
      heading: h ? h.textContent.trim() : null,
      hasTokenPanel: !!document.querySelector('.token-panel'),
      hasLoadingError: text.includes('加载失败') || text.includes('请求失败'),
      bodyTextHead: text.replace(/\\s+/g, ' ').slice(0, 200)
    }
  })()`)
  checks.title = info.title
  checks.heading = info.heading
  checks.headingPresent = !!info.heading
  checks.hasTokenPanel = info.hasTokenPanel
  if (['fail'].includes(scenarioName)) {
    // 失败态：公开页期望错误呈现；管理页无凭证时呈现 token 面板（未发起请求，无错误可显）
    checks.expectErrorState = true
    checks.errorStateShown = route.path.startsWith('/admin')
      ? info.hasTokenPanel
      : (info.hasLoadingError ||
         /失败|错误|无法|异常|不可用/.test(info.bodyTextHead) ||
         /空|暂无|没有/.test(info.bodyTextHead))
  } else {
    checks.hasLoadingError = info.hasLoadingError
  }
  // 横向溢出检查：桌面视口下页面本体不允许横向滚动（表格容器内部滚动除外）
  if (!route.path.startsWith('/admin')) {
    checks.noHorizontalOverflow = await page.eval(
      `document.documentElement.scrollWidth <= window.innerWidth + 1`
    )
  }
  // 对比度抽查：正文主文本 vs 其背景
  checks.contrastProbe = await page.eval(`(() => {
    function lum(c) {
      const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    function bgOf(el) {
      let e = el
      while (e) {
        const bg = getComputedStyle(e).backgroundColor
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          const m = bg.match(/\\d+(\\.\\d+)?/g)
          if (m) return m.map(Number)
        }
        e = e.parentElement
      }
      return [255, 255, 255]
    }
    const el = document.querySelector('h1') || document.querySelector('h2') || document.querySelector('td') || document.querySelector('li')
    if (!el) return null
    const fg = (getComputedStyle(el).color.match(/\\d+(\\.\\d+)?/g) || [0, 0, 0]).map(Number)
    const bg = bgOf(el)
    const l1 = lum(fg), l2 = lum(bg)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    return { text: (el.textContent || '').trim().slice(0, 20), ratio: Math.round(ratio * 100) / 100 }
  })()`)
  return checks
}

/**
 * 走查一组路由 × 视口：截图 + 控制台捕获 + 健康检查。
 * 返回逐路由记录（进 run-manifest）。
 */
export async function driveRoutes(page, baseUrl, { routes, scenarioName, artifactsDir, deepChecks = null }) {
  const records = []
  for (const vp of [DESKTOP, MOBILE]) {
    await page.setViewport(vp)
    for (const route of routes) {
      const url = `${baseUrl}${route.path}`
      const shot = path.join(artifactsDir, `${scenarioName}__${route.name}__${vp.name}.png`)
      page.resetConsole()
      const rec = { scenario: scenarioName, route: route.name, path: route.path, viewport: vp.name, url }
      try {
        await page.goto(url)
        await page.screenshot(shot)
        rec.screenshot = path.relative(process.cwd(), shot)
        rec.checks = await checkRoute(page, route, scenarioName)
        if (vp === DESKTOP && deepChecks) {
          Object.assign(rec.checks, await deepChecks(page, route, scenarioName))
        }
      } catch (err) {
        rec.error = String(err.message || err)
      }
      const consoleIssues = page.takeConsole().filter(
        c => c.kind === 'exception' || c.type === 'error'
      )
      // 空态/失败态下「资源不存在」「后端不可达」类报错是该状态的预期呈现，不算缺陷；
      // 如实留档但单独归类，summary 只统计非预期错误。
      const isExpected = (c) =>
        (scenarioName === 'empty' && /不存在|404/.test(c.text ?? '')) ||
        (scenarioName === 'fail' && /失败|500|network|ECONNREFUSED|proxy/i.test(c.text ?? ''))
      rec.consoleIssues = consoleIssues.map(c => ({
        kind: c.kind,
        text: (c.text || '').slice(0, 200),
        expected: isExpected(c)
      }))
      records.push(rec)
    }
  }
  return records
}

/** 深度交互检查（桌面一次）：键盘 Tab 走查 + 表格横向滚动 + 筛选交互 */
export async function interactionChecks(page, baseUrl, artifactsDir, scenarioName) {
  const out = {}
  // 键盘可达性：roster 页 Tab 6 次，焦点必须前进（非死循环、非丢失）
  await page.goto(`${baseUrl}/roster`)
  out.tabWalk = await page.tabWalk(6)
  out.tabWalkProgresses = out.tabWalk.filter(t => t.tag && !t.tag.startsWith('BODY')).length >= 4
  // 表格横向滚动：archive 页（容器可滚、页面本体不溢出）
  await page.goto(`${baseUrl}/archive`)
  out.archiveScroll = await page.eval(`(() => {
    const scroller = document.querySelector('.table-scroll, .archive-table, .card-table')
      || document.querySelector('[class*="scroll"]') || document.querySelector('main') || document.body
    return {
      scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
      canScroll: scroller.scrollWidth > scroller.clientWidth,
      bodyOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
    }
  })()`)
  // 筛选交互（正常/筛选态）：roster 搜索框输入后行数变化
  if (['normal', 'filter'].includes(scenarioName)) {
    const before = await page.eval(`document.querySelectorAll('tbody tr, .roster-card, li[class*=player]').length`)
    const typed = await page.typeIn(
      `document.querySelector('input[type=search], input[placeholder*=搜索], input[placeholder*=筛选], .filter-bar input, input.input-text')`,
      '弈星'
    )
    await sleep(400)
    const after = await page.eval(`document.querySelectorAll('tbody tr, .roster-card, li[class*=player]').length`)
    out.filterInteraction = {
      typedInInput: typed,
      rowsBefore: before,
      rowsAfter: after,
      filtered: typed ? after < before || after === 1 : null
    }
  }
  // 移动端触控目标抽查：主要按钮最小 40px 高（记录数值，不掩盖）
  await page.setViewport(MOBILE)
  await page.goto(`${baseUrl}/roster`)
  out.touchTargetProbe = await page.eval(`(() => {
    const btns = Array.from(document.querySelectorAll('a[href], button')).slice(0, 8)
    return btns.map(b => {
      const r = b.getBoundingClientRect()
      return { text: (b.textContent || '').trim().slice(0, 12), h: Math.round(r.height), w: Math.round(r.width) }
    }).filter(x => x.w > 0)
  })()`)
  await page.setViewport(DESKTOP)
  return out
}
