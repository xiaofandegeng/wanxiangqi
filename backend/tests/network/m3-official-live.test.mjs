// M3-1 · 官网第一方内容真实抓取存证实测（联网验收，默认 skip）
// 任务书 M3：官方新手指引/主站公开页只读获取 → raw_materials + 来源登记。
// 验收方法：原文/哈希/时间入库可复核。
//
// 门控：WXQ_NETWORK_TESTS=1 才真正联网（默认测试运行零网络依赖，P0-A 隔离铁律）。
// 红线：本测试不得用 fixtures 冒充 —— 联网失败即如实 FAILED：先落盘证据，
//       再 assert.fail（FAILED/BLOCKED 不算验收通过，受阻也是事实）。
// 与 v14 区别：v14 只测适配器；本用例走完整栈（隔离 *_test 库 + sync 端点），
// 验证真实官网原文经服务层事务入库 raw_materials，可被 M3-2..M3-5 内容引用。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { bootAcceptanceStack, pgAvailable } from '../acceptance/_helpers.mjs'
import { OFFICIAL_CONTENT_TARGETS } from '../../src/adapters/official-site.mjs'

const GATED = process.env.WXQ_NETWORK_TESTS === '1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS = path.resolve(__dirname, '../../../docs/v6_artifacts')

test('M3-1 live: 官网公开页真实抓取入库存证（联网门控）', {
  skip: (!GATED || !pgAvailable) && '需 WXQ_NETWORK_TESTS=1 且本地 PG（默认零联网）'
}, async () => {
  const stack = await bootAcceptanceStack('wanxiangqi_m3live_test')
  try {
    const testedAt = new Date().toISOString()
    const res = await stack.api('/api/v1/admin/sources/src-wxq-official/sync', {
      method: 'POST', token: stack.adminToken
    })

    const rows = res.status === 200
      ? (await stack.pool.query(
          `SELECT id, record_key, fetched_at, content_sha256, content, size_bytes, parser_version
           FROM raw_materials WHERE source_id = 'src-wxq-official' ORDER BY record_key`
        )).rows
      : []
    const srcRow = (await stack.pool.query(
      `SELECT status, last_success_at, last_error FROM data_sources WHERE source_id = 'src-wxq-official'`
    )).rows[0]

    // 证据落盘：不依赖断言成败，先可复核再判定（v14 纪律）
    const record = {
      testedAt,
      scope: 'M3-1 官网第一方内容抓取存证（完整栈：sync 端点 → raw_materials）',
      httpStatus: res.status,
      responseBody: res.json,
      source: { status: srcRow?.status ?? null, lastSuccessAt: srcRow?.last_success_at ?? null, lastError: srcRow?.last_error ?? null },
      materials: rows.map(r => ({
        rowId: String(r.id), recordKey: r.record_key, url: OFFICIAL_CONTENT_TARGETS.find(t => t.recordKey === r.record_key)?.url ?? null,
        sha256: r.content_sha256, sizeBytes: Number(r.size_bytes), fetchedAt: r.fetched_at,
        parserVersion: r.parser_version,
        sha256Recomputed: crypto.createHash('sha256').update(r.content ?? '', 'utf8').digest('hex'),
        contentPreview: (r.content ?? '').slice(0, 120)
      })),
      error: res.json?.result?.error ?? res.json?.error ?? res.json?.message ?? null
    }
    fs.mkdirSync(ARTIFACTS, { recursive: true })
    const file = path.join(ARTIFACTS, `m3-official-live-${record.testedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
    fs.writeFileSync(file, JSON.stringify(record, null, 2))

    if (res.status !== 200 || res.json?.code !== 0 || rows.length === 0) {
      assert.fail(`官网真实抓取验收受阻（证据已落盘 ${file}）: ${record.error || res.json?.message || 'HTTP ' + res.status}`)
    }

    // 成功路径：4 个已核实目标全部入库，原文哈希可独立复算，采集时间就位
    assert.equal(rows.length, OFFICIAL_CONTENT_TARGETS.length, '全部官网目标必须入库（任一缺失即结构变化）')
    for (const m of record.materials) {
      assert.ok(m.sha256 && /^[0-9a-f]{64}$/.test(m.sha256), `${m.recordKey} sha256 缺失`)
      assert.equal(m.sha256, m.sha256Recomputed, `${m.recordKey} 库内哈希必须与正文复算一致`)
      assert.ok(m.sizeBytes > 1000, `${m.recordKey} 官网页面实测应 >1KB（实际 ${m.sizeBytes}）`)
      assert.ok(m.fetchedAt, `${m.recordKey} 采集时间必须入库`)
      assert.ok(m.contentPreview && m.contentPreview.length > 0, `${m.recordKey} 正文必须随存证入库`)
    }
    assert.equal(srcRow.status, 'READY', '首次真实成功采集后来源必须 READY')
    assert.equal(record.materials.every(m => m.parserVersion === 'official-raw-v1'), true)
  } finally {
    await stack.cleanup()
  }
})
