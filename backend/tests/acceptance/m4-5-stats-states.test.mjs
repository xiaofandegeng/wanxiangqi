// M4-5 · 统计口径与缺失/过期/失败呈现 + A08 补齐用例（重复任务 / 中途数据库异常）
// 任务书 §6「缺失→暂无统计；小样本提示；过期显示适用旧版本；同步失败保留上次快照并明确状态」
//        §10 A08「同步失败、中途数据库异常、重复任务、重启读取：上次成功数据不损坏；
//                 原文/快照/成功台账同事务；错误状态准确」
//        §10 A09 列表层联动（详情层全流程由 m2-content-core M2-1/A09 覆盖）
//
// 与 v15 的分工：v15 验证同步状态机边界（失败/恢复/幂等重放）；本套件补齐——
//   M4-5a 来源健康三字段（sourceLastError/LastAttemptAt/LastSuccessAt）进入公开契约
//   M4-5b 失败态/过期态（stale）在公开 JSON 如实呈现，上次成功快照值不损坏
//   A08-重复任务：并发两次同步 → 咨询锁串行化 → 双双成功幂等、快照不重复、台账逐次准确
//   A08-中途异常：raw_materials 触发器注入事务内故障 → 整体回滚（快照/存证/台账无中间态）
//   A09(列表层)：待复核 impact 未解决 → /api/v1/lineups hasOpenRecheck=true → resolve 后清除
// 全程仅触碰 wanxiangqi_m45_test（pg-test.mjs 强制 _test 后缀校验）。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'
import { HOKACE_ADAPTER_METADATA } from '../../src/adapters/hokace.mjs'

let stack = null
let stub = null
let stubPhase = 'ok-v1'

// 快照载荷不带窗口/截止日期（缺失→null 契约）：stale 基准回落到 updated_at（同步时刻），
// 「未过期」由构造保证，过期态由用例显式回拨 updated_at 制造，不依赖运行日期
const PAYLOAD_V1 = JSON.stringify({
  data: [
    { lineupName: '雷霆扶桑刺', structureKey: 'sk-m45-lei', winRate: 0.441, top3Rate: 0.66, avgRank: 3.2, sampleCount: 1200,
      snapshotVersion: 'v2609', windowText: '近 7 日对局快照' },
    { lineupName: '长安守卫枪', structureKey: 'sk-m45-chang', winRate: 0.32, top3Rate: 0.51, avgRank: 3.9, sampleCount: 880,
      snapshotVersion: 'v2609', windowText: '近 7 日对局快照' }
  ]
})
const PAYLOAD_V2 = JSON.stringify({
  data: [
    { lineupName: '雷霆扶桑刺', structureKey: 'sk-m45-lei', winRate: 0.45, top3Rate: 0.68, avgRank: 3.1, sampleCount: 1310,
      snapshotVersion: 'v2610', windowText: '近 7 日对局快照' },
    { lineupName: '长安守卫枪', structureKey: 'sk-m45-chang', winRate: 0.33, top3Rate: 0.52, avgRank: 3.85, sampleCount: 910,
      snapshotVersion: 'v2610', windowText: '近 7 日对局快照' }
  ]
})
const PAYLOAD_STRUCTURE_CHANGED = '<html><body><h1>改版了</h1><div>阵容页已迁移</div></body></html>'

function phaseBody() {
  if (stubPhase === 'ok-v1') return PAYLOAD_V1
  if (stubPhase === 'ok-v2') return PAYLOAD_V2
  return PAYLOAD_STRUCTURE_CHANGED
}

before(async () => {
  if (!pgAvailable) return

  stub = http.createServer((req, res) => {
    const body = phaseBody()
    res.writeHead(200, { 'Content-Type': stubPhase.startsWith('ok') ? 'application/json' : 'text/html' })
    res.end(body)
  })
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve))
  HOKACE_ADAPTER_METADATA.targetUrl = `http://127.0.0.1:${stub.address().port}/zh/lineups/`

  stack = await bootAcceptanceStack('wanxiangqi_m45_test')

  // 公开契约 fixtures：已发布阵容 + 已发布修订（发布链路本身由 m2 套件覆盖，
  // 这里直插最小事实，只为本套件验证统计状态字段的公开呈现）
  await stack.pool.query(`
    INSERT INTO game_versions (version_id, official_basis, effective_at, status)
    VALUES ('v260901', 'M4-5 测试版本依据', '2026-09-24T00:00:00Z', 'CURRENT')`)
  await stack.pool.query(`
    INSERT INTO lineups (id, slug, display_name, one_line_summary, status)
    VALUES ('lu-m45', 'm45-lineup', 'M45 测试阵容', '统计状态呈现测试用', 'PUBLISHED')`)
  await stack.pool.query(`
    INSERT INTO lineup_revisions (lineup_id, revision, game_version_id, difficulty, review_status, published_at, created_by)
    VALUES ('lu-m45', 1, 'v260901', 'LOW', 'PUBLISHED', CURRENT_TIMESTAMP, 'm45-seed')`)
})

after(async () => {
  HOKACE_ADAPTER_METADATA.targetUrl = 'https://hokace.wiki/zh/lineups/'
  if (stub) await new Promise(resolve => stub.close(resolve))
  if (stack) await stack.cleanup()
})

const T = () => stack.adminToken

async function triggerSync() {
  return stack.api('/api/v1/admin/sources/src-hokace-wiki/sync', { method: 'POST', token: T() })
}

async function sourceRow() {
  return (await stack.pool.query(
    `SELECT status, last_attempt_at, last_success_at, last_error FROM data_sources WHERE source_id = 'src-hokace-wiki'`
  )).rows[0]
}

async function snapshotRows() {
  return (await stack.pool.query(
    `SELECT id, structure_key, lineup_name, win_rate, sample_count, snapshot_version, updated_at
     FROM lineup_snapshots ORDER BY lineup_name`)).rows
}

const ts = v => new Date(v).getTime()

test('M4-5: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('M4-5a: 成功同步 + 人工映射 → 公开契约携带来源健康三字段（未失败/未过期基线）', { skip: !pgAvailable }, async () => {
  const sync = await triggerSync()
  assert.equal(sync.status, 200, JSON.stringify(sync.json))
  assert.equal(sync.json.code, 0)

  // 取实际 structure_key 建立映射（id 由适配器按内容确定，不在测试里复算）
  const rows = await snapshotRows()
  assert.equal(rows.length, 2)
  const lei = rows.find(r => r.lineup_name === '雷霆扶桑刺')
  const link = await stack.api('/api/v1/admin/lineup-snapshot-links', {
    method: 'POST', token: T(),
    body: { lineupId: 'lu-m45', sourceId: 'src-hokace-wiki', structureKey: lei.structure_key, note: 'M4-5 状态呈现测试映射' }
  })
  assert.equal(link.status, 201, JSON.stringify(link.json))

  const detail = await stack.api('/api/v1/lineups/m45-lineup')
  assert.equal(detail.status, 200)
  const snap = detail.json.data.snapshots[0]
  assert.ok(snap, '映射后快照进入公开契约')
  assert.equal(snap.sourceLastError, null, '最近一次同步成功 → 无失败')
  assert.ok(typeof snap.sourceLastAttemptAt === 'string' && snap.sourceLastAttemptAt.length > 0,
    '最近尝试时间公开（ISO 字符串）')
  assert.ok(typeof snap.sourceLastSuccessAt === 'string' && snap.sourceLastSuccessAt.length > 0,
    '最近成功时间公开（ISO 字符串）')
  assert.equal(snap.stale, false, '刚同步的快照（updated_at 基准）未过期')

  // 列表层同步携带（roster 页渲染横幅依据同一契约）+ statsNotice 小样本提示（不设阈值）
  const list = await stack.api('/api/v1/lineups')
  const listSnap = list.json.data[0].snapshots[0]
  assert.equal(listSnap.sourceLastError, null)
  assert.ok(list.json.statsNotice.includes('样本规模越小比率波动越大'), '小样本阅读提示随列表契约下发')
  assert.ok(list.json.statsNotice.includes('未公布小样本判定口径'), '如实声明来源未给阈值（不擅自造阈值）')
})

test('A08-重复任务: 并发两次同步 → 串行化幂等、快照不重复、台账逐次准确', { skip: !pgAvailable }, async () => {
  const before = await snapshotRows()
  const baselineIds = before.map(r => r.id).sort()
  const baselineSuccessAt = (await sourceRow()).last_success_at

  // 同一来源并发触发两次（重复任务；commitSyncSuccess 以事务级咨询锁按来源串行化）
  const [a, b] = await Promise.all([triggerSync(), triggerSync()])

  // 串行化后两次都是完整替换语义的成功（后到者在前者提交后整体替换，幂等）
  assert.equal(a.json.code, 0, `并发任务A：${a.json.message}`)
  assert.equal(b.json.code, 0, `并发任务B：${b.json.message}`)

  const after = await snapshotRows()
  assert.equal(after.length, before.length, '快照不重复（整体替换，不叠加）')
  assert.deepEqual(after.map(r => r.id).sort(), baselineIds, '确定 id 不漂移（上次成功数据不损坏）')

  // 重复任务逐次留台账：本相位恰 2 条 SUCCESS
  const phaseJobs = (await stack.pool.query(
    `SELECT status FROM sync_jobs WHERE source_id = 'src-hokace-wiki' ORDER BY id`)).rows
  assert.equal(phaseJobs.filter(j => j.status === 'SUCCESS').length, 3,
    '首次同步 + 并发两次（串行化后均成功）= 3 条 SUCCESS 台账')

  const src = await sourceRow()
  assert.equal(src.last_error, null, '最终态无失败记录')
  assert.ok(new Date(src.last_success_at).getTime() >= new Date(baselineSuccessAt).getTime(),
    '成功时间单调不回退')
})

test('A08-中途异常: 事务内故障 → 整体回滚、上次成功数据不损坏、失败状态准确', { skip: !pgAvailable }, async () => {
  // 故障注入：raw_materials 的 BEFORE INSERT 触发器在 commitSyncSuccess 事务内
  // （快照已替换、存证未落）抛错 → 单事务必须整体回滚。仅 INSERT 触发，
  // 不影响 commitSyncFailure 的 UPDATE 语句（失败台账仍能如实落库）
  await stack.pool.query(`
    CREATE FUNCTION m45_fault() RETURNS trigger AS $fn$
      BEGIN RAISE EXCEPTION 'M45 模拟事务中途故障'; END
    $fn$ LANGUAGE plpgsql`)
  await stack.pool.query(
    `CREATE TRIGGER m45_raw_fault BEFORE INSERT ON raw_materials
     FOR EACH ROW EXECUTE FUNCTION m45_fault()`)

  const before = await snapshotRows()
  const rawBefore = (await stack.pool.query(`SELECT count(*)::int AS n FROM raw_materials`)).rows[0].n
  const frozenSuccessAt = (await sourceRow()).last_success_at

  // 新数据（V2）同步 → 事务中途故障
  stubPhase = 'ok-v2'
  const res = await triggerSync()
  assert.equal(res.json.code, 1, '中途故障以失败如实报告')
  assert.match(res.json.message, /M45 模拟事务中途故障/)

  // 快照/存证双双回滚：无「快照已更换却报告失败」的中间态
  const after = await snapshotRows()
  assert.deepEqual(after, before, '上次成功快照原样保留（V1 值未损坏）')
  const rawAfter = (await stack.pool.query(`SELECT count(*)::int AS n FROM raw_materials`)).rows[0].n
  assert.equal(rawAfter, rawBefore, '无孤儿存证（原文与快照同事务）')

  // 失败状态准确：台账 FAILED + 来源 lastError，lastSuccessAt 冻结不动
  const job = (await stack.pool.query(
    `SELECT status, error_summary FROM sync_jobs WHERE source_id = 'src-hokace-wiki' ORDER BY id DESC LIMIT 1`)).rows[0]
  assert.equal(job.status, 'FAILED')
  assert.match(job.error_summary, /M45 模拟事务中途故障/)
  const src = await sourceRow()
  assert.match(src.last_error, /M45 模拟事务中途故障/)
  assert.equal(new Date(src.last_success_at).getTime(), new Date(frozenSuccessAt).getTime(),
    '失败不推进成功时间')

  // 故障移除 → 恢复成功，快照推进到 V2（失败期间数据未损坏，恢复即可继续）
  await stack.pool.query(`DROP TRIGGER m45_raw_fault ON raw_materials`)
  await stack.pool.query(`DROP FUNCTION m45_fault()`)
  const recovery = await triggerSync()
  assert.equal(recovery.json.code, 0)
  const recovered = await snapshotRows()
  const lei = recovered.find(r => r.lineup_name === '雷霆扶桑刺')
  assert.equal(Number(lei.win_rate), 0.45, '恢复后推进到新数据')
  assert.equal(lei.snapshot_version, 'v2610')
  const srcAfter = await sourceRow()
  assert.equal(srcAfter.last_error, null, '成功后清空错误记录')
})

test('M4-5b: 失败态与过期态在公开契约如实呈现（上次成功快照值不损坏）', { skip: !pgAvailable }, async () => {
  const healthySuccessAt = (await sourceRow()).last_success_at
  const beforeValues = await snapshotRows()

  // 真实失败路径驱动（非直改字段）：上游结构变化 → FAILED，快照保留
  stubPhase = 'structure-changed'
  const failed = await triggerSync()
  assert.equal(failed.json.code, 1)

  const detail = await stack.api('/api/v1/lineups/m45-lineup')
  const snap = detail.json.data.snapshots[0]
  assert.ok(snap.sourceLastError, '失败信息进入公开契约（前端据此渲染失败横幅）')
  assert.match(snap.sourceLastError, /未发现符合规范的阵容数据结构|解析/)
  assert.ok(ts(snap.sourceLastAttemptAt) > ts(healthySuccessAt), '最近尝试时间推进到失败那次')
  assert.equal(ts(snap.sourceLastSuccessAt), ts(healthySuccessAt), '成功时间保留在最近一次成功（不随失败推进）')
  // 上次成功快照值原样（失败绝不覆盖）
  assert.equal(snap.winRate, 0.45, '公开值仍为最近一次成功同步的 V2 值')

  // 过期态：同步长期失败 → updated_at 基准超 7 日 → stale=true（「适用旧版本」呈现依据）
  await stack.pool.query(`UPDATE lineup_snapshots SET updated_at = now() - interval '9 days'`)
  const detailStale = await stack.api('/api/v1/lineups/m45-lineup')
  assert.equal(detailStale.json.data.snapshots[0].stale, true, '过期标识如实公开')

  // 值未被过期/失败态篡改
  const afterValues = await snapshotRows()
  assert.deepEqual(afterValues.map(r => [r.id, r.win_rate, r.sample_count]),
    beforeValues.map(r => [r.id, r.win_rate, r.sample_count]), '状态标注不改写统计值')
})

test('A09(列表层): 待复核 impact → 公开列表 hasOpenRecheck=true → resolve 后清除', { skip: !pgAvailable }, async () => {
  const before = await stack.api('/api/v1/lineups')
  assert.notEqual(before.json.data[0].hasOpenRecheck, true, '基线无待复核')

  // 直插未解决 impact（激活→批量登记的全流程由 m2 M2-1/A09 覆盖；此处验证列表联动）
  await stack.pool.query(`
    INSERT INTO patch_notes (id, version_id, slug, title, status)
    VALUES ('pn-m45', 'v260901', 'note-m45', 'M4-5 测试公告', 'PUBLISHED')`)
  const ins = await stack.pool.query(`
    INSERT INTO content_impacts (patch_note_id, content_type, content_id, impact, note)
    VALUES ('pn-m45', 'LINEUP', 'lu-m45', 'NEEDS_RECHECK', 'M4-5 列表联动测试')
    RETURNING id`)
  const impactId = ins.rows[0].id

  const during = await stack.api('/api/v1/lineups')
  assert.equal(during.json.data[0].hasOpenRecheck, true, '待复核阵容在公开列表如实标识')

  const open = await stack.api('/api/v1/admin/content-impacts?open=1', { token: T() })
  assert.ok(open.json.data.some(i => i.id === impactId), '进入待复核清单')

  const resolved = await stack.api(`/api/v1/admin/content-impacts/${impactId}/resolve`, {
    method: 'POST', token: T(), body: { resolution: 'UPDATED', note: '已复核' }
  })
  assert.equal(resolved.status, 200)
  const after = await stack.api('/api/v1/lineups')
  assert.equal(after.json.data[0].hasOpenRecheck, false, '复核完成后列表标识消除')
})
