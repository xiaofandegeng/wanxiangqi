// V05 · 数据库断开 → readiness=503、写失败；只读端点如实降级，绝不伪造数据
// 任务书 §5 V05。
//
// 断链构造：pool 指向本机无监听的端口（连接拒绝 = 权威存储不可达）。
// 注意 /api/v1/players 等读端点在断链下的行为：SQL 异常 → 非 2xx 错误响应
// （本栈读端点无缓存层；dataAsOf 每次现生成，不存在“旧缓存冒充现值”的路径）。
//
// 对照组：同一套栈先连健康测试库验证 ready=200，确保 503 来自断链本身。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'
import { PgRepository } from '../../src/repositories/pg-repository.mjs'
import { createServices } from '../../src/services/index.mjs'
import { createApiServer } from '../../../tools/emulator-watcher/index.mjs'

let healthy = null
let deadStack = null

before(async () => {
  if (!pgAvailable) return
  healthy = await bootAcceptanceStack('wanxiangqi_v05_test')

  // 断链栈：指向必然连接失败的端口（1 号端口，本机无监听）
  const { default: pg } = await import('pg')
  const PoolClass = pg.Pool || pg.default?.Pool
  const deadPool = new PoolClass({
    host: '127.0.0.1', port: 1, user: process.env.PGUSER || process.env.USER || 'lhw',
    database: 'wanxiangqi_v05_test', connectionTimeoutMillis: 500
  })
  const services = createServices(new PgRepository(deadPool), { appMode: 'formal' })
  const server = createApiServer({ services, adminToken: 'v05-token' })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (path, opts = {}) => {
    const headers = {}
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`
    if (opts.body) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${base}${path}`, {
      method: opts.method || 'GET', headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  }
  deadStack = {
    call,
    cleanup: async () => {
      await new Promise(r => server.close(r))
      await deadPool.end().catch(() => {})
    }
  }
})

after(async () => {
  if (deadStack) await deadStack.cleanup()
  if (healthy) await healthy.cleanup()
})

test('V05: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V05: 对照组 —— 健康库下 ready=200（证明 503 由断链触发而非路径错误）', { skip: !pgAvailable }, async () => {
  const ready = await healthy.api('/api/v1/ready')
  assert.equal(ready.status, 200)
  assert.equal(ready.json.status, 'READY')
})

test('V05: 断链下 readiness=503、健康如实报告不可达', { skip: !pgAvailable }, async () => {
  const ready = await deadStack.call('/api/v1/ready')
  assert.equal(ready.status, 503, '权威存储不可达时 readiness 必须 503')
  assert.equal(ready.json.status, 'UNAVAILABLE')

  const health = await deadStack.call('/api/v1/health')
  assert.equal(health.status, 200, 'liveness 存活探针本身可用（进程未死）')
  assert.equal(health.json.db.connected, false, 'health 必须如实报告库断开')
  assert.equal(health.json.counts, null, '断链下绝不输出旧计数/伪造计数')
})

test('V05: 断链下写接口失败且不返回成功语义', { skip: !pgAvailable }, async () => {
  const res = await deadStack.call('/api/v1/admin/imports', {
    method: 'POST', token: 'v05-token',
    body: {
      records: [{ playerId: 'p-v05', matchTime: '2026-09-01T10:00:00Z', finalRank: 1, mode: 'RANKED_DIAMOND' }],
      source: 'V05_DISCONNECTED'
    }
  })
  assert.ok(res.status >= 400, `断链写必须失败（实际 ${res.status}），不得返回成功`)
  assert.notEqual(res.json?.code, 0)
  assert.equal(res.json?.result, undefined, '失败响应不得携带伪造的导入结果')
})

test('V05: 断链下读接口失败响应不含任何编造数据；无缓存层冒充现值', { skip: !pgAvailable }, async () => {
  const players = await deadStack.call('/api/v1/players')
  assert.ok(players.status >= 400, '断链读不得伪装成空结果成功（任务书：失败展示失败）')
  assert.notEqual(players.json?.code, 0)
  assert.equal(Array.isArray(players.json?.data) && players.json.data.length > 0, false,
    '错误响应不得携带数据载荷')
})

test('V05: 存活探针与就绪探针职责分离（liveness 不依赖库）', { skip: !pgAvailable }, async () => {
  // health 端点永远 200（进程活着），库状态在 body 里如实呈现 —— 供探针配置区分使用
  const health = await deadStack.call('/api/v1/health')
  assert.equal(health.status, 200)
  assert.equal(health.json.status, 'UP')
})
