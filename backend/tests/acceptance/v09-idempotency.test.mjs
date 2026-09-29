// V09 · 重复导入、重试、同局多玩家 → 不重复计数，不覆盖其他玩家；来源内键稳定
// 任务书 §5 V09。幂等基石：record_key = sourceId:externalMatchId:externalPlayerId
// （来源内稳定键）；同键同 revision=重复计数，更高 revision=版本更正（V13 详测）。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, countRows, pgAvailable } from './_helpers.mjs'

let stack = null

const extRec = (extPlayerId, finalRank, revision) => ({
  playerId: extPlayerId === 'ext-a' ? 'p-a' : 'p-b',
  nickname: extPlayerId === 'ext-a' ? '选手甲' : '选手乙',
  matchTime: '2026-09-10T10:00:00Z',
  finalRank,
  mode: 'RANKED_DIAMOND',
  sourceId: 'src-v09',
  externalMatchId: 'match-1001',
  externalPlayerId: extPlayerId,
  ...(revision ? { revision } : {})
})

async function importBatch(records) {
  const res = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken, body: { records, source: 'V09_IDEMPOTENCY' }
  })
  assert.equal(res.status, 200, JSON.stringify(res.json))
  return res.json.result
}

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v09_test')
  // 来源治理（P2-B）：记录级 sourceId 必须指向已登记来源 —— 测试先注册外部来源
  await stack.pool.query(
    `INSERT INTO data_sources (source_id, name, type, status)
     VALUES ('src-v09', 'V09 幂等语义测试来源', 'THIRD_PARTY_AGGREGATE', 'UNCONFIGURED')`
  )
  // 复验2：核验强制证据链 —— 记录未带证据时，核验请求必须显式提供可用存证
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status)
     VALUES ('ev-v09', $1, 'src-manual-review', '2026-09-10T09:00:00Z', 'VERIFIED')`,
    ['f'.repeat(64)]
  )
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V09: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V09-0: 未登记来源的导入 → 明确 400 拒绝（来源治理，不泄漏外键细节）', { skip: !pgAvailable }, async () => {
  const res = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{ playerId: 'p-ghost-src', matchTime: '2026-09-10T10:00:00Z', finalRank: 1,
        mode: 'RANKED_DIAMOND', sourceId: 'src-never-registered', externalMatchId: 'm-1', externalPlayerId: 'x-1' }],
      source: 'V09_UNKNOWN_SOURCE'
    }
  })
  assert.equal(res.status, 400)
  assert.match(res.json.error, /未登记的数据来源/)
  assert.equal((await countRows(stack.pool, 'matches')), 0, '拒绝即零写入')
  assert.equal((await countRows(stack.pool, 'players')), 0)
})

test('V09-1: 重复导入 / 网络重试语义 → 不重复计数', { skip: !pgAvailable }, async () => {
  const run1 = await importBatch([extRec('ext-a', 1)])
  assert.equal(run1.inserted, 1)

  // 完全相同的重试两次（客户端超时重发场景）
  const run2 = await importBatch([extRec('ext-a', 1)])
  assert.equal(run2.inserted, 0)
  assert.equal(run2.duplicates, 1)
  const run3 = await importBatch([extRec('ext-a', 1)])
  assert.equal(run3.duplicates, 1)

  // 库内该稳定键只有一行
  const rows = (await stack.pool.query(
    `SELECT id, record_key, revision, superseded_at FROM matches WHERE record_key = 'src-v09:match-1001:ext-a'`
  )).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].revision, 1)
  assert.equal(rows[0].superseded_at, null)

  // 核验后统计 N=1（三次导入只计一局；记录无证据 → 请求须带可用存证，复验2）
  const verify1 = await stack.api(`/api/v1/admin/matches/${rows[0].id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v09', evidenceId: 'ev-v09' }
  })
  assert.equal(verify1.status, 200, JSON.stringify(verify1.json))
  const stats = await stack.api('/api/v1/players/p-a/stats')
  assert.equal(stats.json.stats.sampleCount, 1)
})

test('V09-2: 同局多玩家 → 各自独立键、独立计数，互不覆盖', { skip: !pgAvailable }, async () => {
  // 同一外部对局 match-1001 的另一名选手 ext-b
  const run = await importBatch([extRec('ext-b', 3)])
  assert.equal(run.inserted, 1)

  // 两键并存、各自只有一个当前版本（ext-a 的导入旧版已被核验封存，复验1 SCD-2）
  assert.equal(await countRows(stack.pool, 'matches', "record_key LIKE 'src-v09:match-1001:%' AND superseded_at IS NULL"), 2)

  // 再次重试导入 ext-a（他人记录在场）不得影响 ext-b 的行
  const retry = await importBatch([extRec('ext-a', 1)])
  assert.equal(retry.duplicates, 1)
  assert.equal(await countRows(stack.pool, 'matches', "record_key = 'src-v09:match-1001:ext-b'"), 1)

  const rowB = (await stack.pool.query(
    `SELECT final_rank FROM matches WHERE record_key = 'src-v09:match-1001:ext-b'`
  )).rows[0]
  assert.equal(rowB.final_rank, 3, '导入 ext-a 的重试绝不覆盖 ext-b 的名次')

  // 核验 ext-b 后：p-a N=1、p-b N=1，分母互不渗透
  const idB = (await stack.pool.query(`SELECT id FROM matches WHERE record_key = 'src-v09:match-1001:ext-b' AND superseded_at IS NULL`)).rows[0].id
  const verifyB = await stack.api(`/api/v1/admin/matches/${idB}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v09', evidenceId: 'ev-v09' }
  })
  assert.equal(verifyB.status, 200, JSON.stringify(verifyB.json))
  assert.equal((await stack.api('/api/v1/players/p-a/stats')).json.stats.sampleCount, 1)
  assert.equal((await stack.api('/api/v1/players/p-b/stats')).json.stats.sampleCount, 1)
  assert.equal((await stack.api('/api/v1/players/p-b/stats')).json.stats.top3Rate, 1)
})

test('V09-3: 更高 revision = 版本更正；低版本重放 = 幂等拒绝', { skip: !pgAvailable }, async () => {
  // 更正：ext-a 名次 1 → 4。V09-1 的核验已建立 revision 2（复验1：核验即新版本），
  // 更正必须携带更高 revision 才能取代现行版本
  const corr = await importBatch([extRec('ext-a', 4, 3)])
  assert.equal(corr.inserted, 0, '更正是同键换版本，不产生新键计数')
  assert.equal(corr.superseded, 1, '旧版本被显式取代计数')

  const versions = (await stack.pool.query(
    `SELECT revision, final_rank, superseded_at FROM matches WHERE record_key = 'src-v09:match-1001:ext-a' ORDER BY revision`
  )).rows
  assert.equal(versions.length, 3, '版本历史保留（SCD-2）：导入 rev1 → 核验放行 rev2 → 更正 rev3')
  assert.equal(versions[0].revision, 1)
  assert.notEqual(versions[0].superseded_at, null, '旧版已被取代')
  assert.equal(versions[1].revision, 2)
  assert.notEqual(versions[1].superseded_at, null, '核验版本同样被更正封存')
  assert.equal(versions[2].revision, 3)
  assert.equal(versions[2].superseded_at, null)

  // 过期 revision 1 重放（旧消息晚到）→ 幂等拒绝，不回滚更正
  const stale = await importBatch([extRec('ext-a', 1)])
  assert.equal(stale.duplicates, 1)
  assert.equal(stale.inserted, 0)
  const still = (await stack.pool.query(
    `SELECT final_rank FROM matches WHERE record_key = 'src-v09:match-1001:ext-a' AND superseded_at IS NULL`
  )).rows[0]
  assert.equal(still.final_rank, 4, '过期版本重放不得覆盖现行版本')

  // 当前统计取新版本（核验 rev3 后 N=1、名次 4）
  const idV3 = (await stack.pool.query(
    `SELECT id FROM matches WHERE record_key = 'src-v09:match-1001:ext-a' AND superseded_at IS NULL`
  )).rows[0].id
  const verifyV3 = await stack.api(`/api/v1/admin/matches/${idV3}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v09', evidenceId: 'ev-v09' }
  })
  assert.equal(verifyV3.status, 200, JSON.stringify(verifyV3.json))
  const stats = await stack.api('/api/v1/players/p-a/stats')
  assert.equal(stats.json.stats.sampleCount, 1, '同局同玩家只有一个可见版本参与统计')
  assert.equal(stats.json.stats.winRate, 0)
  assert.equal(stats.json.stats.avgRank, 4)
})

test('V09-4: 每次导入（含全重复批）都有批次台账可查（审计链完整）', { skip: !pgAvailable }, async () => {
  const batches = await countRows(stack.pool, 'import_batches')
  assert.ok(batches >= 5, `重试/更正/全重复批均应留台账（实际 ${batches}）`)
})
