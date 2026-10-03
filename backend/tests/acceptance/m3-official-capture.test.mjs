// M3-1 · 官网第一方内容抓取存证验收（离线状态机：本地受控上游存根）
// 任务书 M3：官方公开页只读获取 → raw_materials（原文/哈希/时间）+ 来源登记。
//
// 与 v15 同一许可模式：验证的是抓取存证状态机与错误边界（鉴权/原子性/
// 状态推进/重启持久化），上游用本地 HTTP 存根（真实 HTTP 往返、真实适配器、
// 真实入库事务）。真实官网实测在 tests/network/m3-official-live.test.mjs
// （WXQ_NETWORK_TESTS=1 门控，不得用存根冒充）。
//   相位1 鉴权与登记：0008 种子 UNCONFIGURED；匿名 401；未知来源 400
//   相位2 首次成功：4 目标原文/sha256/sizeBytes/fetchedAt 入库、来源 READY、台账 SUCCESS
//   相位3 任一目标失败：整单 FAILED、零部分存证、lastSuccessAt 不动
//   相位4 恢复 + 重启持久化：再次成功、存证累积、断线重连状态保留

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import crypto from 'node:crypto'
import { bootAcceptanceStack, reconnectStack, pgAvailable } from './_helpers.mjs'
import { OFFICIAL_CONTENT_TARGETS } from '../../src/adapters/official-site.mjs'

let stack = null
let stub = null
let stubPhase = 'ok'

// 存根正文（按 recordKey 区分，保证 4 目标内容互不相同、sha256 可独立复核）
const STUB_BODIES = {
  'official:home': '<html><body>官网首页存根 桃源 WyQ home</body></html>',
  'official:portal': '<html><body>专题站存根 portal 三分归来</body></html>',
  'official:newbie-guide': '<html><body>新手指引存根 基础规则/入门阵容/棋手推荐</body></html>',
  'official:news:18873181': 'searchNews({status:0,data:{title:"版本更新公告存根"}})'
}

// 适配器目标 URL 指向本地存根（同 v15 对 HOKACE_ADAPTER_METADATA.targetUrl 的做法）
const ORIGINAL_URLS = OFFICIAL_CONTENT_TARGETS.map(t => t.url)

before(async () => {
  if (!pgAvailable) return

  stub = http.createServer((req, res) => {
    const key = decodeURIComponent(req.url.replace(/^\//, ''))
    const body = STUB_BODIES[key]
    if (stubPhase === 'one-target-404' && key === 'official:news:18873181') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('not found')
    }
    if (body == null) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('not found')
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(body)
  })
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve))
  for (const t of OFFICIAL_CONTENT_TARGETS) {
    t.url = `http://127.0.0.1:${stub.address().port}/${encodeURIComponent(t.recordKey)}`
  }

  stack = await bootAcceptanceStack('wanxiangqi_m3_test')
})

after(async () => {
  // 还原适配器全局（同进程复用，避免污染其他套件）
  OFFICIAL_CONTENT_TARGETS.forEach((t, i) => { t.url = ORIGINAL_URLS[i] })
  if (stub) await new Promise(resolve => stub.close(resolve))
  if (stack) await stack.cleanup()
})

async function triggerSync() {
  return stack.api('/api/v1/admin/sources/src-wxq-official/sync', {
    method: 'POST', token: stack.adminToken
  })
}

async function sourceRow() {
  return (await stack.pool.query(
    `SELECT status, last_attempt_at, last_success_at, last_error FROM data_sources WHERE source_id = 'src-wxq-official'`
  )).rows[0]
}

test('M3: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('M3-1a: 0008 种子登记 UNCONFIGURED；同步触发鉴权与未知来源语义一致', { skip: !pgAvailable }, async () => {
  const src = await sourceRow()
  assert.equal(src.status, 'UNCONFIGURED', '登记 ≠ 已采集：种子状态必须 UNCONFIGURED')
  assert.equal(src.last_success_at, null)
  assert.equal(src.last_attempt_at, null)

  const anon = await stack.api('/api/v1/admin/sources/src-wxq-official/sync', { method: 'POST' })
  assert.equal(anon.status, 401, '同步触发必须持管理令牌')

  const ghost = await stack.api('/api/v1/admin/sources/src-not-exists/sync', {
    method: 'POST', token: stack.adminToken
  })
  assert.equal(ghost.status, 400)
  assert.equal(ghost.json.code_name, 'UNCONFIGURED')
})

test('M3-1b: 首次抓取成功 → 4 目标原文/哈希/字节数/时间入库，来源 UNCONFIGURED→READY', { skip: !pgAvailable }, async () => {
  const res = await triggerSync()
  assert.equal(res.status, 200, JSON.stringify(res.json))
  assert.equal(res.json.code, 0)
  assert.equal(res.json.result.count, 4)

  // 原文存证逐条复核（验收方法：原文/哈希/时间入库可复核）
  const rows = (await stack.pool.query(
    `SELECT id, record_key, fetched_at, content_sha256, content, content_type, size_bytes, parser_version
     FROM raw_materials WHERE source_id = 'src-wxq-official' ORDER BY record_key`
  )).rows
  assert.equal(rows.length, 4, '4 个官网目标各一条存证')
  assert.deepEqual(rows.map(r => r.record_key), Object.keys(STUB_BODIES).sort())

  for (const r of rows) {
    const expected = STUB_BODIES[r.record_key]
    assert.equal(r.content, expected, `${r.record_key} 原文必须整包入库（不裁剪不改写）`)
    const sha = crypto.createHash('sha256').update(r.content, 'utf8').digest('hex')
    assert.equal(r.content_sha256, sha, `${r.record_key} sha256 必须可独立复算`)
    assert.equal(Number(r.size_bytes), Buffer.byteLength(r.content, 'utf8'), 'size_bytes 必须是实测字节数')
    assert.ok(r.fetched_at, `${r.record_key} 采集时间必须入库`)
    assert.equal(r.parser_version, 'official-raw-v1')
  }

  // 来源推进 + 台账 SUCCESS
  const src = await sourceRow()
  assert.equal(src.status, 'READY', '首次成功采集 UNCONFIGURED→READY')
  assert.ok(src.last_success_at)
  assert.equal(src.last_error, null)

  const jobs = await stack.api('/api/v1/admin/sync-jobs', { token: stack.adminToken })
  assert.equal(jobs.json.data[0].sourceId, 'src-wxq-official')
  assert.equal(jobs.json.data[0].status, 'SUCCESS')
  assert.equal(jobs.json.data[0].fetchedCount, 4)

  // 抓取存证 ≠ 数据同步：不写任何阵容快照
  const snapshots = await stack.pool.query(`SELECT count(*)::int AS n FROM lineup_snapshots`)
  assert.equal(snapshots.rows[0].n, 0, '官网内容存证不得写业务快照')
})

test('M3-1c: 任一目标失败 → 整单 FAILED、零部分存证、lastSuccessAt 不动', { skip: !pgAvailable }, async () => {
  stubPhase = 'one-target-404'
  const before = (await stack.pool.query(
    `SELECT count(*)::int AS n, max(fetched_at) AS latest FROM raw_materials WHERE source_id = 'src-wxq-official'`
  )).rows[0]
  const srcBefore = await sourceRow()

  const res = await triggerSync()
  assert.equal(res.status, 200)
  assert.equal(res.json.code, 1, '失败如实 code=1')
  assert.match(res.json.message, /官网内容抓取未完成/)

  const after = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM raw_materials WHERE source_id = 'src-wxq-official'`
  )).rows[0]
  assert.equal(after.n, before.n, '不得落部分存证（原子）')

  const src = await sourceRow()
  assert.equal(new Date(src.last_success_at).getTime(), new Date(srcBefore.last_success_at).getTime(),
    '失败不推进成功时间')
  assert.ok(src.last_error, '失败原因记录在来源行')

  const jobs = await stack.api('/api/v1/admin/sync-jobs', { token: stack.adminToken })
  assert.equal(jobs.json.data[0].status, 'FAILED')
})

test('M3-1d: 恢复后再抓取成功；进程重启后来源状态与存证持久', { skip: !pgAvailable }, async () => {
  stubPhase = 'ok'
  const res = await triggerSync()
  assert.equal(res.json.code, 0)

  // 存证按采集动作累积（append-only 证据日志：4 + 4）
  const total = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM raw_materials WHERE source_id = 'src-wxq-official'`
  )).rows[0]
  assert.equal(total.n, 8, '两次成功采集共 8 条存证')

  // 模拟进程重启：全新 pool/services/server，库内状态保留
  await stack.cleanup()
  stack = await reconnectStack('wanxiangqi_m3_test')

  const src = await sourceRow()
  assert.equal(src.status, 'READY', '重启后来源状态持久（不靠内存宣称）')
  assert.ok(src.last_success_at)

  const persisted = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM raw_materials WHERE source_id = 'src-wxq-official'`
  )).rows[0]
  assert.equal(persisted.n, 8, '重启后存证持久')

  // data-status 公开面如实呈现新来源（空 lastSuccessAt 断言已在 M1-E3 覆盖种子态）
  const status = await stack.api('/api/v1/data-status')
  const wxq = status.json.sources.find(s => s.id === 'src-wxq-official')
  assert.equal(wxq.status, 'READY')
  assert.ok(wxq.lastSuccessAt, '公开面成功时间来自库内事实')
})
