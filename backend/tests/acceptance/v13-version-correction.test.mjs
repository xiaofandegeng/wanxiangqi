// V13 · 截点后更正/撤销旧记录 → 当前统计更新，过去截点结果仍取当时版本
// 任务书 §5 V13。SCD-2 版本链：matches 一行=一个版本；截点 t 的可见版本 =
// available_at ≤ t ∧ (superseded_at IS NULL ∨ superseded_at > t) 的最高 revision。
// 更正走导入 revision 通道；撤销 = 运营动作插入 REVOKED 版本（SQL 直插模拟台面动作）。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, insertPlayerRow, pgAvailable } from './_helpers.mjs'

let stack = null
const KEY = 'src-v13:match-77:ext-x'

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_v13_test')
  await insertPlayerRow(stack.pool, { id: 'p-v13', nickname: '版本链选手' })
  // 版本链键依赖来源内稳定键：先注册外部来源（来源治理 P2-B）
  await stack.pool.query(
    `INSERT INTO data_sources (source_id, name, type, status)
     VALUES ('src-v13', 'V13 版本链测试来源', 'THIRD_PARTY_AGGREGATE', 'UNCONFIGURED')`
  )
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V13: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V13-1: v1 导入核验（名次 1）→ 更正 v2（名次 5）→ 当前统计更新、历史截点不变', { skip: !pgAvailable }, async () => {
  // v1：2026-06-01 完赛、当日核验放行 —— 历史已核验状态直插。
  // 复验1 语义下 verify 端点以“实际核验时刻”建新可见版本，9 月无法回溯构造 6 月的当日核验；
  // 本套验证的是版本链截点统计语义（核验端点行为已由 v31 复验1/复验2 全覆盖）
  await insertVerifiedMatch(stack.pool, {
    id: 'm-v13-v1', revision: 1, finalRank: 1, availableAt: '2026-06-01T10:05:00Z'
  })

  // 截点 06-10：名次 1
  const before = (await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-10T00:00:00Z')).json.stats
  assert.equal(before.sampleCount, 1)
  assert.equal(before.winRate, 1)
  assert.equal(before.avgRank, 1)

  // 更正 v2：06-20 发现录入错误，名次实为 5（revision 2）
  const v2 = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{
        playerId: 'p-v13', nickname: '版本链选手', matchTime: '2026-06-01T10:00:00Z',
        availableAt: '2026-06-20T09:00:00Z', finalRank: 5, mode: 'RANKED_DIAMOND',
        sourceId: 'src-v13', externalMatchId: 'match-77', externalPlayerId: 'ext-x', revision: 2
      }],
      source: 'V13_V2'
    }
  })
  assert.equal(v2.status, 200)
  assert.equal(v2.json.result.superseded, 1)

  // v2 当日核验（06-20）：同为历史已核验状态直插（理由同上）
  await stack.pool.query(
    `UPDATE matches SET verified = TRUE, record_status = 'ACTIVE',
            verified_at = '2026-06-20T10:00:00Z', verified_by = 'v13'
     WHERE record_key = $1 AND superseded_at IS NULL`,
    [KEY]
  )

  const now = (await stack.api('/api/v1/players/p-v13/stats')).json.stats
  assert.equal(now.sampleCount, 1, '同键同局仍只计一局')
  assert.equal(now.winRate, 0, '当前口径：更正后的名次 5 生效')
  assert.equal(now.avgRank, 5)

  // 过去截点 06-10：仍取名次 1（当时可见的版本，历史不被篡改）
  const hist1 = (await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-10T00:00:00Z')).json.stats
  assert.equal(hist1.winRate, 1)
  assert.equal(hist1.avgRank, 1)
  // 截点 06-15（v1 之后、v2 之前）：仍取名次 1
  const hist2 = (await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-15T00:00:00Z')).json.stats
  assert.equal(hist2.avgRank, 1)
  // 截点 06-25（v2 之后）：取名次 5
  const hist3 = (await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-25T00:00:00Z')).json.stats
  assert.equal(hist3.avgRank, 5)
})

test('V13-2: 任一截点下每个稳定键至多一个可见版本（SQL 不变量）', { skip: !pgAvailable }, async () => {
  for (const t of ['2026-06-05T00:00:00Z', '2026-06-10T00:00:00Z', '2026-06-15T00:00:00Z',
                   '2026-06-19T00:00:00Z', '2026-06-25T00:00:00Z']) {
    const rows = (await stack.pool.query(
      `SELECT record_key, count(*)::int AS versions FROM matches
       WHERE record_key = $1 AND available_at <= $2 AND (superseded_at IS NULL OR superseded_at > $2)
       GROUP BY record_key`,
      [KEY, t]
    )).rows
    assert.ok(rows.length <= 1, `截点 ${t}：该键最多一组`)
    if (rows.length > 0) {
      assert.equal(rows[0].versions, 1, `截点 ${t} 出现多个同时可见版本 —— SCD-2 可见区间重叠`)
    }
  }
})

test('V13-3: 撤销（REVOKED 新版本）→ 当前统计剔除，历史截点保留当时结果', { skip: !pgAvailable }, async () => {
  // 06-25 运营撤销该记录（材料被认定无效）：插入 REVOKED v3 并取代 v2
  await stack.pool.query(
    `UPDATE matches SET superseded_at = '2026-06-25T10:00:00Z' WHERE record_key = $1 AND superseded_at IS NULL`,
    [KEY]
  )
  await insertRevokedRow(stack.pool, KEY)

  // 当前口径：该局彻底退出统计
  const now = (await stack.api('/api/v1/players/p-v13/stats')).json.stats
  assert.equal(now.sampleCount, 0)
  assert.equal(now.winRate, null)

  // 历史截点逐段保留当时事实：
  //   06-10 → v1(rank1)；06-15 → v1(rank1)；06-24 → v2(rank5)；06-26 → REVOKED（不可见）
  assert.equal((await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-10T00:00:00Z')).json.stats.avgRank, 1)
  assert.equal((await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-15T00:00:00Z')).json.stats.avgRank, 1)
  assert.equal((await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-24T00:00:00Z')).json.stats.avgRank, 5)
  assert.equal((await stack.api('/api/v1/players/p-v13/stats?cutoff=2026-06-26T00:00:00Z')).json.stats.sampleCount, 0)

  // 版本历史完整保留（3 版）：审计可回放
  assert.equal((await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches WHERE record_key = $1`, [KEY]
  )).rows[0].n, 3)
})

test('V13-4: 被取代版本不可再核验（409），必须核验现行版本', { skip: !pgAvailable }, async () => {
  const v1id = (await stack.pool.query(
    `SELECT id FROM matches WHERE record_key = $1 AND revision = 1`, [KEY]
  )).rows[0].id
  const res = await stack.api(`/api/v1/admin/matches/${v1id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v13-stale' }
  })
  assert.equal(res.status, 409, '过期版本核验必须被拒绝（防止复活已更正事实）')
})

// ---- 工具：历史已核验版本行（模拟当时当日核验放行的存量记录） ----
async function insertVerifiedMatch(pool, { id, revision, finalRank, availableAt }) {
  await pool.query(
    `INSERT INTO matches (id, player_id, match_time, available_at, final_rank, mode, verified,
                          record_status, synthetic, record_key, revision, superseded_at,
                          verified_at, verified_by)
     VALUES ($1, 'p-v13', '2026-06-01T10:00:00Z', $2, $3, 'RANKED_DIAMOND', TRUE,
             'ACTIVE', FALSE, $4, $5, NULL, $2, 'v13')`,
    [id, availableAt, finalRank, KEY, revision]
  )
}

// ---- 工具：撤销版本行（模拟运营台撤销动作落库） ----
async function insertRevokedRow(pool, key) {
  await pool.query(
    `INSERT INTO matches (id, player_id, match_time, available_at, final_rank, mode, verified,
                          record_status, synthetic, record_key, revision, superseded_at)
     VALUES ('m-v13-v3', 'p-v13', '2026-06-01T10:00:00Z', '2026-06-25T10:00:00Z', 5, 'RANKED_DIAMOND',
             FALSE, 'REVOKED', FALSE, $1, 3, NULL)`,
    [key]
  )
}
