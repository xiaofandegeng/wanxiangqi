// V03 · 导入一批有效记录，重启服务 → SQL、API、页面字段与统计一致
// 任务书 §5 V03：一次真实导入 + 核验放行后，拆掉整个进程内栈（server+pool），
// 用全新连接重建服务（= 进程重启），断言 SQL 直查、API 响应、统计三方逐字段一致。
//
// 页面字段 = API wire 字段（前端只渲染 API），故本测试锁死 wire 与 SQL 行的逐字段映射。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, reconnectStack, countRows, insertEvidenceWithBlob, pgAvailable } from './_helpers.mjs'

const DB = 'wanxiangqi_v03_test'
const TOKEN = 'v3-acceptance-admin-token'

let stack = null

const RECORDS = [
  { playerId: 'p-v03-a', nickname: '验收甲', matchTime: '2026-09-10T10:00:00Z', finalRank: 1,
    mode: 'RANKED_DIAMOND', verified: true, commander: '李白', lineup: '长城守卫军', evidenceId: 'ev-v03' },
  { playerId: 'p-v03-b', nickname: '验收乙', matchTime: '2026-09-10T10:00:00Z', finalRank: 3,
    mode: 'RANKED_DIAMOND', verified: true, commander: null, lineup: null, evidenceId: 'ev-v03' }
]

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack(DB, { adminToken: TOKEN })
  // 复验2 + v4 W1：核验强制证据链且原件可恢复 —— 存证材料连同原件一次就位
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-v03', sha256: 'b'.repeat(64), status: 'VERIFIED', capturedAt: '2026-09-10T09:00:00Z'
  })
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V03: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V03: 导入（verified:true 被忽略）→ 核验放行 → SQL 与 API 一致', { skip: !pgAvailable }, async () => {
  // 1. 导入：入参带 verified:true 也必须落库为 PENDING 待核验
  const importRes = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: TOKEN, body: { records: RECORDS, source: 'V03_ACCEPTANCE' }
  })
  assert.equal(importRes.status, 200, JSON.stringify(importRes.json))
  assert.equal(importRes.json.result.inserted, 2)
  assert.equal(importRes.json.result.duplicates, 0)

  const batch = await stack.api(`/api/v1/admin/imports/${importRes.json.result.batchId}`, { token: TOKEN })
  assert.equal(batch.status, 200)
  assert.equal(batch.json.data.records.length, 2)
  for (const r of batch.json.data.records) {
    assert.equal(r.verified, false, '导入后必须处于待核验状态')
    assert.equal(r.recordStatus, 'PENDING')
  }
  assert.equal(await countRows(stack.pool, 'matches', "verified = TRUE AND record_status = 'ACTIVE'"), 0)

  // 2. 核验放行（V17 流程）：统计才生效
  for (const r of batch.json.data.records) {
    const v = await stack.api(`/api/v1/admin/matches/${r.id}/verify`, {
      method: 'POST', token: TOKEN, body: { verifiedBy: 'v03-acceptance' }
    })
    assert.equal(v.status, 200, JSON.stringify(v.json))
    assert.equal(v.json.data.verified, true)
    assert.equal(v.json.data.recordStatus, 'ACTIVE')
    assert.ok(v.json.data.availableAt, '核验动作必须赋值 availableAt')
  }

  // 3. SQL 直查 == API 统计
  assert.equal(
    await countRows(stack.pool, 'matches', "verified = TRUE AND record_status = 'ACTIVE' AND synthetic = FALSE"), 2
  )

  const statsA = await stack.api('/api/v1/players/p-v03-a/stats')
  assert.equal(statsA.json.stats.sampleCount, 1)
  assert.equal(statsA.json.stats.firstPlaces, 1)
  assert.equal(statsA.json.stats.winRate, 1)
  assert.equal(statsA.json.stats.top3Rate, 1)
  assert.equal(statsA.json.stats.avgRank, 1)

  const statsB = await stack.api('/api/v1/players/p-v03-b/stats')
  assert.equal(statsB.json.stats.sampleCount, 1)
  assert.equal(statsB.json.stats.winRate, 0, 'N=1 无夺冠 → 0（禁 null/禁兜底）')
  assert.equal(statsB.json.stats.top3Rate, 1)
  assert.equal(statsB.json.stats.avgRank, 3)
})

test('V03: 重启（拆栈重建全新连接）后 SQL、API、页面字段逐字段一致', { skip: !pgAvailable }, async () => {
  // 1. 模拟进程重启：关闭 server 与连接池，全新 pool + 服务栈（内存零继承、库不重建）
  await stack.cleanup()
  stack = await reconnectStack(DB, { adminToken: TOKEN })

  // 2. SQL oracle
  const sqlRow = (await stack.pool.query(
    `SELECT id, player_id, match_time, available_at, final_rank, mode, commander, lineup,
            verified, record_status, revision, record_key, verified_by
     FROM matches WHERE player_id = 'p-v03-a' AND superseded_at IS NULL`
  )).rows[0]
  assert.ok(sqlRow, '重启后数据仍在（PG 是唯一权威，不随进程消亡）')

  // 3. API wire 与 SQL 行逐字段一致（前端渲染的就是这些字段）
  const matchesA = await stack.api('/api/v1/players/p-v03-a/matches')
  assert.equal(matchesA.status, 200)
  assert.equal(matchesA.json.total, 1)
  const wire = matchesA.json.data[0]
  assert.equal(wire.id, sqlRow.id)
  assert.equal(wire.playerId, sqlRow.player_id)
  assert.equal(new Date(wire.matchTime).toISOString(), new Date(sqlRow.match_time).toISOString())
  assert.equal(new Date(wire.availableAt).toISOString(), new Date(sqlRow.available_at).toISOString())
  assert.equal(wire.finalRank, sqlRow.final_rank)
  assert.equal(wire.mode, sqlRow.mode)
  assert.equal(wire.commander, sqlRow.commander)
  assert.equal(wire.lineup, sqlRow.lineup)
  assert.equal(wire.verified, sqlRow.verified)
  assert.equal(wire.recordStatus, sqlRow.record_status)
  assert.equal(wire.revision, sqlRow.revision)
  assert.equal(wire.verifiedBy, sqlRow.verified_by)

  // 4. 统计在重启后保持一致
  const statsA = await stack.api('/api/v1/players/p-v03-a/stats')
  assert.equal(statsA.json.stats.sampleCount, 1)
  assert.equal(statsA.json.stats.winRate, 1)
  assert.equal(statsA.json.stats.avgRank, 1)

  // 5. 大盘列表/健康计数与 SQL 计数一致（版本模型：matches=版本行总数，含已封存旧版）
  const players = await stack.api('/api/v1/players')
  assert.equal(players.json.total, 2)
  const health = await stack.api('/api/v1/health')
  assert.equal(health.json.counts.matches, 4, '2 条导入 + 2 条核验新版本 = 4 个版本行')
  assert.equal(health.json.counts.effectiveMatches, 2, '有效战绩仍为 2（仅当前 ACTIVE 版本计入）')
  assert.equal(health.json.counts.players, 2)
})
