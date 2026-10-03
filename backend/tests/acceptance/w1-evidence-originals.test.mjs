// W1 · 素材原件入库与证据生命周期（v6 适配：承接内容素材资产，个人/六席链路已退役）
// 覆盖：上传→PENDING、魔数嗅探/MIME 一致性、大小限额、clientSha 校验、内容去重幂等、
// usage_scope 冲突 409、原件字节一致性、无原件不得核验 422、匿名 401。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, insertEvidenceWithBlob, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_w1_test')
})

after(async () => {
  if (stack) await stack.cleanup()
})

function pngBuffer(label) {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(label)
  ])
}

async function upload(buf, params = {}, headers = {}) {
  const q = new URLSearchParams({ capturedAt: '2026-10-03T09:00:00Z', ...params })
  return fetch(`${stack.baseUrl}/api/v1/admin/evidences/upload?${q}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stack.adminToken}`,
      'Content-Type': 'image/png',
      'Content-Length': String(buf.length),
      ...headers
    },
    body: buf
  })
}

test('W1: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('W1-1: 上传原件 → PENDING + 服务端 SHA256 为准 + 元信息齐全', { skip: !pgAvailable }, async () => {
  const buf = pngBuffer('W1-1-FIXTURE-original-bytes')
  const res = await upload(buf, { kind: 'CONTENT_ASSET', providedBy: 'w1', usageScope: 'INTERNAL_ONLY' })
  assert.equal(res.status, 201)
  const json = await res.json()
  assert.equal(json.deduplicated, false)
  assert.equal(json.evidence.status, 'PENDING', '上传不等于核验')
  assert.equal(json.evidence.hasOriginal, true)
  assert.equal(json.evidence.mimeType, 'image/png')
  assert.equal(json.evidence.sizeBytes, buf.length)
  const { createHash } = await import('node:crypto')
  assert.equal(json.evidence.sha256, createHash('sha256').update(buf).digest('hex'), 'SHA 以服务端计算为准')
})

test('W1-2: 缺 capturedAt / 非 JSON 体等非法请求 → 400', { skip: !pgAvailable }, async () => {
  const buf = pngBuffer('W1-2-FIXTURE')
  const q = new URLSearchParams({}) // 缺 capturedAt
  const res = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/upload?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stack.adminToken}`, 'Content-Type': 'image/png', 'Content-Length': String(buf.length) },
    body: buf
  })
  assert.equal(res.status, 400)
})

test('W1-3: 魔数嗅探拒绝改名文件（HTML 冒充 image/png → 422）', { skip: !pgAvailable }, async () => {
  const evil = Buffer.from('<html><script>alert(1)</script></html>')
  const res = await upload(evil)
  assert.equal(res.status, 422)
  const json = await res.json()
  assert.equal(json.code_name, 'UNSUPPORTED_EVIDENCE_TYPE')
})

test('W1-4: 声明 MIME 与真实魔数不一致 → 422 MIME_MISMATCH', { skip: !pgAvailable }, async () => {
  const buf = pngBuffer('W1-4-FIXTURE')
  const res = await upload(buf, {}, { 'Content-Type': 'image/jpeg' })
  assert.equal(res.status, 422)
  const json = await res.json()
  assert.equal(json.code_name, 'MIME_MISMATCH')
})

test('W1-5: clientSha256 与服务端不一致 → 422 SHA_MISMATCH', { skip: !pgAvailable }, async () => {
  const buf = pngBuffer('W1-5-FIXTURE')
  const res = await upload(buf, { clientSha256: '0'.repeat(64) })
  assert.equal(res.status, 422)
  const json = await res.json()
  assert.equal(json.code_name, 'SHA_MISMATCH')
})

test('W1-6: Content-Length 超限 → 413（不读 body）', { skip: !pgAvailable }, async () => {
  const buf = pngBuffer('W1-6-FIXTURE')
  const url = new URL(`${stack.baseUrl}/api/v1/admin/evidences/upload`)
  url.searchParams.set('capturedAt', '2026-10-03T09:00:00Z')
  // 原生 http 直发谎报的 Content-Length（fetch 会按真实 body 长度改写，构造不出该攻击面）
  const http = await import('node:http')
  const res = await new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stack.adminToken}`,
        'Content-Type': 'image/png',
        'Content-Length': String(1024 * 1024 * 1024)
      }
    }, resolve)
    req.on('error', reject)
    req.end(buf)
  })
  const json = await new Promise(resolve => {
    let raw = ''
    res.on('data', c => { raw += c })
    res.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve(null) } })
  })
  assert.equal(res.statusCode, 413)
  assert.equal(json?.code_name, 'UPLOAD_TOO_LARGE')
})

test('W1-7: 同内容重复上传 → 幂等去重；usage_scope 冲突 → 409 不静默覆盖', { skip: !pgAvailable }, async () => {
  const buf = pngBuffer('W1-7-FIXTURE-same-bytes')
  const first = await upload(buf, { usageScope: 'INTERNAL_ONLY' })
  assert.equal(first.status, 201)

  const dup = await upload(buf, { usageScope: 'INTERNAL_ONLY' })
  assert.equal(dup.status, 200)
  const dupJson = await dup.json()
  assert.equal(dupJson.deduplicated, true)
  assert.equal(dupJson.evidenceId, (await first.json()).evidenceId)

  const conflict = await upload(buf, { usageScope: 'PUBLIC' })
  assert.equal(conflict.status, 409)
  const conflictJson = await conflict.json()
  assert.equal(conflictJson.code_name, 'METADATA_CONFLICT')
})

test('W1-8: 原件字节一致性（上传什么取回什么）+ 匿名取原件 401', { skip: !pgAvailable }, async () => {
  const buf = pngBuffer('W1-8-FIXTURE-roundtrip')
  const up = await upload(buf)
  const { evidenceId } = await up.json()

  const anon = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/${evidenceId}/content`)
  assert.equal(anon.status, 401)

  const res = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/${evidenceId}/content`, {
    headers: { Authorization: `Bearer ${stack.adminToken}` }
  })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.match(res.headers.get('content-disposition') || '', /attachment/)
  const back = Buffer.from(await res.arrayBuffer())
  assert.equal(back.equals(buf), true, '服务端取回字节必须与上传完全一致')
})

test('W1-9: 无原件（哈希-only 存量）不得核验为有效 → 422 ORIGINAL_MISSING，状态不变', { skip: !pgAvailable }, async () => {
  // 直插 pre-0005 风格的哈希-only 证据（无 blob）
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status, note)
     VALUES ('ev-w1-hashonly', $1, 'src-manual-review', '2026-09-01T00:00:00Z', 'PENDING', 'W1 pre-0005 存量')`,
    ['7'.repeat(64)]
  )
  const res = await stack.api('/api/v1/admin/evidences/ev-w1-hashonly/verify', {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w1' }
  })
  assert.equal(res.status, 422)
  assert.equal(res.json.code_name, 'ORIGINAL_MISSING')
  const row = (await stack.pool.query(`SELECT status FROM evidences WHERE id = 'ev-w1-hashonly'`)).rows[0]
  assert.equal(row.status, 'PENDING', '拒绝后状态必须保持不变')
})

test('W1-10: 核验后重启（新栈）状态保持 —— PG 为唯一权威', { skip: !pgAvailable }, async () => {
  await insertEvidenceWithBlob(stack.pool, { id: 'ev-w1-restart', status: 'PENDING' })
  const ack = await stack.api('/api/v1/admin/evidences/ev-w1-restart/verify', {
    method: 'POST', token: stack.adminToken, body: { verifiedBy: 'w1' }
  })
  assert.equal(ack.status, 200)

  const { reconnectStack } = await import('./_helpers.mjs')
  const second = await reconnectStack('wanxiangqi_w1_test', { adminToken: stack.adminToken })
  try {
    const read = await second.api('/api/v1/admin/evidences/ev-w1-restart', { token: stack.adminToken })
    assert.equal(read.status, 200)
    assert.equal(read.json.data.status, 'VERIFIED', '重启后证据状态从库内恢复')
  } finally {
    await second.cleanup()
  }
})
