// M1-3 · 旧 API 退役验收：原赛事/玩家战绩/实时预测 API 一律 410 RETIRED，
// 不读旧数据、不留壳路由；保留面（ready/health/lineups/data-status）正常。
// 对照 docs/v6旧功能删除与数据归档对照表.md §3。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_m1_test')
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('M1: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('M1-3a: 公开旧 API 全部 410 + API_RETIRED（匿名即达，不读旧数据）', { skip: !pgAvailable }, async () => {
  const retired = [
    '/api/v1/players',
    '/api/v1/players/p-x/stats',
    '/api/v1/players/p-x/matches',
    '/api/v1/matches',
    '/api/v1/events',
    '/api/v1/events/ev-x',
    '/api/live/stream',
    '/api/live/analyze'
  ]
  for (const path of retired) {
    const res = await stack.api(path)
    assert.equal(res.status, 410, `GET ${path} 必须 410（实际 ${res.status}）`)
    assert.equal(res.json.code_name, 'API_RETIRED')
    assert.equal(res.json.retired, true)
    assert.equal(res.json.data, undefined, '退役响应不得携带任何旧数据载荷')
  }
  // POST 同样 410（不因方法不同而复活）
  const post = await stack.api('/api/live/analyze', { method: 'POST', body: { imageBase64: 'x' } })
  assert.equal(post.status, 410)
})

test('M1-3b: 管理旧 API 匿名 401 → 授权 410（退役面仍不绕过鉴权）', { skip: !pgAvailable }, async () => {
  const retiredAdmin = [
    '/api/v1/admin/events',
    '/api/v1/admin/matches',
    '/api/v1/admin/imports'
  ]
  for (const path of retiredAdmin) {
    const anon = await stack.api(path)
    assert.equal(anon.status, 401, `GET ${path} 匿名必须 401`)
    const authed = await stack.api(path, { token: stack.adminToken })
    assert.equal(authed.status, 410, `GET ${path} 授权后必须 410`)
    assert.equal(authed.json.code_name, 'API_RETIRED')
  }
})

test('M1-3c: 保留面正常 —— ready/health/lineups/data-status', { skip: !pgAvailable }, async () => {
  const ready = await stack.api('/api/v1/ready')
  assert.equal(ready.status, 200)
  assert.equal(ready.json.status, 'READY')

  const health = await stack.api('/api/v1/health')
  assert.equal(health.status, 200)
  assert.equal(health.json.counts.players, undefined, 'health 不再报告旧业务计数（players/matches/events）')
  assert.equal(health.json.counts.matches, undefined)
  assert.equal(health.json.counts.events, undefined)

  const lineups = await stack.api('/api/v1/lineups')
  assert.equal(lineups.status, 200)
  assert.equal(lineups.json.total, 0, '空库快照列表如实为空')
  assert.equal(typeof lineups.json.sourceNotice, 'string', '来源口径提示保留')

  const status = await stack.api('/api/v1/data-status')
  assert.equal(status.status, 200)
  assert.ok(Array.isArray(status.json.sources), '来源注册表保留')
})

test('M1-3d: 未注册路径 404（410 与 404 职责分离）', { skip: !pgAvailable }, async () => {
  const res = await stack.api('/api/v1/definitely-not-a-route')
  assert.equal(res.status, 404)
})
