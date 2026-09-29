// V11 · 不同模式/版本/范围、未知模式 → 分母隔离正确，非法筛选参数报错
// 任务书 §5 V11。
//   - 模式分母隔离：RANKED_DIAMOND / TOURNAMENT / 未知模式互不渗透；mode=NULL 记录
//     在任何显式模式过滤下一律排除（禁止模糊通过）
//   - [from,to) 窗口：左闭右开
//   - 非法参数：cutoff/from/to 非日期、from>to、sort 白名单外、recordStatus 白名单外 → 400

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, insertPlayerRow, insertMatchRow, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v11_test')

  await insertPlayerRow(stack.pool, { id: 'p-f', nickname: '过滤语义选手' })
  // 四条已核验记录：两局排位、一局赛事、一局模式未知(null) + 一局未来完赛（隐式截点排除）
  await insertMatchRow(stack.pool, {
    id: 'm-f-1', playerId: 'p-f', matchTime: '2026-09-01T10:00:00Z', availableAt: '2026-09-01T10:05:00Z',
    finalRank: 1, mode: 'RANKED_DIAMOND'
  })
  await insertMatchRow(stack.pool, {
    id: 'm-f-2', playerId: 'p-f', matchTime: '2026-09-02T10:00:00Z', availableAt: '2026-09-02T10:05:00Z',
    finalRank: 2, mode: 'RANKED_DIAMOND'
  })
  await insertMatchRow(stack.pool, {
    id: 'm-f-3', playerId: 'p-f', matchTime: '2026-09-03T10:00:00Z', availableAt: '2026-09-03T10:05:00Z',
    finalRank: 3, mode: 'TOURNAMENT'
  })
  await insertMatchRow(stack.pool, {
    id: 'm-f-4', playerId: 'p-f', matchTime: '2026-09-04T10:00:00Z', availableAt: '2026-09-04T10:05:00Z',
    finalRank: 4, mode: null
  })
  await insertMatchRow(stack.pool, {
    id: 'm-f-5', playerId: 'p-f', matchTime: '2099-01-01T10:00:00Z', availableAt: '2099-01-01T10:05:00Z',
    finalRank: 1, mode: 'RANKED_DIAMOND'
  })
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V11: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V11-1: 模式分母隔离', { skip: !pgAvailable }, async () => {
  // 无模式过滤：四条历史已核验记录（未来记录被隐式截点 now 排除）
  const all = (await stack.api('/api/v1/players/p-f/stats')).json.stats
  assert.equal(all.sampleCount, 4)
  assert.equal(all.firstPlaces, 1)
  assert.equal(all.avgRank, 2.5)

  // RANKED_DIAMOND：仅 m-f-1 + m-f-2
  const ranked = (await stack.api('/api/v1/players/p-f/stats?mode=RANKED_DIAMOND')).json.stats
  assert.equal(ranked.sampleCount, 2)
  assert.equal(ranked.winRate, 0.5)
  assert.equal(ranked.avgRank, 1.5)

  // TOURNAMENT：仅 m-f-3
  const tour = (await stack.api('/api/v1/players/p-f/stats?mode=TOURNAMENT')).json.stats
  assert.equal(tour.sampleCount, 1)
  assert.equal(tour.winRate, 0)
  assert.equal(tour.avgRank, 3)

  // 未知模式：N=0 → 全 null（分母隔离，不得借用其他模式样本）
  const unknown = (await stack.api('/api/v1/players/p-f/stats?mode=DOES_NOT_EXIST')).json.stats
  assert.equal(unknown.sampleCount, 0)
  assert.equal(unknown.winRate, null)
  assert.equal(unknown.avgRank, null)

  // mode=NULL 的记录在任何显式模式过滤下排除
  assert.equal((await stack.api('/api/v1/players/p-f/stats?mode=RANKED_DIAMOND')).json.stats.sampleCount, 2)
  assert.equal((await stack.api('/api/v1/players/p-f/stats?mode=TOURNAMENT')).json.stats.sampleCount, 1)
})

test('V11-2: [from,to) 窗口左闭右开', { skip: !pgAvailable }, async () => {
  // [09-02, 09-04)：含 m-f-2（=from 纳入）、m-f-3；排除 m-f-1、m-f-4（=to 排除）
  const win = (await stack.api('/api/v1/players/p-f/stats?from=2026-09-02T00:00:00Z&to=2026-09-04T00:00:00Z')).json.stats
  assert.equal(win.sampleCount, 2)
  assert.equal(win.avgRank, 2.5)

  // 精确到时刻的端点：to=m-f-3 的 matchTime → m-f-3 排除（右开）
  const tillOpen = (await stack.api('/api/v1/players/p-f/stats?to=2026-09-03T10:00:00Z')).json.stats
  assert.equal(tillOpen.sampleCount, 2, '仅 m-f-1、m-f-2')
  // from=m-f-3 的 matchTime → m-f-3 纳入（左闭）
  const fromClosed = (await stack.api('/api/v1/players/p-f/stats?from=2026-09-03T10:00:00Z')).json.stats
  assert.equal(fromClosed.sampleCount, 2, 'm-f-3 + m-f-4')
})

test('V11-3: 非法筛选参数一律 400 且带字段定位', { skip: !pgAvailable }, async () => {
  const badCases = [
    ['/api/v1/players/p-f/stats?cutoff=not-a-date', 'cutoff'],
    ['/api/v1/players/p-f/stats?from=2026-09-28T00:00:00Z&to=2026-09-01T00:00:00Z', 'from'],
    ['/api/v1/players/p-f/stats?to=yesterday', 'to'],
    ['/api/v1/players/p-f/stats?from=boom', 'from'],
    ['/api/v1/players?sort=; DROP TABLE players', 'sort'],
    ['/api/v1/players/p-f/matches?recordStatus=WHATEVER', 'recordStatus']
  ]
  for (const [url, field] of badCases) {
    const res = await stack.api(url)
    assert.equal(res.status, 400, `${url} 必须 400（实际 ${res.status}）`)
    assert.equal(res.json.code, 400)
    assert.equal(res.json.field, field, `${url} 错误体必须定位非法字段`)
  }
})

test('V11-4: 版本过滤语义 —— 过期 revision 记录不进任何统计口径', { skip: !pgAvailable }, async () => {
  // 构造被取代版本：m-f-1 的修正版（同键 revision 2）
  await insertMatchRow(stack.pool, {
    id: 'm-f-1-r2', playerId: 'p-f', matchTime: '2026-09-01T10:00:00Z', availableAt: '2026-09-05T10:05:00Z',
    finalRank: 6, mode: 'RANKED_DIAMOND', recordKey: 'v11:m-f-1', revision: 2
  })
  await stack.pool.query(
    `UPDATE matches SET record_key = 'v11:m-f-1', superseded_at = '2026-09-05T10:05:00Z' WHERE id = 'm-f-1'`
  )

  // 当前口径：v2（rank6）可见，v1 不重复计数
  const now = (await stack.api('/api/v1/players/p-f/stats')).json.stats
  assert.equal(now.sampleCount, 4, '版本更正不改变分母（同键只计一次）')
  assert.equal(now.avgRank, 3.75, '(6+2+3+4)/4 —— 名次 1 已被更正为 6')

  // 历史截点（更正生效前）：v1（rank1）可见
  const before = (await stack.api('/api/v1/players/p-f/stats?cutoff=2026-09-04T00:00:00Z')).json.stats
  assert.equal(before.sampleCount, 3, 'm-f-1(v1) + m-f-2 + m-f-3')
  assert.equal(before.avgRank, 2)
})

test('V11-5: 大盘列表 mode 过滤同样隔离（列表统计与单查统计一致）', { skip: !pgAvailable }, async () => {
  const list = (await stack.api('/api/v1/players?mode=TOURNAMENT')).json
  const p = list.data.find(x => x.id === 'p-f')
  assert.equal(p.stats.sampleCount, 1)
  assert.equal(p.stats.avgRank, 3)
})
