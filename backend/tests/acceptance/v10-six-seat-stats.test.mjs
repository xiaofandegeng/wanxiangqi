// V10 · 六席模式名次 1～6 → N=6、登顶=1、前三=3、均名=3.5；另测零夺冠与空样本
// 任务书 §5 V10。三个互斥场景全部锁死：
//   A. 单选手六局名次恰为 1..6（六席分布的完整枚举）→ oracle 3.5 均名
//   B. 零夺冠（有样本但无第 1 名）→ winRate=0（非 null、非兜底）
//   C. 空样本 → 全部 null（禁 0 兜底伪装已知）
//   D. 整场六席人工核验：六名选手各持一个名次，聚合口径与 A 等价

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, insertPlayerRow, insertMatchRow, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v10_test')

  // A: p-six 六局名次 1..6
  await insertPlayerRow(stack.pool, { id: 'p-six', nickname: '六局全席位选手' })
  for (let rank = 1; rank <= 6; rank++) {
    await insertMatchRow(stack.pool, {
      id: `m-six-${rank}`, playerId: 'p-six',
      matchTime: `2026-09-0${rank}T10:00:00Z`, availableAt: `2026-09-0${rank}T10:05:00Z`,
      finalRank: rank
    })
  }

  // B: p-zero 三局名次 [2,2,3] —— 有样本、零夺冠
  await insertPlayerRow(stack.pool, { id: 'p-zero', nickname: '零夺冠选手' })
  for (const [i, rank] of [2, 2, 3].entries()) {
    await insertMatchRow(stack.pool, {
      id: `m-zero-${i}`, playerId: 'p-zero',
      matchTime: `2026-09-1${i}T10:00:00Z`, availableAt: `2026-09-1${i}T10:05:00Z`,
      finalRank: rank
    })
  }

  // C: p-empty 已登记选手、零记录
  await insertPlayerRow(stack.pool, { id: 'p-empty', nickname: '空样本选手' })
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V10: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V10-A: 六局名次 1..6 → N=6、登顶=1、前三=3、winRate=1/6、top3Rate=0.5、均名=3.5', { skip: !pgAvailable }, async () => {
  const s = await stack.api('/api/v1/players/p-six/stats')
  assert.equal(s.status, 200)
  const st = s.json.stats
  assert.equal(st.sampleCount, 6)
  assert.equal(st.firstPlaces, 1)
  assert.equal(st.top3Places, 3)
  assert.equal(st.winRate, 0.1667, '1/6 四位小数')
  assert.equal(st.top3Rate, 0.5)
  assert.equal(st.avgRank, 3.5, '六席全集均名 oracle 值')
  assert.equal(st.coverageNote, '已收录 6 局')
})

test('V10-B: 零夺冠 → winRate=0（有样本时禁 null 兜底）', { skip: !pgAvailable }, async () => {
  const st = (await stack.api('/api/v1/players/p-zero/stats')).json.stats
  assert.equal(st.sampleCount, 3)
  assert.equal(st.firstPlaces, 0)
  assert.equal(st.winRate, 0, 'N>0 无夺冠 → 必须是 0，不是 null')
  assert.equal(st.top3Places, 3, '名次 [2,2,3] 全部进入前三')
  assert.equal(st.top3Rate, 1)
  assert.equal(st.avgRank, 2.33, '(2+2+3)/3 两位小数')
})

test('V10-C: 空样本 → 比率/均名全 null、如实告知', { skip: !pgAvailable }, async () => {
  const st = (await stack.api('/api/v1/players/p-empty/stats')).json.stats
  assert.equal(st.sampleCount, 0)
  assert.equal(st.winRate, null, 'N=0 禁 0 兜底 —— 0 会伪装成“已知的不胜”')
  assert.equal(st.top3Rate, null)
  assert.equal(st.avgRank, null)
  assert.equal(st.coverageNote, '已收录 0 局')
  assert.equal(st.warning, '暂无已核验战绩')
  assert.equal(st.isSmallSample, true)
})

test('V10-D: 整场六席人工核验 → 六选手聚合口径与 A 等价', { skip: !pgAvailable }, async () => {
  const sha = 'e'.repeat(64)
  const audit = await stack.api('/api/v1/admin/slots/confirm', {
    method: 'POST', token: stack.adminToken,
    body: {
      title: '六席完整场次', scheduledAt: '2026-09-20T10:00:00Z', mode: 'RANKED_DIAMOND',
      evidenceSha256: sha,
      slots: Array.from({ length: 6 }, (_, i) => ({
        slot: i + 1, playerId: `p-seat-${i + 1}`, nickname: `席位${i + 1}`, finalRank: i + 1
      }))
    }
  })
  assert.equal(audit.status, 200, JSON.stringify(audit.json))

  // 席位 wire：六席名次恰为 1..6
  const detail = (await stack.api('/api/v1/events/' + audit.json.data.id)).json.data
  assert.deepEqual(detail.participants.map(p => p.finalRank), [1, 2, 3, 4, 5, 6])

  // 每名选手 N=1；聚合：总登顶 1、总前三 3、均名均值 3.5
  let firstSum = 0
  let top3Sum = 0
  let avgSum = 0
  for (let i = 1; i <= 6; i++) {
    const st = (await stack.api(`/api/v1/players/p-seat-${i}/stats`)).json.stats
    assert.equal(st.sampleCount, 1, '每席位恰好一局（不补、不并）')
    firstSum += st.firstPlaces
    top3Sum += st.top3Places
    avgSum += st.avgRank
  }
  assert.equal(firstSum, 1, '一场六席对局全局只有一个第 1 名')
  assert.equal(top3Sum, 3)
  assert.equal(avgSum / 6, 3.5, '六席均名聚合 oracle')
})
