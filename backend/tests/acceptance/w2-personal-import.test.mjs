// W2 · 单人真实战绩人工导入（v4 任务书 W2，N03/N05 工程侧）
//
// 铁律对照：
// - 单人导入一局不要求其余五席：一条记录即成立（N03），不做席位补齐/推导
// - 可选字段缺省 null 入库保持 null（禁默认值填充），不产生幽灵 players 行
// - recordKey 恒为 ev:证据编号:材料内序号；时间更正走 revision+1（SCD-2 取代），
//   不裂成两条当前版本（N05）
// - 表单不发送 availableAt：服务端以导入时刻生成（≥ matchTime）
// - 导入 = PENDING：公开统计不读取；verifyMatch 放行后才计入（availableAt=实际核验时刻）
// - 管理列表 GET /api/v1/admin/matches 默认 PENDING 口径，匿名 401

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, pgAvailable, insertPlayerRow } from './_helpers.mjs'

let stack = null

/** 最小合法 PNG（魔数嗅探只看签名；测试数据明确标注 FIXTURE，绝不计入 V07） */
function fixturePng(label = 'W2-FIXTURE') {
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([pngMagic, Buffer.from(`${label}-NOT-REAL-MATERIAL-${Date.now()}-${Math.random()}`)])
}

async function api(pathname, { method = 'GET', token = null, body = null, raw = null, contentType = null } = {}) {
  const res = await fetch(`${stack.baseUrl}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(raw && contentType ? { 'Content-Type': contentType, 'Content-Length': String(raw.length) } : {})
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined)
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

/** 上传并人工确认一件个人截图材料（真实 HTTP 链路：upload → PENDING → verify → VERIFIED） */
async function makeVerifiedEvidence(label, { usageScope = 'PUBLIC' } = {}) {
  const buf = fixturePng(label)
  const q = new URLSearchParams({
    capturedAt: '2026-09-30T08:00:00Z',
    kind: 'PERSONAL_SCREENSHOT',
    usageScope,
    providedBy: 'w2-self'
  })
  const up = await api(`/api/v1/admin/evidences/upload?${q}`, {
    method: 'POST', token: stack.adminToken, raw: buf, contentType: 'image/png'
  })
  assert.equal(up.status, 201, JSON.stringify(up.json))
  const id = up.json.evidence.id
  const ve = await api(`/api/v1/admin/evidences/${id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w2-staff' }
  })
  assert.equal(ve.status, 200, JSON.stringify(ve.json))
  assert.equal(ve.json.data.status, 'VERIFIED')
  return id
}

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_w2_test')
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('W2: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('W2-1: 单人导入一局即成立——不要求其余五席；可选字段 null 保持；无幽灵 players（N03）', { skip: !pgAvailable }, async () => {
  await insertPlayerRow(stack.pool, { id: 'p-w2-me', nickname: 'W2本人选手' })
  const evidenceId = await makeVerifiedEvidence('W2-1')
  const playersBefore = (await stack.pool.query(`SELECT count(*)::int AS n FROM players`)).rows[0].n

  // 表单不发送 availableAt / verified —— 全部由服务端语义决定
  const rec = {
    playerId: 'p-w2-me',
    nickname: 'W2本人选手',
    matchTime: '2026-09-29T13:40:00.000Z',
    finalRank: 2,
    mode: null,
    commander: null,
    lineup: null,
    roundsSurvived: null,
    evidenceId,
    slot: 1,
    evidenceLocator: '第1页第1行'
  }
  const imp = await api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken, body: { records: [rec], source: 'PERSONAL_IMPORT' }
  })
  assert.equal(imp.status, 200, JSON.stringify(imp.json))
  assert.equal(imp.json.result.inserted, 1)
  assert.equal(imp.json.result.superseded ?? 0, 0)

  const row = (await stack.pool.query(
    `SELECT record_key, record_status, verified, available_at, match_time, commander, lineup,
            rounds_survived, evidence_id, evidence_locator, revision, superseded_at
     FROM matches WHERE evidence_id = $1 AND superseded_at IS NULL`,
    [evidenceId]
  )).rows[0]
  assert.ok(row, '候选记录已入库')
  assert.equal(row.record_key, `ev:${evidenceId}:1`, '稳定键 = ev:证据编号:材料内序号')
  assert.equal(row.record_status, 'PENDING', '导入只产生 PENDING，verified 不随导入授予')
  assert.equal(row.verified, false)
  assert.equal(row.commander, null, '可选字段缺省 null 保持 null')
  assert.equal(row.lineup, null)
  assert.equal(row.rounds_survived, null)
  assert.equal(row.evidence_locator, '第1页第1行')
  assert.ok(new Date(row.available_at).getTime() >= new Date(row.match_time).getTime(),
    'availableAt 缺省=导入时刻且必须 ≥ matchTime')

  // N03：单人导入绝不补出其余五席，也不产生任何幽灵身份行
  const playersAfter = (await stack.pool.query(`SELECT count(*)::int AS n FROM players`)).rows[0].n
  assert.equal(playersAfter, playersBefore, '导入一局不得新增任何 players 行（身份已在库）')
  const matchCount = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches WHERE evidence_id = $1`, [evidenceId]
  )).rows[0].n
  assert.equal(matchCount, 1, '一局材料 = 一条记录，无席位推导')

  // PENDING 不计入公开统计
  const stats = await api('/api/v1/players/p-w2-me/stats')
  assert.equal(stats.status, 200)
  assert.equal(stats.json.stats.sampleCount, 0, '待核验记录不得进入公开统计')
})

test('W2-2: 时间录入错误 → 同键 revision+1 更正取代，不裂成两条当前版本（N05）', { skip: !pgAvailable }, async () => {
  await insertPlayerRow(stack.pool, { id: 'p-w2-fix', nickname: 'W2更正选手' })
  const evidenceId = await makeVerifiedEvidence('W2-2')

  const base = {
    playerId: 'p-w2-fix', nickname: 'W2更正选手', finalRank: 4,
    mode: 'RANKED_DIAMOND', evidenceId, slot: 1, evidenceLocator: '第1行'
  }
  const wrongTime = '2026-09-29T09:00:00.000Z'
  const correctedTime = '2026-09-29T21:30:00.000Z'

  const first = await api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: { records: [{ ...base, matchTime: wrongTime }], source: 'PERSONAL_IMPORT' }
  })
  assert.equal(first.status, 200, JSON.stringify(first.json))
  assert.equal(first.json.result.inserted, 1)

  // 更正：同 ev 键、revision+1、正确时间
  const correction = await api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: { records: [{ ...base, matchTime: correctedTime, revision: 2 }], source: 'PERSONAL_IMPORT' }
  })
  assert.equal(correction.status, 200, JSON.stringify(correction.json))
  assert.equal(correction.json.result.superseded, 1, '旧候选被取代（SCD-2）')
  // 取代路径不重复计入 inserted（以 superseded 计数）；新增行由下方库内断言核实
  assert.equal(correction.json.result.inserted, 0)

  const key = `ev:${evidenceId}:1`
  const versions = (await stack.pool.query(
    `SELECT match_time, revision, record_status, superseded_at FROM matches WHERE record_key = $1 ORDER BY revision`,
    [key]
  )).rows
  assert.equal(versions.length, 2, '同键共两个版本行（旧版封存 + 新版当前）')
  assert.equal(versions[0].revision, 1)
  assert.ok(versions[0].superseded_at, 'revision 1 已封存')
  assert.equal(new Date(versions[0].match_time).toISOString(), wrongTime)
  assert.equal(versions[1].revision, 2)
  assert.equal(versions[1].superseded_at, null, 'revision 2 为当前版本')
  assert.equal(new Date(versions[1].match_time).toISOString(), correctedTime)
  assert.equal(versions[1].record_status, 'PENDING')

  const currentCount = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches WHERE record_key = $1 AND superseded_at IS NULL`, [key]
  )).rows[0].n
  assert.equal(currentCount, 1, '不裂键：当前版本恒为 1 条')

  // 同 revision 重复提交 → 幂等忽略，不再新增
  const dup = await api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: { records: [{ ...base, matchTime: correctedTime, revision: 2 }], source: 'PERSONAL_IMPORT' }
  })
  assert.equal(dup.status, 200, JSON.stringify(dup.json))
  assert.equal(dup.json.result.duplicates, 1)
  assert.equal(dup.json.result.inserted, 0)
  const totalAfterDup = (await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches WHERE record_key = $1`, [key]
  )).rows[0].n
  assert.equal(totalAfterDup, 2, '重复提交不产生新行')
})

test('W2-3: 管理候选列表——匿名 401；默认 PENDING 口径；wire 含稳定键/版本/材料定位', { skip: !pgAvailable }, async () => {
  await insertPlayerRow(stack.pool, { id: 'p-w2-list', nickname: 'W2列表选手' })
  const evidenceId = await makeVerifiedEvidence('W2-3')
  const imp = await api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{
        playerId: 'p-w2-list', nickname: 'W2列表选手', matchTime: '2026-09-30T10:00:00.000Z',
        finalRank: 5, evidenceId, slot: 1, evidenceLocator: '第2页第3行'
      }],
      source: 'PERSONAL_IMPORT'
    }
  })
  assert.equal(imp.status, 200, JSON.stringify(imp.json))

  // 匿名 → 401（前缀 Bearer 守卫覆盖管理 GET）
  const anon = await api('/api/v1/admin/matches?recordStatus=PENDING')
  assert.equal(anon.status, 401)

  const list = await api('/api/v1/admin/matches?recordStatus=PENDING', { token: stack.adminToken })
  assert.equal(list.status, 200)
  assert.ok(Array.isArray(list.json.data))
  const mine = list.json.data.find(m => m.evidenceId === evidenceId)
  assert.ok(mine, 'PENDING 候选出现在管理列表')
  assert.equal(mine.recordKey, `ev:${evidenceId}:1`)
  assert.equal(mine.revision, 1)
  assert.equal(mine.recordStatus, 'PENDING')
  assert.equal(mine.evidenceLocator, '第2页第3行', '材料定位随 wire 返回（工作台对照原件用）')

  // 默认 recordStatus=PENDING：放行后的 ACTIVE 记录不出现在该口径
  const ver = await api(`/api/v1/admin/matches/${mine.id}/verify`, {
    method: 'POST', token: stack.adminToken,
    body: { verifiedBy: 'w2-staff', evidenceId }
  })
  assert.equal(ver.status, 200, JSON.stringify(ver.json))
  assert.equal(ver.json.data.recordStatus, 'ACTIVE')
  // 放行 = SCD-2 新版本行（旧 id 封存，新行 id = 旧id-rN，同 record_key）
  assert.equal(ver.json.data.id, `${mine.id}-r${(mine.revision ?? 1) + 1}`)
  assert.equal(ver.json.data.recordKey, mine.recordKey)

  const list2 = await api('/api/v1/admin/matches', { token: stack.adminToken })
  assert.equal(list2.status, 200)
  assert.ok(!list2.json.data.some(m => m.id === mine.id), '默认 PENDING 口径不含已放行 ACTIVE 记录')

  const activeList = await api('/api/v1/admin/matches?recordStatus=ACTIVE', { token: stack.adminToken })
  const activeMine = activeList.json.data.find(m => m.recordKey === mine.recordKey)
  assert.ok(activeMine, '显式 recordStatus=ACTIVE 可查已放行记录（同键新版本行）')
  assert.ok(new Date(activeMine.availableAt).getTime() >= new Date('2026-09-30T10:00:00.000Z').getTime())
})

test('W2-4: 逐条放行后统计计入——单人材料闭环（PENDING 0 局 → 放行 → N=1）', { skip: !pgAvailable }, async () => {
  await insertPlayerRow(stack.pool, { id: 'p-w2-flow', nickname: 'W2闭环选手' })
  const evidenceId = await makeVerifiedEvidence('W2-4')

  const before = await api('/api/v1/players/p-w2-flow/stats')
  assert.equal(before.json.stats.sampleCount, 0)

  const imp = await api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: {
      records: [{
        playerId: 'p-w2-flow', nickname: 'W2闭环选手', matchTime: '2026-09-30T12:00:00.000Z',
        finalRank: 1, mode: 'RANKED_DIAMOND', evidenceId, slot: 1
      }],
      source: 'PERSONAL_IMPORT'
    }
  })
  assert.equal(imp.status, 200, JSON.stringify(imp.json))

  const pendingStill = await api('/api/v1/players/p-w2-flow/stats')
  assert.equal(pendingStill.json.stats.sampleCount, 0, 'PENDING 期间统计仍为 0')

  const list = await api('/api/v1/admin/matches?recordStatus=PENDING', { token: stack.adminToken })
  const row = list.json.data.find(m => m.evidenceId === evidenceId)
  assert.ok(row)

  const ver = await api(`/api/v1/admin/matches/${row.id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w2-staff', evidenceId }
  })
  assert.equal(ver.status, 200, JSON.stringify(ver.json))

  const after = await api('/api/v1/players/p-w2-flow/stats')
  assert.equal(after.json.stats.sampleCount, 1, '放行后统计计入')
  assert.equal(after.json.stats.firstPlaces, 1)
})

test('W2-5: 复验P1 —— INTERNAL_ONLY 材料放行后仍不进公开面（统计/流水/大盘），仅管理端可见', { skip: !pgAvailable }, async () => {
  await insertPlayerRow(stack.pool, { id: 'p-w2-scope', nickname: 'W2范围选手' })
  // 同一玩家两条同口径记录：一内部一公开，除材料范围外无差异
  const evInt = await makeVerifiedEvidence('W2-5-INT', { usageScope: 'INTERNAL_ONLY' })
  const evPub = await makeVerifiedEvidence('W2-5-PUB', { usageScope: 'PUBLIC' })
  const rec = evidenceId => ({
    playerId: 'p-w2-scope', nickname: 'W2范围选手', matchTime: '2026-09-30T14:00:00.000Z',
    finalRank: 1, mode: 'RANKED_DIAMOND', evidenceId, slot: 1
  })
  const imp = await api('/api/v1/admin/imports', {
    method: 'POST', token: stack.adminToken,
    body: { records: [rec(evInt), rec(evPub)], source: 'PERSONAL_IMPORT' }
  })
  assert.equal(imp.status, 200, JSON.stringify(imp.json))
  assert.equal(imp.json.result.inserted, 2)

  // 两条候选都放行（ACTIVE）
  const list = await api('/api/v1/admin/matches?recordStatus=PENDING', { token: stack.adminToken })
  for (const evidenceId of [evInt, evPub]) {
    const row = list.json.data.find(m => m.evidenceId === evidenceId)
    assert.ok(row, `候选 ${evidenceId} 在管理列表`)
    const ver = await api(`/api/v1/admin/matches/${row.id}/verify`, {
      method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w2-staff', evidenceId }
    })
    assert.equal(ver.status, 200, JSON.stringify(ver.json))
  }

  // 公开统计：只计 PUBLIC 一条 —— 内部材料即便已核验放行也不得泄漏
  const stats = await api('/api/v1/players/p-w2-scope/stats')
  assert.equal(stats.json.stats.sampleCount, 1, 'INTERNAL_ONLY 记录不得进入公开统计')
  assert.equal(stats.json.stats.firstPlaces, 1, '计入的是 PUBLIC 那条（名次1）')

  // 公开选手流水 / 大盘：内部记录整行排除
  const flow = await api('/api/v1/players/p-w2-scope/matches')
  assert.equal(flow.json.total, 1)
  assert.ok(flow.json.data.every(m => m.evidenceId !== evInt), '公开流水不含内部材料记录')
  assert.equal(flow.json.data[0].usageScope, 'PUBLIC')

  const board = await api('/api/v1/matches?playerId=p-w2-scope&recordStatus=ACTIVE')
  assert.equal(board.json.total, 1)
  assert.ok(board.json.data.every(m => m.evidenceId !== evInt))

  // 管理端（Bearer）：两条都可见且范围如实随行回传
  const adminActive = await api('/api/v1/admin/matches?recordStatus=ACTIVE&playerId=p-w2-scope', { token: stack.adminToken })
  assert.equal(adminActive.json.total, 2, '管理端可见内部材料记录（授权范围内运营）')
  const intRow = adminActive.json.data.find(m => m.evidenceId === evInt)
  assert.equal(intRow.usageScope, 'INTERNAL_ONLY', 'wire 如实标注允许使用范围')

  // 选手榜统计口径同排除（roster 复算不泄漏）
  const roster = await api('/api/v1/players?query=W2范围选手')
  assert.equal(roster.json.data[0].stats.sampleCount, 1)
})
