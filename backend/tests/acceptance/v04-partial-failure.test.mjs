// V04 · 数据库写入中途失败 → 无部分提交；API 不返回成功；查询不出现已失败记录
// 任务书 §5 V04。两类中途失败：
//   A. 校验层：批量中第 2 条非法 → 整批 400，任何一条都不入库
//   B. 事务层：第 2 条触发数据库约束（测试库临时 CHECK 约束模拟真实写失败）
//      → 单事务整体回滚，players/matches/import_batches 计数全部不变
// 成功对照：解除约束后同批 3 条全部入库，证明 A/B 的“零写入”不是路径没走到。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, countRows, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v04_test')
})

after(async () => {
  if (!stack) return
  await stack.pool.query('DROP TABLE IF EXISTS v04_probe').catch(() => {})
  await stack.cleanup()
})

test('V04: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V04-A: 校验层整批失败 → 400 且零写入', { skip: !pgAvailable }, async () => {
  const countsBefore = {
    players: await countRows(stack.pool, 'players'),
    matches: await countRows(stack.pool, 'matches'),
    batches: await countRows(stack.pool, 'import_batches')
  }

  // 第 2 条 finalRank=9 非法 → 整批拒绝（含合法的第 1 条）
  const res = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [
        { playerId: 'p-v04a', matchTime: '2026-09-01T10:00:00Z', finalRank: 1, mode: 'RANKED_DIAMOND' },
        { playerId: 'p-v04b', matchTime: '2026-09-01T11:00:00Z', finalRank: 9, mode: 'RANKED_DIAMOND' }
      ],
      source: 'V04_VALIDATION_FAIL'
    }
  })
  assert.equal(res.status, 400, '校验失败必须是 400，绝不返回成功')
  assert.notEqual(res.json.code, 0)

  assert.equal(await countRows(stack.pool, 'players'), countsBefore.players, '合法的第 1 条也不得入库')
  assert.equal(await countRows(stack.pool, 'matches'), countsBefore.matches)
  assert.equal(await countRows(stack.pool, 'import_batches'), countsBefore.batches, '批次台账不留失败批次')

  const stats = await stack.api('/api/v1/players/p-v04a/stats')
  assert.equal(stats.json.stats.sampleCount, 0, '查询端不出现已失败批次中的任何记录')
})

test('V04-B: 事务层第 2 条中途 SQL 失败 → 单事务整体回滚', { skip: !pgAvailable }, async () => {
  const countsBefore = {
    players: await countRows(stack.pool, 'players'),
    matches: await countRows(stack.pool, 'matches'),
    batches: await countRows(stack.pool, 'import_batches')
  }

  // 临时约束：mode='V04_TRIGGER' 的行直接被库拒绝（模拟真实写路径失败点）
  await stack.pool.query(`ALTER TABLE matches ADD CONSTRAINT v04_guard CHECK (mode IS DISTINCT FROM 'V04_TRIGGER')`)

  try {
    const res = await stack.api('/api/v1/admin/imports', {
      method: 'POST', token: stack.adminToken,
      body: {
        records: [
          { playerId: 'p-v04a', matchTime: '2026-09-02T10:00:00Z', finalRank: 1, mode: 'RANKED_DIAMOND' },
          { playerId: 'p-v04b', matchTime: '2026-09-02T11:00:00Z', finalRank: 2, mode: 'V04_TRIGGER' },
          { playerId: 'p-v04c', matchTime: '2026-09-02T12:00:00Z', finalRank: 3, mode: 'RANKED_DIAMOND' }
        ],
        source: 'V04_TX_FAIL'
      }
    })
    assert.ok(res.status >= 400, `写中途失败必须非 2xx（实际 ${res.status}）`)
    assert.notEqual(res.json?.code, 0, 'API 不得返回成功语义')

    // 无部分提交：三表计数与失败前完全一致
    assert.equal(await countRows(stack.pool, 'players'), countsBefore.players, '已写入的 p-v04a 必须随事务回滚')
    assert.equal(await countRows(stack.pool, 'matches'), countsBefore.matches)
    assert.equal(await countRows(stack.pool, 'import_batches'), countsBefore.batches)

    // 查询端不出现“已失败记录”（任何 recordStatus 过滤口径下都没有 p-v04b）
    const all = await stack.api('/api/v1/matches?recordStatus=PENDING&limit=200')
    assert.equal(all.json.data.filter(m => m.playerId.startsWith('p-v04')).length, 0)
  } finally {
    await stack.pool.query('ALTER TABLE matches DROP CONSTRAINT v04_guard')
  }
})

test('V04-C: 解除故障后同批数据成功入库（对照组：失败用例的路径确实被执行）', { skip: !pgAvailable }, async () => {
  const res = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [
        { playerId: 'p-v04a', matchTime: '2026-09-02T10:00:00Z', finalRank: 1, mode: 'RANKED_DIAMOND' },
        { playerId: 'p-v04b', matchTime: '2026-09-02T11:00:00Z', finalRank: 2, mode: 'RANKED_DIAMOND' },
        { playerId: 'p-v04c', matchTime: '2026-09-02T12:00:00Z', finalRank: 3, mode: 'RANKED_DIAMOND' }
      ],
      source: 'V04_SUCCESS'
    }
  })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  assert.equal(res.json.result.inserted, 3)
  assert.equal(await countRows(stack.pool, 'matches'), 3)
  assert.equal(await countRows(stack.pool, 'players'), 3)
})
