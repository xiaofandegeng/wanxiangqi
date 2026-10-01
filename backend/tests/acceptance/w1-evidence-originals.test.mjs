// W1 · 材料原件入库与证据生命周期（v4 任务书 W1，N01/N02 工程侧）
//
// 铁律对照：
// - 服务端取得原件字节、计算 SHA256、保存可恢复原件（N01：取回字节与上传一致）
// - 上传 ≠ 核验：上传只产生 PENDING，人工确认动作才 VERIFIED
// - 魔数嗅探：改名文件/HTML 不得入库；匿名不可获取原件
// - 内容去重幂等；usage_scope 授权冲突显式 409，不静默覆盖
// - demo 文件引擎同语义（contentBase64 落 state，1MB 硬上限）

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'
import { FileRepository } from '../../src/repositories/file-repository.mjs'
import { sha256Hex, DEMO_EVIDENCE_MAX_BYTES } from '../../../tools/emulator-watcher/evidence-core.mjs'

let stack = null

/** 最小合法 PNG（魔数嗅探只看签名，不解码图像内容；测试数据明确标注 FIXTURE） */
function fixturePng(label = 'W1-FIXTURE') {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`${label}-NOT-REAL-MATERIAL-${Date.now()}-${Math.random()}`)
  ])
}

/** 二进制上传（走真实 HTTP，元信息 query 传输） */
async function upload(buf, { token = null, capturedAt = '2026-09-30T08:00:00Z', kind = 'PERSONAL_SCREENSHOT',
  usageScope = 'INTERNAL_ONLY', providedBy = 'w1-self', note = 'W1 测试原件', clientSha256 = null, contentType = 'image/png' } = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries({ capturedAt, kind, usageScope, providedBy, note })) {
    if (v !== null && v !== undefined) q.set(k, v)
  }
  if (clientSha256) q.set('clientSha256', clientSha256)
  const res = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/upload?${q}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': contentType,
      'Content-Length': String(buf.length)
    },
    body: buf
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_w1_test')
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('W1: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('W1-1: 上传 → PENDING 证据 + 原件入库；服务端取回字节与上传一致（N01）', { skip: !pgAvailable }, async () => {
  const buf = fixturePng('W1-1')
  const up = await upload(buf, { token: stack.adminToken })
  assert.equal(up.status, 201, JSON.stringify(up.json))
  assert.equal(up.json.deduplicated, false)
  assert.equal(up.json.evidence.status, 'PENDING', '上传不等于核验')
  assert.equal(up.json.evidence.sha256, sha256Hex(buf), 'SHA256 以服务端计算为准')
  assert.equal(up.json.evidence.sizeBytes, buf.length)
  assert.equal(up.json.evidence.hasOriginal, true)

  // 库内原件行存在且字节一致
  const row = (await stack.pool.query(
    `SELECT b.content, b.mime_type, b.size_bytes, b.storage_uri FROM evidence_blobs b WHERE b.sha256 = $1`,
    [sha256Hex(buf)]
  )).rows[0]
  assert.ok(row, 'evidence_blobs 行已入库')
  assert.ok(Buffer.from(row.content).equals(buf), '库内字节与上传完全一致')
  assert.equal(row.mime_type, 'image/png')
  assert.match(row.storage_uri, /^pg:evidence_blobs:sha-[0-9a-f]{16}$/)

  // 管理端取回原件：字节一致 + nosniff + attachment
  const res = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/${up.json.evidenceId}/content`, {
    headers: { Authorization: `Bearer ${stack.adminToken}` }
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/png')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.match(res.headers.get('content-disposition') || '', /^attachment;/)
  const fetched = Buffer.from(await res.arrayBuffer())
  assert.ok(fetched.equals(buf), 'HTTP 取回字节与上传完全一致（N01）')

  // 匿名不可获取（管理前缀整体鉴权）
  const anon = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/${up.json.evidenceId}/content`)
  assert.equal(anon.status, 401)
  const anonUpload = await upload(fixturePng('W1-1-anon'), {})
  assert.equal(anonUpload.status, 401)
})

test('W1-2: 格式与传输校验 —— 魔数嗅探拒 HTML、MIME 不符拒、超限 413、clientSha 不符 422', { skip: !pgAvailable }, async () => {
  const token = stack.adminToken
  // 改名 HTML：声称 image/png 但魔数不是
  const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>padding-padding-padding')
  const r1 = await upload(html, { token, contentType: 'image/png' })
  assert.equal(r1.status, 422)
  assert.equal(r1.json.code_name, 'UNSUPPORTED_EVIDENCE_TYPE')

  // 声明 MIME 与真实魔数不符（PNG 声称 JPEG）
  const r2 = await upload(fixturePng('W1-2-mime'), { token, contentType: 'image/jpeg' })
  assert.equal(r2.status, 422)
  assert.equal(r2.json.code_name, 'MIME_MISMATCH')

  // 超限：谎报 Content-Length 预检拦截
  const big = Buffer.concat([fixturePng('W1-2-big'), Buffer.alloc(11 * 1024 * 1024)]) // > 10MB 默认上限
  const r3 = await upload(big, { token })
  assert.equal(r3.status, 413)
  assert.equal(r3.json.code_name, 'UPLOAD_TOO_LARGE')
  // 超限后零残留
  const blobs = (await stack.pool.query(`SELECT count(*)::int AS n FROM evidence_blobs WHERE sha256 = $1`, [sha256Hex(big)])).rows[0].n
  assert.equal(blobs, 0, '超限请求不得留下半截原件')

  // clientSha256 与服务端计算不一致 → 传输校验失败
  const r4 = await upload(fixturePng('W1-2-sha'), { token, clientSha256: '0'.repeat(64) })
  assert.equal(r4.status, 422)
  assert.equal(r4.json.code_name, 'SHA_MISMATCH')

  // 缺最小元信息 capturedAt → 400
  const r5 = await upload(fixturePng('W1-2-meta'), { token, capturedAt: null })
  assert.equal(r5.status, 400, JSON.stringify(r5.json))
})

test('W1-3: 内容去重幂等；usage_scope 冲突显式 409；QUARANTINED 状态如实回显', { skip: !pgAvailable }, async () => {
  const buf = fixturePng('W1-3')
  const first = await upload(buf, { token: stack.adminToken, usageScope: 'INTERNAL_ONLY' })
  assert.equal(first.status, 201)

  // 同内容重传（网络重试语义）→ 幂等复用，deduplicated 标记
  const again = await upload(buf, { token: stack.adminToken, usageScope: 'INTERNAL_ONLY', note: '重试备注' })
  assert.equal(again.status, 200)
  assert.equal(again.json.deduplicated, true)
  assert.equal(again.json.evidenceId, first.json.evidenceId, '同一原图复用同一证据')
  const shaRows = (await stack.pool.query(`SELECT count(*)::int AS n FROM evidence_blobs WHERE sha256 = $1`, [sha256Hex(buf)])).rows[0].n
  assert.equal(shaRows, 1, '同一内容只有一份原件字节')

  // 授权范围冲突 → 409，不静默覆盖
  const conflict = await upload(buf, { token: stack.adminToken, usageScope: 'PUBLIC' })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.json.code_name, 'METADATA_CONFLICT')
  const row = (await stack.pool.query(`SELECT usage_scope FROM evidences WHERE id = $1`, [first.json.evidenceId])).rows[0]
  assert.equal(row.usage_scope, 'INTERNAL_ONLY', '冲突后原授权范围不被改写')

  // 隔离后重传同图 → 幂等返回但状态如实回显 QUARANTINED（不得当作可用证据）
  await stack.pool.query(`UPDATE evidences SET status = 'QUARANTINED' WHERE id = $1`, [first.json.evidenceId])
  const afterQua = await upload(buf, { token: stack.adminToken, usageScope: 'INTERNAL_ONLY' })
  assert.equal(afterQua.status, 200)
  assert.equal(afterQua.json.evidence.status, 'QUARANTINED')
})

test('W1-4: 生命周期 —— 人工确认 PENDING→VERIFIED；重复确认幂等；隔离材料拒绝确认', { skip: !pgAvailable }, async () => {
  const up = await upload(fixturePng('W1-4'), { token: stack.adminToken })
  assert.equal(up.status, 201)
  const id = up.json.evidenceId

  // 列表按状态过滤
  const pendingList = await stack.api(`/api/v1/admin/evidences?status=PENDING`, { token: stack.adminToken })
  assert.equal(pendingList.status, 200)
  assert.ok(pendingList.json.data.some(e => e.id === id))

  const v1 = await stack.api(`/api/v1/admin/evidences/${id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w1-auditor' }
  })
  assert.equal(v1.status, 200, JSON.stringify(v1.json))
  assert.equal(v1.json.data.status, 'VERIFIED')
  assert.equal(v1.json.data.verifiedBy, 'w1-auditor')
  assert.ok(v1.json.data.verifiedAt)

  // 幂等：已 VERIFIED 再确认不报错、不改动核验时刻
  const v2 = await stack.api(`/api/v1/admin/evidences/${id}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w1-auditor-2' }
  })
  assert.equal(v2.status, 200)
  assert.equal(v2.json.data.verifiedBy, 'w1-auditor', '重复确认不覆盖首次核验人')

  // 不存在的证据
  const missing = await stack.api(`/api/v1/admin/evidences/ev-nope/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'x' }
  })
  assert.equal(missing.status, 404)

  // 隔离材料拒绝确认
  const up2 = await upload(fixturePng('W1-4-qua'), { token: stack.adminToken })
  await stack.pool.query(`UPDATE evidences SET status = 'QUARANTINED' WHERE id = $1`, [up2.json.evidenceId])
  const qua = await stack.api(`/api/v1/admin/evidences/${up2.json.evidenceId}/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'x' }
  })
  assert.equal(qua.status, 409)
})

test('W1-5: 存量哈希-only 材料 → hasOriginal=false，content 端点明确 ORIGINAL_MISSING（不伪造原件）', { skip: !pgAvailable }, async () => {
  // 模拟 pre-0005 存量：SQL 直插只有哈希的证据行
  const legacySha = createHash('sha256').update('legacy-hash-only-material').digest('hex')
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status, note)
     VALUES ('ev-w1-legacy', $1, 'src-manual-review', '2026-09-01T00:00:00Z', 'VERIFIED', '[ORIGINAL_MISSING: pre-0005 hash-only 原件未入库]')`,
    [legacySha]
  )
  const meta = await stack.api(`/api/v1/admin/evidences/ev-w1-legacy`, { token: stack.adminToken })
  assert.equal(meta.status, 200)
  assert.equal(meta.json.data.hasOriginal, false)
  assert.equal(meta.json.data.mimeType, null)
  assert.match(meta.json.data.note || '', /ORIGINAL_MISSING/)

  const content = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/ev-w1-legacy/content`, {
    headers: { Authorization: `Bearer ${stack.adminToken}` }
  })
  assert.equal(content.status, 422)
  assert.equal((await content.json()).code_name, 'ORIGINAL_MISSING')
})

test('W1-6: demo 文件引擎同语义 —— contentBase64 原件往返一致、1MB 硬上限、去重与生命周期', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wxq-w1-file-'))
  const repo = new FileRepository({ dataDir: dir })
  try {
    const buf = fixturePng('W1-6-FILE')
    const up = await repo.uploadEvidence({
      content: buf, declaredMime: 'image/png', capturedAt: '2026-09-30T08:00:00Z',
      providedBy: 'w1-file', usageScope: 'INTERNAL_ONLY', kind: 'PERSONAL_SCREENSHOT'
    })
    assert.equal(up.evidence.status, 'PENDING')
    assert.equal(up.evidence.hasOriginal, true)

    // 字节往返一致（contentBase64）
    const got = await repo.getEvidenceContentBytes(up.evidenceId)
    assert.ok(got.content.equals(buf), 'demo 引擎原件字节往返一致')
    assert.equal(got.mimeType, 'image/png')

    // 去重
    const again = await repo.uploadEvidence({
      content: buf, declaredMime: 'image/png', capturedAt: '2026-09-30T08:00:00Z',
      usageScope: 'INTERNAL_ONLY'
    })
    assert.equal(again.deduplicated, true)
    assert.equal(again.evidenceId, up.evidenceId)

    // 生命周期
    const verified = await repo.verifyEvidence(up.evidenceId, { verifiedBy: 'w1-file-auditor' })
    assert.equal(verified.status, 'VERIFIED')

    // 1MB 硬上限（防 storage.json base64 膨胀）
    const tooBig = Buffer.concat([fixturePng('W1-6-big'), Buffer.alloc(DEMO_EVIDENCE_MAX_BYTES + 1)])
    await assert.rejects(
      () => repo.uploadEvidence({ content: tooBig, declaredMime: 'image/png', capturedAt: '2026-09-30T08:00:00Z' }),
      err => err.status === 413 && err.code === 'UPLOAD_TOO_LARGE'
    )

    // HTML 拒绝（共用嗅探）
    await assert.rejects(
      () => repo.uploadEvidence({ content: Buffer.from('<html><body>fake-image-padding!!'), declaredMime: 'image/png', capturedAt: '2026-09-30T08:00:00Z' }),
      err => err.status === 422 && err.code === 'UNSUPPORTED_EVIDENCE_TYPE'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('W1-7: 复验P2 —— 无可恢复原件的材料不得标记 VERIFIED（422 ORIGINAL_MISSING，状态保持）', { skip: !pgAvailable }, async () => {
  // PG：模拟 pre-0005 哈希-only 的 PENDING 材料（SQL 直插，无 evidence_blobs 行）
  const sha = createHash('sha256').update('w1-7-blob-less-pending').digest('hex')
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status, usage_scope)
     VALUES ('ev-w1-7-noblob', $1, 'src-manual-review', '2026-09-30T00:00:00Z', 'PENDING', 'PUBLIC')`,
    [sha]
  )
  const ve = await stack.api(`/api/v1/admin/evidences/ev-w1-7-noblob/verify`, {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w1-auditor' }
  })
  assert.equal(ve.status, 422, JSON.stringify(ve.json))
  assert.equal(ve.json.code_name, 'ORIGINAL_MISSING')
  const row = (await stack.pool.query(`SELECT status, verified_at FROM evidences WHERE id = 'ev-w1-7-noblob'`)).rows[0]
  assert.equal(row.status, 'PENDING', '核验失败保持原状态，不产出无原件的 VERIFIED')
  assert.equal(row.verified_at, null, '不得写入核验时刻')

  // demo 文件引擎同语义：state 直插无 blob 的 PENDING 证据
  const dir = mkdtempSync(join(tmpdir(), 'wxq-w1-file-p2-'))
  const repo = new FileRepository({ dataDir: dir })
  try {
    repo.engine.state.evidences.push({
      id: 'ev-file-noblob', sha256: sha256Hex(Buffer.from('demo-no-blob')), sourceId: 'src-manual-review',
      capturedAt: '2026-09-30T00:00:00Z', status: 'PENDING', usageScope: 'PUBLIC'
    })
    await assert.rejects(
      () => repo.verifyEvidence('ev-file-noblob', { verifiedBy: 'x' }),
      err => err.status === 422 && err.code === 'ORIGINAL_MISSING'
    )
    assert.equal(repo.engine.state.evidences[0].status, 'PENDING', 'demo 引擎同保原状态')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('W1-8: 复验P1 —— INTERNAL_ONLY 材料记录不进公开统计/流水（demo 引擎同语义）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wxq-w1-file-scope-'))
  const repo = new FileRepository({ dataDir: dir })
  try {
    const st = repo.engine.state
    st.players.push({ id: 'p-scope', nickname: '范围语义选手', rankScore: 100 })
    // 两件已确认材料：一件仅内部、一件允许公开；各挂一条已放行记录（其余字段同口径）
    st.evidences.push(
      { id: 'ev-int', sha256: sha256Hex(Buffer.from('int')), sourceId: 'src-manual-review', capturedAt: '2026-09-29T00:00:00Z', status: 'VERIFIED', usageScope: 'INTERNAL_ONLY' },
      { id: 'ev-pub', sha256: sha256Hex(Buffer.from('pub')), sourceId: 'src-manual-review', capturedAt: '2026-09-29T00:00:00Z', status: 'VERIFIED', usageScope: 'PUBLIC' }
    )
    const mkMatch = (id, evidenceId, rank) => ({
      id, playerId: 'p-scope', matchTime: '2026-09-29T10:00:00.000Z', availableAt: '2026-09-29T10:05:00.000Z',
      mode: 'RANKED_DIAMOND', finalRank: rank, verified: true, recordStatus: 'ACTIVE', synthetic: false,
      recordKey: `ev:${evidenceId}:1`, revision: 1, evidenceId
    })
    st.matches.push(mkMatch('m-int', 'ev-int', 1), mkMatch('m-pub', 'ev-pub', 3))

    // 公开统计：只计 PUBLIC 那条（N=1，非 2）
    const raw = await repo.computePlayerStatsRaw('p-scope')
    assert.equal(raw.n, 1, 'INTERNAL_ONLY 记录不得进入公开统计')
    assert.equal(raw.firstPlaces, 0, '内部材料的夺冠名次不得计入')

    // 公开流水/大盘：整行排除；usageScope 随行回传供管理端识别
    const flow = await repo.getPlayerMatches('p-scope', { recordStatus: 'ACTIVE' })
    assert.equal(flow.length, 1)
    assert.equal(flow[0].id, 'm-pub')
    assert.equal(flow[0].usageScope, 'PUBLIC')
    const board = await repo.getAllMatches({ recordStatus: 'ACTIVE' })
    assert.equal(board.total, 1)
    assert.ok(!board.data.some(m => m.id === 'm-int'))

    // 管理端（includeInternal）：两条都可见，含内部范围标注
    const adminFlow = await repo.getPlayerMatches('p-scope', { recordStatus: 'ACTIVE', includeInternal: true })
    assert.equal(adminFlow.length, 2)
    assert.equal(adminFlow.find(m => m.id === 'm-int').usageScope, 'INTERNAL_ONLY')
    const adminBoard = await repo.getAllMatches({ recordStatus: 'ACTIVE', includeInternal: true })
    assert.equal(adminBoard.total, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
