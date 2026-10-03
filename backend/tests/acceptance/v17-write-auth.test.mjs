// V17 · 匿名/错 token 调用管理接口 → 401；上传不等于核验（v6 适配）
// 两道闸门：
//   闸门1（HTTP）：/api/v1/admin/* 全部 Bearer 鉴权，匿名/错 token 一律 401（含 GET 台账）
//   闸门2（语义）：素材原件上传只产生 PENDING；有效与否只能由人工确认动作
//     （POST /api/v1/admin/evidences/:id/verify）流转，且核验留痕操作人
//   退役管理路径（imports/matches/slots 等）对匿名仍是 401（不因退役而绕过鉴权），
//   持有效 token 才见 410 RETIRED。

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

test('V17-1: 匿名 / 错误 token 调用全部管理接口 → 401', { skip: !pgAvailable }, async () => {
  const cases = [
    ['POST', '/api/v1/admin/sources/src-hokace-wiki/sync', null],
    ['GET', '/api/v1/admin/sync-jobs', null],
    ['GET', '/api/v1/admin/raw-materials', null],
    ['GET', '/api/v1/admin/raw-materials/rm-x', null],
    ['GET', '/api/v1/admin/evidences', null],
    ['GET', '/api/v1/admin/evidences/ev-x', null],
    ['GET', '/api/v1/admin/evidences/ev-x/content', null],
    ['POST', '/api/v1/admin/evidences/ev-x/verify', { verifiedBy: 'x' }],
    // 退役路径同样先过鉴权闸门（匿名不得探测退役面）
    ['POST', '/api/v1/admin/imports', { records: [] }],
    ['POST', '/api/v1/admin/slots/confirm', { slots: [] }],
    ['GET', '/api/v1/admin/matches', null]
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
  // 管理写入零发生
  const health = await stack.api('/api/v1/health')
  assert.equal(health.json.counts.evidences, 0)
  assert.equal(health.json.counts.syncJobs, 0)
})

test('V17-2: 上传只产生 PENDING；人工确认才 VERIFIED 且留痕操作人', { skip: !pgAvailable }, async () => {
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('V17-2-FIXTURE-content-asset')
  ])
  const q = new URLSearchParams({ capturedAt: '2026-10-03T09:00:00Z', kind: 'CONTENT_ASSET', usageScope: 'INTERNAL_ONLY' })
  const up = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/upload?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stack.adminToken}`, 'Content-Type': 'image/png', 'Content-Length': String(buf.length) },
    body: buf
  })
  assert.equal(up.status, 201)
  const upJson = await up.json()
  assert.equal(upJson.evidence.status, 'PENDING', '上传不等于核验')
  const evidenceId = upJson.evidenceId

  const ack = await stack.api(`/api/v1/admin/evidences/${evidenceId}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v17-auditor' }
  })
  assert.equal(ack.status, 200)
  assert.equal(ack.json.data.status, 'VERIFIED')
  assert.equal(ack.json.data.verifiedBy, 'v17-auditor', '核验动作必须留痕操作人')

  const row = (await stack.pool.query(`SELECT status, verified_by FROM evidences WHERE id = $1`, [evidenceId])).rows[0]
  assert.equal(row.status, 'VERIFIED')
  assert.equal(row.verified_by, 'v17-auditor')
})

test('V17-3: 退役管理路径持有效 token → 410 RETIRED（不读旧数据、不留壳）', { skip: !pgAvailable }, async () => {
  const cases = [
    ['POST', '/api/v1/admin/imports'],
    ['GET', '/api/v1/admin/imports/batch-x'],
    ['POST', '/api/v1/admin/slots/confirm'],
    ['GET', '/api/v1/admin/matches'],
    ['POST', '/api/v1/admin/matches/mh-x/verify'],
    ['GET', '/api/v1/admin/events']
  ]
  for (const [method, path] of cases) {
    const res = await stack.api(path, { method, token: stack.adminToken, body: method === 'GET' ? null : {} })
    assert.equal(res.status, 410, `${method} ${path} 授权后应答 410（实际 ${res.status}）`)
    assert.equal(res.json.code_name, 'API_RETIRED')
    assert.equal(res.json.retired, true)
  }
})
