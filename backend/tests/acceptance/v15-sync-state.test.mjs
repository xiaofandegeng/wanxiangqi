// V15 · 两次同步、上游超时/结构变化、恢复 → 幂等、失败状态、旧快照标识、成功时间均正确
// 任务书 §5 V15。
//
// 说明（任务书 §5 红线）：真实来源核对（V14）不能用自编响应代替；但 V15 验证的是
// 同步状态机与错误处理边界 —— mock 响应正是其许可用途。本测试将适配器目标 URL 指向
// 本地受控 HTTP 存根（真实 HTTP 往返、真实解析器、真实台账写入），逐相位驱动：
//   相位1 成功 → 快照入台账、lastSuccessAt 推进、raw_materials 存证
//   相位2 幂等重放 → 同数据两次同步不重复不漂移
//   相位3 结构变化（页面不再含阵容结构）→ FAILED，旧快照原样保留、lastSuccessAt 不动
//   相位4 网络不可达 → FAILED，同上
//   相位5 恢复 → SUCCESS，快照替换为新数据、lastSuccessAt 再次推进

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'
import { HOKACE_ADAPTER_METADATA } from '../../../tools/emulator-watcher/adapters/hokace.mjs'

let stack = null
let stub = null
let stubPhase = 'ok-v1'
const PAYLOAD_V1 = JSON.stringify({
  data: [
    { lineupName: '雷霆扶桑刺', winRate: 0.441, top3Rate: 0.66, avgRank: 3.2, sampleCount: 1200,
      windowStart: '2026-09-01T00:00:00Z', windowEnd: '2026-09-08T00:00:00Z', dataCutoffAt: '2026-09-08T00:00:00Z' },
    { lineupName: '长安守卫枪', winRate: 0.32, top3Rate: 0.51, avgRank: 3.9, sampleCount: 880,
      windowStart: '2026-09-01T00:00:00Z', windowEnd: '2026-09-08T00:00:00Z' }
  ]
})
const PAYLOAD_V2 = JSON.stringify({
  data: [
    { lineupName: '雷霆扶桑刺', winRate: 0.45, top3Rate: 0.68, avgRank: 3.1, sampleCount: 1310,
      dataCutoffAt: '2026-09-15T00:00:00Z' },
    { lineupName: '新版法系剑', winRate: 0.29, top3Rate: 0.47, avgRank: 4.1, sampleCount: 640 }
  ]
})
const PAYLOAD_STRUCTURE_CHANGED = '<html><body><h1>改版了</h1><div>阵容页已迁移</div></body></html>'

function phaseBody() {
  if (stubPhase === 'ok-v1') return PAYLOAD_V1
  if (stubPhase === 'ok-v2') return PAYLOAD_V2
  if (stubPhase === 'structure-changed') return PAYLOAD_STRUCTURE_CHANGED
  return '' // 'unreachable' 不会走到这里（URL 指向死端口）
}

before(async () => {
  if (!pgAvailable) return

  // 本地受控上游存根（真实 HTTP 服务）
  stub = http.createServer((req, res) => {
      const body = phaseBody()
    res.writeHead(200, { 'Content-Type': stubPhase.startsWith('ok') ? 'application/json' : 'text/html' })
    res.end(body)
  })
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve))
  HOKACE_ADAPTER_METADATA.targetUrl = `http://127.0.0.1:${stub.address().port}/zh/lineups/`

  stack = await bootAcceptanceStack('wanxiangqi_v15_test')
})

after(async () => {
  // 还原适配器全局（同进程复用，避免污染其他测试）
  HOKACE_ADAPTER_METADATA.targetUrl = 'https://hokace.wiki/zh/lineups/'
  if (stub) await new Promise(resolve => stub.close(resolve))
  if (stack) await stack.cleanup()
})

async function triggerSync() {
  return stack.api('/api/v1/admin/sources/src-hokace-wiki/sync', { method: 'POST', token: stack.adminToken })
}

async function sourceRow() {
  return (await stack.pool.query(
    `SELECT status, last_attempt_at, last_success_at, last_error FROM data_sources WHERE source_id = 'src-hokace-wiki'`
  )).rows[0]
}

test('V15: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V15-1: 首次同步成功 → 快照/台账/存证/成功时间全就位', { skip: !pgAvailable }, async () => {
  const res = await triggerSync()
  assert.equal(res.status, 200, JSON.stringify(res.json))
  assert.equal(res.json.code, 0)

  const lineups = (await stack.pool.query(`SELECT lineup_name, win_rate, top3_rate, avg_rank, sample_count FROM lineup_snapshots ORDER BY lineup_name`))
  assert.equal(lineups.rows.length, 2)
  const lei = lineups.rows.find(r => r.lineup_name === '雷霆扶桑刺')
  assert.equal(Number(lei.win_rate), 0.441, '来源公布的比率原样入库（[0,1] 契约）')
  assert.equal(Number(lei.avg_rank), 3.2, '均名缺失不兜底、有值不篡改')

  const jobs = await stack.api('/api/v1/admin/sync-jobs', { token: stack.adminToken })
  assert.equal(jobs.json.data[0].status, 'SUCCESS')
  assert.equal(jobs.json.data[0].fetchedCount, 2)

  const src = await sourceRow()
  assert.equal(src.status, 'READY')
  assert.ok(src.last_success_at, '成功时间必须推进')
  const firstSuccessAt = src.last_success_at

  // 原始材料存证（内容哈希 + 解析器版本 + 复验4：正文/字节数/存储位置齐全可离线复核）
  const raw = (await stack.pool.query(`SELECT content_sha256, parser_version, content_type, content, size_bytes, storage_uri FROM raw_materials WHERE source_id = 'src-hokace-wiki'`)).rows
  assert.equal(raw.length, 1)
  assert.equal(raw[0].parser_version, 'hokace-html-v2609-astro')
  assert.equal(raw[0].content_type, 'application/json')
  assert.ok(raw[0].content && raw[0].content.includes('雷霆扶桑刺'), '原始正文必须随存证入库（可离线复核）')
  assert.equal(Number(raw[0].size_bytes), Buffer.byteLength(raw[0].content, 'utf8'), 'size_bytes 必须是正文实测字节数')
  assert.match(raw[0].storage_uri, /^pg:raw_materials:sha-/, 'storage_uri 内容寻址指向库内正文')

  // —— 保存相位基线，供后续相位断言“不动” ——
  stack.firstSuccessAt = firstSuccessAt
})

test('V15-2: 幂等 —— 同一响应再次同步 → 替换不重复、成功时间不回退', { skip: !pgAvailable }, async () => {
  const before = (await stack.pool.query(`SELECT id, lineup_name FROM lineup_snapshots ORDER BY id`)).rows
  const res = await triggerSync()
  assert.equal(res.json.code, 0)

  const after = (await stack.pool.query(`SELECT id, lineup_name FROM lineup_snapshots ORDER BY id`)).rows
  assert.equal(after.length, before.length, '整体替换语义：同数据两次同步不产生重复快照')
  assert.deepEqual(after.map(r => r.id), before.map(r => r.id), '稳定 id 不漂移（详情引用不断链）')

  const src = await sourceRow()
  assert.ok(new Date(src.last_success_at).getTime() >= new Date(stack.firstSuccessAt).getTime(),
    '成功时间单调不回退')

  const jobs = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM sync_jobs WHERE source_id='src-hokace-wiki' AND status='SUCCESS'`
  )).rows[0].n
  assert.equal(jobs, 2, '每次尝试都有台账（含幂等重放）')

  // 幂等重放成功合法推进了成功时间 → 后续“失败不动”相位以该值为冻结基线
  stack.frozenSuccessAt = src.last_success_at
})

test('V15-3: 上游结构变化 → FAILED、旧快照原样保留、lastSuccessAt 不动', { skip: !pgAvailable }, async () => {
  stubPhase = 'structure-changed'
  const snapshotBefore = (await stack.pool.query(`SELECT id, win_rate, avg_rank, updated_at FROM lineup_snapshots ORDER BY id`)).rows

  const res = await triggerSync()
  assert.equal(res.status, 200)
  assert.equal(res.json.code, 1, '同步失败以 code=1 如实报告（HTTP 层不伪装成功）')
  assert.match(res.json.message, /同步未完成/)

  // 旧快照逐字节保留
  const snapshotAfter = (await stack.pool.query(`SELECT id, win_rate, avg_rank, updated_at FROM lineup_snapshots ORDER BY id`)).rows
  assert.deepEqual(snapshotAfter, snapshotBefore, '失败绝不覆盖旧快照（V15 红线）')

  // lastSuccessAt 不动；lastError 记录结构变化
  const src = await sourceRow()
  assert.equal(new Date(src.last_success_at).getTime(), new Date(stack.frozenSuccessAt).getTime(),
    '失败不推进成功时间')
  assert.match(src.last_error, /未发现符合规范的阵容数据结构|解析/)

  // 台账 FAILED
  const jobs = await stack.api('/api/v1/admin/sync-jobs', { token: stack.adminToken })
  assert.equal(jobs.json.data[0].status, 'FAILED')
  assert.ok(jobs.json.data[0].errorSummary)
})

test('V15-4: 网络不可达（连接拒绝）→ FAILED、快照与成功时间依旧不动', { skip: !pgAvailable }, async () => {
  const deadPort = stub.address().port
  await new Promise(resolve => stub.close(resolve))
  stub = null
  HOKACE_ADAPTER_METADATA.targetUrl = `http://127.0.0.1:1/zh/lineups/` // 无监听端口
  const snapshotBefore = (await stack.pool.query(`SELECT id, updated_at FROM lineup_snapshots ORDER BY id`)).rows

  const res = await triggerSync()
  assert.equal(res.json.code, 1)

  const snapshotAfter = (await stack.pool.query(`SELECT id, updated_at FROM lineup_snapshots ORDER BY id`)).rows
  assert.deepEqual(snapshotAfter, snapshotBefore)
  const src = await sourceRow()
  assert.equal(new Date(src.last_success_at).getTime(), new Date(stack.frozenSuccessAt).getTime())
  assert.ok(src.last_error, '网络错误如实记录')
})

test('V15-5: 上游恢复（新数据）→ SUCCESS、快照替换为新版本、成功时间推进', { skip: !pgAvailable }, async () => {
  stub = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(PAYLOAD_V2)
  })
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve))
  HOKACE_ADAPTER_METADATA.targetUrl = `http://127.0.0.1:${stub.address().port}/zh/lineups/`

  const res = await triggerSync()
  assert.equal(res.json.code, 0)

  const names = (await stack.pool.query(`SELECT lineup_name, win_rate FROM lineup_snapshots ORDER BY lineup_name`)).rows
  assert.equal(names.length, 2)
  assert.ok(names.some(r => r.lineup_name === '新版法系剑'), '新阵容进入')
  assert.ok(!names.some(r => r.lineup_name === '长安守卫枪'), '来源已下架的阵容随整体替换移除')
  const lei = names.find(r => r.lineup_name === '雷霆扶桑刺')
  assert.equal(Number(lei.win_rate), 0.45, '更新后的真实比率')

  const src = await sourceRow()
  assert.ok(new Date(src.last_success_at).getTime() > new Date(stack.frozenSuccessAt).getTime(),
    '恢复后成功时间必须推进')
  assert.equal(src.last_error, null, '成功后清空错误记录')
})
