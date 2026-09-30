// V17 · 匿名调用写接口、提交 verified:true → 未授权拒绝；授权导入也不能跳过证据核验流程
// 任务书 §5 V17。两道闸门：
//   闸门1（HTTP）：/api/v1/admin/* 全部 Bearer 鉴权，匿名/错 token 一律 401（含 GET 台账）
//   闸门2（语义）：即使持有效 token，verified 只能由“核验动作”授予——
//     导入入参 verified:true 被强制忽略（PENDING），统计不生效；
//     slots/confirm 必须绑定已入库、人工确认有效、原件可恢复的 evidenceId
//     （v4 W1 收紧：客户端自带 64 位字符串不再构成证据，不得伪造证据链）

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, insertEvidenceWithBlob, pgAvailable } from './_helpers.mjs'

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

test('V17-2: 有效 token 导入提交 verified:true → 被强制忽略；无证据不得核验放行', { skip: !pgAvailable }, async () => {
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

  // 复验2：无证据记录仅凭 verifiedBy 核验 → 422 拒绝（核验按钮 ≠ 证据链完整）
  const verifyNoEvidence = await stack.api(`/api/v1/admin/matches/${(await stack.pool.query(
    `SELECT id FROM matches WHERE player_id = 'p-v17'`
  )).rows[0].id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v17-auditor' }
  })
  assert.equal(verifyNoEvidence.status, 422, JSON.stringify(verifyNoEvidence.json))
  assert.match(verifyNoEvidence.json.error, /证据/)
  assert.equal((await stack.api('/api/v1/players/p-v17/stats')).json.stats.sampleCount, 0, '拒绝后仍不计入统计')

  // 唯一放行通道：证据链完整（记录自带 evidenceId，且原件可恢复）+ 核验动作
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-v17', sha256: '1'.repeat(64), status: 'VERIFIED', capturedAt: '2026-09-01T09:00:00Z'
  })
  const import2 = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{
        playerId: 'p-v17', matchTime: '2026-09-01T11:00:00Z', finalRank: 1,
        mode: 'RANKED_DIAMOND', evidenceId: 'ev-v17'
      }]
    }
  })
  assert.equal(import2.status, 200, JSON.stringify(import2.json))
  const withEvidence = (await stack.pool.query(
    `SELECT id, available_at FROM matches WHERE player_id = 'p-v17' AND evidence_id = 'ev-v17'`
  )).rows[0]
  const importAvailableAt = withEvidence.available_at

  const verify = await stack.api(`/api/v1/admin/matches/${withEvidence.id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v17-auditor' }
  })
  assert.equal(verify.status, 200, JSON.stringify(verify.json))
  assert.equal(verify.json.data.verified, true)
  assert.equal(verify.json.data.verifiedBy, 'v17-auditor')
  // 复验1：放行版本的 availableAt = 实际核验时刻（晚于导入时刻），不沿用导入时间
  assert.ok(new Date(verify.json.data.availableAt).getTime() > new Date(importAvailableAt).getTime(),
    'availableAt 必须是核验时刻而非导入时刻（过去截点不被回写）')
  assert.equal((await stack.api('/api/v1/players/p-v17/stats')).json.stats.sampleCount, 1)
})

test('V17-3: 核验动作必须留痕操作人（无 verifiedBy 拒绝）', { skip: !pgAvailable }, async () => {
  const res = await stack.api('/api/v1/admin/matches/nonexistent/verify', {
    method: 'POST', token: stack.adminToken, body: {}
  })
  assert.ok(res.status >= 400, '缺 verifiedBy 的核验请求必须被拒绝（操作留痕是核验的组成部分）')
})

test('V17-4: slots/confirm 缺 evidenceId / 证据不存在 / 指纹不符 → 拒绝（不得伪造证据链）', { skip: !pgAvailable }, async () => {
  const slots = Array.from({ length: 6 }, (_, i) => ({
    slot: i + 1, playerId: `p-v17-s${i}`, nickname: `席位${i}`, finalRank: i + 1
  }))
  // ① 无 evidenceId：客户端自带的 sha256 字符串不构成证据（v4 W1 收紧点）
  const noEvidence = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: { title: '无证据核验', scheduledAt: '2026-09-02T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceSha256: 'f'.repeat(64), slots }
  })
  assert.equal(noEvidence.status, 422, JSON.stringify(noEvidence.json))
  assert.equal(noEvidence.json.code_name, 'NO_EVIDENCE', '只带 sha 字符串、不带 evidenceId 不得放行')

  // ② evidenceId 指向不存在的证据
  const ghost = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: { title: '幽灵证据核验', scheduledAt: '2026-09-02T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceId: 'ev-never-exists', slots }
  })
  assert.equal(ghost.status, 422)
  assert.equal(ghost.json.code_name, 'EVIDENCE_NOT_FOUND')

  // ③ 证据存在但请求指纹与库内原件不符（传输校验）
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-v17-mismatch', sha256: '9'.repeat(64), status: 'VERIFIED', capturedAt: '2026-09-02T09:00:00Z'
  })
  const badSha = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: { title: '指纹不符核验', scheduledAt: '2026-09-02T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceId: 'ev-v17-mismatch', evidenceSha256: 'zz-not-sha', slots }
  })
  assert.equal(badSha.status, 422)
  assert.equal(badSha.json.code_name, 'SHA_MISMATCH', '请求指纹必须与库内证据原件一致')

  // 未落任何场次/席位（整体拒绝，无部分写入）
  assert.equal((await stack.api('/api/v1/events')).json.total, 0)
  assert.equal((await stack.pool.query(`SELECT count(*)::int AS n FROM event_participants`)).rows[0].n, 0)
})

test('V17-5: 上传原件→人工确认材料→evidenceId 核验入库，证据可追溯', { skip: !pgAvailable }, async () => {
  // v4 W1 完整链路：上传只产生 PENDING（上传≠核验）→ 人工确认有效 → evidenceId 才是放行凭据
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('V17-5-FIXTURE-six-seat-sheet-NOT-REAL')
  ])
  const q = new URLSearchParams({
    capturedAt: '2026-09-03T09:00:00Z', kind: 'SIX_SEAT_SHEET',
    usageScope: 'INTERNAL_ONLY', providedBy: 'v17'
  })
  const up = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/upload?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stack.adminToken}`, 'Content-Type': 'image/png', 'Content-Length': String(buf.length) },
    body: buf
  })
  const upJson = await up.json()
  assert.equal(up.status, 201, JSON.stringify(upJson))
  assert.equal(upJson.evidence.status, 'PENDING', '上传不等于核验')
  const evidenceId = upJson.evidenceId

  const sixSlots = Array.from({ length: 6 }, (_, i) => ({
    slot: i + 1, playerId: `p-v17-ok-${i}`, nickname: `核验席位${i}`, finalRank: i + 1
  }))

  // PENDING 材料直接拿去核验 → 422 EVIDENCE_PENDING（先人工确认，后放行）
  const tooEarly = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: { title: '未确认材料核验', scheduledAt: '2026-09-03T10:00:00Z', mode: 'RANKED_DIAMOND', evidenceId, slots: sixSlots }
  })
  assert.equal(tooEarly.status, 422, JSON.stringify(tooEarly.json))
  assert.equal(tooEarly.json.code_name, 'EVIDENCE_PENDING')

  // 人工确认材料有效
  const ack = await stack.api(`/api/v1/admin/evidences/${evidenceId}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v17-auditor' }
  })
  assert.equal(ack.status, 200, JSON.stringify(ack.json))
  assert.equal(ack.json.data.status, 'VERIFIED')

  const ok = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: {
      title: '证据链完整核验', scheduledAt: '2026-09-03T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceId, evidenceSha256: upJson.evidence.sha256,
      slots: sixSlots
    }
  })
  assert.equal(ok.status, 200, JSON.stringify(ok.json))

  const evd = (await stack.pool.query(
    `SELECT source_id, status FROM evidences WHERE id = $1`, [evidenceId]
  )).rows[0]
  assert.equal(evd.source_id, 'src-manual-review')
  assert.equal(evd.status, 'VERIFIED')

  // 该场核验产生的六条记录直接 ACTIVE（人工核验即放行动作），且全部可追溯到同一份材料
  const active = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches WHERE player_id LIKE 'p-v17-ok-%'
      AND verified AND record_status = 'ACTIVE' AND superseded_at IS NULL`
  )).rows[0].n
  assert.equal(active, 6)
  const linked = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches WHERE player_id LIKE 'p-v17-ok-%' AND evidence_id = $1`,
    [evidenceId]
  )).rows[0].n
  assert.equal(linked, 6, '六条记录全部挂接同一已核验证据（可追溯）')
})
