// v3.1 复验整改验收（2026-09-30 独立复验四项 P1）
// 复验1: 核验动作不得污染过去截点 —— verifyMatch 必须以实际核验时刻建立可见新版本（SCD-2），
//        旧版本原样封存；过去截点统计永远取当时版本（仍 PENDING → 不计入）
// 复验2: 无证据的记录不得核验通过 —— 仅凭 verifiedBy 的“核验按钮”不构成证据链；
//        证据不存在 / 证据已隔离同样拒绝
// 复验3: 未治理来源（UNCONFIGURED）的旧生成快照不得公开混排 —— /lineups 只返回
//        来源 READY/ACTIVE 且快照 ACTIVE 的行，并携带来源元数据供前端分组
// 复验4: 原始材料正文随存证入库可离线复核；快照替换/存证/台账/来源推进单事务 ——
//        中途失败绝不留下“快照已更换”的中间态

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { bootAcceptanceStack, insertPlayerRow, insertEvidenceWithBlob, pgAvailable } from './_helpers.mjs'
import { HOKACE_ADAPTER_METADATA } from '../../../tools/emulator-watcher/adapters/hokace.mjs'

let stack = null
let stub = null

const PAYLOAD_OK = JSON.stringify({
  data: [
    { lineupName: '雷霆扶桑刺', winRate: 0.441, top3Rate: 0.66, avgRank: 3.2, sampleCount: 1200 },
    { lineupName: '长安守卫枪', winRate: 0.32, top3Rate: 0.51, avgRank: 3.9, sampleCount: 880 }
  ]
})

before(async () => {
  if (!pgAvailable) return
  stub = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(PAYLOAD_OK)
  })
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve))
  HOKACE_ADAPTER_METADATA.targetUrl = `http://127.0.0.1:${stub.address().port}/zh/lineups/`
  stack = await bootAcceptanceStack('wanxiangqi_v31_test')
})

after(async () => {
  HOKACE_ADAPTER_METADATA.targetUrl = 'https://hokace.wiki/zh/lineups/'
  if (stub) await new Promise(resolve => stub.close(resolve))
  if (stack) await stack.cleanup()
})

test('v3.1: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

// ---------------- 复验1 + 复验2：核验语义 ----------------

test('复验1: 核验以实际核验时刻建新版本 —— 过去截点统计不被回写', { skip: !pgAvailable }, async () => {
  // 现场复刻：比赛 9/3 发生、9/4 收录入库（PENDING），9/30 才核验
  await insertPlayerRow(stack.pool, { id: 'p-r1', nickname: '复验一选手' })
  // v4 W1：证据须连同可恢复原件入库（verifyMatch 收紧后无原件不得放行）
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-r1', sha256: '2'.repeat(64), status: 'VERIFIED', capturedAt: '2026-09-03T09:00:00Z'
  })
  const imp = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{
        playerId: 'p-r1', matchTime: '2026-09-03T10:00:00Z', availableAt: '2026-09-04T00:00:00Z',
        finalRank: 1, mode: 'RANKED_DIAMOND', evidenceId: 'ev-r1'
      }]
    }
  })
  assert.equal(imp.status, 200, JSON.stringify(imp.json))
  const pendingId = (await stack.pool.query(`SELECT id FROM matches WHERE player_id = 'p-r1'`)).rows[0].id

  // 核验前：任意截点样本均为 0
  const beforeOld = await stack.api('/api/v1/players/p-r1/stats?cutoff=2026-09-10T00:00:00Z')
  assert.equal(beforeOld.json.stats.sampleCount, 0)

  const verify = await stack.api(`/api/v1/admin/matches/${pendingId}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'review-auditor' }
  })
  assert.equal(verify.status, 200, JSON.stringify(verify.json))

  // 新版本可见性从核验时刻起（availableAt ≈ now，而非导入时刻 9/4）
  const newAvailable = new Date(verify.json.data.availableAt).getTime()
  assert.ok(newAvailable > new Date('2026-09-29T00:00:00Z').getTime(),
    '放行版本 availableAt 必须是实际核验时刻（今天），不得沿用导入时刻')

  // 核心断言（复验者原始复现路径）：9/10 截点的样本仍为 0、胜率仍为 null —— 核验不回写历史
  const afterOld = await stack.api('/api/v1/players/p-r1/stats?cutoff=2026-09-10T00:00:00Z')
  assert.equal(afterOld.json.stats.sampleCount, 0, '过去截点样本不得因今天核验变成 1')
  assert.equal(afterOld.json.stats.winRate, null, '过去截点胜率不得变成 100%')

  // 当前时点：样本 1、登顶 1
  const now = await stack.api('/api/v1/players/p-r1/stats')
  assert.equal(now.json.stats.sampleCount, 1)
  assert.equal(now.json.stats.firstPlaces, 1)

  // 版本链：旧版本封存（superseded_at=核验时刻、状态原样 PENDING），新版本 ACTIVE
  const versions = (await stack.pool.query(
    `SELECT id, revision, record_status, verified, superseded_at, available_at
     FROM matches WHERE record_key = (SELECT record_key FROM matches WHERE id = $1) ORDER BY revision`,
    [pendingId]
  )).rows
  assert.equal(versions.length, 2, '核验必须产生新版本（SCD-2），不得原地翻转')
  const [oldV, newV] = versions
  assert.equal(oldV.record_status, 'PENDING', '旧版本状态原样封存')
  assert.equal(oldV.verified, false)
  assert.ok(oldV.superseded_at, '旧版本必须封存')
  assert.equal(newV.record_status, 'ACTIVE')
  assert.equal(newV.verified, true)
  assert.equal(newV.superseded_at, null)
  assert.ok(new Date(newV.available_at).getTime() > new Date(oldV.available_at).getTime())

  // 重复核验 → 409（幂等保护，不再堆版本）
  const again = await stack.api(`/api/v1/admin/matches/${newV.id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'review-auditor' }
  })
  assert.equal(again.status, 409)
})

test('复验2: 无证据 / 证据不存在 / 证据已隔离 → 核验一律拒绝', { skip: !pgAvailable }, async () => {
  await insertPlayerRow(stack.pool, { id: 'p-r2', nickname: '复验二选手' })
  // ① 记录本身无证据、请求也不带 → 422
  const noEvd = await stack.api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: { records: [{ playerId: 'p-r2', matchTime: '2026-09-05T10:00:00Z', finalRank: 2, mode: 'RANKED_DIAMOND' }] }
  })
  assert.equal(noEvd.status, 200)
  const idNoEvd = (await stack.pool.query(`SELECT id FROM matches WHERE player_id = 'p-r2'`)).rows[0].id
  const rejected = await stack.api(`/api/v1/admin/matches/${idNoEvd}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'review-auditor' }
  })
  assert.equal(rejected.status, 422, JSON.stringify(rejected.json))
  assert.match(rejected.json.error, /证据/)
  assert.equal(rejected.json.code_name, 'NO_EVIDENCE')

  // ② 请求携带不存在的 evidenceId → 422
  const ghost = await stack.api(`/api/v1/admin/matches/${idNoEvd}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'review-auditor', evidenceId: 'ev-never-exists' }
  })
  assert.equal(ghost.status, 422)
  assert.equal(ghost.json.code_name, 'EVIDENCE_NOT_FOUND')

  // ③ 证据已被隔离 → 422（隔离材料不得作为放行依据）
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status)
     VALUES ('ev-r2-qua', $1, 'src-manual-review', '2026-09-05T09:00:00Z', 'QUARANTINED')`,
    ['3'.repeat(64)]
  )
  const qua = await stack.api(`/api/v1/admin/matches/${idNoEvd}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'review-auditor', evidenceId: 'ev-r2-qua' }
  })
  assert.equal(qua.status, 422)
  assert.equal(qua.json.code_name, 'EVIDENCE_QUARANTINED')

  // 拒绝后记录仍是 PENDING，统计不计入
  const row = (await stack.pool.query(`SELECT record_status FROM matches WHERE id = $1`, [idNoEvd])).rows[0]
  assert.equal(row.record_status, 'PENDING')
  assert.equal((await stack.api('/api/v1/players/p-r2/stats')).json.stats.sampleCount, 0)
})

// ---------------- 复验3：阵容来源隔离 ----------------

test('复验3: /lineups 只公开 READY/ACTIVE 来源的 ACTIVE 快照，并带来源元数据', { skip: !pgAvailable }, async () => {
  await stack.pool.query(`
    INSERT INTO lineup_snapshots (id, source_id, lineup_name, sample_count, win_rate, top3_rate, avg_rank, updated_at) VALUES
      ('lu-r31', 'src-hokace-wiki',        '真实来源快照A', 100, 0.40, 0.60, 2.5, CURRENT_TIMESTAMP),
      ('lu-r32', 'src-hokace-wiki',        '真实来源已隔离B', 100, 0.40, 0.60, 2.5, CURRENT_TIMESTAMP),
      ('lu-r33', 'src-datatft-platform',   '旧生成脚本快照C', 100, 0.40, 0.60, 2.5, CURRENT_TIMESTAMP)
  `)
  await stack.pool.query(
    `UPDATE lineup_snapshots SET record_status = 'QUARANTINED', quarantine_reason = '测试: 已隔离快照' WHERE id = 'lu-r32'`
  )

  const res = await stack.api('/api/v1/lineups')
  const ids = res.json.data.map(l => l.id)
  assert.ok(ids.includes('lu-r31'), 'READY 来源的 ACTIVE 快照应公开')
  assert.ok(!ids.includes('lu-r32'), '已隔离快照不得公开（即使来源 READY）')
  assert.ok(!ids.includes('lu-r33'), 'UNCONFIGURED 来源（datatft 旧生成快照）不得与真实来源混排')

  // 来源元数据齐全（前端按来源分组依据；名称以 data_sources 注册表为准）
  const item = res.json.data.find(l => l.id === 'lu-r31')
  const registeredName = (await stack.pool.query(
    `SELECT name FROM data_sources WHERE source_id = 'src-hokace-wiki'`
  )).rows[0].name
  assert.equal(item.sourceName, registeredName)
  assert.equal(item.sourceStatus, 'READY')
  assert.ok(item.sourceType)

  // 详情页口径一致：已隔离/未治理来源快照 → 404（不渲染伪造档案）
  assert.equal((await stack.api('/api/v1/lineups/lu-r32')).status, 404)
  assert.equal((await stack.api('/api/v1/lineups/lu-r33')).status, 404)
  assert.equal((await stack.api('/api/v1/lineups/lu-r31')).status, 200)

  // health 口径分列：总量与公开可用分开报（隔离后 lineupsActive < lineups）
  const health = await stack.api('/api/v1/health')
  assert.ok(health.json.counts.lineups >= health.json.counts.lineupsActive)
})

// ---------------- 复验4：存证正文 + 同步单事务 ----------------

test('复验4: 同步成功 → 原始正文入库可查；提交中途失败 → 快照/台账/来源零变更', { skip: !pgAvailable }, async () => {
  const syncOk = await stack.api('/api/v1/admin/sources/src-hokace-wiki/sync', {
    method: 'POST', token: stack.adminToken
  })
  assert.equal(syncOk.json.code, 0, JSON.stringify(syncOk.json))

  // 台账存证：正文/字节数/存储位置齐全（离线复核三要素）
  const raws = (await stack.pool.query(
    `SELECT id, content, size_bytes, storage_uri FROM raw_materials WHERE source_id = 'src-hokace-wiki' ORDER BY fetched_at DESC LIMIT 1`
  )).rows[0]
  assert.ok(raws.content.includes('雷霆扶桑刺'), '原始响应正文必须入库')
  assert.equal(Number(raws.size_bytes), Buffer.byteLength(raws.content, 'utf8'))
  assert.match(raws.storage_uri, /^pg:raw_materials:sha-/)

  // 管理端点可按 id 取回完整正文（复核通道）
  const detail = await stack.api(`/api/v1/admin/raw-materials/${raws.id}`, { token: stack.adminToken })
  assert.equal(detail.status, 200)
  assert.equal(detail.json.data.content, raws.content)
  assert.equal((await stack.api('/api/v1/admin/raw-materials')).status, 401, '存证查阅同样需要鉴权')

  // —— 中途失败原子性：第二批快照内含重复主键（前两条已 INSERT 后撞 PK）→ 整体回滚 ——
  const snapshotBefore = (await stack.pool.query(
    `SELECT id, win_rate, updated_at FROM lineup_snapshots WHERE source_id = 'src-hokace-wiki' ORDER BY id`
  )).rows
  const sourceBefore = (await stack.pool.query(
    `SELECT last_success_at, status FROM data_sources WHERE source_id = 'src-hokace-wiki'`
  )).rows[0]
  const job = await stack.repo.recordSyncJob({
    sourceId: 'src-hokace-wiki', jobType: 'LINEUP_SNAPSHOT_SYNC', scope: 'lineups:all',
    startedAt: new Date().toISOString()
  })

  await assert.rejects(
    stack.repo.commitSyncSuccess({
      sourceId: 'src-hokace-wiki',
      snapshots: [
        { id: 'lu-evil-a', lineupName: '不应出现的快照A', winRate: 0.5, top3Rate: 0.5, coreHeroes: [] },
        { id: 'lu-evil-b', lineupName: '不应出现的快照B', winRate: 0.5, top3Rate: 0.5, coreHeroes: [] },
        { id: 'lu-evil-b', lineupName: '撞主键的第三条', winRate: 0.5, top3Rate: 0.5, coreHeroes: [] }
      ],
      rawMaterial: { sourceId: 'src-hokace-wiki', recordKey: 'lineups:all', fetchedAt: new Date().toISOString(),
        contentSha256: '4'.repeat(64), content: '{"evil":true}' },
      jobPatch: { id: job.id, status: 'SUCCESS', finishedAt: new Date().toISOString() },
      sourcePatch: { lastSuccessAt: new Date().toISOString(), status: 'READY' }
    }),
    /duplicate key|violates/i
  )

  // 快照逐字节未动、台账仍 RUNNING、来源时间未推进 —— 不存在“快照已更换但报告失败”
  const snapshotAfter = (await stack.pool.query(
    `SELECT id, win_rate, updated_at FROM lineup_snapshots WHERE source_id = 'src-hokace-wiki' ORDER BY id`
  )).rows
  assert.deepEqual(snapshotAfter, snapshotBefore, '提交中途失败：快照不得被更换')
  const jobRow = (await stack.pool.query(`SELECT status FROM sync_jobs WHERE id = $1`, [job.id])).rows[0]
  assert.equal(jobRow.status, 'RUNNING', '台账不得在未提交前标 SUCCESS')
  const sourceAfter = (await stack.pool.query(
    `SELECT last_success_at, status FROM data_sources WHERE source_id = 'src-hokace-wiki'`
  )).rows[0]
  assert.deepEqual(sourceAfter, sourceBefore, '来源状态不得被部分推进')
  assert.equal((await stack.api('/api/v1/lineups')).json.data.some(l => l.id.startsWith('lu-evil')), false)
  // 中途失败的存证也不得留档（正文与台账同事务）
  assert.equal((await stack.pool.query(
    `SELECT count(*)::int AS n FROM raw_materials WHERE content_sha256 = $1`, ['4'.repeat(64)]
  )).rows[0].n, 0)
})
