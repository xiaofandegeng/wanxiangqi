// V17 · 匿名调用写接口、提交 verified:true → 未授权拒绝；授权导入也不能跳过证据核验流程
// 任务书 §5 V17。两道闸门：
//   闸门1（HTTP）：/api/v1/admin/* 全部 Bearer 鉴权，匿名/错 token 一律 401（含 GET 台账）
//   闸门2（语义）：即使持有效 token，verified 只能由“核验动作”授予——
//     导入入参 verified:true 被强制忽略（PENDING），统计不生效；
//     slots/confirm 缺材料 sha256 指纹直接拒绝（不得伪造证据链）

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v17_test')
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V17: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V17-1: 匿名 / 错误 token 调用全部写接口 → 401', { skip: !pgAvailable }, async () => {
  const records = [{ playerId: 'p-v17', matchTime: '2026-09-01T10:00:00Z', finalRank: 1, mode: 'RANKED_DIAMOND' }]

  const cases = [
    ['POST', '/api/v1/admin/imports', { records }],
    ['POST', '/api/v1/admin/slots/confirm', { slots: [] }],
    ['POST', '/api/v1/admin/matches/mh-x/verify', { verifiedBy: 'x' }],
    ['POST', '/api/v1/admin/sources/src-hokace-wiki/sync', null],
    ['GET', '/api/v1/admin/sync-jobs', null],
    ['GET', '/api/v1/admin/imports/batch-x', null]
  ]
  for (const [method, path, body] of cases) {
    // 完全匿名
    const anon = await stack.api(path, { method, body })
    assert.equal(anon.status, 401, `${method} ${path} 匿名必须 401（实际 ${anon.status}）`)
    assert.equal(anon.json.code, 401)
    // 错误 token
    const wrong = await stack.api(path, { method, token: 'wrong-token-attack', body })
    assert.equal(wrong.status, 401, `${method} ${path} 错误 token 必须 401`)
  }
  // 写入零发生
  const health = await stack.api('/api/v1/health')
  assert.equal(health.json.counts.matches, 0)
  assert.equal(health.json.counts.players, 0)
})

test('V17-2: 有效 token 导入提交 verified:true → 被强制忽略，统计不生效', { skip: !pgAvailable }, async () => {
  const res = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{
        playerId: 'p-v17', matchTime: '2026-09-01T10:00:00Z', finalRank: 1,
        mode: 'RANKED_DIAMOND', verified: true, recordStatus: 'ACTIVE' // 攻击面：试图自带放行
      }],
      source: 'V17_ATTACK_VERIFIED'
    }
  })
  assert.equal(res.status, 200, '授权导入本身成功')
  assert.match(res.json.message, /verified 状态不随导入授予/)

  // 库内：verified=false、PENDING —— 客户端提供的 verified/recordStatus 均未生效
  const row = (await stack.pool.query(
    `SELECT verified, record_status, available_at FROM matches WHERE player_id = 'p-v17'`
  )).rows[0]
  assert.equal(row.verified, false, '入参 verified:true 必须被服务端忽略')
  assert.equal(row.record_status, 'PENDING')

  // 统计口径不生效（待核验记录绝不参与正式统计）
  const stats = await stack.api('/api/v1/players/p-v17/stats')
  assert.equal(stats.json.stats.sampleCount, 0)
  assert.equal(stats.json.stats.winRate, null)
  const feed = await stack.api('/api/v1/matches')
  assert.equal(feed.json.total, 0, 'ACTIVE 口径流水为空（PENDING 不混入）')

  // 唯一放行通道：核验动作
  const verify = await stack.api(`/api/v1/admin/matches/${(await stack.pool.query(
    `SELECT id FROM matches WHERE player_id = 'p-v17'`
  )).rows[0].id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v17-auditor' }
  })
  assert.equal(verify.status, 200)
  assert.equal(verify.json.data.verified, true)
  assert.equal(verify.json.data.verifiedBy, 'v17-auditor')
  assert.ok(verify.json.data.availableAt)
  assert.equal((await stack.api('/api/v1/players/p-v17/stats')).json.stats.sampleCount, 1)
})

test('V17-3: 核验动作必须留痕操作人（无 verifiedBy 拒绝）', { skip: !pgAvailable }, async () => {
  const res = await stack.api('/api/v1/admin/matches/nonexistent/verify', {
    method: 'POST', token: stack.adminToken, body: {}
  })
  assert.ok(res.status >= 400, '缺 verifiedBy 的核验请求必须被拒绝（操作留痕是核验的组成部分）')
})

test('V17-4: slots/confirm 缺材料 sha256 → 拒绝（不得伪造证据链）', { skip: !pgAvailable }, async () => {
  const slots = Array.from({ length: 6 }, (_, i) => ({
    slot: i + 1, playerId: `p-v17-s${i}`, nickname: `席位${i}`, finalRank: i + 1
  }))
  const noSha = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: { title: '无指纹核验', scheduledAt: '2026-09-02T10:00:00Z', mode: 'RANKED_DIAMOND', slots }
  })
  assert.ok(noSha.status >= 400, '无 sha256 指纹的核验必须失败（有效 token 也不能绕过证据链）')

  const badSha = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: { title: '伪指纹核验', scheduledAt: '2026-09-02T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceSha256: 'zz-not-sha', slots }
  })
  assert.ok(badSha.status >= 400, '非 64 位十六进制 sha256 必须失败')

  // 未落任何场次/席位（整体拒绝，无部分写入）
  assert.equal((await stack.api('/api/v1/events')).json.total, 0)
  assert.equal((await stack.pool.query(`SELECT count(*)::int AS n FROM event_participants`)).rows[0].n, 0)
})

test('V17-5: 带合法 sha256 的核验正常入库且证据可追溯', { skip: !pgAvailable }, async () => {
  const sha = 'f'.repeat(64)
  const ok = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: {
      title: '证据链完整核验', scheduledAt: '2026-09-03T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceSha256: sha,
      slots: Array.from({ length: 6 }, (_, i) => ({
        slot: i + 1, playerId: `p-v17-ok-${i}`, nickname: `核验席位${i}`, finalRank: i + 1
      }))
    }
  })
  assert.equal(ok.status, 200, JSON.stringify(ok.json))

  const evd = (await stack.pool.query(
    `SELECT source_id, status FROM evidences WHERE sha256 = $1`, [sha]
  )).rows[0]
  assert.equal(evd.source_id, 'src-manual-review')
  assert.equal(evd.status, 'VERIFIED')

  // 该场核验产生的六条记录直接 ACTIVE（人工核验即放行动作）
  const active = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches WHERE player_id LIKE 'p-v17-ok-%'
      AND verified AND record_status = 'ACTIVE' AND superseded_at IS NULL`
  )).rows[0].n
  assert.equal(active, 6)
})
