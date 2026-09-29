// V18 · 统计口径双实现等价性验收（PG SQL ⇄ stats-core JS）
// 任务书 §5 V18：同一组事实记录 + 同一组查询参数，PgRepository（SQL count(*) FILTER
// + 可见版本 CTE）与 FileRepository/StorageEngine（stats-core.mjs 纯函数）必须给出
// 逐字段一致的结果；同时对若干参数组合断言手工推演的“oracle 值”，防止两侧同错。
//
// 铁律：仅连接 *_test 库（helpers/pg-test.mjs 强制校验），业务库零接触。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { runMigrations } from '../../src/migrate.mjs'
import { PgRepository } from '../../src/repositories/pg-repository.mjs'
import { FileRepository } from '../../src/repositories/file-repository.mjs'
import { StatsService } from '../../src/services/stats.mjs'
import { connectTestDb, recreateTestDb, isLocalPgAvailable } from '../helpers/pg-test.mjs'
import { makeTmpStore } from '../helpers/tmp-store.mjs'

const pgAvailable = await isLocalPgAvailable()

// ---------------------------------------------------------------------------
// 事实记录 fixtures：单一事实源，同时展开为 SQL 行与 JS 记录
// 覆盖维度：未核验 / 隔离 / 撤销 / 待核验 / 晚到 / 未来 / 截点边界（matchTime==cut 排除、
// availableAt==cut 纳入）/ 模式缺失 / 模式不匹配 / SCD-2 版本链（v1 被更正为 v2）/
// 无 record_key 遗留行
// ---------------------------------------------------------------------------
const FIX = [
  // id,        matchTime,            availableAt,          rank, mode,             verified, status,      synthetic, recordKey, rev, supersededAt
  ['m1',  '2026-09-20T10:00:00Z', '2026-09-20T10:05:00Z', 1, 'RANKED_DIAMOND', true,  'ACTIVE',     false, null,      1, null],
  ['m2',  '2026-09-20T11:00:00Z', '2026-09-20T11:05:00Z', 2, 'RANKED_DIAMOND', false, 'PENDING',    false, null,      1, null], // 未核验 → 排除
  ['m3',  '2026-09-20T12:00:00Z', '2026-09-20T12:05:00Z', 1, 'RANKED_DIAMOND', true,  'QUARANTINED',true,  null,      1, null], // 隔离+合成 → 排除
  ['m4',  '2026-09-20T13:00:00Z', '2026-09-20T13:05:00Z', 3, 'RANKED_DIAMOND', true,  'REVOKED',    false, null,      1, null], // 撤销 → 排除
  ['m5',  '2026-09-21T10:00:00Z', '2026-09-26T10:00:00Z', 1, 'RANKED_DIAMOND', true,  'ACTIVE',     false, null,      1, null], // 晚到：09-25 截点外、09-27 内
  ['m6',  '2026-09-26T10:00:00Z', '2026-09-26T10:05:00Z', 2, 'RANKED_DIAMOND', true,  'ACTIVE',     false, null,      1, null], // 截点后完赛
  ['m7',  '2026-09-25T12:00:00Z', '2026-09-25T11:00:00Z', 1, 'RANKED_DIAMOND', true,  'ACTIVE',     false, null,      1, null], // matchTime==cutoff → 排除
  ['m8',  '2026-09-24T10:00:00Z', '2026-09-25T12:00:00Z', 6, 'RANKED_DIAMOND', true,  'ACTIVE',     false, null,      1, null], // availableAt==cutoff → 纳入
  ['m9',  '2026-09-22T10:00:00Z', '2026-09-22T10:05:00Z', 4, 'TOURNAMENT',     true,  'ACTIVE',     false, null,      1, null],
  ['m10', '2026-09-22T11:00:00Z', '2026-09-22T11:05:00Z', 2, null,            true,  'ACTIVE',     false, null,      1, null], // 模式缺失：任何 mode 过滤下排除
  ['k1v1','2026-09-22T12:00:00Z', '2026-09-22T12:05:00Z', 1, 'RANKED_DIAMOND', true,  'ACTIVE',     false, 'eq-key-1',1, '2026-09-23T10:00:00Z'], // 版本链 v1（已被更正）
  ['k1v2','2026-09-22T12:00:00Z', '2026-09-23T10:00:00Z', 5, 'RANKED_DIAMOND', true,  'ACTIVE',     false, 'eq-key-1',2, null]                   // 版本链 v2（当前版）
]

const PLAYERS = ['p-eq', 'p-eq-empty', 'p-eq-s19', 'p-eq-s20']

let pool = null
let pgRepo = null
let fileRepo = null
let engine = null
let cleanupTmp = null
let pgSvc = null
let fileSvc = null

function jsRecord(row) {
  const [id, matchTime, availableAt, finalRank, mode, verified, recordStatus, synthetic, recordKey, revision, supersededAt] = row
  return {
    id, playerId: 'p-eq', matchTime, availableAt, finalRank, mode, verified, recordStatus, synthetic,
    recordKey, revision, supersededAt,
    commander: null, lineup: null, roundsSurvived: null, threeStars: [], batchId: null, evidenceId: null
  }
}

before(async () => {
  if (!pgAvailable) return
  // 1. 重建测试库（仅 *_test 库，helpers 强制校验）并应用迁移 → 空净 schema
  await recreateTestDb()
  pool = await connectTestDb()
  const client = await pool.connect()
  try {
    await runMigrations(client, { logger: { log() {} } })
  } finally {
    client.release()
  }

  // 2. players 基础行（matches.player_id 外键依赖）
  for (const pid of PLAYERS) {
    await pool.query('INSERT INTO players (id, nickname) VALUES ($1, $2)', [pid, pid])
  }

  // 3. p-eq 事实记录：SQL 侧
  for (const r of FIX) {
    const [id, matchTime, availableAt, finalRank, mode, verified, recordStatus, synthetic, recordKey, revision, supersededAt] = r
    await pool.query(
      `INSERT INTO matches (id, player_id, match_time, available_at, final_rank, mode, verified,
                            record_status, synthetic, record_key, revision, superseded_at)
       VALUES ($1,'p-eq',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, matchTime, availableAt, finalRank, mode, verified, recordStatus, synthetic, recordKey, revision, supersededAt]
    )
  }
  // 小样本边界：19 局 / 20 局（阈值 20 → isSmallSample 边界）
  for (const [pid, n] of [['p-eq-s19', 19], ['p-eq-s20', 20]]) {
    for (let i = 0; i < n; i++) {
      await pool.query(
        `INSERT INTO matches (id, player_id, match_time, available_at, final_rank, mode, verified, record_status)
         VALUES ($1,$2,$3,$4,$5,'RANKED_DIAMOND',TRUE,'ACTIVE')`,
        [`${pid}-m${i}`, pid, `2026-09-20T10:00:00Z`, `2026-09-20T10:05:00Z`, (i % 6) + 1]
      )
    }
  }

  // 4. JS 侧：临时目录 StorageEngine + FileRepository（同一批事实记录的 camelCase 镜像）
  const tmp = makeTmpStore()
  engine = tmp.engine
  cleanupTmp = tmp.cleanup
  engine.state.players.push(...PLAYERS.map(id => ({ id, nickname: id, platform: 'DEFAULT' })))
  engine.state.matches.push(...FIX.map(jsRecord))
  for (const [pid, n] of [['p-eq-s19', 19], ['p-eq-s20', 20]]) {
    for (let i = 0; i < n; i++) {
      engine.state.matches.push({
        id: `${pid}-m${i}`, playerId: pid, matchTime: '2026-09-20T10:00:00Z', availableAt: '2026-09-20T10:05:00Z',
        finalRank: (i % 6) + 1, mode: 'RANKED_DIAMOND', verified: true, recordStatus: 'ACTIVE', synthetic: false,
        recordKey: null, revision: 1, supersededAt: null, commander: null, lineup: null, roundsSurvived: null,
        threeStars: [], batchId: null, evidenceId: null
      })
    }
  }
  fileRepo = new FileRepository(engine)
  pgRepo = new PgRepository(pool)
  pgSvc = new StatsService(pgRepo, { smallSampleThreshold: 20 })
  fileSvc = new StatsService(fileRepo, { smallSampleThreshold: 20 })
})

after(async () => {
  if (cleanupTmp) cleanupTmp()
  if (pool) await pool.end().catch(() => {})
})

/**
 * 等价性断言：两侧 getPlayerStats 输出必须 deepEqual（stats + params + playerId）
 */
async function assertEquivalent(playerId, params, label) {
  const fromPg = await pgSvc.getPlayerStats(playerId, params)
  const fromJs = await fileSvc.getPlayerStats(playerId, params)
  assert.deepEqual(
    fromJs.stats,
    fromPg.stats,
    `等价性破裂 [${label}] player=${playerId}: JS=${JSON.stringify(fromJs.stats)} vs PG=${JSON.stringify(fromPg.stats)}`
  )
  return fromPg.stats
}

test('V18: 环境前置（本地 PG 不可用则整体 skip，禁止误报失败）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V18: 等价性矩阵 —— 全参数组合 PG SQL ≡ stats-core JS', { skip: !pgAvailable }, async () => {
  const matrix = [
    [{ cutoffTime: '2026-09-25T12:00:00Z' }, '中窗截点'],
    [{ cutoffTime: '2026-09-22T23:59:00Z' }, '版本链切换前截点(v1 可见)'],
    [{ cutoffTime: '2026-09-27T12:00:00Z' }, '晚到数据已收录截点'],
    [{}, '无截点(隐式 now，全部历史已可知)'],
    [{ cutoffTime: '2026-09-25T12:00:00Z', mode: 'TOURNAMENT' }, '模式过滤'],
    [{ cutoffTime: '2026-09-25T12:00:00Z', mode: 'RANKED_DIAMOND' }, '模式过滤(主模式)'],
    [{ from: '2026-09-24T00:00:00Z', to: '2026-09-25T10:00:00Z' }, '[from,to) 窗口'],
    [{ from: '2026-09-22T12:00:00Z', to: '2026-09-23T10:00:00Z' }, '窗口含版本链切换点'],
    [{ cutoffTime: '2026-09-25T12:00:00Z', from: '2026-09-21T00:00:00Z', to: '2026-09-26T00:00:00Z' }, '截点+窗口叠加'],
    [{ cutoffTime: '2026-09-19T00:00:00Z' }, '早于全部记录的截点(N=0)']
  ]
  for (const playerId of PLAYERS) {
    for (const [params, label] of matrix) {
      await assertEquivalent(playerId, params, `${playerId} / ${label}`)
    }
  }
})

test('V18: oracle 断言 —— 手工推演值（防两侧同错）', { skip: !pgAvailable }, async () => {
  // 截点 09-25T12:00 —— 有效集 {m1(rank1), m8(rank6), m9(rank4), m10(rank2), k1→v2(rank5)}
  const mid = await pgSvc.getPlayerStats('p-eq', { cutoffTime: '2026-09-25T12:00:00Z' })
  assert.equal(mid.stats.sampleCount, 5)
  assert.equal(mid.stats.firstPlaces, 1)
  assert.equal(mid.stats.top3Places, 2)
  assert.equal(mid.stats.winRate, 0.2)
  assert.equal(mid.stats.top3Rate, 0.4)
  assert.equal(mid.stats.avgRank, 3.6)

  // 截点 09-22T23:59 —— k1 取 v1(rank1)；有效集 {m1, m9(rank4), m10(rank2), k1v1}
  const early = await pgSvc.getPlayerStats('p-eq', { cutoffTime: '2026-09-22T23:59:00Z' })
  assert.equal(early.stats.sampleCount, 4)
  assert.equal(early.stats.firstPlaces, 2)
  assert.equal(early.stats.top3Places, 3)
  assert.equal(early.stats.avgRank, 2)
  // 版本更正生效：同一 record_key 在早截点贡献 rank1、晚截点贡献 rank5（SCD-2 可回溯）

  // 无截点（now ≥ 09-29）：8 局 {m1,m5,m6,m7,m8,m9,m10,k1v2}
  const all = await pgSvc.getPlayerStats('p-eq', {})
  assert.equal(all.stats.sampleCount, 8)
  assert.equal(all.stats.firstPlaces, 3) // m1, m5, m7
  assert.equal(all.stats.avgRank, 2.75)  // rankSum 22 / 8

  // 模式过滤 TOURNAMENT：仅 m9 → N=1 无夺冠 → winRate 必须为 0（非 null、非兜底）
  const tour = await pgSvc.getPlayerStats('p-eq', { cutoffTime: '2026-09-25T12:00:00Z', mode: 'TOURNAMENT' })
  assert.equal(tour.stats.sampleCount, 1)
  assert.equal(tour.stats.winRate, 0)
  assert.equal(tour.stats.avgRank, 4)

  // [from,to)：仅 m8 → to 端点排除 m7
  const win = await pgSvc.getPlayerStats('p-eq', { from: '2026-09-24T00:00:00Z', to: '2026-09-25T10:00:00Z' })
  assert.equal(win.stats.sampleCount, 1)
  assert.equal(win.stats.avgRank, 6)

  // 空库选手：N=0 → 比率/均名全 null（禁 0 兜底）
  const empty = await pgSvc.getPlayerStats('p-eq-empty', {})
  assert.equal(empty.stats.sampleCount, 0)
  assert.equal(empty.stats.winRate, null)
  assert.equal(empty.stats.top3Rate, null)
  assert.equal(empty.stats.avgRank, null)
  assert.equal(empty.stats.coverageNote, '已收录 0 局')

  // 小样本阈值边界（阈值 20）：19 → true；20 → false
  assert.equal((await pgSvc.getPlayerStats('p-eq-s19', {})).stats.isSmallSample, true)
  assert.equal((await pgSvc.getPlayerStats('p-eq-s20', {})).stats.isSmallSample, false)
})

test('V18: 非法参数两侧同拒（400 InvalidStatsParamError）', { skip: !pgAvailable }, async () => {
  const bad = [
    [{ cutoffTime: 'not-a-date' }, 'cutoff'],
    [{ from: '2026-09-28T00:00:00Z', to: '2026-09-01T00:00:00Z' }, 'from'],
    [{ to: 'yesterday' }, 'to']
  ]
  for (const [params, field] of bad) {
    await assert.rejects(() => pgSvc.getPlayerStats('p-eq', params), (err) => {
      assert.equal(err.status, 400)
      assert.equal(err.field, field)
      return true
    }, `PG 侧应拒绝 ${JSON.stringify(params)}`)
    await assert.rejects(() => fileSvc.getPlayerStats('p-eq', params), (err) => {
      assert.equal(err.status, 400)
      assert.equal(err.field, field)
      return true
    }, `JS 侧应拒绝 ${JSON.stringify(params)}`)
  }
})
