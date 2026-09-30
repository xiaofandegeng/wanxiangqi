// V08 · 未知玩家 / 昵称变更 / 同名玩家 → 不补战绩、不错合并；稳定身份正确
// 任务书 §5 V08。身份铁律：players 只按 playerId 稳定键 upsert（V08 禁止按昵称归并）；
// 未知选手不得获得任何战绩；同名不同人必须各自独立统计。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, countRows, insertEvidenceWithBlob, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v08_test')
  // 复验2 + v4 W1：核验强制证据链且原件可恢复 —— 三条存证材料连同原件一次就位
  //（ev-v08 供导入核验放行；ev-v08-r2 / ev-v08-r3 供两场席位确认）
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-v08', sha256: 'e'.repeat(64), status: 'VERIFIED', capturedAt: '2026-09-01T09:00:00Z'
  })
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-v08-r2', sha256: 'c'.repeat(64), status: 'VERIFIED', capturedAt: '2026-09-02T09:00:00Z'
  })
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-v08-r3', sha256: 'd'.repeat(64), status: 'VERIFIED', capturedAt: '2026-09-03T09:00:00Z'
  })
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V08: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V08-1: 未知玩家 → 统计 N=0、比率全 null，绝不补战绩', { skip: !pgAvailable }, async () => {
  const stats = await stack.api('/api/v1/players/ghost-never-existed/stats')
  assert.equal(stats.status, 200)
  assert.equal(stats.json.stats.sampleCount, 0)
  assert.equal(stats.json.stats.winRate, null)
  assert.equal(stats.json.stats.top3Rate, null)
  assert.equal(stats.json.stats.avgRank, null)
  assert.equal(stats.json.stats.coverageNote, '已收录 0 局')

  const matches = await stack.api('/api/v1/players/ghost-never-existed/matches')
  assert.equal(matches.json.total, 0, '未知玩家不得被填充任何历史战绩（禁 15 局 22% 式默认）')

  // 大盘查询不自动创建未知玩家
  const list = await stack.api('/api/v1/players')
  assert.equal(list.json.data.find(p => p.id === 'ghost-never-existed'), undefined)
})

test('V08-2: 昵称变更 → 同一稳定身份，战绩随人走，不产生新选手', { skip: !pgAvailable }, async () => {
  // 先以昵称“旧昵称”导入一局并核验
  const imp1 = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{ playerId: 'p-rename', nickname: '旧昵称', matchTime: '2026-09-01T10:00:00Z',
        finalRank: 1, mode: 'RANKED_DIAMOND', evidenceId: 'ev-v08' }],
      source: 'V08_RENAME_1'
    }
  })
  assert.equal(imp1.status, 200)
  const rec = (await stack.api('/api/v1/admin/imports/' + imp1.json.result.batchId, { token: stack.adminToken })).json.data.records[0]
  await stack.api(`/api/v1/admin/matches/${rec.id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v08' }
  })

  // 昵称变更为“新昵称”：走人工核验席位确认（按 playerId upsert；证据为已入库可恢复原件）
  const audit = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: {
      title: '昵称变更后的场次', scheduledAt: '2026-09-02T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceId: 'ev-v08-r2', evidenceSha256: 'c'.repeat(64),
      slots: Array.from({ length: 6 }, (_, i) => ({
        slot: i + 1, playerId: i === 0 ? 'p-rename' : `p-fill-${i}`, nickname: i === 0 ? '新昵称' : `补位${i}`,
        finalRank: i + 1
      }))
    }
  })
  assert.equal(audit.status, 200, JSON.stringify(audit.json))

  // 仍是同一稳定身份：players 表只有一行 p-rename，昵称已更新
  const rows = (await stack.pool.query(`SELECT nickname FROM players WHERE id = 'p-rename'`)).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].nickname, '新昵称')
  assert.equal(await countRows(stack.pool, 'players'), 6, '改名选手兼任席位1 + 5 个补位 = 6，绝无昵称归并产生的新行')

  // 战绩随稳定身份累计（导入 1 局 + 核验席位 1 局，且两局都是第 1 名）
  const stats = await stack.api('/api/v1/players/p-rename/stats')
  assert.equal(stats.json.stats.sampleCount, 2, '昵称变更不错乱身份归属的统计')
  assert.equal(stats.json.stats.firstPlaces, 2)

  // 旧昵称不再是独立选手（按昵称查不到第二个身份）
  const list = await stack.api('/api/v1/players?query=旧昵称')
  assert.equal(list.json.data.length, 0, '旧昵称不得残留为独立选手行')
})

test('V08-3: 同名不同玩家 → 各自独立统计，互不串档', { skip: !pgAvailable }, async () => {
  // 同一场次两个席位昵称完全相同、playerId 不同（证据 ev-v08-r3 已随 before() 入库）
  const audit = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: {
      title: '同名选手对局', scheduledAt: '2026-09-03T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceId: 'ev-v08-r3', evidenceSha256: 'd'.repeat(64),
      slots: [
        { slot: 1, playerId: 'p-same-a', nickname: '同名甲', finalRank: 1 },
        { slot: 2, playerId: 'p-same-b', nickname: '同名甲', finalRank: 6 },
        ...Array.from({ length: 4 }, (_, i) => ({ slot: i + 3, playerId: `p-fill2-${i}`, nickname: `补丁${i}`, finalRank: i + 3 }))
      ]
    }
  })
  assert.equal(audit.status, 200, JSON.stringify(audit.json))

  // 两个同名选手各自独立、统计正确分流
  const statsA = await stack.api('/api/v1/players/p-same-a/stats')
  const statsB = await stack.api('/api/v1/players/p-same-b/stats')
  assert.equal(statsA.json.stats.sampleCount, 1)
  assert.equal(statsA.json.stats.winRate, 1, '登顶者统计只归 p-same-a')
  assert.equal(statsB.json.stats.sampleCount, 1)
  assert.equal(statsB.json.stats.winRate, 0)
  assert.equal(statsB.json.stats.avgRank, 6, '垫底者统计只归 p-same-b，绝不错合并')

  const sameNameRows = (await stack.pool.query(
    `SELECT id FROM players WHERE nickname = '同名甲' ORDER BY id`
  )).rows
  assert.deepEqual(sameNameRows.map(r => r.id), ['p-same-a', 'p-same-b'], '同名两行独立身份')
})

test('V08-4: 重复导入不改昵称（导入路径 ON CONFLICT DO NOTHING，昵称以核验台更新为准）', { skip: !pgAvailable }, async () => {
  await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{ playerId: 'p-rename', nickname: '又一个冒名昵称', matchTime: '2026-09-04T10:00:00Z',
        finalRank: 2, mode: 'RANKED_DIAMOND' }],
      source: 'V08_DUP_NICK'
    }
  })
  const row = (await stack.pool.query(`SELECT nickname FROM players WHERE id = 'p-rename'`)).rows[0]
  assert.equal(row.nickname, '新昵称', '导入不得按昵称归并，也不得顺手改昵称')
})
