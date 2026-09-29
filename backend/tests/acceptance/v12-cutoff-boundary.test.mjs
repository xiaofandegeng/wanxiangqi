// V12 · 比赛在截点前、系统在截点后才核验 → 赛前统计不纳入；
//        边界 matchTime=t 排除、availableAt=t 纳入
// 任务书 §5 V12。双时间截点语义（stats-core 唯一事实源 + PG SQL 等价实现）：
//   有效 ⇔ matchTime < t（严格小于）∧ availableAt ≤ t（含等号）
//   availableAt 缺失且有截点 → 排除（禁回退 matchTime）—— PG 侧以列级 NOT NULL
//   结构性保证（写入路径必须赋值，见 V12-3）；JS 侧排除语义由 V18 直测锁定。
// 用毫秒级精确时间在 t 两侧构造记录，锁死边界符号方向。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, insertPlayerRow, insertMatchRow, pgAvailable } from './_helpers.mjs'

let stack = null

const T = '2026-06-15T12:00:00.000Z'          // 截点 t
const T_MS = Date.parse(T)
const T2 = '2026-06-16T12:00:00.000Z'         // 晚截点（收录完成后）
const iso = ms => new Date(ms).toISOString()

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v12_test')
  await insertPlayerRow(stack.pool, { id: 'p-b', nickname: '边界语义选手' })

  //       id      matchTime      availableAt     rank  在 t 的期望
  // r_in_a  t-1ms        t-1ms            1   IN   （早于截点完赛且已收录）
  // r_out_m t（恰等）    t-1h             2   OUT  （matchTime=t 排除）
  // r_in_b  t-1h         t（恰等）        3   IN   （availableAt=t 纳入）
  // r_out_v t-1h         t+1ms            6   OUT  （截点后才核验 → 赛前统计不纳入）
  // r_late  t+1h         t+1h             5   OUT@t / IN@T2（晚完赛晚收录）
  await insertMatchRow(stack.pool, {
    id: 'r_in_a', playerId: 'p-b', matchTime: iso(T_MS - 1), availableAt: iso(T_MS - 1), finalRank: 1
  })
  await insertMatchRow(stack.pool, {
    id: 'r_out_m', playerId: 'p-b', matchTime: T, availableAt: iso(T_MS - 3600_000), finalRank: 2
  })
  await insertMatchRow(stack.pool, {
    id: 'r_in_b', playerId: 'p-b', matchTime: iso(T_MS - 3600_000), availableAt: T, finalRank: 3
  })
  await insertMatchRow(stack.pool, {
    id: 'r_out_v', playerId: 'p-b', matchTime: iso(T_MS - 3600_000), availableAt: iso(T_MS + 1), finalRank: 6
  })
  await insertMatchRow(stack.pool, {
    id: 'r_late', playerId: 'p-b', matchTime: iso(T_MS + 3600_000), availableAt: iso(T_MS + 3600_000), finalRank: 5
  })
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V12: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V12-1: 截点 t 的纳入/排除逐条精确（HTTP 层）', { skip: !pgAvailable }, async () => {
  const res = await stack.api(`/api/v1/players/p-b/stats?cutoff=${encodeURIComponent(T)}`)
  assert.equal(res.status, 200, JSON.stringify(res.json))
  const st = res.json.stats

  // 恰好 2 条纳入：r_in_a(rank1) + r_in_b(rank3)
  assert.equal(st.sampleCount, 2, `matchTime=t 排除 / availableAt=t 纳入 / 晚核验排除 / NULL收录排除 —— 实际 N=${st.sampleCount}`)
  assert.equal(st.firstPlaces, 1)
  assert.equal(st.top3Places, 2)
  assert.equal(st.avgRank, 2, '(1+3)/2')

  // 响应回显规范化后的截点参数（可追踪）
  assert.equal(res.json.params.cutoff, T)
})

test('V12-2: “比赛在截点前、系统在截点后才核验”→ 赛前统计不纳入，赛后截点才纳入', { skip: !pgAvailable }, async () => {
  // r_out_v：matchTime = t-1h（赛前）、availableAt = t+1ms（截点后才核验）
  const before = (await stack.api(`/api/v1/players/p-b/stats?cutoff=${encodeURIComponent(T)}`)).json.stats
  assert.equal(before.sampleCount, 2, '截点 t 视角看不到晚核验的对局（防未来信息泄漏）')

  const after = (await stack.api(`/api/v1/players/p-b/stats?cutoff=${encodeURIComponent(T2)}`)).json.stats
  // T2 视角：r_in_a(1) + r_out_m(2, matchTime=t<T2 且已收录) + r_in_b(3) + r_out_v(6) + r_late(5) = 5 局
  assert.equal(after.sampleCount, 5)
  assert.equal(after.firstPlaces, 1)
  assert.equal(after.top3Places, 3)
  assert.equal(after.avgRank, 3.4, '(1+2+3+6+5)/5')
})

test('V12-3: availableAt 缺失 → PG 侧结构性不可能（列级 NOT NULL），JS 侧语义由 V18 锁定', { skip: !pgAvailable }, async () => {
  // “availableAt 缺失且有截点 → 排除”的第一道防线是写入边界：
  // 正式库 matches.available_at 列 NOT NULL —— 导入/核验路径必须赋值，NULL 行无法存在
  const col = (await stack.pool.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'matches' AND column_name = 'available_at'`
  )).rows[0]
  assert.equal(col.is_nullable, 'NO', '收录时刻列必须 NOT NULL（防无收录时刻记录进入正式库）')

  // 第二道防线（stats-core JS，legacy 文件仓储路径的兜底语义）由 V18 直测
  // （fixtures 无法在 PG 侧表达 NULL availableAt —— 这正是结构性保证的意义）

  const st = (await stack.api(`/api/v1/players/p-b/stats?cutoff=${encodeURIComponent(T2)}`)).json.stats
  assert.equal(st.sampleCount, 5)

  // 无显式截点（隐式 now）：本测试运行于 2026-09，全部记录的 availableAt 均已过去 → 5 条全纳入
  const implicit = (await stack.api('/api/v1/players/p-b/stats')).json.stats
  assert.equal(implicit.sampleCount, 5, '隐式 now 口径与 T2 一致（无未来记录时）')
})

test('V12-4: SQL 直查与 HTTP 响应逐字段一致（同截点同结果）', { skip: !pgAvailable }, async () => {
  const oracle = (await stack.pool.query(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE final_rank = 1)::int AS first_places,
            count(*) FILTER (WHERE final_rank <= 3)::int AS top3_places,
            COALESCE(sum(final_rank), 0)::int AS rank_sum
     FROM matches
     WHERE player_id = 'p-b' AND verified AND record_status = 'ACTIVE' AND NOT synthetic
       AND final_rank BETWEEN 1 AND 6
       AND match_time < $1 AND available_at IS NOT NULL AND available_at <= $1`,
    [T]
  )).rows[0]
  const st = (await stack.api(`/api/v1/players/p-b/stats?cutoff=${encodeURIComponent(T)}`)).json.stats
  assert.equal(st.sampleCount, oracle.n)
  assert.equal(st.firstPlaces, oracle.first_places)
  assert.equal(st.top3Places, oracle.top3_places)
  assert.equal(st.avgRank, Number((oracle.rank_sum / oracle.n).toFixed(2)))
})
